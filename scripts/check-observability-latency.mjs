// Read-only counterpart to check-latency.mjs: exact-request dashboard timings.
// This dashboard endpoint is undocumented and may change. Fail explicitly rather
// than treating missing observations as zero or silently changing API routes.
import { readFile, writeFile } from 'node:fs/promises';
import { getToken } from '../node_modules/netlify-cli/dist/utils/command-helpers.js';
import { percentile } from './lib/latency.mjs';
import { observabilityTimings } from './lib/observability.mjs';

const file = process.argv[2];
if (!file) throw Error('Pass a synthetic AI report from scripts/check-latency.mjs. Uses the existing Netlify CLI login.');
const report = JSON.parse(await readFile(file, 'utf8'));
const siteId = process.env.NETLIFY_SITE_ID || 'ed619bd9-b888-4276-b235-9733f4d3cd0d';
const from = Date.parse(report.started_at) - 5000, to = Date.parse(report.finished_at) + 5000;
if (report.target !== 'ai' || !/^[\da-f-]{36}$/.test(siteId)
  || !Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 300000
  || !Array.isArray(report.results) || !report.results.length || report.results.length > 100
  || report.results.some(sample => !/^[0-9A-Z]{26}$/.test(sample.request_id || '')))
  throw Error('Expected a bounded synthetic AI report (at most five minutes / 100 Netlify request IDs).');
const [token] = await getToken();
if (!token) throw Error('Sign in through the established Netlify CLI connection.');

const results = [];
for (let offset = 0; offset < report.results.length; offset += 5) {
  results.push(...await Promise.all(report.results.slice(offset, offset + 5).map(async sample => {
    const url = new URL(`https://api.netlify.com/api/v1/sites/${siteId}/observability/requests/${sample.request_id}`);
    url.searchParams.set('from_ts', String(from)); url.searchParams.set('to_ts', String(to));
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` },
        redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response.ok) return { request_id: sample.request_id, matched: false, error: `http_${response.status}` };
      const detail = observabilityTimings(sample, await response.json());
      const matched = detail.edge_duration_ms !== null && detail.function_duration_ms !== null;
      return { ...detail, matched, ...(!matched ? { error: 'missing_function_timing' } : {}) };
    } catch {
      return { request_id: sample.request_id, matched: false, error: 'request_failed' };
    }
  })));
}
const metrics = ['edge_duration_ms', 'function_duration_ms', 'outside_function_ms',
  'reported_before_function_ms', 'reported_after_function_ms'];
const summary = { requests: results.length, matched: results.filter(row => row.matched).length,
  metrics: Object.fromEntries(metrics.map(metric => [metric, {
    samples: results.filter(row => Number.isFinite(row[metric])).length,
    p50: percentile(results.map(row => row[metric]), .5),
    p95: percentile(results.map(row => row[metric]), .95),
    max: percentile(results.map(row => row[metric]), 1),
  }])) };
const output = { fetched_at: new Date().toISOString(), site_id: siteId, source: file,
  note: 'Netlify dashboard request details, joined by exact request ID. Durations are separate from application spans; do not add them. Timestamp-derived intervals are platform-reported placement, not a measured internal queue or a synchronized-clock guarantee. Missing details may still be ingesting.',
  summary, results };
const destination = file.replace(/\.json$/, '') + '-observability.json';
await writeFile(destination, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ report: destination, ...summary }));
if (summary.matched !== summary.requests) process.exitCode = 2;
