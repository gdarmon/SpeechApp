import { z } from "zod";
import { AppError, type Reply } from "./models.js";
import type { Settings } from "./config.js";

export const AUDIO_LIMIT = 2_000_000;
export const speechSchema = z.strictObject({
  turn_id: z.number().int().positive().nullable().default(null),
  suggestion_index: z.number().int().min(0).max(1).nullable().default(null),
});
const formats: Record<string, string> = { "audio/mp4": "mp4", "video/mp4": "mp4", "audio/webm": "webm", "video/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mpeg": "mp3" };
export const speechAvailable = (settings: Settings) => !settings.demo && !!settings.transcription.apiKey && !!settings.voiceApiKey;

export async function readRecording(request: Request) {
  const mime = (request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (!formats[mime]) throw new AppError(415, "This recording format is not supported. Try Safari or Chrome.");
  const size = Number(request.headers.get("Content-Length"));
  if (size > AUDIO_LIMIT) throw new AppError(413, "Keep your recording under 45 seconds.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "Record a short answer first.");
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    length += chunk.value.length;
    if (length > AUDIO_LIMIT) { await reader.cancel(); throw new AppError(413, "Keep your recording under 45 seconds."); }
    chunks.push(chunk.value);
  }
  if (length < 128) throw new AppError(400, "The recording was empty. Hold the button while you speak.");
  return { bytes: Buffer.concat(chunks), mime, extension: formats[mime] };
}

export function spokenReply(reply: Reply) {
  const correction = reply.turn_feedback?.kind === "correction" ? reply.turn_feedback.natural : "";
  return correction && !reply.text.includes(correction) ? `${correction}. ${reply.text}` : reply.text;
}

export class Speech {
  constructor(private settings: Settings, private request = fetch) {}
  private async send(path: string, body: BodyInit, headers: Record<string, string> = {}) {
    const transcribing = path === "transcriptions";
    const key = transcribing ? this.settings.transcription.apiKey : this.settings.voiceApiKey;
    const host = transcribing && this.settings.transcription.provider === "groq" ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1";
    if (this.settings.demo || !key) throw new AppError(503, "Online voice is not available. You can type your answer instead.");
    try {
      const response = await this.request(`${host}/audio/${path}`, { method: "POST", redirect: "error",
        headers: { Authorization: `Bearer ${key}`, ...headers }, body, signal: AbortSignal.timeout(25000) });
      if (!response.ok) { await response.body?.cancel(); throw new AppError(503, "The voice service is busy. Please try again shortly."); }
      return response;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, "The voice request was interrupted. Please try again.");
    }
  }
  async transcribe(recording: Awaited<ReturnType<typeof readRecording>>, language: string) {
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(recording.bytes)], { type: recording.mime }), `answer.${recording.extension}`);
    form.set("model", this.settings.transcription.provider === "groq" ? "whisper-large-v3-turbo" : "gpt-4o-mini-transcribe"); form.set("language", language); form.set("response_format", "json");
    const response = await this.send("transcriptions", form);
    const data = await response.json().catch(() => ({}));
    if (typeof data.text !== "string" || !data.text.trim()) throw new AppError(422, "I couldn't hear an answer. Please record it again, or type it.");
    if (data.text.length > 2500) throw new AppError(422, "Please use a shorter answer.");
    return { text: data.text.trim() };
  }
  async speak(reply: Reply) {
    const response = await this.send("speech", JSON.stringify({ model: "gpt-4o-mini-tts", voice: "coral", input: spokenReply(reply),
      instructions: "Speak in Brazilian Portuguese, warmly and clearly, at a natural conversational pace. Use clear pronunciation and natural pauses, without stretching syllables or adding long pauses between words. Read the supplied Portuguese exactly.", response_format: "mp3" }), { "Content-Type": "application/json" });
    return response.arrayBuffer();
  }
}
