import { cp, mkdir, rm } from "node:fs/promises";

// Only this public directory is published. Source, .env and database files cannot enter dist.
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });
console.log("Built the public landing page. Netlify bundles the API separately.");
