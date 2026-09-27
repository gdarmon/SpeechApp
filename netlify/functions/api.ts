import type { Config, Context } from "@netlify/functions";
import { createHandler } from "../../src/api.js";
import { settingsFromEnv, type Settings } from "../../src/config.js";
import { connectDatabase, type Database } from "../../src/database.js";
import { createRuntimeTracker } from "../../src/runtime.js";

let settings: Settings | undefined;
let database: Database | undefined;
const runtime = createRuntimeTracker();

const handler = createHandler({
  settings: () => settings ??= settingsFromEnv(),
  database: config => database ??= connectDatabase(config),
  region: () => process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "local/unknown",
});

export default (request: Request, context: Context) => handler(request, context.ip || "unknown", runtime());

export const config: Config = {
  path: ["/auth/*", "/account", "/content-reports", "/health", "/status", "/dashboard", "/diagnostics", "/diagnostics/ai", "/progress", "/sessions", "/sessions/*", "/speech/*", "/learner", "/rewards", "/rewards/*", "/friends", "/api/*"],
};
