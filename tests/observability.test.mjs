import { expect, it } from 'vitest';
import { observabilityTimings } from '../scripts/lib/observability.mjs';

const sample = { request_id: 'probe', total_ms: 7245.1, handler_ms: 1744.2, ai_ms: 1715.7, db_ms: 23.6 };
const detail = { timestamp: 1790489581842, duration_ns: 7089540758, status_code: 200,
  operations: [{ timestamp: 1790489587004, duration_ns: 1813669631, type: 'function', name: 'api' }] };

it('separates dashboard request duration, function duration and reported placement', () => {
  expect(observabilityTimings(sample, detail)).toMatchObject({ request_id: 'probe',
    edge_duration_ms: 7089.5, function_duration_ms: 1813.7, outside_function_ms: 5275.8,
    reported_before_function_ms: 5162, reported_after_function_ms: 113.8 });
});

it('leaves missing, ambiguous or differently scaled timings unknown', () => {
  expect(observabilityTimings(sample, {})).toMatchObject({ edge_duration_ms: null,
    function_duration_ms: null, outside_function_ms: null, reported_before_function_ms: null });
  expect(observabilityTimings(sample, { ...detail, operations: [...detail.operations, ...detail.operations] }))
    .toMatchObject({ function_operations: 2, function_duration_ms: null, outside_function_ms: null });
  expect(observabilityTimings(sample, { ...detail, timestamp: detail.timestamp * 1e6 }))
    .toMatchObject({ reported_before_function_ms: null, reported_after_function_ms: null });
});

it('does not retain client identity, headers, URLs, logs or operation metadata', () => {
  const output = observabilityTimings(sample, { ...detail, url: '/private-sentinel',
    client: { address: 'private-sentinel' }, headers: { authorization: 'private-sentinel' },
    operations: [{ ...detail.operations[0], logs: ['private-sentinel'], metadata: { secret: 'private-sentinel' } }] });
  expect(JSON.stringify(output)).not.toContain('private-sentinel');
  expect(output.function_duration_ms).toBe(1813.7);
});
