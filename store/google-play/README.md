# Fala — Google Play package

Open `preview.html` for the listing and a gallery. The files in this folder are public store material; there are no credentials or real learner records.

- `en-US/`: app title, short description and full description, within Play's length limits.
- `icon-512.png`: store icon, 512 × 512.
- `feature-graphic-1024x500.jpg`: banner, 1024 × 500.
- `screenshots/phone/`: five native phone screenshots, 1080 × 1920.
- `screenshots/seven-inch/`: five native 7-inch tablet screenshots, 1080 × 1920.
- `screenshots/ten-inch/`: five native 10-inch tablet screenshots, 1920 × 1080.
- `app-access.txt`: reviewer instructions.
- `console-answers.md`: proposed Console answers and outstanding requirements.
- `asset-manifest.json`: app version, image dimensions and SHA-256 hashes.

Screenshots capture the actual Android interface on emulators at different display sizes, using fictional lesson examples. They are not photographs or generated screen mockups. The original Fala logo and character artwork are AI-generated; complete Google's asset declarations accurately.

The publisher workflow handles internal testing. The separate store workflow uploads these assets and can prepare a closed-testing draft; it does not start testing or publish to production. Twelve testers must remain opted in to the closed test for fourteen continuous days before the owner can apply for production access. Internal testing does not satisfy that requirement.

To regenerate: run **Prepare Google Play store** in `capture` mode, inspect/download the native screenshots, copy them into this folder, then run `python3 scripts/package-play-store.py` (requires Pillow). This validates versions, dimensions and text limits, regenerates the preview, and creates a ZIP under `artifacts/`.
