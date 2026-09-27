import { createHash, timingSafeEqual } from "node:crypto";
import { createHandler } from "../../src/api.js";
import { settingsFromEnv, type Settings } from "../../src/config.js";
import { connectDatabase, type Database } from "../../src/database.js";
import { createRuntimeTracker } from "../../src/runtime.js";

const hash = (value: string) => createHash("sha256").update(value).digest();
const reject = (status: number, detail: string) => Response.json({ detail }, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});

// The shared API intentionally suppresses raw driver errors. This isolated
// deployment logs only a fixed category to diagnose installation failures.
export function probeDatabase(database: Database): Database {
  return { ...database, query: async <T>(statement: string, values?: Parameters<Database["query"]>[1]) => {
    try { return await database.query<T>(statement, values); }
    catch (error) {
      const code = (error as { code?: unknown })?.code;
      const message = (error as { message?: unknown })?.message;
      const categories: Record<string, string> = {
        "28P01": "credentials_rejected", "28000": "authorization_rejected",
        "3D000": "database_not_found", "53300": "connection_limit",
        "ENOTFOUND": "hostname_not_found", "EAI_AGAIN": "dns_unavailable",
        "ECONNREFUSED": "connection_refused", "ETIMEDOUT": "connection_timeout",
        "CONNECT_TIMEOUT": "connection_timeout", "ECONNRESET": "connection_reset",
        "SELF_SIGNED_CERT_IN_CHAIN": "certificate_untrusted",
        "DEPTH_ZERO_SELF_SIGNED_CERT": "certificate_untrusted",
        "UNABLE_TO_VERIFY_LEAF_SIGNATURE": "certificate_untrusted",
        "ERR_TLS_CERT_ALTNAME_INVALID": "certificate_hostname_mismatch",
      };
      const category = typeof code === "string" && Object.hasOwn(categories, code) ? categories[code]
        : typeof message === "string" && /tenant or user not found/i.test(message) ? "pooler_account_not_found" : "unknown";
      console.error(JSON.stringify({ event: "fala_probe_database_failure", category }));
      throw error;
    }
  } };
}

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
  database: config => database ??= probeDatabase(connectDatabase(config)),
  region: () => process.env.VERCEL_REGION || "local/unknown",
});

export default { fetch: createProbeHandler(handler, () => process.env.FALA_TOKEN || "") };
