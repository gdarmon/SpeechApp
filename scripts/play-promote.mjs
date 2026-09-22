import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { googleAccessToken } from './play-upload.mjs';
import { checkRelease, releaseMetadata } from './release.mjs';

const root = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.fala.app/edits';

// Manual, explicitly authorized promotion of one existing bundle. Automatic publishing stays internal.
export async function promoteClosedTest({ token, expectedVersion, release, request = fetch }) {
  const metadata = releaseMetadata(release?.version, release?.notes?.[0]?.text);
  if (!token || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || expectedVersion > 2100000000) {
    throw Error('Specify the exact existing Play version code to promote.');
  }
  const code = String(expectedVersion);
  const name = `Fala ${metadata.version} (${code})`;
  const call = async (path = '', method = 'GET', body) => {
    let response;
    try {
      response = await request(root + path, { method, redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw Error('Google Play connection interrupted. Check the track before retrying; a commit may have completed.'); }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (error.error?.details?.some(detail => detail.reason === 'CHANGES_ALREADY_IN_REVIEW')) {
        throw Error('Google Play already has changes in review. This promotion did not cancel that review.');
      }
      // Do not print Google response bodies, which can contain supplied credentials or values.
      throw Error(`Google Play closed-test ${method} failed (HTTP ${response.status}). Check Play Console before retrying.`);
    }
    return response.status === 204 ? {} : response.json();
  };
  const createEdit = async () => {
    const edit = await call('', 'POST', {});
    if (typeof edit.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(edit.id)) throw Error('Invalid Play edit identifier.');
    return edit.id;
  };
  const matches = candidate => candidate?.status === 'completed' && candidate.name === name &&
    candidate.versionCodes?.length === 1 && String(candidate.versionCodes[0]) === code &&
    candidate.releaseNotes?.find(note => note.language === 'en-US')?.text === metadata.notes[0].text;
  let editId, committed = false, verificationId;
  try {
    editId = await createEdit();
    const before = (await call(`/${editId}/tracks`)).tracks || [];
    const source = before.find(track => track.track === 'internal')?.releases?.find(matches);
    if (!source) throw Error('The exact version and release notes must already be completed in internal testing.');
    const current = before.find(track => track.track === 'alpha')?.releases || [];
    const alreadyPromoted = current.length === 1 && matches(current[0]);
    if (!alreadyPromoted) {
      if (current.some(item => item.versionCodes?.some(value => !Number.isSafeInteger(Number(value)) || Number(value) >= expectedVersion))) {
        throw Error('Alpha already contains this or a newer version with different release details. No changes made.');
      }
      if (current.some(item => item.status !== 'completed')) {
        throw Error('Alpha has another draft or rollout. No changes made.');
      }
      const promoted = { name, versionCodes: [code], releaseNotes: source.releaseNotes, status: 'completed',
        ...(source.inAppUpdatePriority === undefined ? {} : { inAppUpdatePriority: source.inAppUpdatePriority }) };
      await call(`/${editId}/tracks/alpha`, 'PUT', { track: 'alpha', releases: [promoted] });
      await call(`/${editId}:validate`, 'POST');
      await call(`/${editId}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`, 'POST');
      committed = true;
    }
    // Verify using a fresh edit, rather than mistaking an uncommitted response for a published track.
    verificationId = await createEdit();
    const after = (await call(`/${verificationId}/tracks`)).tracks || [];
    const alpha = after.find(track => track.track === 'alpha');
    if (alpha?.releases?.length !== 1 || !matches(alpha.releases[0])) {
      throw Error('The committed Alpha release could not be verified. Check Play Console before retrying.');
    }
    return { package: 'com.fala.app', version: metadata.version, versionCode: expectedVersion,
      track: 'alpha', status: 'completed', verified: true, alreadyPromoted,
      before, after, verifiedAt: new Date().toISOString(),
      availability: 'The API confirms the track release; Play review or managed publishing may still delay tester availability.' };
  } finally {
    for (const id of [verificationId, ...(!committed ? [editId] : [])].filter(Boolean)) {
      try { await call(`/${id}`, 'DELETE'); } catch { /* Uncommitted edits expire. */ }
    }
  }
}

async function main() {
  const release = await checkRelease();
  const expectedVersion = Number(process.env.FALA_CLOSED_VERSION_CODE);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw Error('Provide FALA_CLOSED_VERSION_CODE.');
  const token = await googleAccessToken(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '');
  const receipt = await promoteClosedTest({ token, expectedVersion, release });
  await mkdir('artifacts/play-store', { recursive: true });
  await writeFile('artifacts/play-store/promotion-alpha.json', JSON.stringify(receipt, null, 2) + '\n');
  const summary = `Fala ${receipt.version} (build ${receipt.versionCode}) promoted to closed testing (alpha, completed); verified in a fresh Play edit.\n${receipt.availability}\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
