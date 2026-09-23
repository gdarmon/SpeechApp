import { describe, expect, it } from "vitest";
import { coachingReplySchema } from "../src/coaching.js";
import { feedbackSchema, replySchema, type Session } from "../src/models.js";
import { sessionVocabulary } from "../src/vocabulary.js";
import { sanitizeFeedback } from "../src/service.js";

const opening = replySchema.parse({ text: "Oi! Tudo bem?", translation: "היי! מה שלומך?", pace: "slow",
  suggested_replies: [{ text: "Estou bem.", translation: "שלומי טוב." }, { text: "Mais ou menos.", translation: "ככה ככה." }] });
const correction = { kind: "correction", message: "Use quero for I want.", said: "Eu querer café", natural: "Eu quero café" };
const fixed = { ...opening, text: "Com leite?", turn_feedback: correction };

describe("small-step conversation contract", () => {
  it("accepts a short greeting and rejects a complicated opening, stacked questions and long answer ideas", () => {
    const schema = coachingReplySchema({ action: "start" });
    expect(schema.parse(opening)).toEqual(opening);
    for (const reply of [
      { ...opening, text: "Oi! Como você costuma escolher um lugar interessante para encontrar todos os seus amigos?" },
      { ...opening, text: "Tudo bem? Como se chama?" },
      { ...opening, pace: "normal" },
      { ...opening, suggested_replies: [{ text: "Eu geralmente gosto de encontrar os meus amigos no café da esquina.", translation: "Long answer" }, opening.suggested_replies[1]] },
    ]) expect(schema.safeParse(reply).success).toBe(false);
  });

  it("requires immediate feedback and grounds one spoken correction in this learner's current answer", () => {
    const schema = coachingReplySchema({ action: "continue", input: { text: "Eu querer café, por favor." } });
    expect(schema.parse(fixed).turn_feedback?.natural).toBe("Eu quero café");
    expect(schema.safeParse(opening).success).toBe(false);
    expect(schema.safeParse({ ...fixed, turn_feedback: { ...correction, said: "Ele querer café" } }).success).toBe(false);
    expect(schema.safeParse({ ...fixed, text: "Quer leite?" }).success).toBe(true);
    expect(schema.safeParse({ ...fixed, text: "Eu quero café." }).success).toBe(false);
    expect(schema.safeParse({ ...fixed, turn_feedback: { ...correction, natural: "Eu querer café!" } }).success).toBe(false);
    expect(schema.safeParse({ ...fixed, turn_feedback: { ...correction, natural: "Eu quero קפה" } }).success).toBe(false);
    const age = coachingReplySchema({ action: "continue", input: { text: "Eu tenho 44 anos." } });
    expect(age.safeParse({ ...fixed, text: "Tenho 44 anos. Tudo bem?", turn_feedback: { ...correction, said: "Eu tenho 44 anos", natural: "Tenho 44 anos" } }).success).toBe(false);
  });

  it("does not grade a help-language request and closes answer ten without a new question", () => {
    expect(coachingReplySchema({ action: "help" }).safeParse(fixed).success).toBe(false);
    const schema = coachingReplySchema({ action: "continue", input: { text: "Estou bem." }, last_turn: true });
    const closing = { ...opening, text: "Boa prática! Até a próxima!", translation: "תרגול טוב! להתראות!", suggested_replies: [],
      turn_feedback: { kind: "ok", message: "That answer works.", said: "", natural: "" } };
    expect(schema.safeParse(closing).success).toBe(true);
    expect(schema.safeParse({ ...closing, text: "Boa! E você?" }).success).toBe(false);
    expect(schema.safeParse({ ...closing, suggested_replies: opening.suggested_replies }).success).toBe(false);
  });

  it("rejects English template translations when Hebrew is selected", () => {
    const schema = coachingReplySchema({ action: "start", support_language: "he-IL" });
    expect(schema.safeParse(opening).success).toBe(true);
    expect(schema.safeParse({ ...opening, translation: "Hi! How are you?" }).success).toBe(false);
    expect(schema.safeParse({ ...opening, suggested_replies: [{ ...opening.suggested_replies[0], translation: "I'm well." }, opening.suggested_replies[1]] }).success).toBe(false);
  });
});

it("counts actual Portuguese exposure while excluding help-language words and translated feedback", () => {
  const session = { opening: replySchema.parse({ text: "Café ou chá?", translation: "Coffee or tea?", suggested_replies: [
    { text: "Um café.", translation: "A coffee." }, { text: "Um chá.", translation: "A tea." },
  ] }), turns: [
    { text: "Um CAFÉ.", help: false, reply: replySchema.parse({ text: "Com leite?", explanation: "milk", turn_feedback: { kind: "ok", message: "Nice answer" } }) },
    { text: "I want coffee", help: true, reply: replySchema.parse({ text: "Quero café.", practice_phrase: "Quero café." }) },
  ] } as Session;
  const counts = sessionVocabulary(session);
  expect(counts.get("café")).toBe(3);
  expect(counts.get("chá")).toBe(1);
  expect(counts.get("leite")).toBe(1);
  for (const word of ["coffee", "milk", "nice", "want", "tea"]) expect(counts.has(word)).toBe(false);
});

it("includes spoken corrections without counting an echoed correction twice", () => {
  const session = { opening, turns: [
    { text: "Eu querer café", help: false, reply: replySchema.parse({ ...fixed, text: "Com leite?" }) },
    { text: "Eu querer café", help: false, reply: replySchema.parse(fixed) },
  ] } as Session;
  expect(sessionVocabulary(session).get("quero")).toBe(2);
});

it("grounds the final review in recorded coaching instead of inventing a new grammar diagnosis", () => {
  const report = feedbackSchema.parse({ summary: "You made several basic mistakes.", pointers: ["Always add an article before café."], corrections: [
    { key: "quero", category: "grammar", said: correction.said, natural: correction.natural, explanation: "Use quero.", example: "Eu quero chá." },
    { key: "article", category: "grammar", said: "Eu quero café", natural: "Eu quero o café", explanation: "Always add an article.", example: "O café." },
  ] });
  for (const language of ["en-US", "he-IL"] as const) {
    const session = { request: { support_language: language }, opening, kind: "conversation", demo: false, turns: [
      { text: correction.said, help: false, source: "speech", reply: replySchema.parse(fixed) },
      { text: "Eu quero café", help: false, source: "typed", assisted: true, reply: replySchema.parse({ ...opening, turn_feedback: { kind: "ok", message: "That works." } }) },
    ] } as Session;
    const result = sanitizeFeedback(report, session, { confidence: null });
    expect(result.corrections.map(point => point.key)).toEqual(["quero"]);
    expect(result.corrections[0].explanation).toBe(correction.message);
    expect(result.corrections[0].example).toBe(correction.natural);
    expect(result.review_phrases).toEqual([correction.natural]);
    expect(result.summary).not.toContain("mistakes");
    expect(result.pointers.join(" ")).not.toContain("article");
    expect(result.pointers[0]).toContain(correction.natural);
    expect(result.summary).toContain(language === "he-IL" ? "תשובות שתרגלת: 2. תשובות בדיבור ללא עזרה: 1." : "2 Portuguese answers, including 1 spoken without help.");
    // A repeated finish should not mutate the provider's original response object.
    expect(report.corrections).toHaveLength(2);
  }
});
