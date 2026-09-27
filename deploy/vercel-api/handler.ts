import { createHandler } from "../../src/api.js";
import { settingsFromEnv, type Settings } from "../../src/config.js";
import { connectDatabase, type Database } from "../../src/database.js";
import { createRuntimeTracker } from "../../src/runtime.js";

// The public client origin stays on Netlify. Never derive this from an
// untrusted forwarded-host header: cookie mutations keep their CSRF check.
export const PUBLIC_ORIGIN = "https://falachatapp.netlify.app";
export function createVercelHandler(handler: ReturnType<typeof createHandler>, runtime = createRuntimeTracker()) {
  return async (request: Request) => {
    const source = new URL(request.url);
    const route = source.pathname === "/api/service" ? source.searchParams.get("route") : source.pathname;
    if (!route || !/^\/[a-zA-Z][a-zA-Z0-9_/-]{0,239}$/.test(route)) return Response.json({ detail: "Endpoint not found." }, { status: 404 });
    const target = new URL(route, PUBLIC_ORIGIN);
    const response = await handler(new Request(target, request), request.headers.get("x-vercel-forwarded-for") || "unknown", runtime());
    response.headers.set("X-Fala-Host", "vercel");
    return response;
  };
}
let settings: Settings | undefined;
let database: Database | undefined;
const handler = createHandler({ settings: () => settings ??= settingsFromEnv(),
  database: config => database ??= connectDatabase(config), region: () => process.env.VERCEL_REGION || "unknown" });
export default { fetch: createVercelHandler(handler) };
