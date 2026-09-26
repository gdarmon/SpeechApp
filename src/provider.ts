import { z } from "zod";
import type { AIRoute, Settings } from "./config.js";
import { coolDown, firstValidReply } from "./ai-routing.js";
import { AppError, feedbackSchema, replySchema, turnFeedbackSchema, type Feedback, type Reply } from "./models.js";
import { partnerPrompt, FEEDBACK } from "./prompts.js";
import type { Timing } from "./timing.js";
import { coachingReplySchema, learnerHasNoCord } from "./coaching.js";
import { coachingLimits } from "./learning.js";

export interface AIProvider {
  demo: boolean;
  reply(context: Record<string, unknown>): Promise<Reply>;
  feedback(context: Record<string, unknown>): Promise<Feedback>;
}

// Generate the wire shape from the same contracts we validate. Defaults are for older
// saved replies, not optional fields in a newly generated response.
function generationSchema(context: Record<string, unknown>, feedback: boolean) {
  const limits = coachingLimits(context);
  const answerFeedback = z.union([
    turnFeedbackSchema.extend({ kind: z.literal("correction") }),
    turnFeedbackSchema.extend({ kind: z.enum(["ok", "clarify", "guided"]), said: z.literal(""), natural: z.literal("") }),
  ]);
  const schema = feedback ? feedbackSchema.extend({ vocabulary: feedbackSchema.shape.vocabulary.unwrap().max(5) }) : replySchema.extend({
    turn_feedback: context.action === "continue" ? answerFeedback : z.null(),
    suggested_replies: z.array(replySchema.shape.suggested_replies.unwrap().element.extend({
      text: z.string().min(1).max(limits.idea_chars),
    })).length(context.last_turn === true ? 0 : 2),
    text: z.string().min(1).max(limits.text_chars),
    translation: z.string().min(1).max(2400),
    pace: context.action === "start" ? z.literal("slow") : replySchema.shape.pace,
  });
  return JSON.parse(JSON.stringify(z.toJSONSchema(schema), (key, value) =>
    key === "default" || key === "$schema" ? undefined : value));
}

export class CompatibleProvider implements AIProvider {
  readonly demo = false;
  readonly observations: { provider: string; model: string; status: number; elapsed_ms: number;
    limits: Record<string, number>; input_tokens?: number; output_tokens?: number }[] = [];
  constructor(private settings: Settings, private timing: Timing, private request = fetch) {}

  private async complete<T>(prompt: string, context: Record<string, unknown>, schema: z.ZodType<T>, feedback = false): Promise<T> {
    return this.timing.measure("ai", () => firstValidReply(this.settings, this.settings.fallback,
      this.settings.aiHedgeMs, this.settings.aiTimeoutMs,
      (route, signal) => this.generate(route, signal, prompt, context, schema, feedback)));
  }

