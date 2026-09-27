import { z } from "zod";
import { createHandler } from "../../src/api.js";
import type { Settings } from "../../src/config.js";
import type { Database, Executor } from "../../src/database.js";
import { CompatibleProvider } from "../../src/provider.js";
import type { RuntimeObservation } from "../../src/runtime.js";

// Only the isolated diagnostic adapter imports this. No production learner
// tables are copied or queried, even if a real learner token is supplied.
export function isolatedSessionDatabase(database: Database): Database {
  const wrap = (executor: Executor): Executor => ({ query: (sql, values) =>
    executor.query(sql.replace(/\bfala\./g, "fala_latency_probe."), values) });
  return { ...wrap(database), transaction: action => database.transaction(tx => action(wrap(tx))), close: () => database.close() };
}

const envelope = z.strictObject({
  method: z.enum(["GET", "POST", "DELETE"]),
  path: z.string().max(150).regex(/^(?:\/sessions(?:\/[0-9a-f-]{36}(?:\/(?:turns|finish|speech))?)?|\/speech\/transcribe)$/),
  body: z.unknown().optional(),
});

export function createSessionProbe(settings: () => Settings, database: () => Database) {
  return async (request: Request, runtime: RuntimeObservation) => {
    const token = request.headers.get("X-Fala-Test-Learner") || "";
    if (!/^fala_[A-Za-z0-9_-]{43}$/.test(token)) return Response.json({ detail: "Synthetic learner credential required." }, { status: 401 });
    const reader = request.body?.getReader();
    const parts: Uint8Array[] = []; let size = 0;
    if (reader) for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.length;
      if (size > 2700000) { await reader.cancel(); return Response.json({ detail: "Request too large." }, { status: 413 }); }
      parts.push(chunk.value);
    }
    let input: z.infer<typeof envelope>;
    try { input = envelope.parse(JSON.parse(Buffer.concat(parts).toString("utf8"))); }
    catch { return Response.json({ detail: "Invalid isolated session request." }, { status: 422 }); }
    if (size > 24000 && input.path !== "/speech/transcribe") return Response.json({ detail: "Request too large." }, { status: 413 });
    if (input.method === "GET" && input.body !== undefined) return Response.json({ detail: "GET cannot have a body." }, { status: 422 });
    let recording: Uint8Array<ArrayBuffer> | undefined;
    if (input.path === "/speech/transcribe") {
      const audio = z.strictObject({ mp3_base64: z.string().min(172).max(2666668).regex(/^[A-Za-z0-9+/]*={0,2}$/) }).safeParse(input.body);
      if (input.method !== "POST" || !audio.success) return Response.json({ detail: "Synthetic MP3 required." }, { status: 422 });
      recording = new Uint8Array(Buffer.from(audio.data.mp3_base64, "base64"));
    }
    let provider: CompatibleProvider | undefined;
    const handler = createHandler({ settings, database: () => isolatedSessionDatabase(database()),
      provider: (config, timing) => provider = new CompatibleProvider(config, timing) });
    const response = await handler(new Request(new URL(input.path, request.url), {
      method: input.method, headers: { Authorization: `Bearer ${token}`, "Content-Type": recording ? "audio/mpeg" : "application/json" },
      ...(input.body === undefined ? {} : { body: recording ?? JSON.stringify(input.body) }),
    }));
    response.headers.set("X-Fala-Probe-Mode", "isolated-session");
    response.headers.set("X-Fala-Probe-Runtime", JSON.stringify(runtime));
    const observations = provider?.observations || [];
    response.headers.set("X-Fala-Probe-Input-Tokens", String(observations.reduce((sum, row) => sum + (row.input_tokens || 0), 0)));
    response.headers.set("X-Fala-Probe-Output-Tokens", String(observations.reduce((sum, row) => sum + (row.output_tokens || 0), 0)));
    response.headers.set("X-Fala-Probe-AI-Calls", String(observations.length));
    return response;
  };
}
