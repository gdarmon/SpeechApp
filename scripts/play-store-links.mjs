// Hosting maintenance: preserve listing copy/images/tracks and replace only old Fala URLs.
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { googleAccessToken } from './play-upload.mjs';
const root = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.fala.app/edits';
const oldOrigin = 'https://falachatapp.netlify.app';
const newOrigin = 'https://fala-api.vercel.app';
export async function updateStoreLinks(token, request = fetch) {
  const call = async (path, method = 'GET', body) => {
    const response = await request(root + path, { method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) { await response.body?.cancel(); throw Error(`Google Play link maintenance: HTTP ${response.status}. Check listing permissions and pending review; no automatic review replacement.`); }
    return response.status === 204 ? {} : response.json();
  };
  let edit, committed = false, verification;
  try {
    edit = await call('', 'POST', {});
    if (!/^[A-Za-z0-9_-]+$/.test(edit.id || '')) throw Error('Invalid Google edit ID');
    const [details, listings] = await Promise.all(['/details', '/listings'].map(p => call('/' + edit.id + p)));
    const website = details.contactWebsite;
    const updateWebsite = website === oldOrigin || website?.startsWith(oldOrigin + '/');
    const changed = [];
    for (const listing of listings.listings || []) {
      if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(listing.language || '')) throw Error('Invalid listing language');
      const patch = {};
      for (const field of ['fullDescription', 'shortDescription']) {
        if (typeof listing[field] !== 'string') continue;
        const replaced = listing[field].replace(/https:\/\/falachatapp\.netlify\.app(?=\/|[\s)]|$)/g, newOrigin);
        if (replaced !== listing[field]) patch[field] = replaced;
      }
      if (Object.keys(patch).length) {
        await call('/' + edit.id + '/listings/' + listing.language, 'PATCH', patch);
        changed.push({ language: listing.language, patch });
      }
    }
    if (updateWebsite) await call('/' + edit.id + '/details', 'PATCH', { contactWebsite: newOrigin + website.slice(oldOrigin.length) });
    if (updateWebsite || changed.length) {
      await call('/' + edit.id + ':validate', 'POST');
      await call('/' + edit.id + ':commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW', 'POST');
      committed = true;
      verification = await call('', 'POST', {});
      if (!/^[A-Za-z0-9_-]+$/.test(verification.id || '')) throw Error('Invalid verification edit ID');
      if (updateWebsite && (await call('/' + verification.id + '/details')).contactWebsite !== newOrigin + website.slice(oldOrigin.length)) throw Error('Website update was not verified');
      for (const entry of changed) {
        const actual = await call('/' + verification.id + '/listings/' + entry.language);
        if (Object.entries(entry.patch).some(([field,value]) => actual[field] !== value)) throw Error('Listing link update was not verified');
      }
    }
    return { checked_at: new Date().toISOString(), website_updated: Boolean(updateWebsite), languages_updated: changed.map(l => l.language), committed, verified: true,
      limits: ['Privacy-policy and account/data-deletion Console fields require separate owner verification.', 'No images, binaries or track releases were changed. No pending review was replaced.'] };
  } finally {
    if (verification?.id) await call('/' + verification.id, 'DELETE');
    if (edit?.id && !committed) await call('/' + edit.id, 'DELETE');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = await googleAccessToken(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '');
  const result = await updateStoreLinks(token);
  await mkdir('artifacts/play-store', { recursive: true });
  await writeFile('artifacts/play-store/links.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
