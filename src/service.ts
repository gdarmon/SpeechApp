import { isDeepStrictEqual } from "node:util";
import { AppError, type Start, type TurnInput, type Finish, type Feedback, type Session, type LearnerContext } from "./models.js";
import type { AIProvider } from "./provider.js";
import type { Store } from "./store.js";

const normalized = (text: string) => text.toLocaleLowerCase("pt-BR").match(/[\p{L}\p{N}_]+/gu)?.join(" ") || "";

function context(kind: string, topic: string, learner: LearnerContext, session?: Session) {
  return { kind, topic, profile: learner.assessment, recent_topics: learner.recent_topics,
    weaknesses: [...learner.memory, ...learner.help_patterns].filter(m => new Date(m.due_at).getTime() <= Date.now())
      .sort((a,b) => b.occurrences-a.occurrences || a.due_at.localeCompare(b.due_at)).slice(0,3),
    known_pattern_keys: learner.memory.map(m => m.key).filter(Boolean).slice(0,30),
    opening: session?.opening, turn_count: session?.turns.length || 0,
    turns: (session?.turns || []).slice(-12).map(t => ({ text: t.text, help: t.help, reply: t.reply })),
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
      const reply = await this.ai.reply({ ...context(input.kind, input.topic, learner), action: "start" });
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
      const feedback = await this.ai.feedback({ ...context(session.kind, session.topic, learner, session),
        turns: session.turns.map(t => ({ text: t.text, help: t.help, reply: t.reply })),
        action: "feedback", self_report: input.confidence });
      const result = sanitizeFeedback(feedback, session, input);
      await tx.finish(id, result, session.demo);
      return result;
    });
  }
}

export function sanitizeFeedback(feedback: Feedback, session: Session, input: Finish): Feedback {
  const result = structuredClone(feedback);
  const spoken = session.turns.filter(t => !t.help).map(t => t.text);
  const seen = new Set<string>();
  result.corrections = result.corrections.filter(c => {
    c.key = c.key.toLowerCase().replace(/[^a-z0-9_]+/g,"_").replace(/^_+|_+$/g,"");
    if (!c.key || seen.has(c.key) || !spoken.some(t => t.includes(c.said)) || normalized(c.said) === normalized(c.natural)
      || /^eu tenho \d+ anos$/.test(normalized(c.said))) return false;
    seen.add(c.key); return true;
  });
  if (session.kind !== "assessment" || spoken.length < 5 || session.demo) result.assessment = null;
  if (result.assessment) {
    const assessment = result.assessment;
    const dimensions = ["comprehension", "vocabulary", "grammar", "sentence_construction", "fluency"] as const;
    for (const key of dimensions) {
      const dimension = assessment[key];
      if (!dimension.evidence || !spoken.some(t => t.includes(dimension.evidence))) {
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
