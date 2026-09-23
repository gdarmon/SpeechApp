import { describe, expect, it } from "vitest";
import { CAPOEIRA_LESSONS, lessonContext } from "../src/capoeira.js";
import { teachingPlan } from "../src/pedagogy.js";
import { coachingReplySchema, wordCount } from "../src/coaching.js";
import { PRACTICE_LEVELS, practiceResult } from "../src/learning.js";
import { replySchema, type Session } from "../src/models.js";
import { focusWords } from "../src/vocabulary.js";

const feedback = { kind: "ok" as const, message: "בקשה ברורה.", said: "", natural: "" };
const question = (text = "Quer repetir martelo?") => replySchema.parse({ text, translation: "רוצה לחזור על מרטלו?", pace: "slow",
  turn_feedback: feedback, suggested_replies: [
    { text: "Quero martelo.", translation: "אני רוצה מרטלו." },
    { text: "Pode repetir?", translation: "אפשר לחזור?" },
  ] });

describe("focused ten-answer lessons", () => {
  it("keeps a bounded learning focus with spaced returns across every level and theme", () => {
    for (const level of PRACTICE_LEVELS) for (const theme of CAPOEIRA_LESSONS) for (const visit of [1, 2, 5]) {
      const seen = new Set<string>();
      const focus: string[] = [];
      for (let round = 0; round < 10; round++) {
        const lesson = lessonContext({ id: theme.id, visit }, round, "he-IL", level.level)!;
        const terms = lesson.vocabulary.map(entry => entry.term);
        expect(terms.length).toBeLessThanOrEqual(level.level === 1 ? 2 : level.level === 2 ? 3 : 4);
        expect(terms.filter(term => !seen.has(term)).length).toBeLessThanOrEqual(1);
        for (const term of seen) expect(terms).toContain(term);
        terms.forEach(term => seen.add(term));
        expect(terms).toContain(lesson.next_prompt.focus_term);
        focus.push(lesson.next_prompt.focus_term!);
        expect(lesson.deferred_terms.some(term => terms.includes(term))).toBe(false);
        expect(lesson.vocabulary.every(entry => /\p{Script=Hebrew}/u.test(entry.translation))).toBe(true);
        {
          const model = lesson.next_prompt.model!;
          expect(wordCount(model.text)).toBeLessThanOrEqual(level.turn_words);
          expect(model.suggested_replies.every(idea => wordCount(idea.text) <= level.idea_words)).toBe(true);
          const generated = replySchema.parse({ ...model, pace: "slow", turn_feedback: round ? feedback : null });
          expect(coachingReplySchema({ action: round ? "continue" : "start", lesson,
            practice: level, support_language: "he-IL" }).safeParse(generated).success).toBe(true);
        }
      }
      expect(focus[0]).toBe(focus[1]);
      expect(focus[0]).toBe(focus[3]);
      expect(focus.slice(0, 7)).toContain(focus[7]);
      expect(seen.has(focus[9])).toBe(true);
      expect(lessonContext({ id: theme.id, visit }, 10, "he-IL", level.level)!.next_prompt.focus_term).toBeUndefined();
    }
  });

  it("limits every level-one spoken field to seven words, including help and corrections", () => {
    const long = "Quando usamos a negativa na aula, quem costuma ser seu parceiro?";
    const context = { action: "continue", practice: { level: 1 }, support_language: "he-IL", input: { text: "Quero repetir martelo." } };
    const schema = coachingReplySchema(context);
    expect(schema.safeParse(question(long)).success).toBe(false);
    expect(schema.safeParse(question("Você quer repetir o nome martelo agora?")).success).toBe(true); // exactly seven
    expect(schema.safeParse(question("Você quer repetir o nome martelo agora comigo?")).success).toBe(false);
    expect(schema.safeParse(question("Quando treinamos, quem vem?")).success).toBe(false);
    expect(schema.safeParse(question("Isso é martelo. Quem vem?")).success).toBe(false);
    expect(schema.safeParse(question("Quem treina e onde mora?")).success).toBe(false);
    expect(schema.safeParse({ ...question(), translation: "רוצה לחזור? עם מי?" }).success).toBe(false);
    const eight = "Eu quero repetir o nome martelo mais devagar.";
    expect(wordCount(eight)).toBe(8);
    expect(coachingReplySchema({ ...context, action: "help" }).safeParse({ ...question(), turn_feedback: null, practice_phrase: eight }).success).toBe(false);
    expect(schema.safeParse({ ...question(), turn_feedback: { kind: "correction", said: context.input.text, natural: eight, message: "כדאי לקצר." } }).success).toBe(false);
    for (const level of PRACTICE_LEVELS) {
      expect(level.turn_words).toBe(level.opening_words);
      expect(teachingPlan(level.level).language_work).toBeTruthy();
    }
  });

  it("permits planned retrieval after a gap, while preventing immediate question loops", () => {
    const opening = question();
    const context = { action: "continue", practice: { level: 1 }, opening,
      input: { text: "Quero queixada." }, teaching: teachingPlan(1, 3),
      lesson: lessonContext({ id: "kicks-v1", visit: 1 }, 3),
      turns: [{ reply: { text: "Quer repetir queixada?" } }] };
    expect(coachingReplySchema(context).safeParse(opening).success).toBe(true);
    expect(coachingReplySchema({ ...context, turns: [{ reply: opening }] }).safeParse(opening).success).toBe(false);
    expect(coachingReplySchema({ ...context, teaching: teachingPlan(1, 1), lesson: lessonContext({ id: "kicks-v1", visit: 1 }, 1) }).safeParse(opening).success).toBe(false);
    const nextLesson = lessonContext({ id: "instruments-v1", visit: 1 })!;
    const nextOpening = replySchema.parse({ ...nextLesson.next_prompt.model, pace: "slow" });
    expect(coachingReplySchema({ action: "start", lesson: nextLesson,
      recent_openings: [nextOpening.text] }).safeParse(nextOpening).success).toBe(true);
  });

  it("keeps canonical long terms intact and prioritizes a learner's explicit terminology question", () => {
    const lesson = lessonContext({ id: "roda-rhythms-v1", visit: 1 }, 0)!;
    const reply = question("Quer ouvir o nome?");
    reply.turn_feedback = null;
    reply.suggested_replies[0].text = "São Bento Grande da Regional.";
    expect(coachingReplySchema({ action: "start", lesson }).safeParse(reply).success).toBe(true);
    const cord = question("Quer repetir o nome?");
    cord.turn_feedback = null;
    cord.suggested_replies[0].text = "Corda crua e amarela.";
    expect(coachingReplySchema({ action: "start", lesson: lessonContext({ id: "first-cords-v1", visit: 2 }) }).safeParse(cord).success).toBe(true);
    const context = { action: "continue", lesson: lessonContext({ id: "kicks-v1", visit: 1 }, 1),
      input: { text: "O que é a negativa?" }, capoeira_reference: [{ term: "negativa" }] };
    const clarification = question("Quer conhecer o nome negativa?");
    expect(coachingReplySchema(context).safeParse(clarification).success).toBe(true);
    expect(coachingReplySchema({ ...context, input: { text: "O que é au sem mau?" }, capoeira_reference: [{ term: "aú sem mão" }] })
      .safeParse({ ...clarification, suggested_replies: [
        { text: "Quero aú sem mão.", translation: "אני רוצה גלגלון בלי ידיים." },
        { text: "Pode repetir?", translation: "אפשר לחזור?" },
      ] }).success).toBe(true);
  });

  it("models connected answers at higher levels without requiring the learner to write a long answer", () => {
    const lesson = lessonContext({ id: "evasions-v1", visit: 1 }, 3, "he-IL", 4)!;
    const context = { action: "continue", practice: { level: 4 }, lesson, teaching: teachingPlan(4, 3),
      input: { text: "Quero repetir esquiva diagonal." } };
    const reply = replySchema.parse({ ...lesson.next_prompt.model, turn_feedback: feedback });
    expect(coachingReplySchema(context).safeParse(reply).success).toBe(true);
    expect(coachingReplySchema(context).safeParse({ ...reply, suggested_replies: [
      { text: "Quero esquiva diagonal.", translation: "אני רוצה התחמקות אלכסונית." },
      { text: "Pode repetir?", translation: "אפשר לחזור?" },
    ] }).success).toBe(false);
    const guided = lessonContext({ id: "evasions-v1", visit: 1 }, 1, "he-IL", 4)!;
    expect(coachingReplySchema({ ...context, lesson: guided, teaching: teachingPlan(4, 1) })
      .safeParse({ ...reply, ...guided.next_prompt.model }).success).toBe(true);
  });

  it("lets meaningful repeated short answers contribute without promoting rote or assisted sessions", () => {
    const texts = ["Quero martelo.", "Pode repetir?", "Quero queixada.", "Quero martelo.", "Pode repetir?", "Quero queixada.", "Sim.", "Sim.", "Não.", "Não."];
    const session = { request: { resolved_level: 1 }, opening: question(), demo: false,
      turns: texts.map(text => ({ text, source: "speech", ideas_hidden: true, help: false, assisted: false, reply: question() })) } as Session;
    expect(practiceResult(session).ready).toBe(true);
    session.turns.forEach(turn => { turn.text = "Quero martelo."; });
    expect(practiceResult(session).ready).toBe(false);
    session.turns.forEach((turn, index) => { turn.text = texts[index]; turn.assisted = true; });
    expect(practiceResult(session).ready).toBe(false);
  });

  it("keeps encountered lesson targets in the five-item review even when already seen", () => {
    const session = { request: { topic: "capoeira class", resolved_level: 1, resolved_lesson: { id: "kicks-v1", visit: 1 } },
      topic: "Capoeira", turns: [] } as unknown as Session;
    const counts = new Map([["martelo", 5], ["queixada", 4], ["colega", 8], ["hoje", 8], ["amigo", 8], ["amanhã", 8], ["escola", 8]]);
    expect(focusWords(session, counts, new Set(["martelo", "queixada"]))).toEqual(expect.arrayContaining(["martelo", "queixada"]));
    expect(focusWords(session, counts, new Set())).toHaveLength(5);
    expect(focusWords(session, new Map([["martelo", 1]]), new Set())).toEqual(["martelo"]);
  });
});
