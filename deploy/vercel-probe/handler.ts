import { createHash, timingSafeEqual } from "node:crypto";
import { createHandler } from "../../src/api.js";
import { settingsFromEnv, type Settings } from "../../src/config.js";
import { connectDatabase, type Database } from "../../src/database.js";
import { createRuntimeTracker } from "../../src/runtime.js";

const hash = (value: string) => createHash("sha256").update(value).digest();
const reject = (status: number, detail: string) => Response.json({ detail }, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});

// An isolated hosting comparison, not an alternative learner API. Reject all
// learner credentials/routes before the shared handler can read their account.
export function createProbeHandler(handler: ReturnType<typeof createHandler>,
  operatorToken: () => string, runtime = createRuntimeTracker()) {
  return async (request: Request) => {
    const invocation = runtime();
    const path = new URL(request.url).pathname.replace(/^\/api(?=\/)/, "").replace(/\/$/, "");
    const allowed = request.method === "GET" && ["/health", "/diagnostics"].includes(path)
      || request.method === "POST" && path === "/diagnostics/ai";
    if (!allowed) return reject(404, "Endpoint or method not found.");
    if (path !== "/health") {
      const token = operatorToken();
      if (token.length < 32) return reject(503, "Operator diagnostics are not configured.");
      if (!timingSafeEqual(hash(request.headers.get("Authorization") || ""), hash(`Bearer ${token}`))) {
        return reject(401, "Operator access required.");
      }
    }
    return handler(request, "operator-probe", invocation);
  };
}

let settings: Settings | undefined;
let database: Database | undefined;
const handler = createHandler({
  settings: () => settings ??= settingsFromEnv(),
  database: config => database ??= connectDatabase(config),
  region: () => process.env.VERCEL_REGION || "local/unknown",
});

export default { fetch: createProbeHandler(handler, () => process.env.FALA_TOKEN || "") };
