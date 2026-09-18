# Validation — 18 September 2026

Completed locally:

- Android 0.2.0 debug APK built with the new Fala logo and reduced network requests per spoken turn.
- Android lint: no errors; 12 advisory warnings (dependency updates, Kotlin conveniences, and resource cleanup). APK v2 signature verified with `apksigner`.
- Release manifest disables cleartext traffic and backups; extraction rules exclude private data from cloud/device transfer. Local HTTP is enabled only in the debug variant.
- **16 TypeScript tests passed** against an embedded PostgreSQL engine (PGlite). They exercise the actual SQL migration and application queries: repeat migration, public-role denial/RLS, authenticated API, cross-handler retries and payload conflicts, provider rollback, atomic report/evidence rollback, lock contention response, bounded requests, persisted rate limiting, assessment/correction evidence, valid age statements, English/Hebrew help, due memory, demo exclusion, and cascading deletion.
- TypeScript checks and static-site build passed.
- Netlify's function packaging completed; the generated route manifest includes all Android API paths and `/api/*` aliases.
- Dependency audit reported **zero known vulnerabilities** after pinning the patched transitive image library used by Netlify's development tools.
- Official Gradle wrapper distribution checksum is pinned.

The PostgreSQL tests run locally with a fake AI provider. PGlite serializes its transactions; concurrency tests establish idempotent replay through independent handlers, and simulated lock contention checks the conflict response. They do not establish real cloud connection pooling or distributed load performance.

Still requires your cloud configuration and phone:

- New Supabase project creation, SQL migration in that project, Netlify import, and production secrets. No remote database migration or site deployment was performed by these local checks.
- Live AI replies and Portuguese coaching quality. The existing local provider key was empty.
- Actual Supabase transaction-pooler connectivity and measured Haifa latency. Run the included read-only benchmark after deployment.
- Physical microphone, pt-BR recognition/voice naturalness, loudspeaker/headset and lifecycle behavior. Follow [device checks](device-checks.md).
- Play Store release/signing. The local APK is signed with a development key; GitHub CI debug builds may use another key.

The locally built APK is `artifacts/fala-debug.apk` with a sibling SHA-256 file. Build outputs, private configuration, learner databases, downloaded toolchains, and local caches are excluded from Git. GitHub Actions builds a downloadable APK from source. See [deployment steps](deployment.md).
