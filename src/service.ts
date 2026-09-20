import { isDeepStrictEqual } from "node:util";
import { AppError, PRACTICE_TURNS, type Start, type TurnInput, type Finish, type Feedback, type Reply, type Session, type LearnerContext } from "./models.js";
import { compactFeedback, focusWords, sessionVocabulary } from "./vocabulary.js";
import { independentAnswer, practiceLevel, practiceResult } from "./learning.js";
import { capoeiraTerm, chooseLesson, lessonContext } from "./capoeira.js";
import type { AIProvider } from "./provider.js";
import type { Store } from "./store.js";

const normalized = (text: string) => text.toLocaleLowerCase("pt-BR").match(/[\p{L}\p{N}_]+/gu)?.join(" ") || "";
// Prior translations and feedback are already stored for display. The partner needs
// the dialogue and offered phrases, not repeated instructions or old feedback to copy.
const partnerContext = (reply: Reply, latest = false) => ({ text: reply.text,
  ...(reply.practice_phrase ? { practice_phrase: reply.practice_phrase } : {}),
  ...(latest ? { suggested_replies: (reply.suggested_replies ?? []).map(idea => idea.text) } : {}) });
const coachedCorrections = (session: Session) => session.turns.flatMap(turn => {
  const point = turn.reply.turn_feedback;
  return !turn.help && point?.kind === "correction" && turn.text.includes(point.said) ? [point] : [];
});

function context(kind: string, topic: string, learner: LearnerContext, session?: Session, question = 0) {
  return { kind, topic, profile: learner.assessment, recent_topics: learner.recent_topics,
    recent_openings: session ? undefined : learner.recent_openings,
    lesson: lessonContext(session?.request.resolved_lesson, question, session?.request.support_language),
    support_language: session?.request.support_language ?? "en-US",
    practice_target: PRACTICE_TURNS,
    practice: practiceLevel(session ? session.request.resolved_level : learner.practice.level),
    weaknesses: [...learner.memory, ...learner.help_patterns].filter(m => new Date(m.due_at).getTime() <= Date.now())
      .sort((a,b) => b.occurrences-a.occurrences || a.due_at.localeCompare(b.due_at)).slice(0,3),
    known_pattern_keys: learner.memory.map(m => m.key).filter(Boolean).slice(0,30),
    opening: session ? partnerContext(session.opening, session.turns.length === 0) : undefined, turn_count: session?.turns.length || 0,
    turns: (session?.turns || []).slice(-12).map((t, index, turns) => ({ text: t.text, help: t.help, source: t.source, assisted: t.assisted, reply: partnerContext(t.reply, index === turns.length - 1) })),
  };
}

export class Sessions {
  constructor(private store: Store, private ai: AIProvider) {}

  async start(input: Start) {
    return this.store.mutate(async tx => {
      const previous = await tx.started(input.request_id);
      if (previous) {
        const { resolved_level: _resolved, resolved_lesson: _lesson, ...original } = previous.request;
        if (!isDeepStrictEqual(original, input)) throw new AppError(409, "This request ID was already used with different content.");
        return previous;
      }
      const { learner } = await tx.snapshot();
      const level = practiceLevel(input.practice_level ?? learner.practice.level);
      const choice = this.ai.demo ? undefined : chooseLesson(input.topic, learner.lessons ?? []);
      const lesson = lessonContext(choice, 0, input.support_language);
      const reply = await this.ai.reply({ ...context(input.kind, input.topic, learner), lesson, practice: level, support_language: input.support_language ?? "en-US", action: "start" });
      if (lesson) reply.topic = `ABADÁ capoeira · ${lesson.title}`;
      return tx.create(input, reply, this.ai.demo, level.level, choice);
    });
  }

  async turn(id: string, input: TurnInput) {
    return this.store.mutate(async tx => {
      const { session, learner } = await tx.snapshot(id);
      if (!session) throw new AppError(404, "Conversation not found.");
      const previous = session.turns.find(t => t.request_id === input.request_id);
      if (previous) {
        const { request } = previous as typeof previous & { request: TurnInput };
        if (!isDeepStrictEqual(request, input)) throw new AppError(409, "This request ID was already used with different content.");
        return previous.reply;
      }
      if (session.ended_at) throw new AppError(409, "This conversation has ended. Start a new one.");
      if (session.demo !== this.ai.demo) throw new AppError(409, "The server mode changed. Start a new conversation.");
      if (session.turns.length >= 80) throw new AppError(409, "Please finish this session and start a new conversation.");
      const round = session.turns.filter(t => !t.help).length + (input.help ? 0 : 1);
      const reply = await this.ai.reply({ ...context(session.kind, session.topic, learner, session, round),
        practice_round: round,
        last_turn: !input.help && session.turns.filter(t => !t.help).length >= PRACTICE_TURNS - 1,
        action: input.help ? "help" : "continue", input });
      await tx.append(id, input, reply);
      return reply;
    });
  }

