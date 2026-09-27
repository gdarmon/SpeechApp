const ms = value => Number.isFinite(value) && value >= 0 ? Number((value / 1e6).toFixed(1)) : null;
const rounded = value => Number(value.toFixed(1));

// Only numeric timings and the original probe ID leave this boundary. Dashboard
// records also contain client addresses and logs, which must not be retained.
export function observabilityTimings(sample, detail) {
  const operations = (Array.isArray(detail?.operations) ? detail.operations : [])
    .filter(operation => operation.type === 'function' && operation.name === 'api');
  const operation = operations.length === 1 ? operations[0] : null;
  const requestMs = ms(detail?.duration_ns), functionMs = ms(operation?.duration_ns);
  const requestStart = detail?.timestamp, functionStart = operation?.timestamp;
  // Dashboard timestamps are epoch milliseconds; do not interpret another unit
  // as a valid wait or report absent timestamps as zero.
  const epochMs = value => Number.isSafeInteger(value) && value >= 1e12 && value < 1e13;
  const beforeMs = epochMs(requestStart) && epochMs(functionStart) ? functionStart - requestStart : null;
  return {
    request_id: sample.request_id,
    status_code: Number.isInteger(detail?.status_code) ? detail.status_code : null,
    client_total_ms: sample.total_ms, handler_ms: sample.handler_ms, ai_ms: sample.ai_ms, db_ms: sample.db_ms,
    edge_duration_ms: requestMs, function_operations: operations.length, function_duration_ms: functionMs,
    outside_function_ms: requestMs !== null && functionMs !== null ? rounded(requestMs - functionMs) : null,
    reported_before_function_ms: beforeMs,
    reported_after_function_ms: requestMs !== null && functionMs !== null && beforeMs !== null
      ? rounded(requestMs - functionMs - beforeMs) : null,
  };
}
