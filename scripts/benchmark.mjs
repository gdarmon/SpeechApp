// Read-only timing check. Does not send transcripts, invoke the AI, or print the token.
const url = process.env.FALA_URL;
const token = process.env.FALA_TOKEN;
if (!url || !token) throw new Error("Set FALA_URL to your deployed HTTPS site and FALA_TOKEN to its device token.");
if (new URL(url).protocol !== "https:" && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Use HTTPS for a hosted server.");
const samples = [];
for (let index = 0; index < 8; index++) {
  const start = performance.now();
  const response = await fetch(url.replace(/\/$/, "") + "/diagnostics", { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Diagnostics returned HTTP ${response.status}. Check the token and deployment settings.`);
  const data = await response.json();
  const elapsed = Math.round(performance.now() - start);
  samples.push(elapsed);
  console.log(JSON.stringify({ request: index + 1, round_trip_ms: elapsed, server_timing: response.headers.get("server-timing"),
    function_region: data.function_region, database_region_hint: data.database_region_hint }));
}
const warm = samples.slice(1).sort((a,b) => a-b);
console.log(`First request: ${samples[0]} ms. Subsequent median: ${warm[Math.floor(warm.length/2)]} ms; slowest: ${warm.at(-1)} ms.`);
console.log("Run on your Haifa connection. These read-only samples exclude recognition, AI generation, and speech playback.");
