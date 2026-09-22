import {contentReportSchema,reportContent} from "./content-reports.js";
import { Auth, googleLoginSchema, sameOrigin, webCookie, type VerifyGoogle } from "./auth.js";
import { z } from "zod";
import type { Settings } from "./config.js";
import type { Database } from "./database.js";
import { AppError, startSchema, turnSchema, finishSchema } from "./models.js";
import { CompatibleProvider, DemoProvider, type AIProvider } from "./provider.js";
import { Sessions } from "./service.js";
import { Store, publicSession } from "./store.js";
import { Timing } from "./timing.js";
import { Speech, readRecording, speechAvailable, speechSchema } from "./speech.js";
import { Rewards, rewardSettingsSchema } from './rewards.js';
import { saveSubscription, subscriptionSchema } from './reminders.js';

type Dependencies = {
  settings: () => Settings;
  database: (settings: Settings) => Database;
  provider?: (settings: Settings, timing: Timing) => AIProvider;
  region?: () => string;
  verifyGoogle?: VerifyGoogle;
  speech?: (settings: Settings) => Pick<Speech, "transcribe" | "speak">;
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
      if (path === "/auth/web/google" && request.method === "POST") {
        sameOrigin(request);
        const { age_eligible: _eligible, ...input } = googleLoginSchema.extend({ age_eligible: z.literal(true) }).parse(await body(request));
        const login = await auth.signIn(input, clientAddress);
        const response = respond({ email: login.email, expires_at: login.expires_at });
        response.headers.set("Set-Cookie", webCookie(login.token)); return response;
      }
      const user = await auth.authorize(request);
      if (path === "/auth/me" && request.method === "GET") return respond(await auth.account(user.id));
      if (path === "/auth/logout" && request.method === "POST") { await auth.signOut(request); const response = respond({ signed_out: true }); response.headers.set("Set-Cookie", webCookie()); return response; }
      const store = new Store(database, timing, user.id, settings.dailyUserLimit, settings.dailyAppLimit);
      const rewards = new Rewards(store, user.id);
      if (path === '/content-reports' && request.method === 'POST') {
        const input=contentReportSchema.parse(await body(request));
        return respond(await store.mutate(tx=>reportContent(tx,user.id,input)));
      }
      if (path === '/rewards/push' && request.method === 'POST') {
        const input=subscriptionSchema.parse(await body(request));
        return respond(await store.mutate(tx=>saveSubscription(tx,user.id,input)));
      }
      if (path === '/rewards/push/remove' && request.method === 'POST') {
        const input=z.strictObject({endpoint:z.string().max(2048)}).parse(await body(request));
        await store.query('DELETE FROM fala.push_subscriptions WHERE user_id=$1::uuid AND endpoint=$2',[user.id,input.endpoint]);
        return respond({removed:true});
      }
      if (path === '/rewards' && request.method === 'GET') return respond(await rewards.snapshot());
      if (path === '/rewards/settings' && request.method === 'POST') {
        const input = rewardSettingsSchema.parse(await body(request));
        return respond(await store.mutate(tx => new Rewards(tx,user.id).settings(input)));
      }
      if (path === '/rewards/reminder' && request.method === 'POST') {
        z.strictObject({}).parse(await body(request));
        const language=z.enum(['en-US','he-IL']).optional().parse(new URL(request.url).searchParams.get('language')??undefined);
        return respond(await store.mutate(tx => new Rewards(tx,user.id).claimReminder(language)));
      }
      if (path === '/friends' && request.method === 'GET') return respond(await rewards.social());
      if (path === '/friends' && request.method === 'POST') {
        const input = z.discriminatedUnion('action',[
          z.strictObject({ action:z.literal('create'),value:z.string().trim().min(1).max(50) }),
          z.strictObject({ action:z.literal('join'),value:z.string().regex(/^[A-Za-z0-9_-]{24}$/) }),
          z.strictObject({ action:z.enum(['leave','rotate']) }),
        ]).parse(await body(request));
        if(input.action==='create' || input.action==='join') await rewards.circleBudget();
        return respond(await store.mutate(tx => new Rewards(tx,user.id).circle(input.action,'value' in input?input.value:'')));
      }
      if (path === "/account" && request.method === "DELETE") {
        if (user.operator) throw new AppError(403, "Sign in with Google to delete your account.");
        await store.mutate(tx => tx.deleteAccount()); return respond({ deleted: true });
      }
      const ai = dependencies.provider?.(settings, timing) || (settings.demo ? new DemoProvider() : new CompatibleProvider(settings, timing));
      const sessions = new Sessions(store, ai);
      const speech = dependencies.speech?.(settings) ?? new Speech(settings);
      if (path === "/speech/status" && request.method === "GET") return respond({ available: speechAvailable(settings) });
      if (path === "/speech/transcribe" && request.method === "POST") {
        const language = z.enum(["pt", "he", "en"]).parse(new URL(request.url).searchParams.get("language") ?? "pt");
        const recording = await readRecording(request);
        await store.budget();
        return respond(await speech.transcribe(recording, language));
      }
      const status = { demo: ai.demo, ai_configured: Boolean(settings.apiKey) || ai.demo, speech: { transcription: settings.transcription.provider, voice: settings.voiceApiKey ? "openai" : "none" } };
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
        if (path === "/dashboard") return respond({ status, progress: await store.progress(), history: await store.history(), rewards: await rewards.snapshot() });
        if (path === "/progress") return respond(await store.progress());
        if (path === "/sessions") return respond(await store.history());
      }
      if (path === "/sessions" && request.method === "POST") {
        const input = startSchema.parse(await body(request));
        await store.budget();
        return respond(publicSession(await sessions.start(input)));
      }
      const match = path.match(/^\/sessions\/([^/]+)(?:\/(turns|finish|speech))?$/);
      if (match) {
        const id = z.uuid().parse(match[1]);
        if (match[2] === "speech" && request.method === "POST") {
          const input = speechSchema.parse(await body(request));
          const session = await store.session(id);
          const reply = input.turn_id === null ? session.opening : session.turns.find(turn => turn.id === input.turn_id)?.reply;
          if (!reply) throw new AppError(404, "Conversation reply not found.");
          const suggestion = input.suggestion_index === null ? null : reply.suggested_replies?.[input.suggestion_index];
          if (input.suggestion_index !== null && !suggestion) throw new AppError(404, "Suggested answer not found.");
          // Select only saved, owned text. A suggested answer must not include the partner's correction.
          const spoken = suggestion ? { ...reply, text: suggestion.text, turn_feedback: null } : reply;
          await store.budget();
          return new Response(await speech.speak(spoken), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Server-Timing": timing.header() } });
        }
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
      if (error instanceof AppError) {
        const response = respond({ detail: error.message, ...(error.code ? { code: error.code } : {}),
          ...(error.retryAfterSeconds ? { retry_after_seconds: error.retryAfterSeconds } : {}) }, error.status);
        if (error.retryAfterSeconds) response.headers.set("Retry-After", String(error.retryAfterSeconds));
        return response;
      }
      if (error instanceof z.ZodError) return respond({ detail: "Check the request fields, text length, language, and request ID." }, 422);
      const code = (error as { code?: string })?.code;
      if (code === "42P01" || code === "3F000") return respond({ detail: "Fala is being updated. Please try again shortly." }, 503);
      // Deliberately do not log raw exceptions: drivers can embed credentials, SQL or transcripts.
      return respond({ detail: "Fala is temporarily unavailable. Please try again shortly." }, 503);
    }
  };
}
