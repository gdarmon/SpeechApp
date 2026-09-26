import { replySchema, type TurnInput } from "./models.js";
import { coachingLimits } from "./learning.js";
import { capoeiraTerm, termKey } from "./capoeira.js";

export const wordCount = (text: string) => text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
const normalized = (text: string) => text.toLocaleLowerCase("pt-BR").match(/[\p{L}\p{N}]+/gu)?.join(" ") ?? "";
const spokenQuestion = (text: string) => text.match(/[^.!?]*\?/)?.[0] ?? "";

// Keep an explicit personal fact across later turns, until the learner updates
// it. Help-language requests and references to someone else's cord are excluded.
export function learnerHasNoCord(context: Record<string, unknown>) {
  if (!context.lesson) return false;
  const answers = [...((context.turns as { text?: string; help?: boolean }[] | undefined) ?? []),
    ...(context.input ? [context.input as Partial<TurnInput>] : [])];
  for (const answer of answers.reverse()) {
    if (answer.help) continue;
    const text = termKey(answer.text ?? "");
    if (/^(?:eu )?(?:ainda )?nao tenho (?:uma |nenhuma )?corda\b|^(?:eu )?estou sem corda\b/.test(text)) return true;
    if (/^(?:eu )?(?:agora |ja )?tenho (?:uma )?corda\b/.test(text)) return false;
  }
  return false;
}

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
    const lesson = context.lesson as { vocabulary?: { term: string }[]; deferred_terms?: string[];
      next_prompt?: { format?: string; phase?: string; focus_term?: string; allow_repetition?: boolean; model?: unknown } } | undefined;
    const teaching = context.teaching as { allow_repetition?: boolean; phase?: string; focus_words?: string[] } | undefined;
    const forms = (term: string) => [term, ...(capoeiraTerm(term)?.aliases ?? [])];
    const contains = (text: string, term: string) => forms(term).some(form => (` ${termKey(text)} `).includes(` ${termKey(form)} `));
    const respondsToNewTerm = (context.capoeira_reference as { term: string }[] | undefined)?.some(entry =>
      contains(input?.text ?? "", entry.term) && !lesson?.vocabulary?.some(known => known.term === entry.term));
    // "Quero repetir martelo" can be the intended lesson answer, not a request
    // to replay the question. Do not bypass the teaching contract for every
    // occurrence of a word we deliberately teach throughout this curriculum.
    const repetitionRequest = /^(?:(?:voce )?pode(?:ria)?(?: voce)? (?:repetir|falar de novo|dizer novamente)|repete|repita|de novo|novamente)\b/.test(termKey(input?.text ?? ""));
    const repair = help || reply.turn_feedback?.kind === "clarify" || repetitionRequest;
    const languageQuestion = /\b(?:como se diz|como (?:se )?pronuncia|o que significa)\b/.test(termKey(input?.text ?? ""));
    if (lesson && !final && !repair && !languageQuestion) {
      const question = termKey(reply.text);
      if (learnerHasNoCord(context) && (/\b(?:quer|prefere|escolhe|escolher|gostaria)\b.*\b(?:corda|essa|outra)\b/.test(question)
        || /\b(?:qual|cor)\b.*\b(?:sua corda|corda voce tem)\b/.test(question))) {
        reject("The learner said they have no cord. Do not ask them to choose/want a rank or ask its color again. Ask about their own class practice or their teacher, without inventing their rank.");
      }
      if (/\b(?:ouvir|escutar|repetir)\b.*\bcorda\b/.test(question)
        || /\b(?:nome|palavra|expressao|termo)\b.*\b(?:ouvir|repetir|escutar)\b/.test(question)
        || /\b(?:ouvir|repetir|escutar)\b.*\b(?:nome|palavra|expressao|termo)\b/.test(question)) {
        reject("Have a meaningful conversation about the lesson situation. Do not ask which name to hear/repeat or treat a cord as audio. Name/pronunciation practice is for an explicit learner request.");
      }
    }
    if (!start && !final && !repair && !respondsToNewTerm) {
      type PriorReply = { text?: string; suggested_replies?: (string | { text: string })[] };
      const previous = (context.turns as { reply?: PriorReply }[] | undefined)?.at(-1)?.reply
        ?? context.opening as PriorReply | undefined;
      const priorIdeas = previous?.suggested_replies?.map(idea => normalized(typeof idea === "string" ? idea : idea.text));
      if (priorIdeas?.length === 2 && normalized(previous?.text ?? "") !== normalized(reply.text)
        && reply.suggested_replies.length === 2 && reply.suggested_replies.every(idea => priorIdeas.includes(normalized(idea.text)))) {
        reject("The question changed but both answer ideas were copied from the previous question. Adapt the ideas to answer the current question; keep familiar vocabulary, not a fixed pair of answers.");
      }
    }
    if (!lesson && !help && !final && !repair && teaching?.focus_words?.length) {
      const exposure = normalized([reply.text, ...reply.suggested_replies.map(idea => idea.text)].join(" ")).split(" ");
      const retained = teaching.focus_words.some(word => exposure.some(token => token === word
        || /[oa]$/.test(word) && new RegExp(`^${word.slice(0, -1)}[oa]s?$`, "u").test(token)
        || token === `${word}s`));
      if (!retained) reject("Reuse at least one teaching.focus_words anchor from the opening in the question or an idea. Do not replace the learning focus with a new mini-topic.");
    }
    if (start && lesson?.vocabulary?.length) {
      const openingText = ` ${termKey([reply.text, ...reply.suggested_replies.map(idea => idea.text)].join(" "))} `;
      if (!lesson.vocabulary.some(entry => openingText.includes(` ${termKey(entry.term)} `))) {
        reject("Start in the selected lesson: include at least one of its vocabulary terms in the question or an answer idea.");
      }
    }
    if (lesson && !final && !repair && !respondsToNewTerm) {
      const exposure = [reply.text, ...reply.suggested_replies.map(idea => idea.text)].join(" ");
      // A natural follow-up can use a pronoun, ask about practice or acknowledge
      // that the learner has no cord/instrument. Do not force a catalog name into
      // every turn: that constraint produced irrelevant listening/name drills.
      // Remove full introduced names first: corda crua must not be mistaken for
      // a deferred name inside the already-taught corda crua e amarela.
      let remaining = ` ${termKey(exposure)} `;
      for (const entry of [...(lesson.vocabulary ?? [])].sort((a,b) => b.term.length - a.term.length)) {
        for (const form of forms(entry.term).sort((a,b) => b.length - a.length)) {
          remaining = remaining.split(` ${termKey(form)} `).join(" ");
        }
      }
      if (lesson.deferred_terms?.some(term => contains(remaining, term))) {
        reject("Do not introduce deferred lesson terms. Recycle the vocabulary already introduced in this session.");
      }
    }
    if (!help && !final && !repair) {
      const previous = start ? (context.recent_openings as string[] | undefined) ?? [] : [
        (context.opening as { text?: string } | undefined)?.text ?? "",
        ...((context.turns as { reply?: { text?: string } }[] | undefined) ?? []).map(turn => turn.reply?.text ?? ""),
      ];
      const question = spokenQuestion(reply.text);
      const retrieval = teaching?.allow_repetition || lesson?.next_prompt?.allow_repetition;
      // Reusing a reviewed question frame in a new beginner lesson is useful:
      // the target name changes, while the language remains familiar.
      const checked = start && lesson ? [] : retrieval ? previous.slice(-1) : previous;
      if (checked.some(text => text && (normalized(text) === normalized(reply.text)
        || lesson && question && normalized(spokenQuestion(text)) === normalized(question)))) {
        reject("Avoid an immediate question loop. Reuse vocabulary and answer frames; repeat an earlier question only on a planned retrieval turn after an intervening exchange, or when the learner asks for help.");
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
    if (lesson) {
      const translatedPairs = [{ text: reply.text, translation: reply.translation }, ...reply.suggested_replies];
      for (const pair of translatedPairs) {
        if (!/\bcordas?\b/.test(termKey(pair.text))) continue;
        const translated = context.support_language === "he-IL" ? /חגור|חבל/.test(pair.translation)
          : /\b(?:cords?|belts?)\b/i.test(pair.translation);
        if (!translated) reject("Translate corda as a capoeira cord/belt (Hebrew: חגורה), with its literal colors. Copying the Portuguese description without its meaning is not a translation.");
      }
    }
    if (wordCount(reply.text) > limits.text_words || reply.text.length > limits.text_chars) reject(`Keep this level's spoken turn within ${limits.text_words} words and ${limits.text_chars} characters.`);
    const questions = reply.text.match(/\?/g)?.length ?? 0;
    if (questions > 1) reject("Ask only one question at a time.");
    if (!final && !help && questions !== 1) reject("Ask one simple next question in text so the learner can reply.");
    if (final && reply.text.includes("?")) reject("Close the practice without asking a new question.");
    if ((reply.translation.match(/\?/g)?.length ?? 0) !== questions) reject("Translate the same question or statement; do not add or remove a question in translation.");
    if (/\b(?:e|mas)\s+(?:quem|quando|onde|como|qual|quais|por que|o que)\b/i.test(spokenQuestion(reply.text))) {
      reject("Ask about one thing, not two joined questions sharing a question mark.");
    }
    if (lesson && !help && !final) {
      const afterWhich = termKey(reply.text).replace(/^qual (?:e )?(?:o |a )?/, "");
      if (/^qual\b/i.test(reply.text) && lesson.vocabulary?.some(entry => afterWhich.startsWith(`${termKey(entry.term)} `))) {
        reject("Do not ask which variant of an unexplained name. Ask a concrete question about the situation with directly matching answer ideas.");
      }
      if (/\b(?:qual|o que)\b.*\b(?:pr[oó]xim[ao]|vem depois|vem ap[oó]s)\b/i.test(reply.text)
        && !/\b(?:quer|prefere|escolhe|gostaria)\b/i.test(reply.text)) {
        reject("Do not quiz the order of a capoeira sequence. Ask a concrete question that responds to the learner's experience or request.");
      }
    }
    if (limits.level === 1 && /^(?:quando|enquanto|se|depois que|antes de)\b[^?]*[,;]/i.test(reply.text.trim())) {
      reject("At level 1 use one short clause. Remove the scene-setting subordinate clause.");
    }
    if (limits.level === 1 && !help && !final) {
      const questionOnly = reply.text.replace(/^(?:oi|olá|bom dia|boa tarde|boa noite)[!.,]\s*/i, "");
      if (/[.!;]\s*\p{L}/u.test(questionOnly) || /[,;]\s*(?:quem|quando|onde|como|qual|quais|o que)\b/i.test(questionOnly)) {
        reject("At level 1 ask just the short question. Put feedback in turn_feedback instead of adding a second spoken sentence or preamble.");
      }
    }
    if (start && reply.pace !== "slow") reject("Start at a gentle speaking pace.");
    if (reply.suggested_replies.some(idea => wordCount(idea.text) > limits.idea_words || idea.text.length > limits.idea_chars)) reject(`Keep reply ideas within ${limits.idea_words} words and ${limits.idea_chars} characters for this level.`);
    const phase = teaching?.phase ?? lesson?.next_prompt?.phase;
    if (!help && !final && !repair && limits.level >= 3 && ["model", "retrieve", "recall"].includes(phase ?? "")
      && !reply.suggested_replies.some(idea => wordCount(idea.text) >= limits.minimum_words)) {
      reject(`At this teaching stage, at least one IDEA must demonstrate the level's connected-answer goal (about ${limits.minimum_words} words or more, within the idea limit). Demonstrate a relevant reason, clarification or alternative without filler. This requirement is for the example, never the learner's answer.`);
    }
    if (wordCount(reply.practice_phrase) > Math.min(10, limits.idea_words)) reject(`Help with one short phrase of at most ${Math.min(10, limits.idea_words)} words.`);
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
    if (wordCount(feedback.natural) > Math.min(10, limits.idea_words)) reject(`Give one short corrected phrase of at most ${Math.min(10, limits.idea_words)} words.`);
  });
}
