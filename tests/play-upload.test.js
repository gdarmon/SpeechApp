import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { generateKeyPair, exportPKCS8, jwtVerify } from "jose";
import { googleAccessToken, publishBundle, versionCode } from "../scripts/play-upload.mjs";
import { checkRelease, releaseMetadata } from "../scripts/release.mjs";

const bundle = Buffer.from("signed-test-bundle");
const digest = createHash("sha256").update(bundle).digest("hex");
const release = releaseMetadata("0.9.0", "More varied capoeira practice and birthday conversations.");
function google({ failCommit = false, existing = 3, badUpload = {}, failureBody = "" } = {}) {
  const calls = [];
  const request = async (address, options) => {
    const url = new URL(address); calls.push({ url, ...options });
    if (url.pathname.endsWith("/edits")) return Response.json({ id: "edit123" });
    if (options.method === "DELETE") return new Response(null, { status: 204 });
    if (url.pathname.endsWith("/bundles") && options.method === "POST") return Response.json({ versionCode: 100101, sha256: digest, ...badUpload });
    if (url.pathname.endsWith("/bundles")) return Response.json({ bundles: [{ versionCode: existing }] });
    if (url.pathname.endsWith("/apks")) return Response.json({ apks: [] });
    if (url.pathname.endsWith("/tracks")) return Response.json({ tracks: [{ track: "production", releases: [{ versionCodes: [String(existing)] }] }] });
    if (url.pathname.endsWith(":commit")) return failCommit ? new Response(failureBody, { status: 400 }) : Response.json({ id: "edit123" });
    if (url.pathname.endsWith("/tracks/internal")) return Response.json({ track: "internal" });
    throw Error(`Unexpected request ${options.method} ${url}`);
  };
  return { request, calls };
}
const publish = (mock, extra = {}) => publishBundle({ token: "private-access-token", bundle, release, expectedVersion: 100101, request: mock.request, ...extra });

describe("Google Play publisher", () => {
  it("increments versions for builds and reruns and rejects invalid values", () => {
    expect(versionCode("1", "1")).toBe(100101);
    expect(versionCode("1", "2")).toBe(100102);
    expect(versionCode("2", "1")).toBeGreaterThan(versionCode("1", "99"));
    for (const [run, attempt] of [[0,1],[1,0],[1,100],[1.1,1],[1,"oops"],[2100000000,1]]) expect(() => versionCode(run,attempt)).toThrow();
  });
  it("uploads exact bundle bytes, checks checksum/version, and commits only to internal testing", async () => {
    const mock = google();
    expect(await publish(mock)).toEqual({ versionCode: 100101, sha256: digest, track: "internal", status: "completed" });
    const upload = mock.calls.find(c => c.url.pathname.startsWith("/upload/"));
    expect(upload.body).toBe(bundle); expect(upload.signal).toBeInstanceOf(AbortSignal);
    const track = mock.calls.find(c => c.method === "PUT");
    expect(track.url.pathname).toContain("/tracks/internal");
    expect(JSON.parse(track.body)).toEqual({ track: "internal", releases: [{ name: "Fala 0.9.0 (100101)", versionCodes: ["100101"], status: "completed", releaseNotes: release.notes }] });
    const commit = mock.calls.find(c => c.url.pathname.endsWith(":commit"));
    expect(commit.url.searchParams.get("changesInReviewBehavior")).toBe("ERROR_IF_IN_REVIEW");
    expect(commit.body).toBeUndefined();
    expect(mock.calls.every(c => c.redirect === "error" && c.headers.Authorization === "Bearer private-access-token")).toBe(true);
    expect(mock.calls.some(c => c.method === "DELETE")).toBe(false);
  });
  it("rejects reused/older versions before uploading any bundle", async () => {
    for (const existing of [100101, 100200]) {
      const mock = google({ existing }); await expect(publish(mock)).rejects.toThrow("already used or older");
      expect(mock.calls.some(c => c.url.pathname.startsWith("/upload/"))).toBe(false);
      expect(mock.calls.at(-1).method).toBe("DELETE");
    }
  });
  it("requires usable versioned release notes before contacting Google", async () => {
    for (const invalid of [undefined, { version: "../secret", notes: release.notes }, { version: "0.9.0", notes: [] },
      { version: "0.9.0", notes: [{ text: " " }] }, { version: "0.9.0", notes: [{ text: "x".repeat(501) }] }]) {
      const mock = google();
      await expect(publish(mock, { release: invalid })).rejects.toThrow();
      expect(mock.calls).toEqual([]);
    }
    const current = await checkRelease();
    expect(current.notes[0].text.length).toBeGreaterThan(0);
  });
  it("never releases a bundle with an unexpected checksum or version", async () => {
    for (const badUpload of [{ sha256: "wrong" }, { versionCode: 3 }]) {
      const mock = google({ badUpload }); await expect(publish(mock)).rejects.toThrow("version or checksum");
      expect(mock.calls.some(c => c.method === "PUT" || c.url.pathname.endsWith(":commit"))).toBe(false);
      expect(mock.calls.at(-1).method).toBe("DELETE");
    }
  });
  it("cleans up an uncommitted edit without leaking Google error bodies or canceling a review", async () => {
    const mock = google({ failCommit: true, failureBody: "private-access-token private-key" });
    await expect(publish(mock)).rejects.toThrow("HTTP 400");
    expect(mock.calls.at(-1).method).toBe("DELETE");
    const another = google({ failCommit: true, failureBody: "private-access-token private-key" });
    await expect(publish(another)).rejects.not.toThrow("private-");
  });
  it("supports an explicitly requested draft and rejects unrecognized release states", async () => {
    const mock = google(); await publish(mock, { status: "draft" });
    expect(JSON.parse(mock.calls.find(c => c.method === "PUT").body).releases[0].status).toBe("draft");
    const invalid = google(); await expect(publish(invalid, { status: "production" })).rejects.toThrow();
    expect(invalid.calls).toEqual([]);
  });
  it("does not expose private request details when a network operation fails", async () => {
    await expect(publish({ request: async () => { throw Error("private-access-token"); } })).rejects.not.toThrow("private-access-token");
  });
  it("exchanges a signed service-account assertion scoped only to Android publishing", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
    const account = { type: "service_account", client_email: "fala@test.iam.gserviceaccount.com", private_key: await exportPKCS8(privateKey), token_uri: "https://attacker.invalid" };
    const result = await googleAccessToken(JSON.stringify(account), async (url, options) => {
      expect(url).toBe("https://oauth2.googleapis.com/token"); expect(options.redirect).toBe("error");
      const form = new URLSearchParams(options.body);
      expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
      const { payload } = await jwtVerify(form.get("assertion"), publicKey, { issuer: account.client_email, audience: url });
      expect(payload.scope).toBe("https://www.googleapis.com/auth/androidpublisher");
      expect(payload.exp - payload.iat).toBe(3300);
      return Response.json({ access_token: "test-access-token" });
    });
    expect(result).toBe("test-access-token");
    await expect(googleAccessToken("malformed-private-key")).rejects.not.toThrow("malformed-private-key");
    await expect(googleAccessToken(JSON.stringify(account), async () => new Response("private-key", { status: 403 }))).rejects.not.toThrow("private-key");
  });
});
