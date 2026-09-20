# Fala release requirements

The user requires a visible version and release notes for every new app version.

- For each user-visible release, increment the version in `package.json`, the root and root-package entries of `package-lock.json`, Android's `versionName`, the web header and the service-worker cache name. Increase Android's fallback version code as well; CI allocates its own monotonically increasing code.
- Add `releases/<version>.txt` with concise user-facing English notes (at most 500 characters). Keep previous notes. `npm run build` validates version consistency and the notes; the Play uploader attaches them to the release.
- Use the existing signing key and the existing `com.fala.app` identity. Never print or commit signing credentials, service-account keys or GitHub tokens.
- Automated publishing targets Google Play internal testing. Confirm the upload result before reporting that an Android update is published. Netlify deployment alone does not update an installed Android binary.
- For server-only content updates, explain that existing clients receive the content without a phone reinstall. Keep Portuguese difficulty separate from capoeira knowledge, and end-of-session vocabulary reviews capped at five items.
