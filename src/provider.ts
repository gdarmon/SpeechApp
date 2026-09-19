import { z } from "zod";
import type { Settings } from "./config.js";
import { AppError, feedbackSchema, replySchema, type Feedback, type Reply } from "./models.js";
import { PARTNER, FEEDBACK } from "./prompts.js";
import type { Timing } from "./timing.js";

const coachingReplySchema = replySchema.refine(reply => reply.translation.length > 0 && reply.suggested_replies.length === 2,
  "A coaching reply needs a translation and two reply ideas.");

export interface AIProvider {
  demo: boolean;
  reply(context: Record<string, unknown>): Promise<Reply>;
  feedback(context: Record<string, unknown>): Promise<Feedback>;
}

export class CompatibleProvider implements AIProvider {
  readonly demo = false;
  constructor(private settings: Settings, private timing: Timing, private request = fetch) {}

  private async complete<T>(prompt: string, context: Record<string, unknown>, schema: z.ZodType<T>, feedback = false): Promise<T> {
    if (!this.settings.apiKey) throw new AppError(503, "Set the AI provider key on the server before starting a conversation.");
    const body: Record<string, unknown> = {
      model: this.settings.model,
      messages: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify(context) }],
      response_format: { type: "json_object" }, max_completion_tokens: feedback ? 4096 : 2048,
    };
    const host = new URL(this.settings.baseUrl).hostname;
    if (host === "api.openai.com") body.store = false;
    if (host === "api.groq.com" && this.settings.model.startsWith("openai/gpt-oss-")) body.reasoning_effort = "low";
    return this.timing.measure("ai", async () => {
      try {
        const response = await this.request(this.settings.baseUrl.replace(/\/$/, "") + "/chat/completions", {
          method: "POST", headers: { Authorization: `Bearer ${this.settings.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body), signal: AbortSignal.timeout(this.settings.aiTimeoutMs), redirect: "error",
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new AppError(503, response.status === 429 ? "The AI service is busy or its quota is exhausted. Retry shortly."
            : "The AI service rejected the request. Check the server's provider configuration.");
        }
        const result = await response.json();
        const choice = result?.choices?.[0];
        if (choice?.finish_reason !== "stop") throw new AppError(503, "The AI response was incomplete. Please retry.");
        return schema.parse(JSON.parse(choice.message.content));
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof TypeError && /JSON|properties/.test(error.message)) {
          throw new AppError(503, "The AI returned an invalid response. Please retry.");
        }
        throw new AppError(503, "The AI connection timed out or was interrupted. Your saved conversation is safe; retry.");
      }
    });
  }
  reply(context: Record<string, unknown>) { return this.complete(PARTNER, context, coachingReplySchema); }
  feedback(context: Record<string, unknown>) { return this.complete(FEEDBACK, context, feedbackSchema, true); }
}

export class DemoProvider implements AIProvider {
  readonly demo = true;
  async reply(context: Record<string, unknown>) {
    if (context.action === "help") return replySchema.parse({ text: "Este é um teste de conexão. Vamos continuar em português?",
      explanation: "Translation requires a configured AI provider; demo mode cannot translate." });
    if (context.action === "start") return replySchema.parse({ text: "Oi! Este é um teste de voz. Como foi o seu dia?", pace: "slow", topic: "Voice connection test" });
    const questions = ["O que você gosta de fazer no fim de semana?", "Me conta um pouco sobre uma viagem que você fez.", "E o que você pretende fazer amanhã?"];
    return replySchema.parse({ text: questions[Number(context.turn_count || 0) % questions.length] });
  }
  async feedback() { return feedbackSchema.parse({ summary: "Connection test completed. No AI assessment or learning feedback was generated." }); }
}