  private async generate<T>(route: AIRoute, signal: AbortSignal, prompt: string, context: Record<string, unknown>, schema: z.ZodType<T>, feedback: boolean): Promise<T> {
    if (!route.apiKey) throw new AppError(503, "Set the AI provider key on the server before starting a conversation.");
    const body: Record<string, unknown> = {
      model: route.model,
      messages: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify(context) }],
      response_format: { type: "json_object" }, max_completion_tokens: feedback
        ? (context.kind === "assessment" ? 4096 : 2048)
        : (coachingLimits(context).level >= 3 ? 2048 : 1536),
    };
    const host = new URL(route.baseUrl).hostname;
    if (host === "api.openai.com") body.store = false;
    const groqStructured = host === "api.groq.com" && ["openai/gpt-oss-20b", "openai/gpt-oss-120b"].includes(route.model);
    const openaiStructured = host === "api.openai.com" && ["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna"].includes(route.model);
    if (groqStructured || openaiStructured) {
      body.reasoning_effort = openaiStructured && route.model === "gpt-5.6-luna" ? "none" : "low";
      body.response_format = { type: "json_schema", json_schema: { name: feedback ? "practice_summary" : "practice_reply",
        strict: true, schema: generationSchema(context, feedback) } };
    }
    return this.timing.measure(new URL(route.baseUrl).hostname === new URL(this.settings.baseUrl).hostname ? "ai_primary" : "ai_fallback", async () => {
      const deadline = performance.now() + this.settings.aiTimeoutMs;
      let repairHint = "";
      let rejectedContent = "";
      let generations = 0;
      // One targeted repair per route. Capacity failures never sleep or replay
      // the same saturated service; the coordinator starts the other route.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          signal.throwIfAborted();
          const remaining = Math.floor(deadline - performance.now());
          if (remaining < 1) throw new Error("AI deadline reached");
          if (repairHint) {
            body.messages = [
              { role: "system", content: prompt },
              { role: "user", content: JSON.stringify(context) },
              ...(rejectedContent ? [{ role: "assistant", content: rejectedContent }] : []),
              { role: "user", content: "Repair the previous response. Keep its valid parts and fix these rules: " + repairHint
                + " Return the complete required JSON, without commentary. Do not change the learner's answer or invent a correction." },
            ];
          }
          const started = performance.now();
          const response = await this.request(route.baseUrl.replace(/\/$/, "") + "/chat/completions", {
            method: "POST", headers: { Authorization: `Bearer ${route.apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(body), signal, redirect: "error",
          });
          const limits: Record<string, number> = {};
          for (const field of ["limit-requests", "limit-tokens", "remaining-requests", "remaining-tokens"]) {
            const value = response.headers.get(`x-ratelimit-${field}`);
            if (value && /^\d+$/.test(value)) limits[field] = Number(value);
          }
          const observation: (typeof this.observations)[number] = { provider: host, model: route.model, status: response.status,
            elapsed_ms: Math.round(performance.now() - started), limits };
          this.observations.push(observation);
          if (!response.ok) {
            await response.body?.cancel();
            if (response.status === 429) {
              const header = response.headers.get("Retry-After")?.trim();
              const seconds = header ? (/^\d+(?:\.\d+)?$/.test(header) ? Number(header) : (Date.parse(header) - Date.now()) / 1000) : NaN;
              const valid = Number.isFinite(seconds) && seconds >= 0;
              console.warn(JSON.stringify({ event: "ai_rate_limit", provider: host, model: route.model,
                retry_after_seconds: valid ? Math.ceil(seconds) : null }));
              coolDown(route, valid ? Math.max(1, seconds) : 30);
              const retry = valid ? Math.min(86400, Math.max(1, Math.ceil(seconds))) : 60;
              const wait = retry < 60 ? `${retry} seconds` : `${Math.ceil(retry / 60)} minute${retry > 60 ? "s" : ""}`;
              throw new AppError(429, `Fala's AI provider has reached its usage limit. Wait ${wait}, then tap Retry. Your conversation is safe.`, "ai_rate_limited", retry);
            }
            if (response.status >= 500) coolDown(route, 5);
            throw new AppError(503, response.status >= 500 ? "The AI service is temporarily unavailable. Please retry shortly."
              : "The AI service rejected the request. Check the server's provider configuration.", "ai_unavailable");
          }
          generations++;
          const result = await response.json();
          observation.elapsed_ms = Math.round(performance.now() - started);
          if (Number.isSafeInteger(result?.usage?.prompt_tokens)) observation.input_tokens = result.usage.prompt_tokens;
          if (Number.isSafeInteger(result?.usage?.completion_tokens)) observation.output_tokens = result.usage.completion_tokens;
          const choice = result?.choices?.[0];
          // Keep this only in memory for the single repair; never log conversation text.
          rejectedContent = typeof choice?.message?.content === "string" ? choice.message.content.slice(0, 16000) : "";
          if (choice?.finish_reason === "length" && generations < 2 && attempt < 1 && deadline - performance.now() > 1000) {
            repairHint = "The previous response was too long. Keep the response concise.";
            continue;
          }
          if (choice?.finish_reason !== "stop") throw new AppError(503, "The AI response was incomplete. Please retry.", "ai_invalid_reply");
          return schema.parse(JSON.parse(choice.message.content));
        } catch (error) {
          if (signal.aborted) throw error;
          if (error instanceof AppError) throw error;
          if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof TypeError && /JSON|properties/.test(error.message)) {
            repairHint = error instanceof z.ZodError ? error.issues.slice(0,4).map(issue => issue.message).join(" ") : "Return syntactically valid JSON.";
            console.warn(JSON.stringify({ event: "ai_reply_validation", provider: host, model: route.model,
              generation: generations, issues: error instanceof z.ZodError ? error.issues.map(issue => ({ code: issue.code,
                path: issue.path, ...(issue.code === "custom" ? { rule: issue.message } : {}) })) : [{ code: "invalid_json" }] }));
            // Retry malformed model output once, within the original time budget.
            if (generations < 2 && attempt < 1 && deadline - performance.now() > 1000) continue;
            throw new AppError(503, "The AI returned an invalid response. Please retry.", "ai_invalid_reply");
          }
          throw new AppError(503, "The AI connection timed out or was interrupted. Your saved conversation is safe; retry.", "ai_timeout");
        }
      }
      throw new AppError(503, "The AI returned an invalid response. Please retry.", "ai_invalid_reply");
    });
  }
  reply(context: Record<string, unknown>) {
    const limits = coachingLimits(context);
    const language = context.support_language === "he-IL" ? "HEBREW" : "ENGLISH";
    const action = ["start", "help", "continue"].includes(String(context.action)) ? String(context.action).toUpperCase() : "START";
    const instruction = `\nPractice level ${limits.level}: ${limits.title}. Goal: ${limits.goal} Target learner answer: ${limits.answer_goal}. `
      + `Spoken text maximum ${limits.text_words} words / ${limits.text_chars} characters; each answer idea maximum ${limits.idea_words} words / ${limits.idea_chars} characters. `
      + `\nThis reply: action=${action}; all translations and feedback messages MUST be in ${language}. `
      + (action === "CONTINUE" ? "turn_feedback MUST be an object with kind, message, said and natural; NEVER null. " : "turn_feedback MUST be null. ")
      + (context.last_turn === true ? "This is the final answer: close with no question and an empty suggestions array."
        : `Give two translated ideas that directly answer this question using familiar frames. Length limits are ceilings, not a quota; never pad an answer. Help/correction phrases maximum ${Math.min(10, limits.idea_words)} words. The learner has answered ${Number(context.practice_round) || 0} of 10 questions. Follow teaching.task and recycle its focus; it is not time for a farewell.`)
      + (learnerHasNoCord(context) ? "\nCurrent learner fact: they DO NOT HAVE A CORDA. Rank is earned, never chosen. Do not offer any cord/color, ask if they want one, or ask its color. Continue about their own class practice or teacher, with one concrete question at this level. The optional focus term and possession frames must yield to this fact." : "");
    return this.complete(partnerPrompt(context) + instruction, context, coachingReplySchema(context));
  }
  feedback(context: Record<string, unknown>) {
    const words = Array.isArray(context.vocabulary_words) ? context.vocabulary_words as string[] : null;
    const coached = Array.isArray(context.coached_corrections);
    const schema = feedbackSchema.refine(report => {
      if (!coached && !report.pointers.length) return false;
      if (!words) return true;
      const translated = new Set(report.vocabulary.filter(item => item.translation).map(item => item.word.normalize("NFC").toLowerCase()));
      return translated.size === words.length && report.vocabulary.length === words.length && words.every(word => translated.has(word));
    }, "Include practical pointers and translate each supplied vocabulary word exactly once, without adding words.");
    const language = context.support_language === "he-IL" ? "HEBREW" : "ENGLISH";
    const grounded = coached ? "\nThis session already has immediate coaching. Select corrections ONLY from coached_corrections, copying said and natural exactly. Do not introduce new corrections, diagnoses or grammar rules. If the list is empty, corrections must be empty. The app builds the factual summary and practice pointers: set summary to 'Practice complete.' and pointers to an empty array." : "";
    return this.complete(FEEDBACK + `\nFor this report, write all explanations, summary, pointers and word meanings in ${language}. Translate all ${words?.length ?? 0} supplied vocabulary words.` + grounded, context, schema, true);
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
