import type { Session, Turn } from "./models.js";

export const PRACTICE_LEVELS = [
  { level: 1, title: "First phrases", goal: "Reuse a short phrase to express one concrete need.", answer_goal: "One short phrase, usually 2–7 words", minimum_words: 2, opening_words: 7, opening_chars: 70, turn_words: 7, turn_chars: 70, idea_words: 7, idea_chars: 70 },
  { level: 2, title: "Full sentences", goal: "Give a full sentence with one useful detail.", answer_goal: "One short sentence, usually 5–12 words", minimum_words: 5, opening_words: 12, opening_chars: 100, turn_words: 12, turn_chars: 100, idea_words: 12, idea_chars: 100 },
  { level: 3, title: "Connected answers", goal: "Connect two thoughts with a reason or a short sequence.", answer_goal: "Two short connected thoughts", minimum_words: 10, opening_words: 18, opening_chars: 150, turn_words: 18, turn_chars: 150, idea_words: 24, idea_chars: 180 },
  { level: 4, title: "Explain and clarify", goal: "Explain one event or clarify one misunderstanding.", answer_goal: "Two or three connected sentences on one point", minimum_words: 16, opening_words: 24, opening_chars: 190, turn_words: 24, turn_chars: 190, idea_words: 32, idea_chars: 250 },
  { level: 5, title: "Flexible conversations", goal: "Explain a choice and adapt it to one change of plan.", answer_goal: "A concise explanation with a reason or alternative", minimum_words: 24, opening_words: 32, opening_chars: 240, turn_words: 32, turn_chars: 240, idea_words: 40, idea_chars: 300 },
] as const;

export type PracticeLevel = typeof PRACTICE_LEVELS[number];
export type PracticeProgress = { level: number; title: string; goal: string; answer_goal: string; ready_sessions: number; sessions_needed: number };
export type PracticeResult = { level: number; independent_answers: number; successful_answers: number; ready: boolean };
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
  // Word count is a coarse answer-length signal: STT punctuation is not a reliable
  // sentence counter. Never use elapsed time, repetitions or typed text to promote.
  const successful = own.filter(turn => turn.reply.turn_feedback?.kind === "ok" && answerWords(turn.text) >= level.minimum_words);
  const varied = new Set(successful.map(turn => normalizeAnswer(turn.text)));
  return { level: level.level, independent_answers: own.length, successful_answers: varied.size,
    ready: !session.demo && session.turns.filter(turn => !turn.help).length >= 10 && successful.length >= 6
      && varied.size >= (level.level === 1 ? 3 : level.level === 2 ? 4 : 6) };
}

export function practiceProgress(results: { level: number; sessions: number }[]): PracticeProgress {
  const proven = results.filter(result => result.sessions >= 2 && result.level >= 1 && result.level <= 5);
  const level = practiceLevel(Math.min(5, Math.max(1, ...proven.map(result => result.level + 1))));
  return { level: level.level, title: level.title, goal: level.goal, answer_goal: level.answer_goal,
    ready_sessions: Math.min(2, results.find(result => result.level === level.level)?.sessions ?? 0), sessions_needed: 2 };
}

export function coachingLimits(context: Record<string, unknown>) {
  const level = practiceLevel((context.practice as { level?: number } | undefined)?.level);
  return { ...level, text_words: context.action === "start" ? level.opening_words : level.turn_words,
    text_chars: context.action === "start" ? level.opening_chars : level.turn_chars };
}
