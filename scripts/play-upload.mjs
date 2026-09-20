import { readFile, appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { importPKCS8, SignJWT } from "jose";
import { checkRelease, releaseMetadata } from "./release.mjs";

const apiRoot = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.fala.app/edits";
const uploadRoot = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/com.fala.app/edits";
const tokenUrl = "https://oauth2.googleapis.com/token";
const scope = "https://www.googleapis.com/auth/androidpublisher";

export function versionCode(runNumber, attempt) {
  const run = Number(runNumber), retry = Number(attempt);
  const code = 100000 + run * 100 + retry;
  if (!Number.isSafeInteger(run) || run < 1 || !Number.isSafeInteger(retry) || retry < 1 || retry > 99 || code > 2100000000) {
    throw new Error("Invalid workflow run number or attempt for the Play version code.");
  }
  return code;
}

export async function googleAccessToken(raw, request = fetch) {
  let account, assertion;
  try {
    account = JSON.parse(raw);
    if (account.type !== "service_account" || !/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(account.client_email)) throw new Error();
    const key = await importPKCS8(account.private_key, "RS256");
    assertion = await new SignJWT({ scope }).setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(account.client_email).setAudience(tokenUrl).setIssuedAt().setExpirationTime("55m").sign(key);
  } catch { throw new Error("Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON to the complete service-account JSON key in GitHub Actions secrets."); }
  let response;
  try {
    response = await request(tokenUrl, { method: "POST", redirect: "error", signal: AbortSignal.timeout(30000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  } catch { throw new Error("Could not reach Google authentication. Retry the workflow."); }
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Google authentication failed (HTTP ${response.status}). Check the publishing service-account key.`); }
  const result = await response.json().catch(() => { throw new Error("Google authentication returned an invalid response."); });
  if (typeof result.access_token !== "string" || !result.access_token) throw new Error("Google did not return an access token.");
  return result.access_token;
}

export async function publishBundle({ token, bundle, expectedVersion, release, status = "completed", request = fetch }) {
  if (!token || !Buffer.isBuffer(bundle) || bundle.length === 0) throw new Error("Missing Google access token or signed App Bundle.");
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || expectedVersion > 2100000000) throw new Error("Invalid bundle version code.");
  if (!["draft", "completed"].includes(status)) throw new Error("Play release status must be draft or completed.");
  const metadata = releaseMetadata(release?.version, release?.notes?.[0]?.text);
  const call = async (url, method = "GET", value, media = false) => {
    let response;
    try {
      response = await request(url, { method, redirect: "error", signal: AbortSignal.timeout(media ? 180000 : 30000),
        headers: { Authorization: `Bearer ${token}`, ...(value === undefined ? {} : { "Content-Type": media ? "application/octet-stream" : "application/json" }) },
        ...(value === undefined ? {} : { body: media ? value : JSON.stringify(value) }) });
    } catch { throw new Error("Google Play connection interrupted. Check the Console before retrying; a commit may have completed."); }
    if (!response.ok) {
      // Google errors can include supplied values; never dump bodies, tokens or private keys into CI logs.
      await response.body?.cancel();
      const hints = { 400: "Check the first release/setup, draft status, and pending review in Play Console.",
        401: "Check the service-account credentials.", 403: "Enable the Play Developer API and grant this service account Fala testing-track release access.",
        404: "Create Fala and finish the first Console upload before using automated uploads.",
        409: "Another release changed the app. Check Play Console and rerun after it finishes." };
      throw new Error(`Google Play ${method} request failed (HTTP ${response.status}). ${hints[response.status] || "Check Play Console and retry later."}`);
    }
    return response.status === 204 ? {} : response.json().catch(() => { throw new Error("Google Play returned an invalid response."); });
  };
  let editId, committed = false;
  try {
    const edit = await call(apiRoot, "POST", {});
    if (typeof edit.id !== "string" || !/^[A-Za-z0-9_-]+$/.test(edit.id)) throw new Error("Google returned an invalid publishing edit.");
    editId = edit.id;
    const base = `${apiRoot}/${editId}`;
    const [bundles, apks, tracks] = await Promise.all([
      call(`${base}/bundles`), call(`${base}/apks`), call(`${base}/tracks`),
    ]);
    const used = [...(bundles.bundles || []), ...(apks.apks || [])].map(b => b.versionCode);
    for (const track of tracks.tracks || []) for (const release of track.releases || []) used.push(...(release.versionCodes || []));
    if (used.some(v => !Number.isSafeInteger(Number(v)) || Number(v) >= expectedVersion)) {
      throw new Error("This version is already used or older than a Play build. Run a new workflow from current main; do not re-upload an older build.");
    }
    const uploaded = await call(`${uploadRoot}/${editId}/bundles?uploadType=media`, "POST", bundle, true);
    const digest = createHash("sha256").update(bundle).digest("hex");
    if (Number(uploaded.versionCode) !== expectedVersion || uploaded.sha256 !== digest) {
      throw new Error("Google's uploaded bundle version or checksum differs from the signed local bundle. No release was committed.");
    }
    // The destination is deliberately fixed: automation never promotes to production or other tracks.
    await call(`${base}/tracks/internal`, "PUT", { track: "internal", releases: [{
      name: `Fala ${metadata.version} (${expectedVersion})`, versionCodes: [String(expectedVersion)], status,
      releaseNotes: metadata.notes,
    }] });
    // Never silently cancel an unrelated review in progress.
    await call(`${base}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`, "POST");
    committed = true;
    return { versionCode: expectedVersion, sha256: digest, track: "internal", status };
  } finally {
    if (editId && !committed) {
      try { await call(`${apiRoot}/${editId}`, "DELETE"); } catch { /* Edit expires if cleanup is unavailable. */ }
    }
  }
}

async function main() {
  if (process.argv[2] === "version") {
    const code = versionCode(process.env.GITHUB_RUN_NUMBER, process.env.GITHUB_RUN_ATTEMPT);
    if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `FALA_VERSION_CODE=${code}\n`);
    console.log(`Play version code: ${code}`);
    return;
  }
  if (process.argv[2] !== "upload") throw new Error("Use play-upload.mjs version or upload.");
  const release = await checkRelease();
  const token = await googleAccessToken(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || "");
  const bundle = await readFile("android/app/build/outputs/bundle/release/app-release.aab");
  const result = await publishBundle({ token, bundle, release, expectedVersion: Number(process.env.FALA_VERSION_CODE),
    status: process.env.FALA_PLAY_RELEASE_STATUS || "completed" });
  const summary = `Fala ${release.version} (build ${result.versionCode}) uploaded to Google Play internal testing (${result.status}).\nSHA-256: ${result.sha256}\n\n${release.notes[0].text}\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