  async finish(id: string, input: Finish) {
    return this.store.mutate(async tx => {
      const { session, learner } = await tx.snapshot(id);
      if (!session) throw new AppError(404, "Conversation not found.");
      if (session.feedback) return compactFeedback(session.feedback, session);
      if (session.demo !== this.ai.demo) throw new AppError(409, "The server mode changed. Start a new conversation.");
      const counts = sessionVocabulary(session);
      const seenBefore = await tx.previouslySeenWords(id, [...counts.keys()]);
      const words = focusWords(session, counts, seenBefore);
      const feedback = await this.ai.feedback({ ...context(session.kind, session.topic, learner, session),
        turns: session.turns.map(t => ({ text: t.text, help: t.help, source: t.source, assisted: t.assisted, reply: partnerContext(t.reply) })),
        action: "feedback", self_report: input.confidence, vocabulary_words: words,
        ...(session.turns.some(t => t.reply.turn_feedback) ? { coached_corrections: coachedCorrections(session) } : {}) });
      const result = sanitizeFeedback(feedback, session, input);
      const translations = new Map(feedback.vocabulary.map(item => [item.word.normalize("NFC").toLowerCase(), item.translation]));
      result.vocabulary = words.map(word => ({ word, translation: (session.request.resolved_lesson ?
        capoeiraTerm(word)?.[session.request.support_language === "he-IL" ? "he" : "en"] : undefined) ?? translations.get(word) ?? "",
        occurrences: counts.get(word)!, seen_before: seenBefore.has(word) }));
      result.vocabulary_total = counts.size;
      result.practice_result = practiceResult(session);
      await tx.finish(id, result, session.demo);
      return result;
    });
  }
}

export function sanitizeFeedback(feedback: Feedback, session: Session, input: Finish): Feedback {
  const result = structuredClone(feedback);
  const spoken = session.turns.filter(t => !t.help).map(t => t.text);
  const spontaneous = session.turns.filter((turn, index) => independentAnswer(session, turn, index)).map(t => t.text);
  const seen = new Set<string>();
  const coached = session.turns.some(t => t.reply.turn_feedback);
  const observed = coachedCorrections(session);
  result.corrections = result.corrections.filter(c => {
    c.key = c.key.toLowerCase().replace(/[^a-z0-9_]+/g,"_").replace(/^_+|_+$/g,"");
    if (!c.key || seen.has(c.key) || !spoken.some(t => t.includes(c.said)) || normalized(c.said) === normalized(c.natural)
      || /^eu tenho \d+ anos$/.test(normalized(c.said))) return false;
    if (coached) {
      const point = observed.find(point => normalized(point.said) === normalized(c.said) && normalized(point.natural) === normalized(c.natural));
      if (!point) return false;
      c.explanation = point.message;
      c.example = point.natural;
    }
    seen.add(c.key); return true;
  });
  if (session.kind !== "assessment" || spontaneous.length < 5 || session.demo) result.assessment = null;
  if (result.assessment) {
    const assessment = result.assessment;
    const dimensions = ["comprehension", "vocabulary", "grammar", "sentence_construction", "fluency"] as const;
    for (const key of dimensions) {
      const dimension = assessment[key];
      if (!dimension.evidence || !spontaneous.some(t => t.includes(dimension.evidence))) {
        assessment[key] = { observation: "Not enough reliable evidence.", evidence: "" };
      }
    }
    assessment.pronunciation = { observation: "Not assessed: audio unavailable.", evidence: "" };
    assessment.confidence = { observation: input.confidence ? `Self-reported: ${input.confidence}` : "Not assessed: no self-report.", evidence: "" };
    if (dimensions.slice(0,4).filter(k => assessment[k].evidence).length < 2) assessment.cefr = null;
  }
  result.review_phrases = [...new Set([...observed.map(point => point.natural), ...result.corrections.map(c => c.natural),
    ...session.turns.filter(t => t.help).map(t => t.reply.practice_phrase).filter(Boolean)])].slice(0,5);
  if (coached) {
    // Summarize recorded practice, not a second set of model-invented diagnoses.
    // The model still supplies vocabulary meanings and labels for observed corrections.
    const hebrew = session.request.support_language === "he-IL";
    const guided = spoken.length - spontaneous.length;
    result.summary = hebrew
      ? `סיימת שיחה קצרה בפורטוגזית. תשובות שתרגלת: ${spoken.length}. תשובות בדיבור ללא עזרה: ${spontaneous.length}.` + (guided ? " תשובות שנעזרות בדוגמה או בהקלדה הן תרגול מודרך, ואפשר בהמשך לנסות לומר אותן לבד." : " עכשיו אפשר לחזור על הביטויים מהשיחה ולהשתמש בהם שוב.")
      : `You practiced ${spoken.length} Portuguese answer${spoken.length === 1 ? "" : "s"}, including ${spontaneous.length} spoken without help.` + (guided ? " Suggested or typed answers count as guided practice. Try saying one on your own next time." : " Revisit the phrases from this conversation and use them again.");
    const phrases = result.review_phrases.filter(phrase => phrase.length <= 100).slice(0,2);
    if (!phrases.length) {
      const last = session.turns.filter(t => !t.help && t.reply.turn_feedback?.kind === "ok" && t.text.length <= 100).at(-1);
      if (last) phrases.push(last.text);
    }
    result.pointers = phrases.map(phrase => hebrew ? `כדאי לומר שוב בקול: ״${phrase}״` : `Practice saying: “${phrase}”`);
    result.pointers.push(hebrew ? "בפעם הבאה, כדאי לנסות תשובה קצרה אחת בלי לקרוא את הדוגמה." : "Next time, try one short answer without reading the suggestion.");
  }
  return result;
}
