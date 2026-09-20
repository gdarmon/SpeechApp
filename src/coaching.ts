import { replySchema, type TurnInput } from "./models.js";
import { coachingLimits } from "./learning.js";
import { termKey } from "./capoeira.js";

export const wordCount = (text: string) => text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
const normalized = (text: string) => text.toLocaleLowerCase("pt-BR").match(/[\p{L}\p{N}]+/gu)?.join(" ") ?? "";
const spokenQuestion = (text: string) => text.match(/[^.!?]*\?/)?.[0] ?? "";

// Validate teaching constraints before a generated response can reach speech playback.
// The saved reply schema stays compatible with conversations created by older versions.
export function coachingReplySchema(context: Record<string, unknown>) {
  const limits = coachingLimits(context);
  return replySchema.superRefine((reply, ctx) => {
    const reject = (message: string) => ctx.addIssue({ code: "custom", message });
    const start = context.action === "start";
    const help = context.action === "help";
    const final = context.last_turn === true;
    const input = context.input as Partial<TurnInput> | undefined;
    const lesson = context.lesson as { vocabulary?: { term: string }[]; next_prompt?: { format?: string } } | undefined;
    if (start && lesson?.vocabulary?.length) {
      const openingText = ` ${termKey([reply.text, ...reply.suggested_replies.map(idea => idea.text)].join(" "))} `;
      if (!lesson.vocabulary.some(entry => openingText.includes(` ${termKey(entry.term)} `))) {
        reject("Start in the selected lesson: include at least one of its vocabulary terms in the question or an answer idea.");
      }
    }
    if (!help && !final && reply.turn_feedback?.kind !== "clarify" && !/repet|de novo|novamente/i.test(input?.text ?? "")) {
      const previous = start ? (context.recent_openings as string[] | undefined) ?? [] : [
        (context.opening as { text?: string } | undefined)?.text ?? "",
        ...((context.turns as { reply?: { text?: string } }[] | undefined) ?? []).map(turn => turn.reply?.text ?? ""),
      ];
      const question = spokenQuestion(reply.text);
      if (previous.some(text => text && (normalized(text) === normalized(reply.text)
        || lesson && question && normalized(spokenQuestion(text)) === normalized(question)))) {
        reject("This repeats an earlier question, even if its introduction changed. Ask a different useful question that follows the learner's answer and current lesson task.");
      }
      if (lesson?.next_prompt?.format === "open") {
        if (!/\b(qual|quais|como|quem|onde|quando|quanto|quantos|quanta|quantas|por que|o que)\b/i.test(question) || /\bou\b/i.test(question)) {
          reject("For this task ask one short open question (what/which/how/who/where/when), not yes/no or two alternatives. Follow the lesson's current task.");
        }
      }
    }
    if (!reply.translation || reply.suggested_replies.length !== (final ? 0 : 2)) reject("Include a translation and two reply ideas, or no ideas for the closing turn.");
    const portuguese = [reply.text, reply.practice_phrase, ...reply.suggested_replies.map(idea => idea.text), reply.turn_feedback?.natural ?? ""];
    if (portuguese.some(value => /\p{Script=Hebrew}/u.test(value))) reject("Keep Hebrew out of Portuguese fields.");
    const supportText = [reply.translation, ...reply.suggested_replies.map(idea => idea.translation), ...(reply.turn_feedback ? [reply.turn_feedback.message] : [])];
    if (context.support_language === "he-IL" && supportText.some(value => !/\p{Script=Hebrew}/u.test(value))) reject("Use Hebrew for every translation and feedback message; do not copy English examples.");
    if (context.support_language === "en-US" && supportText.some(value => /\p{Script=Hebrew}/u.test(value))) reject("Use English for every translation and feedback message.");
    if (wordCount(reply.text) > limits.text_words || reply.text.length > limits.text_chars) reject(`Keep this level's spoken turn within ${limits.text_words} words and ${limits.text_chars} characters.`);
    const questions = reply.text.match(/\?/g)?.length ?? 0;
    if (questions > 1) reject("Ask only one question at a time.");
    if (!final && !help && questions !== 1) reject("Ask one simple next question in text so the learner can reply.");
    if (final && reply.text.includes("?")) reject("Close the practice without asking a new question.");
    if (start && reply.pace !== "slow") reject("Start at a gentle speaking pace.");
    if (reply.suggested_replies.some(idea => wordCount(idea.text) > limits.idea_words || idea.text.length > limits.idea_chars)) reject(`Keep reply ideas within ${limits.idea_words} words and ${limits.idea_chars} characters for this level.`);
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
    if (!feedback.said || !feedback.natural || !input?.text?.includes(feedback.said)) reject("Quote only the current learner answer.");
    if (normalized(feedback.said) === normalized(feedback.natural)) reject("Do not correct punctuation or already-correct wording.");
    if (/^eu tenho \d+ anos$/.test(normalized(feedback.said))) reject("That age statement is already correct.");
    if (wordCount(feedback.natural) > 10) reject("Give one short corrected phrase.");
  });
}
