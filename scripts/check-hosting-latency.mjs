// Correlates only request IDs from a bounded synthetic report. No generated text,
// credentials, or unrelated hosting log messages are written to the output.
import { readFile, writeFile } from 'node:fs/promises';
import { getToken } from '../node_modules/netlify-cli/dist/utils/command-helpers.js';
import { fetchHistoricalLogs, buildFunctionLogsUrl } from '../node_modules/netlify-cli/dist/commands/logs/log-api.js';
import { correlatePlatform } from './lib/latency.mjs';

const file = process.argv[2];
if (!file) throw Error('Pass the JSON report from scripts/check-latency.mjs. Requires the existing authorized Netlify CLI login.');
const report = JSON.parse(await readFile(file, 'utf8'));
const siteId = process.env.NETLIFY_SITE_ID || 'ed619bd9-b888-4276-b235-9733f4d3cd0d';
const from = Date.parse(report.started_at) - 2000, to = Date.parse(report.finished_at) + 2000;
if (!/^[\da-f-]{36}$/.test(siteId) || !Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 300000
  || !Array.isArray(report.results) || !report.results.length || report.results.length > 100) throw Error('Expected a bounded Fala latency report (at most five minutes / 100 requests).');
const [token] = await getToken();
if (!token) throw Error('Sign in through the established Netlify CLI connection. Do not copy tokens into this script.');
const logs = await fetchHistoricalLogs({ baseUrl: buildFunctionLogsUrl({ siteId, functionName: 'api' }),
  accessToken: token, from, to });
const results = correlatePlatform(report.results, logs);
const output = { fetched_at: new Date().toISOString(), site_id: siteId, source: file,
  matched: results.filter(row => row.matched).length, requests: results.length,
  note: 'Platform timestamp offsets use different wall clocks. Platform duration and handler spans can overlap initialization; do not add them together. Missing logs are unknown and may arrive later.', results };
const destination = file.replace(/\.json$/, '') + '-hosting.json';
await writeFile(destination, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ report: destination, matched: output.matched, requests: output.requests }));
if (output.matched !== output.requests) process.exitCode = 2;
