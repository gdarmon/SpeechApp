import { describe, expect, it } from "vitest";
import { CAPOEIRA_LESSONS, capoeiraTerm, chooseLesson, lessonContext, type LessonHistory } from "../src/capoeira.js";
import { focusWords, sessionVocabulary, vocabularyUnits } from "../src/vocabulary.js";
import { coachingReplySchema } from "../src/coaching.js";
import { replySchema, type Session } from "../src/models.js";

describe("varied ABADÁ conversations", () => {
  it("covers the full curriculum before revisiting, then rotates vocabulary on the oldest lesson", () => {
    const history: LessonHistory[] = [];
    for (let i = 0; i < CAPOEIRA_LESSONS.length; i++) {
      const choice = chooseLesson("capoeira class", history)!;
      expect(history.some(item => item.id === choice.id)).toBe(false);
      expect(choice.visit).toBe(1);
      history.push({ id: choice.id, visits: 1, last_used: new Date(i * 1000).toISOString() });
    }
    const revisited = chooseLesson("ABADÁ", history)!;
    expect(revisited).toEqual({ id: history[0].id, visit: 2 });
    expect(lessonContext(revisited)?.vocabulary[0].term).not.toBe(lessonContext({ ...revisited, visit: 1 })?.vocabulary[0].term);
    expect(chooseLesson("everyday life", history)).toBeUndefined();
    expect(chooseLesson("capoeira class", [])?.id).toBe(history[0].id);
  });

  it("keeps every lesson small, translated and usable for all ten questions", () => {
    for (const lesson of CAPOEIRA_LESSONS) {
      for (let question = 0; question < 10; question++) {
        const context = lessonContext({ id: lesson.id, visit: 2 }, question, "he-IL")!;
        expect(context.vocabulary.length).toBeLessThanOrEqual(4);
        expect(context.vocabulary.some(term => term.term === context.next_prompt.focus_term)).toBe(true);
        expect(context.vocabulary.every(term => /\p{Script=Hebrew}/u.test(term.translation))).toBe(true);
      }
      expect(lessonContext({ id: lesson.id, visit: 1 }, 10)?.next_prompt.focus_term).toBeUndefined();
    }
    expect(capoeiraTerm("Meia-lua solta")).toBeUndefined();
    expect(capoeiraTerm("Bencao")?.word).toBe("bênção");
    expect(capoeiraTerm("Vôo do morcego")?.word).toBe("voo do morcego");
    expect(lessonContext({ id: "unknown-old-lesson", visit: 1 })).toBeUndefined();
  });

  it("reviews complete movement names, handles accents and excludes unused examples", () => {
    const opening = replySchema.parse({ text: "Meia-lua de compasso ou aú?", suggested_replies: [{ text: "Quero aprender s-dobrado.", translation: "An unused idea" }] });
    const session = { request: { topic: "capoeira class" }, topic: "ABADÁ", opening,
      turns: [{ help: false, text: "Meia lua de compasso. Depois, queda de rim.", reply: replySchema.parse({ text: "Vamos conversar sobre queda de rins e aú." }) }] } as Session;
    const counts = sessionVocabulary(session);
    expect(counts.get("meia-lua de compasso")).toBe(2);
    expect(counts.get("queda de rins")).toBe(2);
    expect(counts.get("aú")).toBe(2);
    for (const fragment of ["meia", "lua", "compasso", "rins", "s-dobrado"]) expect(counts.has(fragment)).toBe(false);
    expect(focusWords(session, counts, new Set())).toContain("aú");
    expect(focusWords(session, counts, new Set()).length).toBeLessThanOrEqual(5);
    expect(vocabularyUnits("Vôo do morcego. Bencao. S dobrado.", true)).toEqual(["voo do morcego", "bênção", "s-dobrado"]);
    expect(vocabularyUnits("A bateria do carro.", false)).toEqual(["a", "bateria", "do", "carro"]);
    session.request.resolved_lesson = { id: "spinning-v1", visit: 1 };
    const ranked = focusWords(session, new Map([...counts, ["novo", 20], ["lado", 20], ["professor", 20], ["rápido", 20]]), new Set());
    expect(ranked).toContain("meia-lua de compasso");
  });

  it("rejects repeated openings and turns but allows requested repetition and clarification", () => {
    const opening = replySchema.parse({ text: "Oi! Martelo ou armada?", translation: "Hi! Martelo or armada?", pace: "slow",
      suggested_replies: [{ text: "Prefiro martelo.", translation: "I prefer martelo." }, { text: "Quero armada.", translation: "I want armada." }] });
    expect(coachingReplySchema({ action: "start", recent_openings: [opening.text] }).safeParse(opening).success).toBe(false);
    const reply = { ...opening, turn_feedback: { kind: "ok", message: "That works.", said: "", natural: "" } };
    const context = { action: "continue", opening, input: { text: "Prefiro martelo." } };
    expect(coachingReplySchema(context).safeParse(reply).success).toBe(false);
    expect(coachingReplySchema({ ...context, input: { text: "Pode repetir?" } }).safeParse(reply).success).toBe(true);
    expect(coachingReplySchema(context).safeParse({ ...reply, turn_feedback: { ...reply.turn_feedback, kind: "clarify" } }).success).toBe(true);
    expect(coachingReplySchema({ action: "help", opening }).safeParse(opening).success).toBe(true);
  });

  it("enforces open speaking tasks without restricting the planned choice or confirmation turns", () => {
    const reply = replySchema.parse({ text: "Qual chute você prefere?", pace: "slow", translation: "Which kick do you prefer?",
      suggested_replies: [{ text: "Prefiro martelo.", translation: "I prefer martelo." }, { text: "Eu gosto de armada.", translation: "I like armada." }] });
    const context = { action: "start", lesson: lessonContext({ id: "kicks-v1", visit: 1 }) };
    expect(coachingReplySchema(context).safeParse(reply).success).toBe(true);
    expect(coachingReplySchema({ ...context, recent_openings: ["Oi! Qual chute você prefere?"] }).safeParse(reply).success).toBe(false);
    expect(coachingReplySchema({ ...context, lesson: lessonContext({ id: "exercises-v1", visit: 1 }) }).safeParse(reply).success).toBe(false);
    for (const text of ["Você prefere martelo?", "Martelo ou armada?", "Qual você prefere: martelo ou armada?"]) {
      expect(coachingReplySchema(context).safeParse({ ...reply, text }).success).toBe(false);
      expect(coachingReplySchema({ ...context, lesson: lessonContext({ id: "kicks-v1", visit: 1 }, 4) }).safeParse({ ...reply, text }).success).toBe(true);
    }
  });
});
