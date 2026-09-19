import { describe, expect, it } from "vitest";
import { feedbackSchema, replySchema, type Session } from "../src/models.js";
import { coachingReplySchema } from "../src/coaching.js";
import { independentAnswer, practiceProgress, practiceResult } from "../src/learning.js";
import { compactFeedback, focusWords, sessionVocabulary } from "../src/vocabulary.js";

const reply = replySchema.parse({ text: "O que você vai fazer?", translation: "What will you do?", turn_feedback: { kind: "ok", message: "That fits the instruction." },
  suggested_replies: [{ text: "Vou treinar com calma.", translation: "I'll practise calmly." }, { text: "Pode repetir?", translation: "Can you repeat?" }] });
const answers = ["Primeiro vou levantar a mão direita.", "Depois eu vou trocar de lado.", "Eu quero repetir o movimento devagar.", "Agora vou formar uma dupla aqui.", "Vou prestar atenção no meu professor.", "Eu vou seguir o ritmo agora.", "Sim.", "Tudo bem.", "Claro.", "Obrigado."];
const session = (): Session => ({ request: { topic: "capoeira class", resolved_level: 2 }, topic: "Capoeira class", kind: "conversation", demo: false,
  opening: reply, turns: answers.map(text => ({ text, source: "speech", help: false, assisted: false, reply })) } as Session);

describe("practice difficulty", () => {
  it("requires a complete session with six distinct clear answers of the target length", () => {
    expect(practiceResult(session())).toMatchObject({ level: 2, successful_answers: 6, ready: true });
    const short = session(); short.turns.pop();
    expect(practiceResult(short).ready).toBe(false);
    const repeated = session(); repeated.turns.forEach(turn => { turn.text = answers[0]; });
    expect(practiceResult(repeated)).toMatchObject({ successful_answers: 1, ready: false });
    const tooBrief = session(); tooBrief.request.resolved_level = 4;
    expect(practiceResult(tooBrief).ready).toBe(false);
  });
  it("excludes suggested, typed, helped, corrected and demo answers from advancement", () => {
    for (const kind of ["assisted", "typed", "copied", "help", "correction", "demo"]) {
      const s = session();
      if (kind === "demo") s.demo = true;
      for (const turn of s.turns) {
        if (kind === "assisted") turn.assisted = true;
        if (kind === "typed") turn.source = "typed";
        if (kind === "copied") turn.text = reply.suggested_replies[0].text;
        if (kind === "help") turn.help = true;
        if (kind === "correction") turn.reply = { ...reply, turn_feedback: { kind: "correction", said: turn.text, natural: "Uma frase", message: "Adjust this." } };
      }
      expect(practiceResult(s).ready, kind).toBe(false);
    }
  });
  it("recommends a step up after two qualifying sessions, without time-based promises", () => {
    expect(practiceProgress([]).level).toBe(1);
    expect(practiceProgress([{ level: 1, sessions: 1 }])).toMatchObject({ level: 1, ready_sessions: 1 });
    expect(practiceProgress([{ level: 1, sessions: 2 }, { level: 5, sessions: 1 }]).level).toBe(2);
    expect(practiceProgress([{ level: 3, sessions: 2 }]).level).toBe(4);
    expect(practiceProgress([{ level: 5, sessions: 20 }]).level).toBe(5);
  });
  it("does not penalize a natural answer that happens to match an unseen idea", () => {
    const s = session(); const turn = s.turns[0];
    turn.text = reply.suggested_replies[0].text;
    expect(independentAnswer(s, turn, 0)).toBe(false);
    turn.ideas_hidden = true;
    expect(independentAnswer(s, turn, 0)).toBe(true);
    turn.assisted = true;
    expect(independentAnswer(s, turn, 0)).toBe(false);
  });
  it("allows connected answers at higher levels while retaining the beginner and one-question limits", () => {
    const longer = { ...reply, text: "O professor mudou a sequência depois da primeira tentativa. Como você vai explicar o que entendeu e confirmar a mudança?", suggested_replies: [
      { text: "Primeiro eu vou gingar devagar. Depois vou trocar de lado. Quero confirmar o último movimento.", translation: "First I'll move slowly. Then I'll change sides. I want to confirm the last movement." },
      { text: "Entendi a primeira parte. Não entendi a mudança. Pode explicar o último movimento?", translation: "I understood the first part. I didn't understand the change. Can you explain the last movement?" },
    ] };
    expect(coachingReplySchema({ action: "continue", practice: { level: 4 } }).safeParse(longer).success).toBe(true);
    expect(coachingReplySchema({ action: "continue", practice: { level: 1 } }).safeParse(longer).success).toBe(false);
    expect(coachingReplySchema({ action: "continue", practice: { level: 4 } }).safeParse({ ...longer, text: "Entendeu? O que vai fazer?" }).success).toBe(false);
  });
});

describe("five useful words", () => {
  it("prefers unseen meaningful class words over frequent fillers and duplicate word forms", () => {
    const s = session();
    const counts = new Map([['sim', 40], ['eu', 40], ['por', 40], ['ginga', 8], ['gingar', 7], ['mão', 2], ['direita', 4], ['direito', 1], ['devagar', 4], ['esquerda', 3], ['parceiro', 3], ['abacaxi', 1]]);
    const words = focusWords(s, counts, new Set(['ginga', 'gingar']));
    expect(words).toHaveLength(5);
    expect(words).toEqual(expect.arrayContaining(['mão', 'direita', 'devagar', 'esquerda', 'parceiro']));
    expect(words.some(word => ['sim', 'eu', 'por', 'gingar', 'direito'].includes(word))).toBe(false);
  });
  it("never invents filler words to reach five and compacts old reports without changing saved data", () => {
    const s = session();
    expect(focusWords(s, new Map([['sim', 10], ['ginga', 1]]), new Set())).toEqual(['ginga']);
    const counts = sessionVocabulary(s);
    const saved = feedbackSchema.parse({ summary: "Practice", vocabulary: [...counts].map(([word]) => ({ word, translation: `Meaning of ${word}` })) });
    const compact = compactFeedback(saved, s);
    expect(compact.vocabulary.length).toBeLessThanOrEqual(5);
    expect(saved.vocabulary.length).toBeGreaterThan(5);
    expect(compact.vocabulary.every(word => counts.has(word.word) && word.translation === `Meaning of ${word.word}`)).toBe(true);
  });
});
