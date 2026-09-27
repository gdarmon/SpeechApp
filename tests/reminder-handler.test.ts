import { afterEach, expect, it, vi } from "vitest";
import { createReminderHandler } from "../src/reminder-handler.js";
afterEach(() => vi.unstubAllEnvs());
it("requires the dedicated scheduler credential before any database or push access", async () => {
  const database = vi.fn(), deliver = vi.fn(async () => ({ delivered: 0 }));
  const token = "test-reminder-token-over-32-characters";
  const handler = createReminderHandler(() => token, database, deliver);
  for (const auth of [undefined, "Bearer wrong", "Bearer operator-token"]) {
    expect((await handler(new Request("https://fala.test/internal/reminders", { method: "POST", headers: auth ? { Authorization: auth } : {} }))).status).toBe(401);
  }
  expect(database).not.toHaveBeenCalled(); expect(deliver).not.toHaveBeenCalled();
  vi.stubEnv("FALA_VAPID_PUBLIC_KEY", "test-public"); vi.stubEnv("FALA_VAPID_PRIVATE_KEY", "test-private");
  expect((await handler(new Request("https://fala.test/internal/reminders", { method: "POST", headers: { Authorization: `Bearer ${token}` } }))).status).toBe(200);
  expect(deliver).toHaveBeenCalledTimes(1);
});
