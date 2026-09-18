import { Auth, googleLoginSchema, type VerifyGoogle } from "./auth.js";
import { z } from "zod";
import type { Settings } from "./config.js";
import type { Database } from "./database.js";
import { AppError, startSchema, turnSchema, finishSchema } from "./models.js";
import { CompatibleProvider, DemoProvider, type AIProvider } from "./provider.js";
import { Sessions } from "./service.js";
import { Store, publicSession } from "./store.js";
import { Timing } from "./timing.js";

type Dependencies = {
  settings: () => Settings;
  database: (settings: Settings) => Database;
  provider?: (settings: Settings, timing: Timing) => AIProvider;
  region?: () => string;
  verifyGoogle?: VerifyGoogle;
};

async function body(request: Request): Promise<unknown> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) throw new AppError(415, "Send an application/json request.");
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 24000) { await reader.cancel(); throw new AppError(413, "Request too large."); }
    chunks.push(part.value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AppError(400, "Invalid JSON request."); }
}

export function createHandler(dependencies: Dependencies) {
  return async (request: Request, clientAddress = "local"): Promise<Response> => {
    const timing = new Timing();
    const respond = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
      status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
        "Server-Timing": timing.header(), "X-Content-Type-Options": "nosniff", ...(status === 429 ? { "Retry-After": "60" } : {}) },
    });
    try {
      const path = new URL(request.url).pathname.replace(/^\/api(?=\/)/, "").replace(/\/$/, "") || "/";
      if (path === "/health" && request.method === "GET") return respond({ status: "ok" });
      const settings = dependencies.settings();
      const database = dependencies.database(settings);
      const auth = new Auth(settings, database, timing, dependencies.verifyGoogle);
      if (path === "/auth/config" && request.method === "GET") return respond(auth.config());
      if (path === "/auth/google/challenge" && request.method === "POST") {
        z.strictObject({}).parse(await body(request));
        return respond(await auth.challenge(clientAddress));
      }
      if (path === "/auth/google" && request.method === "POST") return respond(await auth.signIn(googleLoginSchema.parse(await body(request)), clientAddress));
      const user = await auth.authorize(request);
      if (path === "/auth/logout" && request.method === "POST") { await auth.signOut(request); return respond({ signed_out: true }); }
      const store = new Store(database, timing, user.id, settings.dailyUserLimit, settings.dailyAppLimit);
      if (path === "/account" && request.method === "DELETE") {
        if (user.operator) throw new AppError(403, "Sign in with Google to delete your account.");
        await store.mutate(tx => tx.deleteAccount()); return respond({ deleted: true });
      }
      const ai = dependencies.provider?.(settings, timing) || (settings.demo ? new DemoProvider() : new CompatibleProvider(settings, timing));
      const sessions = new Sessions(store, ai);
      const status = { demo: ai.demo, ai_configured: Boolean(settings.apiKey) || ai.demo };
      if (request.method === "GET") {
        if (path === "/status") { await store.ping(); return respond(status); }
        if (path === "/diagnostics") {
          if (!user.operator) throw new AppError(403, "Operator access required.");
          await store.ping();
          const host = new URL(settings.databaseUrl).hostname;
          return respond({ ...status, database_ready: true, function_region: dependencies.region?.() || "local/unknown",
            database_region_hint: host.match(/aws-\d+-([a-z]+-[a-z]+-\d+)\.pooler\.supabase\.com/)?.[1] || null,
            model: settings.model });
        }
        if (path === "/dashboard") return respond({ status, progress: await store.progress(), history: await store.history() });
        if (path === "/progress") return respond(await store.progress());
        if (path === "/sessions") return respond(await store.history());
      }
      if (path === "/sessions" && request.method === "POST") {
        const input = startSchema.parse(await body(request));
        await store.budget();
        return respond(publicSession(await sessions.start(input)));
      }
      const match = path.match(/^\/sessions\/([^/]+)(?:\/(turns|finish))?$/);
      if (match) {
        const id = z.uuid().parse(match[1]);
        if (!match[2] && request.method === "GET") return respond(publicSession(await store.session(id)));
        if (!match[2] && request.method === "DELETE") { await store.mutate(tx => tx.delete(id)); return respond({ deleted: true }); }
        if (match[2] === "turns" && request.method === "POST") {
          const input = turnSchema.parse(await body(request));
          await store.budget();
          return respond(await sessions.turn(id, input));
        }
        if (match[2] === "finish" && request.method === "POST") {
          const input = finishSchema.parse(await body(request));
          await store.budget();
          return respond(await sessions.finish(id, input));
        }
      }
      if (path === "/learner" && request.method === "DELETE") {
        await store.mutate(tx => tx.delete()); return respond({ deleted: true });
      }
      return respond({ detail: "Endpoint or method not found." }, 404);
    } catch (error) {
      if (error instanceof AppError) return respond({ detail: error.message }, error.status);
      if (error instanceof z.ZodError) return respond({ detail: "Check the request fields, text length, language, and request ID." }, 422);
      const code = (error as { code?: string })?.code;
      if (code === "42P01" || code === "3F000") return respond({ detail: "Fala is being updated. Please try again shortly." }, 503);
      // Deliberately do not log raw exceptions: drivers can embed credentials, SQL or transcripts.
      return respond({ detail: "Fala is temporarily unavailable. Please try again shortly." }, 503);
    }
  };
}
