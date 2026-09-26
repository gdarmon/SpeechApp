import { practiceLevel } from "./learning.js";
import type { Reply } from "./models.js";

const frameWords = new Set("a o as os um uma uns umas e ou de do da dos das em no na nos nas ao aos à às por para com sem que qual quais como onde quando quem porque eu você vocês ele ela eles elas nós me se meu minha seu sua seus suas sim não oi olá bom boa bem tudo muito mais menos esse essa isso isto aqui ali então é são foi ser estar está estou tá também favor obrigado obrigada até tchau legal claro ótimo ok quero quer querer tenho tem ter vou vai ir posso pode poderia gostaria prefiro gosto sou fomos fui estava era já ainda vez novo novamente tomar beber comer pedir repetir ouvir fazer aprender treinar praticar jogar estudar comprar".split(" "));
export function openingFocus(opening: Pick<Reply, "suggested_replies"> | undefined, budget: number) {
  const ideas = (opening?.suggested_replies ?? []).map(idea =>
    (idea.text.toLocaleLowerCase("pt-BR").match(/[\p{L}]+/gu) ?? []).filter(word => word.length > 2 && !frameWords.has(word)));
  // Take an anchor from each idea before secondary details from either one.
  const words = Array.from({ length: Math.max(0, ...ideas.map(words => words.length)) }, (_, index) =>
    ideas.flatMap(words => words[index] ? [words[index]] : [])).flat();
  return [...new Set(words)].slice(0, budget);
}

