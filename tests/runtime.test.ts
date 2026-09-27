import { expect, it } from "vitest";
import { createRuntimeTracker } from "../src/runtime.js";

it("distinguishes first and reused invocations without rewriting earlier snapshots", () => {
  let now = 100;
  const observe = createRuntimeTracker(() => now);
  const first = observe();
  now += 250;
  const second = observe();
  expect(first).toMatchObject({ invocation_number: 1, first_invocation: true, module_age_ms: 0 });
  expect(second).toEqual({ ...first, invocation_number: 2, first_invocation: false, module_age_ms: 250 });
  expect(createRuntimeTracker(() => now)().instance_id).not.toBe(first.instance_id);
});
