import { cp, mkdir, rm } from "node:fs/promises";
import { checkRelease } from "./release.mjs";
import { execFileSync } from "node:child_process";

execFileSync(process.execPath, ['scripts/localization.mjs', '--check'], { stdio: 'inherit' });

const release = await checkRelease();

// Only this public directory is published. Source, .env and database files cannot enter dist.
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });
console.log(`Built Fala ${release.version}; release versions and notes verified. Netlify bundles the API separately.`);
