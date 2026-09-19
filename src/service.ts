import { isDeepStrictEqual } from "node:util";
import { AppError, PRACTICE_TURNS, type Start, type TurnInput, type Finish, type Feedback, type Reply, type Session, type LearnerContext } from "./models.js";
import { sessionVocabulary } from "./vocabulary.js";
import type { AIProvider } from "./provider.js";
import type { Store } from "./store.js";

const normalized = (text: string) => text.toLocaleLowerCase("pt-BR").match(/[\p{L}\p{N}_]+/gu)?.join(" ") || "";
// Prior translations and feedback are already stored for display. The partner needs
// the dialogue and offered phrases, not repeated instructions or old feedback to copy.
const partnerContext = (reply: Reply) => ({ text: reply.text, practice_phrase: reply.practice_phrase,
  suggested_replies: (reply.suggested_replies ?? []).map(idea => idea.text) });

function context(kind: string, topic: string, learner: LearnerContext, session?: Session) {
  return { kind, topic, profile: learner.assessment, recent_topics: learner.recent_topics,
    support_language: session?.request.support_language ?? "en-US",
    practice_target: PRACTICE_TURNS,
    weaknesses: [...learner.memory, ...learner.help_patterns].filter(m => new Date(m.due_at).getTime() <= Date.now())
      .sort((a,b) => b.occurrences-a.occurrences || a.due_at.localeCompare(b.due_at)).slice(0,3),
    known_pattern_keys: learner.memory.map(m => m.key).filter(Boolean).slice(0,30),
    opening: session ? partnerContext(session.opening) : undefined, turn_count: session?.turns.length || 0,
    turns: (session?.turns || []).slice(-12).map(t => ({ text: t.text, help: t.help, source: t.source, assisted: t.assisted, reply: partnerContext(t.reply) })),
  };
}

export class Sessions {
  constructor(private store: Store, private ai: AIProvider) {}

  async start(input: Start) {
    return this.store.mutate(async tx => {
      const previous = await tx.started(input.request_id);
      if (previous) {
        if (!isDeepStrictEqual(previous.request, input)) throw new AppError(409, "This request ID was already used with different content.");
        return previous;
      }
      const { learner } = await tx.snapshot();
      const reply = await this.ai.reply({ ...context(input.kind, input.topic, learner), support_language: input.support_language ?? "en-US", action: "start" });
      return tx.create(input, reply, this.ai.demo);
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
      const reply = await this.ai.reply({ ...context(session.kind, session.topic, learner, session),
        practice_round: session.turns.filter(t => !t.help).length + (input.help ? 0 : 1),
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
      if (session.feedback) return session.feedback;
      if (session.demo !== this.ai.demo) throw new AppError(409, "The server mode changed. Start a new conversation.");
      const counts = sessionVocabulary(session);
      const words = [...counts.keys()].slice(0, 180);
      const seenBefore = await tx.previouslySeenWords(id, words);
      const feedback = await this.ai.feedback({ ...context(session.kind, session.topic, learner, session),
        turns: session.turns.map(t => ({ text: t.text, help: t.help, source: t.source, assisted: t.assisted, reply: partnerContext(t.reply) })),
        action: "feedback", self_report: input.confidence, vocabulary_words: words });
      const result = sanitizeFeedback(feedback, session, input);
      const translations = new Map(feedback.vocabulary.map(item => [item.word.normalize("NFC").toLowerCase(), item.translation]));
      result.vocabulary = words.map(word => ({ word, translation: translations.get(word) ?? "",
        occurrences: counts.get(word)!, seen_before: seenBefore.has(word) }));
      result.vocabulary_total = counts.size;
      await tx.finish(id, result, session.demo);
      return result;
    });
  }
}

export function sanitizeFeedback(feedback: Feedback, session: Session, input: Finish): Feedback {
  const result = structuredClone(feedback);
  const spoken = session.turns.filter(t => !t.help).map(t => t.text);
  const spontaneous = session.turns.filter((turn, index) => {
    const previous = index === 0 ? session.opening : session.turns[index - 1].reply;
    const suggestions = [...(previous.suggested_replies || []).map(s => s.text), previous.practice_phrase].filter(Boolean);
    return !turn.help && turn.source !== "typed" && !turn.assisted
      && !suggestions.some(text => normalized(text) === normalized(turn.text));
  }).map(t => t.text);
  const seen = new Set<string>();
  result.corrections = result.corrections.filter(c => {
    c.key = c.key.toLowerCase().replace(/[^a-z0-9_]+/g,"_").replace(/^_+|_+$/g,"");
    if (!c.key || seen.has(c.key) || !spoken.some(t => t.includes(c.said)) || normalized(c.said) === normalized(c.natural)
      || /^eu tenho \d+ anos$/.test(normalized(c.said))) return false;
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
  result.review_phrases = [...new Set([...result.corrections.map(c => c.natural),
    ...session.turns.filter(t => t.help).map(t => t.reply.practice_phrase).filter(Boolean)])].slice(0,5);
  return result;
}
