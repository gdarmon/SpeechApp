import { createHandler } from "../../src/api.js";
import { settingsFromEnv, type Settings } from "../../src/config.js";
import { connectDatabase, type Database } from "../../src/database.js";
import { createRuntimeTracker } from "../../src/runtime.js";
import { createProbeHandler } from "../vercel-probe/handler.js";
import { createReminderHandler } from "../../src/reminder-handler.js";
import { createSessionProbe } from "../vercel-probe/sessions.js";

// The website and API share the Vercel origin; forwarded hosts never authorize CSRF.
export const PUBLIC_ORIGIN = "https://fala-api.vercel.app";
export function createVercelHandler(handler: ReturnType<typeof createHandler>, runtime = createRuntimeTracker(), isolated?: (request: Request) => Promise<Response>, reminders?: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    const source = new URL(request.url);
    const route = source.pathname === "/api/service" ? source.searchParams.get("route") : source.pathname;
    if (!route || !/^\/[a-zA-Z][a-zA-Z0-9_/-]{0,239}$/.test(route)) return Response.json({ detail: "Endpoint not found." }, { status: 404 });
    const target = new URL(route, PUBLIC_ORIGIN);
    // Rewrites add their private route parameter; learner options such as the
    // transcription/support language must reach the shared API unchanged.
    for (const [name, value] of source.searchParams) {
      if (source.pathname !== "/api/service" || name !== "route") target.searchParams.append(name, value);
    }
    const forwarded = new Request(target, request);
    const response = route === "/internal/reminders" && reminders ? await reminders(forwarded) : route === "/diagnostics/session" && isolated ? await isolated(forwarded)
      : await handler(forwarded, request.headers.get("x-vercel-forwarded-for") || "unknown", runtime());
    response.headers.set("X-Fala-Host", "vercel");
    return response;
  };
}
let settings: Settings | undefined;
let database: Database | undefined;
const handler = createHandler({ settings: () => settings ??= settingsFromEnv(),
  database: config => database ??= connectDatabase(config), region: () => process.env.VERCEL_REGION || "unknown" });
const isolated = process.env.FALA_SESSION_DIAGNOSTICS === "true" ? createProbeHandler(handler, () => process.env.FALA_TOKEN || "", createRuntimeTracker(),
  createSessionProbe(() => settings ??= settingsFromEnv(), () => database ??= connectDatabase(settings ??= settingsFromEnv()))) : undefined;
const reminders = createReminderHandler(() => process.env.FALA_REMINDER_TOKEN || "", () => database ??= connectDatabase(settings ??= settingsFromEnv()));
export default { fetch: createVercelHandler(handler, createRuntimeTracker(), isolated, reminders) };
