import { z } from "zod";
import type { Settings } from "./config.js";
import { AppError, feedbackSchema, replySchema, turnFeedbackSchema, type Feedback, type Reply } from "./models.js";
import { PARTNER, FEEDBACK } from "./prompts.js";
import type { Timing } from "./timing.js";
import { coachingReplySchema } from "./coaching.js";

export interface AIProvider {
  demo: boolean;
  reply(context: Record<string, unknown>): Promise<Reply>;
  feedback(context: Record<string, unknown>): Promise<Feedback>;
}

// Generate the wire shape from the same contracts we validate. Defaults are for older
// saved replies, not optional fields in a newly generated response.
function generationSchema(context: Record<string, unknown>, feedback: boolean) {
  const answerFeedback = z.union([
    turnFeedbackSchema.extend({ kind: z.literal("correction") }),
    turnFeedbackSchema.extend({ kind: z.enum(["ok", "clarify", "guided"]), said: z.literal(""), natural: z.literal("") }),
  ]);
  const schema = feedback ? feedbackSchema : replySchema.extend({
    turn_feedback: context.action === "continue" ? answerFeedback : z.null(),
    suggested_replies: replySchema.shape.suggested_replies.unwrap().length(context.last_turn === true ? 0 : 2),
    text: z.string().min(1).max(context.action === "start" ? 70 : 110),
  });
  return JSON.parse(JSON.stringify(z.toJSONSchema(schema), (key, value) =>
    key === "default" || key === "$schema" ? undefined : value));
}

export class CompatibleProvider implements AIProvider {
  readonly demo = false;
  constructor(private settings: Settings, private timing: Timing, private request = fetch) {}

  private async complete<T>(prompt: string, context: Record<string, unknown>, schema: z.ZodType<T>, feedback = false): Promise<T> {
    if (!this.settings.apiKey) throw new AppError(503, "Set the AI provider key on the server before starting a conversation.");
    const body: Record<string, unknown> = {
      model: this.settings.model,
      messages: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify(context) }],
      response_format: { type: "json_object" }, max_completion_tokens: feedback
        ? (Array.isArray(context.vocabulary_words) && context.vocabulary_words.length > 80 ? 8192 : 4096) : 2048,
    };
    const host = new URL(this.settings.baseUrl).hostname;
    if (host === "api.openai.com") body.store = false;
    if (host === "api.groq.com" && ["openai/gpt-oss-20b", "openai/gpt-oss-120b"].includes(this.settings.model)) {
      body.reasoning_effort = "medium";
      body.response_format = { type: "json_schema", json_schema: { name: feedback ? "practice_summary" : "practice_reply",
        strict: true, schema: generationSchema(context, feedback) } };
    }
    return this.timing.measure("ai", async () => {
      const deadline = performance.now() + this.settings.aiTimeoutMs;
      let repairHint = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const remaining = Math.floor(deadline - performance.now());
          if (remaining < 1) throw new Error("AI deadline reached");
          if (attempt === 1 && repairHint) body.messages = [
            { role: "system", content: prompt + "\nThe previous generation could not be used. Return complete, concise JSON with exactly the required fields. Keep Portuguese and translated text in their specified fields; never mix Hebrew letters into Portuguese. " + repairHint },
            { role: "user", content: JSON.stringify(context) },
          ];
          const response = await this.request(this.settings.baseUrl.replace(/\/$/, "") + "/chat/completions", {
            method: "POST", headers: { Authorization: `Bearer ${this.settings.apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(body), signal: AbortSignal.timeout(remaining), redirect: "error",
          });
          if (!response.ok) {
            await response.body?.cancel();
            const retryAfter = response.headers.get("Retry-After");
            const delay = retryAfter === null ? NaN : Number(retryAfter) * 1000;
            // A brief provider throttle can clear within this request. Never loop on
            // quota exhaustion or wait beyond the original function/AI deadline.
            if (response.status === 429 && attempt === 0 && Number.isFinite(delay) && delay >= 0 && delay <= 5000
              && deadline - performance.now() > delay + 1000) {
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
            throw new AppError(503, response.status === 429 ? "The AI service is busy or its quota is exhausted. Retry shortly."
              : response.status >= 500 ? "The AI service is temporarily unavailable. Please retry shortly."
                : "The AI service rejected the request. Check the server's provider configuration.");
          }
          const result = await response.json();
          const choice = result?.choices?.[0];
          if (choice?.finish_reason === "length" && attempt === 0 && deadline - performance.now() > 1000) {
            repairHint = "The previous response was too long. Keep the response concise.";
            continue;
          }
          if (choice?.finish_reason !== "stop") throw new AppError(503, "The AI response was incomplete. Please retry.");
          return schema.parse(JSON.parse(choice.message.content));
        } catch (error) {
          if (error instanceof AppError) throw error;
          if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof TypeError && /JSON|properties/.test(error.message)) {
            repairHint = error instanceof z.ZodError ? error.issues.slice(0,4).map(issue => issue.message).join(" ") : "Return syntactically valid JSON.";
            // Retry malformed model output once, within the original time budget.
            if (attempt === 0 && deadline - performance.now() > 1000) continue;
            throw new AppError(503, "The AI returned an invalid response. Please retry.");
          }
          throw new AppError(503, "The AI connection timed out or was interrupted. Your saved conversation is safe; retry.");
        }
      }
      throw new AppError(503, "The AI returned an invalid response. Please retry.");
    });
  }
  reply(context: Record<string, unknown>) {
    const language = context.support_language === "he-IL" ? "HEBREW" : "ENGLISH";
    const action = ["start", "help", "continue"].includes(String(context.action)) ? String(context.action).toUpperCase() : "START";
    const instruction = `\nThis reply: action=${action}; all translations and feedback messages MUST be in ${language}. `
      + (action === "CONTINUE" ? "turn_feedback MUST be an object with kind, message, said and natural; NEVER null. " : "turn_feedback MUST be null. ")
      + (context.last_turn === true ? "This is the final answer: close with no question and an empty suggestions array."
        : `Give two short translated answer ideas. The learner has answered ${Number(context.practice_round) || 0} of 10 questions. Keep the conversation going with one real, simple question; it is not time for a farewell.`);
    return this.complete(PARTNER + instruction, context, coachingReplySchema(context));
  }
  feedback(context: Record<string, unknown>) {
    const words = Array.isArray(context.vocabulary_words) ? context.vocabulary_words as string[] : null;
    const schema = feedbackSchema.refine(report => {
      if (!report.pointers.length) return false;
      if (!words) return true;
      const translated = new Set(report.vocabulary.filter(item => item.translation).map(item => item.word.normalize("NFC").toLowerCase()));
      return translated.size === words.length && report.vocabulary.length === words.length && words.every(word => translated.has(word));
    }, "Include practical pointers and translate each supplied vocabulary word exactly once, without adding words.");
    const language = context.support_language === "he-IL" ? "HEBREW" : "ENGLISH";
    return this.complete(FEEDBACK + `\nFor this report, write all explanations, summary, pointers and word meanings in ${language}. Translate all ${words?.length ?? 0} supplied vocabulary words.`, context, schema, true);
  }
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
