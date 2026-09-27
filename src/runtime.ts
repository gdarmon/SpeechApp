import { randomUUID } from "node:crypto";

export type RuntimeObservation = {
  instance_id: string;
  invocation_number: number;
  first_invocation: boolean;
  module_age_ms: number;
};

// First application invocation is observable; platform cold-start/init time is
// not. Capture a value before awaiting work so concurrent requests cannot change it.
export function createRuntimeTracker(clock = () => performance.now()) {
  const id = randomUUID(), loadedAt = clock();
  let invocations = 0;
  return (): RuntimeObservation => ({ instance_id: id, invocation_number: ++invocations,
    first_invocation: invocations === 1, module_age_ms: Number(Math.max(0, clock() - loadedAt).toFixed(1)) });
}
