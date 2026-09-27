import { describe, expect, it, vi } from "vitest";
import adapter, { createProbeHandler } from "../deploy/vercel-probe/handler.js";
import type { createHandler } from "../src/api.js";

const token = "operator-test-token-at-least-32-characters";
function request(path: string, method = "GET", credential: string | null = token) {
  return new Request(`https://probe.example${path}`, { method,
    headers: credential ? { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" } : {},
    ...(method === "POST" ? { body: JSON.stringify({ route: "primary" }) } : {}) });
}
describe("isolated hosting probe", () => {
  it("serves health without configuring or connecting to a database", async () => {
    const response = await adapter.fetch(request("/api/health", "GET", null));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("server-timing")).toContain("total;dur=");
  });

  it.each(["/sessions", "/api/sessions", "/auth/google", "/api/account", "/rewards", "/api/api/diagnostics"])(
    "cannot access learner endpoint %s even with the operator token", async path => {
      const shared = vi.fn();
      const probe = createProbeHandler(shared, () => token);
      expect((await probe(request(path))).status).toBe(404);
      expect(shared).not.toHaveBeenCalled();
    });

  it("rejects learner tokens, cookies and missing credentials before shared account lookup", async () => {
    const shared = vi.fn();
    const probe = createProbeHandler(shared, () => token);
    for (const credential of [null, `fala_${"a".repeat(43)}`, "incorrect"]) {
      const input = request("/diagnostics/ai", "POST", credential);
      input.headers.set("Cookie", `fala_session=${token}`);
      expect((await probe(input)).status).toBe(401);
    }
    expect(shared).not.toHaveBeenCalled();
  });

  it("fails closed without a configured operator token and rejects unsupported methods", async () => {
    const shared = vi.fn();
    const probe = createProbeHandler(shared, () => "");
    expect((await probe(request("/diagnostics"))).status).toBe(503);
    expect((await probe(request("/health", "POST"))).status).toBe(404);
    expect((await probe(request("/diagnostics/ai"))).status).toBe(404);
    expect(shared).not.toHaveBeenCalled();
  });

  it("preserves request bodies, response timings and independent invocation snapshots during concurrent calls", async () => {
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    let arrived = 0;
    const shared: ReturnType<typeof createHandler> = async (input, address, runtime) => {
      expect(await input.json()).toEqual({ route: "primary" });
      expect(address).toBe("operator-probe");
      if (++arrived === 50) release();
      await barrier;
      return Response.json({ runtime }, { headers: { "Server-Timing": "total;dur=20, ai;dur=15" } });
    };
    const probe = createProbeHandler(shared, () => token);
    const responses = await Promise.all(Array.from({ length: 50 }, (_, i) =>
      probe(request(i % 2 ? "/diagnostics/ai" : "/api/diagnostics/ai/", "POST"))));
    const runtimes = await Promise.all(responses.map(async response => {
      expect(response.headers.get("server-timing")).toBe("total;dur=20, ai;dur=15");
      return (await response.json()).runtime;
    }));
    expect(new Set(runtimes.map(value => value.instance_id)).size).toBe(1);
    expect(new Set(runtimes.map(value => value.invocation_number)).size).toBe(50);
    expect(runtimes.filter(value => value.first_invocation)).toHaveLength(1);
  });
});
