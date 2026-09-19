import { z } from "zod";

const text = (max: number, min = 0) => z.string().trim().min(min).max(max);
export const PRACTICE_TURNS = 10;
export const startSchema = z.strictObject({
  request_id: text(80, 8),
  kind: z.enum(["conversation", "assessment"]).default("conversation"),
  topic: text(120, 1).default("choose for me"),
  support_language: z.enum(["en-US", "he-IL"]).optional(),
});
export const turnSchema = z.strictObject({
  request_id: text(80, 8), text: text(2500, 1),
  help: z.boolean().default(false),
  language: z.enum(["pt-BR", "en-US", "he-IL"]).default("pt-BR"),
  speech_ms: z.number().int().min(0).max(180000).default(0),
  source: z.enum(["speech", "typed"]).optional(),
  assisted: z.boolean().optional(),
}).refine((v) => v.help || v.language === "pt-BR", "Use pt-BR for conversation turns.")
  .refine((v) => v.source !== "typed" || v.speech_ms === 0, "Typed replies cannot count as speaking time.");
export const finishSchema = z.strictObject({
  confidence: z.enum(["hard", "okay", "comfortable"]).nullable().default(null),
});
export const turnFeedbackSchema = z.strictObject({
  kind: z.enum(["ok", "correction", "clarify", "guided"]),
  message: text(160, 1),
  said: text(250).default(""),
  natural: text(90).default(""),
});
export const replySchema = z.strictObject({
  text: text(1600, 1), explanation: text(400).default(""),
  practice_phrase: text(500).default(""), pace: z.enum(["slow", "normal"]).default("normal"),
  topic: text(120).default(""),
  translation: text(2400).default(""),
  suggested_replies: z.array(z.strictObject({ text: text(350, 1), translation: text(500, 1) })).max(2).default([]),
  turn_feedback: turnFeedbackSchema.nullable().default(null),
});
export const correctionSchema = z.strictObject({
  key: text(120, 1), category: z.enum(["grammar", "retrieval", "naturalness", "literal_translation"]),
  said: text(500, 1), natural: text(500, 1), explanation: text(500, 1), example: text(500, 1),
});
const dimension = z.strictObject({ observation: text(500), evidence: text(500).default("") });
export const assessmentSchema = z.strictObject({
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).nullable().default(null),
  comprehension: dimension, vocabulary: dimension, grammar: dimension, sentence_construction: dimension,
  fluency: dimension, pronunciation: dimension, confidence: dimension,
});
export const feedbackSchema = z.strictObject({
  summary: text(700, 1), corrections: z.array(correctionSchema).max(3).default([]),
  assessment: assessmentSchema.nullable().default(null),
  pointers: z.array(text(220, 1)).max(3).default([]),
  vocabulary: z.array(z.strictObject({ word: text(80, 1), translation: text(100) })).max(180).default([]),
});
export type Start = z.infer<typeof startSchema>;
export type TurnInput = z.infer<typeof turnSchema>;
export type Finish = z.infer<typeof finishSchema>;
export type Reply = z.infer<typeof replySchema>;
export type Feedback = z.infer<typeof feedbackSchema> & {
  review_phrases?: string[]; vocabulary_total?: number;
  vocabulary: { word: string; translation: string; occurrences?: number; seen_before?: boolean }[];
};
export type Correction = z.infer<typeof correctionSchema>;
export type Assessment = z.infer<typeof assessmentSchema>;
export type Turn = TurnInput & { id?: number; session_id: string; reply: Reply; request?: TurnInput };
export type Session = {
  id: string; request_id: string; request: Start; kind: Start["kind"]; topic: string;
  started_at: string; ended_at: string | null; opening: Reply; feedback: Feedback | null;
  demo: boolean; turns: Turn[];
};
export type Memory = Partial<Correction> & {
  natural: string; category: string; occurrences: number; last_seen: string; due_at: string; topic?: string;
};
export type LearnerContext = { assessment: Assessment | null; memory: Memory[]; help_patterns: Memory[]; recent_topics: string[] };

export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
