import { replySchema, type TurnInput } from "./models.js";

export const wordCount = (text: string) => text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
const normalized = (text: string) => text.toLocaleLowerCase("pt-BR").match(/[\p{L}\p{N}]+/gu)?.join(" ") ?? "";

// Validate teaching constraints before a generated response can reach speech playback.
// The saved reply schema stays compatible with conversations created by older versions.
export function coachingReplySchema(context: Record<string, unknown>) {
  return replySchema.superRefine((reply, ctx) => {
    const reject = (message: string) => ctx.addIssue({ code: "custom", message });
    const start = context.action === "start";
    const help = context.action === "help";
    const final = context.last_turn === true;
    if (!reply.translation || reply.suggested_replies.length !== (final ? 0 : 2)) reject("Include a translation and two reply ideas, or no ideas for the closing turn.");
    const portuguese = [reply.text, reply.practice_phrase, ...reply.suggested_replies.map(idea => idea.text), reply.turn_feedback?.natural ?? ""];
    if (portuguese.some(value => /\p{Script=Hebrew}/u.test(value))) reject("Keep Hebrew out of Portuguese fields.");
    const supportText = [reply.translation, ...reply.suggested_replies.map(idea => idea.translation), ...(reply.turn_feedback ? [reply.turn_feedback.message] : [])];
    if (context.support_language === "he-IL" && supportText.some(value => !/\p{Script=Hebrew}/u.test(value))) reject("Use Hebrew for every translation and feedback message; do not copy English examples.");
    if (context.support_language === "en-US" && supportText.some(value => /\p{Script=Hebrew}/u.test(value))) reject("Use English for every translation and feedback message.");
    if (wordCount(reply.text) > (start ? 8 : 16) || reply.text.length > (start ? 70 : 110)) reject("Use a short, simple spoken turn.");
    const questions = reply.text.match(/\?/g)?.length ?? 0;
    if (questions > 1) reject("Ask only one question at a time.");
    if (!final && !help && questions !== 1) reject("Ask one simple next question in text so the learner can reply.");
    if (final && reply.text.includes("?")) reject("Close the practice without asking a new question.");
    if (start && reply.pace !== "slow") reject("Start at a gentle speaking pace.");
    if (reply.suggested_replies.some(idea => wordCount(idea.text) > 7 || idea.text.length > 60)) reject("Offer short replies a beginner can say.");
    if (wordCount(reply.practice_phrase) > 10) reject("Help with one short phrase at a time.");
    const feedback = reply.turn_feedback;
    if (start || help) {
      if (feedback) reject("Do not grade a greeting or an English/Hebrew help request.");
      return;
    }
    if (context.action === "continue" && !feedback) reject("Give brief feedback on the current answer.");
    if (!feedback) return;
    if (wordCount(feedback.message) > 22) reject("Give one brief feedback point.");
    if (feedback.kind !== "correction") {
      if (feedback.said || feedback.natural) reject("Only a correction can include before/after wording.");
      return;
    }
    const input = context.input as Partial<TurnInput> | undefined;
    if (!feedback.said || !feedback.natural || !input?.text?.includes(feedback.said)) reject("Quote only the current learner answer.");
    if (normalized(feedback.said) === normalized(feedback.natural)) reject("Do not correct punctuation or already-correct wording.");
    if (/^eu tenho \d+ anos$/.test(normalized(feedback.said))) reject("That age statement is already correct.");
    if (wordCount(feedback.natural) > 10) reject("Give one short corrected phrase.");
  });
}