// Product teaching budgets, not CEFR scores. A session practises a small set of
// chunks repeatedly; advancing the turn does not mean introducing a new topic.
const sequences = [
  [0, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  [0, 0, 1, 0, 2, 1, 0, 2, 1, 0],
];
const stages = ["model", "guided", "model", "retrieve", "guided", "retrieve", "apply", "retrieve", "apply", "recall"];
const tasks = [
  "Establish one concrete need in this situation. Model the core answer pattern in the ideas; do not quiz an unexplained term.",
  "Respond to the learner's actual answer in the same situation. Reuse a familiar answer pattern when it fits; do not assume a yes after a no.",
  "If it fits the conversation, introduce the next focus term using a familiar pattern and a meaningful translation. Otherwise continue the learner's point.",
  "Invite reuse of familiar language in a relevant follow-up. Do not ask an already-answered personal question or ignore the learner just to retrieve a term.",
  "Practise the current focus in the same situation. Change only one detail; retain the core answer pattern.",
  "Retrieve an earlier term and pattern. Build on what the learner actually said, without adding another teaching target.",
  "Use the focus in a related exchange within the SAME situation. Keep the roles stable and supply a familiar model if needed.",
  "Reuse familiar language after a gap, adapting the question to what the learner has already told you. Avoid both repetitive loops and unnecessary new vocabulary.",
  "Reuse the learned words in one small application. No new target words or unrelated personal questions.",
  "Invite one final answer using a learned pattern. Keep ideas available as optional help; do not demand a summary of the whole lesson.",
];
const languageWork = [
  "One concrete phrase, present tense, one clause. Reuse familiar answer frames, adapting them to the current question (e.g. Quero ... for a choice, Sim / Não for a confirmation). Accept one-word answers when they answer the question. No subordinate clauses, explanations, or hypothetical situations.",
  "One short sentence with ONE useful detail. Reuse TWO answer frames, then vary one slot. Familiar present tense or vou + infinitive; do not demand a reason and another detail together.",
  "Link two short thoughts with one familiar connector (e.g. porque or depois). Reuse TWO or THREE answer frames. Practise a short reason OR sequence, one at a time.",
  "Explain one event or resolve one misunderstanding. Reuse THREE frames for a past event, clarification and its reason. Ask one focused follow-up; never combine two independent requests.",
  "Develop and adapt one plan. Reuse THREE frames for a choice, a reason and an alternative. Introduce at most one related complication; a concise relevant answer remains valid.",
];

export function teachingPlan(levelValue: unknown, question = 0, opening?: Pick<Reply, "suggested_replies">) {
  const level = practiceLevel(levelValue).level;
  const targetTerms = level <= 2 ? 2 : 3;
  const sequence = sequences[level <= 2 ? 0 : 1];
  const index = Math.max(0, Math.min(10, Math.trunc(question) || 0));
  return {
    revision: "responsive-practice-v3",
    target_terms: targetTerms,
    focus_words: openingFocus(opening, targetTerms),
    language_work: languageWork[level - 1],
    phase: stages[index] ?? "close",
    task: tasks[index] ?? "Close briefly with no new question or vocabulary.",
    focus_index: sequence[index] ?? 0,
    introduced_terms: Math.max(...sequence.slice(0, Math.min(index + 1, 10))) + 1,
    allow_repetition: [3, 5, 7, 8, 9].includes(index),
    // Open questions are a useful tool, not a demand that forces topic drift.
    format: "flexible",
  };
}

// Opening examples demonstrate a real use of the lesson vocabulary. They are
// seeds, not a ten-turn script: continuations must respond to the learner.
export function lessonOpeningModel(lessonId: string, term: string, meaning: string, language: string, levelValue: unknown) {
  if (practiceLevel(levelValue).level > 2) return undefined;
  const he = language === "he-IL";
  const gloss = meaning.split(/;| — | \(/)[0];
  const englishObject = `${/^[aeiou]/i.test(gloss) ? "an" : "a"} ${gloss}`;
  type Line = [string, string, string];
  let question: Line;
  let answers: [Line, Line];
  if (term.startsWith("corda ")) {
    question = ["Qual é a sua corda?", "איזו חגורה יש לך?", "Which cord do you have?"];
    answers = [[`Tenho ${term}.`, `יש לי ${gloss}.`, `I have ${englishObject}.`],
      ["Ainda não tenho corda.", "עדיין אין לי חגורה.", "I don't have a cord yet."]];
  } else if (["instruments-v1", "ensemble-v1"].includes(lessonId) && term !== "bateria") {
    question = [`Você toca ${term}?`, `אתה מנגן ב${gloss}?`, `Do you play the ${term}?`];
    answers = [[`Toco ${term}.`, `אני מנגן ב${gloss}.`, `I play the ${term}.`],
      ["Ainda não toco.", "אני עדיין לא מנגן.", "I don't play yet."]];
  } else if (["kicks-v1", "evasions-v1", "sweeps-v1", "direct-kicks-v1", "floor-v1", "spinning-v1",
    "demonstration-v1", "cartwheel-shapes-v1", "cartwheel-variations-v1"].includes(lessonId)) {
    question = [`Você treina ${term}?`, `אתה מתרגל ${gloss}?`, `Do you practise ${term}?`];
    answers = [[`Treino ${term}.`, `אני מתרגל ${gloss}.`, `I practise ${term}.`],
      ["Ainda não treino esse movimento.", "אני עדיין לא מתרגל את התנועה הזאת.", "I don't practise that movement yet."]];
  } else if (lessonId === "berimbau-parts-v1") {
    question = [`Você tem ${term}?`, `יש לך ${gloss}?`, `Do you have ${englishObject}?`];
    answers = [[`Tenho ${term}.`, `יש לי ${gloss}.`, `I have ${englishObject}.`],
      ["Ainda não tenho.", "עדיין אין לי.", "I don't have one yet."]];
  } else if (["roda-rhythms-v1", "traditional-toques-v1"].includes(lessonId)) {
    question = [`Você conhece ${term}?`, `אתה מכיר את המקצב ${term}?`, `Do you know the ${term} rhythm?`];
    answers = [["Conheço esse ritmo.", "אני מכיר את המקצב הזה.", "I know that rhythm."],
      ["Ainda não conheço.", "אני עדיין לא מכיר.", "I don't know it yet."]];
  } else {
    // Let the scenario guide uncommon terms rather than forcing nouns, verbs,
    // song lines and events into one universal, often ungrammatical template.
    return undefined;
  }
  return { text: question[0], translation: question[he ? 1 : 2],
    suggested_replies: answers.map(answer => ({ text: answer[0], translation: answer[he ? 1 : 2] })) };
}
