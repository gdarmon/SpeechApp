import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
export function releaseMetadata(version, text) {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Use a major.minor.patch release version.");
  if (typeof text !== "string" || !text.trim() || [...text.trim()].length > 500) {
    throw new Error("Release notes must contain 1–500 characters for Google Play.");
  }
  return { version, notes: [{ language: "en-US", text: text.trim() }] };
}

export async function loadRelease() {
  const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error("Invalid package release version.");
  return releaseMetadata(pkg.version, await readFile(new URL(`releases/${pkg.version}.txt`, root), "utf8"));
}

export async function checkRelease() {
  const release = await loadRelease();
  const [android, web, worker, lockText] = await Promise.all([
    "android/app/build.gradle.kts", "public/app/index.html", "public/app/sw.js", "package-lock.json",
  ].map(path => readFile(new URL(path, root), "utf8")));
  const lock = JSON.parse(lockText);
  if (android.match(/versionName\s*=\s*"([^"]+)"/)?.[1] !== release.version ||
      web.match(/<small>Web ([^<]+)<\/small>/)?.[1] !== release.version ||
      worker.match(/const CACHE = 'fala-web-([^']+)'/)?.[1] !== release.version ||
      lock.version !== release.version || lock.packages?.[""]?.version !== release.version) {
    throw new Error("Release version must match Android, the web label/cache, package.json and package-lock.json.");
  }
  return release;
}
