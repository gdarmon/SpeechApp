import type { Session, Turn } from "./models.js";

export const PRACTICE_LEVELS = [
  { level: 1, title: "First phrases", goal: "Practise familiar words and short phrases for one everyday need.", answer_goal: "A word or short phrase; reuse familiar patterns", minimum_words: 2, opening_words: 7, opening_chars: 70, turn_words: 7, turn_chars: 70, idea_words: 7, idea_chars: 70 },
  { level: 2, title: "Simple sentences", goal: "Build a familiar sentence and change one detail at a time.", answer_goal: "One simple sentence with a useful detail", minimum_words: 4, opening_words: 12, opening_chars: 100, turn_words: 12, turn_chars: 100, idea_words: 12, idea_chars: 100 },
  { level: 3, title: "Connected ideas", goal: "Link familiar ideas with a short reason or sequence.", answer_goal: "Two ideas linked with because, then or but", minimum_words: 6, opening_words: 18, opening_chars: 150, turn_words: 18, turn_chars: 150, idea_words: 24, idea_chars: 180 },
  { level: 4, title: "Explain and clarify", goal: "Give a short explanation or ask for a useful clarification.", answer_goal: "Explain one point; add detail only when useful", minimum_words: 8, opening_words: 24, opening_chars: 190, turn_words: 24, turn_chars: 190, idea_words: 32, idea_chars: 250 },
  { level: 5, title: "Flexible conversations", goal: "Adapt a familiar conversation to a small change.", answer_goal: "Explain a choice or offer an alternative", minimum_words: 10, opening_words: 32, opening_chars: 240, turn_words: 32, turn_chars: 240, idea_words: 40, idea_chars: 300 },
] as const;

export type PracticeLevel = typeof PRACTICE_LEVELS[number];
export const PRACTICE_GUIDANCE = {
  building: "Repeat familiar practice as often as you need. Use examples, then try a phrase from memory when you feel comfortable.",
  consolidating: "Keep practising this level on different days and in familiar situations. Returning to something you know is useful learning.",
  revisit: "Take your time at this level. Revisit an easier task or use answer ideas whenever they help.",
  explore: "Your recent practice suggests you could try the next level. Stay here or choose a harder level when you feel ready.",
  extending: "Keep using this level in different situations. Practise recalling familiar language and explaining one useful detail.",
} as const;
export type PracticeProgress = { level: number; title: string; goal: string; answer_goal: string;
  next_level: number | null; guidance: string; evidence_days: number;
  /** Compatibility for older clients; new screens do not show a promotion counter. */
  ready_sessions: number; sessions_needed: number };
export type PracticeResult = { level: number; independent_answers: number; successful_answers: number; ready: boolean };
export type PracticeEvidence = { level: number; ended_at: string; context: string; ready: boolean };
export const practiceLevel = (value: unknown): PracticeLevel => PRACTICE_LEVELS.find(item => item.level === value) ?? PRACTICE_LEVELS[0];
export const normalizeAnswer = (text: string) => text.toLocaleLowerCase("pt-BR").match(/[\p{L}\p{N}]+/gu)?.join(" ") ?? "";
export const answerWords = (text: string) => normalizeAnswer(text).split(" ").filter(Boolean).length;

export function independentAnswer(session: Session, turn: Turn, index: number) {
  const previous = index === 0 ? session.opening : session.turns[index - 1].reply;
  // Older apps did not record hidden ideas, so exact-copy exclusion stays
  // conservative there. A natural answer may coincidentally match an unseen idea.
  const ideas = [...(turn.ideas_hidden === true ? [] : (previous.suggested_replies ?? []).map(idea => idea.text)), previous.practice_phrase].filter(Boolean);
  return !turn.help && turn.source === "speech" && !turn.assisted
    && !ideas.some(idea => normalizeAnswer(idea) === normalizeAnswer(turn.text));
}

export function practiceResult(session: Session): PracticeResult {
  const level = practiceLevel(session.request.resolved_level);
  const own = session.turns.filter((turn, index) => independentAnswer(session, turn, index));
  // A coarse signal, not a proficiency score. Short answers remain valid; longer
  // examples must never become a learner-facing word or sentence quota.
  const successful = own.filter(turn => turn.reply.turn_feedback?.kind === "ok" && answerWords(turn.text) >= level.minimum_words);
  const varied = new Set(successful.map(turn => normalizeAnswer(turn.text)));
  return { level: level.level, independent_answers: own.length, successful_answers: varied.size,
    ready: !session.demo && session.turns.filter(turn => !turn.help).length >= 10 && successful.length >= 6
      && varied.size >= (level.level === 1 ? 3 : level.level === 2 ? 4 : 6) };
}

export function practiceProgress(results: PracticeEvidence[], currentLevel: unknown = 1, now = Date.now()): PracticeProgress {
  // The last chosen/practised difficulty persists. Evidence offers a challenge;
  // it never silently changes the level of the learner's next conversation.
  const level = practiceLevel(currentLevel);
  const day = 86_400_000;
  const recent = results.filter(result => result.level === level.level && Number.isFinite(Date.parse(result.ended_at))
    && Date.parse(result.ended_at) <= now && Date.parse(result.ended_at) >= now - 90 * day)
    .sort((a, b) => Date.parse(b.ended_at) - Date.parse(a.ended_at)).slice(0, 60);
  // Several sessions on one date are practice, not several observations of retention.
  // UTC dates plus the elapsed-span check keep midnight/time-zone changes from
  // turning one sitting into evidence accumulated over a week.
  const successes = recent.filter(result => result.ready);
  const days = new Set(successes.map(result => new Date(result.ended_at).toISOString().slice(0, 10))).size;
  const contexts = new Set(successes.map(result => normalizeAnswer(result.context)).filter(Boolean)).size;
  const span = successes.length ? Date.parse(successes[0].ended_at) - Date.parse(successes.at(-1)!.ended_at) : 0;
  const daysNeeded = level.level <= 2 ? 4 : 5;
  const stable = recent.length >= 3 && recent[0].ready && recent.slice(0, 3).filter(result => result.ready).length >= 2;
  const fresh = recent.length > 0 && now - Date.parse(recent[0].ended_at) <= 14 * day;
  // These minimum safeguards are product heuristics, not learning deadlines or
  // validated CEFR thresholds. Many learners will need substantially more practice.
  const explore = level.level < 5 && days >= daysNeeded && contexts >= (level.level <= 2 ? 2 : 3)
    && span >= (level.level <= 2 ? 7 : 14) * day && stable && fresh;
  const guidance = explore ? PRACTICE_GUIDANCE.explore : recent.length && (!recent[0].ready || !fresh) ? PRACTICE_GUIDANCE.revisit
    : level.level === 5 ? PRACTICE_GUIDANCE.extending : days ? PRACTICE_GUIDANCE.consolidating : PRACTICE_GUIDANCE.building;
  return { level: level.level, title: level.title, goal: level.goal, answer_goal: level.answer_goal,
    next_level: explore ? level.level + 1 : null, guidance, evidence_days: days,
    ready_sessions: Math.min(daysNeeded, days), sessions_needed: daysNeeded };
}

export function coachingLimits(context: Record<string, unknown>) {
  const level = practiceLevel((context.practice as { level?: number } | undefined)?.level);
  return { ...level, text_words: context.action === "start" ? level.opening_words : level.turn_words,
    text_chars: context.action === "start" ? level.opening_chars : level.turn_chars };
}
