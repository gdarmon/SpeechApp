import { describe, expect, it } from "vitest";
import { CAPOEIRA_LESSONS, lessonContext } from "../src/capoeira.js";
import { lessonOpeningModel, openingFocus, teachingPlan } from "../src/pedagogy.js";
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
  it("keeps everyday vocabulary anchored to the opening instead of changing subjects every turn", () => {
    const opening = replySchema.parse({ text: "O que quer beber?", suggested_replies: [
      { text: "Quero um café com leite, por favor.", translation: "A coffee with milk, please." },
      { text: "Um chá, por favor.", translation: "A tea, please." },
    ] });
    expect(openingFocus(opening, 2)).toEqual(["café", "chá"]);
    const context = { action: "continue", practice: { level: 1 }, teaching: teachingPlan(1, 1, opening) };
    const good = replySchema.parse({ text: "Quer café com leite?", translation: "Want coffee with milk?", turn_feedback: { kind: "ok", message: "A clear request." },
      suggested_replies: [{ text: "Quero café com leite.", translation: "I want coffee with milk." }, { text: "Quero chá.", translation: "I want tea." }] });
    expect(coachingReplySchema(context).safeParse(good).success).toBe(true);
    expect(coachingReplySchema(context).safeParse({ ...good, text: "O que quer comer?", suggested_replies: [
      { text: "Quero um sanduíche.", translation: "I want a sandwich." }, { text: "Um bolo.", translation: "A cake." },
    ] }).success).toBe(false);
  });
  it("keeps a bounded learning focus with spaced returns across every level and theme", () => {
    for (const level of PRACTICE_LEVELS) for (const theme of CAPOEIRA_LESSONS) for (const visit of [1, 2, 5]) {
      const seen = new Set<string>();
      const focus: string[] = [];
      const history: { reply: { text: string; suggested_replies: string[] } }[] = [];
      for (let round = 0; round < 10; round++) {
        const lesson = lessonContext({ id: theme.id, visit }, round, "he-IL", level.level)!;
        const terms = lesson.vocabulary.map(entry => entry.term);
        expect(terms.length).toBeLessThanOrEqual(level.level <= 2 ? 2 : 3);
        expect(terms.filter(term => !seen.has(term)).length).toBeLessThanOrEqual(1);
        for (const term of seen) expect(terms).toContain(term);
        terms.forEach(term => seen.add(term));
        expect(terms).toContain(lesson.next_prompt.focus_term);
        focus.push(lesson.next_prompt.focus_term!);
        expect(lesson.deferred_terms.some(term => terms.includes(term))).toBe(false);
        expect(lesson.vocabulary.every(entry => /\p{Script=Hebrew}/u.test(entry.translation))).toBe(true);
        if (lesson.next_prompt.model) {
          expect(round).toBe(0);
          const model = lesson.next_prompt.model;
          expect(wordCount(model.text)).toBeLessThanOrEqual(level.turn_words);
          expect(model.suggested_replies.every(idea => wordCount(idea.text) <= level.idea_words)).toBe(true);
          const generated = replySchema.parse({ ...model, pace: "slow", turn_feedback: round ? feedback : null });
          const result = coachingReplySchema({ action: round ? "continue" : "start", lesson,
            teaching: teachingPlan(level.level, round), turns: history,
            practice: level, support_language: "he-IL" }).safeParse(generated);
          expect(result.success, `${theme.id}, level ${level.level}, visit ${visit}, round ${round}: ${result.error?.message}`).toBe(true);
          history.push({ reply: { text: model.text, suggested_replies: model.suggested_replies.map(idea => idea.text) } });
        }
      }
      expect(focus[0]).toBe(focus[1]);
      expect(focus[0]).toBe(focus[3]);
      expect(focus.slice(0, 7)).toContain(focus[7]);
      expect(seen.has(focus[9])).toBe(true);
      expect(lessonContext({ id: theme.id, visit }, 10, "he-IL", level.level)!.next_prompt.focus_term).toBeUndefined();
    }
  });

  it("uses literal cord descriptions and real situations instead of a universal name drill", () => {
    for (const language of ["en-US", "he-IL"]) {
      const lesson = lessonContext({ id: "graduated-cords-v1", visit: 2 }, 0, language)!;
      const model = lesson.next_prompt.model!;
      expect(model.text).toBe("Qual é a sua corda?");
      expect(model.suggested_replies.map(idea => idea.text)).toEqual(["Tenho corda verde e roxa.", "Ainda não tenho corda."]);
      expect(model.suggested_replies[0].translation).toContain(language === "he-IL" ? "חגורה ירוקה וסגולה" : "green-and-purple cord");
      expect(model.suggested_replies[0].translation).not.toContain("corda verde e roxa");
      expect(lesson.vocabulary[0].usage).toContain("not an idiom");
      expect(lessonOpeningModel("instruments-v1", "berimbau", "berimbau", language, 1)?.text).toBe("Você toca berimbau?");
      expect(lessonOpeningModel("kicks-v1", "martelo", "round kick", language, 1)?.text).toBe("Você treina martelo?");
      for (let round = 1; round < 10; round++) {
        expect(lessonContext({ id: "graduated-cords-v1", visit: 2 }, round, language)!.next_prompt.model).toBeUndefined();
      }
    }
  });

  it("rejects the reported cord-as-audio question and untranslated color descriptions", () => {
    const lesson = lessonContext({ id: "graduated-cords-v1", visit: 2 }, 0, "he-IL")!;
    const context = { action: "start", lesson, support_language: "he-IL" };
    const good = replySchema.parse({ ...lesson.next_prompt.model, pace: "slow" });
    expect(coachingReplySchema(context).safeParse(good).success).toBe(true);
    for (const text of ["Quer ouvir corda verde e roxa?", "Qual nome quer ouvir?", "Quer repetir esse nome?"]) {
      const result = coachingReplySchema(context).safeParse({ ...good, text });
      expect(result.success, text).toBe(false);
      expect(result.error?.issues.some(issue => issue.message.includes("meaningful conversation"))).toBe(true);
    }
    expect(coachingReplySchema(context).safeParse({ ...good, translation: 'יש לך "corda verde e roxa"?' }).success).toBe(false);
    expect(coachingReplySchema(context).safeParse({ ...good, suggested_replies: [
      { ...good.suggested_replies[0], translation: 'יש לי "corda verde e roxa".' }, good.suggested_replies[1],
    ] }).success).toBe(false);
    const english = { ...context, support_language: "en-US" };
    const enReply = replySchema.parse({ ...lessonContext({ id: "graduated-cords-v1", visit: 2 }, 0, "en-US")!.next_prompt.model, pace: "slow" });
    expect(coachingReplySchema(english).safeParse(enReply).success).toBe(true);
    expect(coachingReplySchema(english).safeParse({ ...enReply, translation: "Do you have corda verde e roxa?" }).success).toBe(false);
  });

  it("allows a responsive follow-up when the learner has no cord, and actual requests for repetition", () => {
    const lesson = lessonContext({ id: "graduated-cords-v1", visit: 1 }, 1, "he-IL")!;
    const context = { action: "continue", lesson, practice: { level: 1 }, support_language: "he-IL", input: { text: "Ainda não tenho corda." } };
    const next = replySchema.parse({ text: "Você treina há muito tempo?", translation: "אתה מתאמן כבר הרבה זמן?",
      turn_feedback: { kind: "ok", message: "הבנתי, עדיין אין לך חגורה." },
      suggested_replies: [{ text: "Comecei agora.", translation: "התחלתי עכשיו." }, { text: "Treino há um ano.", translation: "אני מתאמן שנה." }] });
    expect(coachingReplySchema(context).safeParse(next).success).toBe(true);
    const repeated = { ...next, text: "Quer ouvir esse nome devagar?", translation: "תרצה לשמוע את השם הזה לאט?" };
    expect(coachingReplySchema(context).safeParse(repeated).success).toBe(false);
    expect(coachingReplySchema({ ...context, input: { text: "Pode repetir?" } }).safeParse(repeated).success).toBe(true);
  });

  it("rejects stale answer pairs on changed questions, while allowing one familiar frame, retrieval and repair", () => {
    const opening = replySchema.parse({ text: "O que quer beber?", translation: "What would you like to drink?", suggested_replies: [
      { text: "Quero café.", translation: "I'd like coffee." }, { text: "Quero chá.", translation: "I'd like tea." },
    ] });
    const next = { ...opening, text: "Quer café com leite?", translation: "Want coffee with milk?",
      turn_feedback: { kind: "ok", message: "A clear request.", said: "", natural: "" } };
    const context = { action: "continue", practice: { level: 1 }, opening,
      teaching: teachingPlan(1, 1, opening), input: { text: "Quero café." } };
    expect(coachingReplySchema(context).safeParse(next).success).toBe(false);
    expect(coachingReplySchema(context).safeParse({ ...next, suggested_replies: [...next.suggested_replies].reverse() }).success).toBe(false);
    const adapted = { ...next, suggested_replies: [{ text: "Sim, com leite.", translation: "Yes, with milk." }, opening.suggested_replies[1]] };
    expect(coachingReplySchema(context).safeParse(adapted).success).toBe(true);
    const turns = [{ reply: { text: opening.text, suggested_replies: opening.suggested_replies.map(idea => idea.text) } }];
    expect(coachingReplySchema({ ...context, opening: undefined, turns }).safeParse(next).success).toBe(false);
    expect(coachingReplySchema({ ...context, turns: [{ reply: adapted }], teaching: teachingPlan(1, 3, opening) })
      .safeParse({ ...opening, turn_feedback: next.turn_feedback }).success).toBe(true);
    expect(coachingReplySchema({ ...context, input: { text: "Pode repetir?" } }).safeParse(next).success).toBe(true);
    expect(coachingReplySchema({ ...context, action: "help" }).safeParse({ ...next, turn_feedback: null }).success).toBe(true);
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
    const reply = question("Você conhece esse ritmo?");
    reply.turn_feedback = null;
    reply.suggested_replies[0].text = "São Bento Grande da Regional.";
    expect(coachingReplySchema({ action: "start", lesson }).safeParse(reply).success).toBe(true);
    const cord = question("Qual é a sua corda?");
    cord.translation = "איזו חגורה יש לך?";
    cord.turn_feedback = null;
    cord.suggested_replies[0] = { text: "Corda crua e amarela.", translation: "חגורה בצבע טבעי וצהוב." };
    expect(coachingReplySchema({ action: "start", support_language: "he-IL", lesson: lessonContext({ id: "first-cords-v1", visit: 2 }) }).safeParse(cord).success).toBe(true);
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
    const reply = replySchema.parse({ text: "O que ajuda você na aula?", translation: "מה עוזר לך בשיעור?", turn_feedback: feedback,
      suggested_replies: [{ text: "Uma explicação simples ajuda porque ainda estou aprendendo português.", translation: "הסבר פשוט עוזר כי אני עדיין לומד פורטוגזית." },
        { text: "Gosto de praticar devagar com um colega.", translation: "אני אוהב לתרגל לאט עם חבר." }] });
    expect(coachingReplySchema(context).safeParse(reply).success).toBe(true);
    expect(coachingReplySchema(context).safeParse({ ...reply, suggested_replies: [
      { text: "Quero esquiva diagonal.", translation: "אני רוצה התחמקות אלכסונית." },
      { text: "Pode repetir?", translation: "אפשר לחזור?" },
    ] }).success).toBe(false);
    const guided = lessonContext({ id: "evasions-v1", visit: 1 }, 1, "he-IL", 4)!;
    expect(coachingReplySchema({ ...context, lesson: guided, teaching: teachingPlan(4, 1) })
      .safeParse({ ...reply, suggested_replies: [{ text: "Sim.", translation: "כן." }, { text: "Ainda não.", translation: "עדיין לא." }] }).success).toBe(true);
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
