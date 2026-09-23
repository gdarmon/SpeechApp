import { practiceLevel } from "./learning.js";

// Product teaching budgets, not CEFR scores. A session practises a small set of
// chunks repeatedly; advancing the turn does not mean introducing a new topic.
const sequences = [
  [0, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  [0, 0, 1, 0, 2, 1, 0, 2, 1, 0],
  [0, 0, 1, 0, 2, 1, 3, 0, 2, 1],
];
const stages = ["model", "guided", "model", "retrieve", "guided", "retrieve", "apply", "retrieve", "apply", "recall"];
const tasks = [
  "Establish one concrete need in this situation. Model the core answer pattern in the ideas; do not quiz an unexplained term.",
  "Follow the learner's answer with the SAME focus term and answer pattern. One simple confirmation is enough; no new topic.",
  "Introduce the next focus term using the SAME familiar answer pattern. Explain its meaning through the translation, not a technical quiz.",
  "Retrieve the first term after the intervening term. Reuse a familiar question and answer pattern; intentional repetition is useful.",
  "Practise the current focus in the same situation. Change only one detail; retain the core answer pattern.",
  "Retrieve an earlier term and pattern. Build on what the learner actually said, without adding another teaching target.",
  "Use the focus in a related exchange within the SAME situation. Keep the roles stable and supply a familiar model if needed.",
  "Return to an earlier term after a gap. A familiar question is welcome; do not invent vocabulary to sound different.",
  "Reuse the learned words in one small application. No new target words or unrelated personal questions.",
  "Invite one final answer using a learned pattern. Keep ideas available as optional help; do not demand a summary of the whole lesson.",
];
const languageWork = [
  "One concrete phrase, present tense, one clause. Reuse TWO answer frames (e.g. Quero ... / Pode repetir?). Accept one-word answers when they answer the question. No subordinate clauses, explanations, or hypothetical situations.",
  "One short sentence with ONE useful detail. Reuse TWO answer frames, then vary one slot. Familiar present tense or vou + infinitive; do not demand a reason and another detail together.",
  "Link two short thoughts with one familiar connector (e.g. porque or depois). Reuse TWO or THREE answer frames. Practise a short reason OR sequence, one at a time.",
  "Explain one event or resolve one misunderstanding. Reuse THREE frames for a past event, clarification and its reason. Ask one focused follow-up; never combine two independent requests.",
  "Develop and adapt one plan. Reuse THREE frames for a choice, a reason and an alternative. Introduce at most one related complication; a concise relevant answer remains valid.",
];

export function teachingPlan(levelValue: unknown, question = 0) {
  const level = practiceLevel(levelValue).level;
  const sequence = sequences[Math.min(level - 1, 2)];
  const index = Math.max(0, Math.min(10, Math.trunc(question) || 0));
  return {
    revision: "focused-practice-v1",
    target_terms: level === 1 ? 2 : level === 2 ? 3 : 4,
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

// A small, reviewed language model for each beginner turn. This is an example
// for the partner, not a replacement for responding to the learner's answer.
// Asking about the NAME avoids inventing variants or a class sequence the
// learner has never been given. Full capoeira names remain intact in an idea.
export function beginnerModel(term: string, meaning: string, question: number, language: string) {
  const models = [
    ["Qual nome quer ouvir?", "איזה שם תרצה לשמוע?", "Which name would you like to hear?"],
    ["Quer ouvir esse nome devagar?", "תרצה לשמוע את השם הזה לאט?", "Would you like to hear that name slowly?"],
    ["Qual nome quer ouvir agora?", "איזה שם תרצה לשמוע עכשיו?", "Which name would you like to hear now?"],
    ["Qual nome quer repetir?", "על איזה שם תרצה לחזור?", "Which name would you like to repeat?"],
    ["Quer repetir esse nome devagar?", "תרצה לחזור על השם הזה לאט?", "Would you like to repeat that name slowly?"],
    ["Qual nome quer ouvir novamente?", "איזה שם תרצה לשמוע שוב?", "Which name would you like to hear again?"],
    ["Qual nome vamos repetir?", "על איזה שם נחזור?", "Which name shall we repeat?"],
    ["Qual nome quer repetir?", "על איזה שם תרצה לחזור?", "Which name would you like to repeat?"],
    ["Quer ouvir esse nome novamente?", "תרצה לשמוע את השם הזה שוב?", "Would you like to hear that name again?"],
    ["Qual nome quer ouvir novamente?", "איזה שם תרצה לשמוע שוב?", "Which name would you like to hear again?"],
  ];
  const model = models[question];
  if (!model) return undefined;
  const he = language === "he-IL";
  return { text: model[0], translation: model[he ? 1 : 2],
    suggested_replies: [
      { text: `Quero ${term}.`, translation: he ? `אני רוצה את השם ״${term}״ (${meaning}).` : `I'd like “${term}” (${meaning}).` },
      { text: "Pode repetir?", translation: he ? "אפשר לחזור?" : "Could you repeat?" },
    ] };
}

export function lessonModel(term: string, meaning: string, question: number, language: string, levelValue: unknown) {
  const level = practiceLevel(levelValue).level;
  if (level === 1) return beginnerModel(term, meaning, question, language);
  if (question >= 10) return undefined;
  const he = language === "he-IL";
  const named = `“${term}”`;
  const models = [
    { text: `Como quer repetir ${named}?`, he: `איך תרצה לחזור על ${named}?`, en: `How would you like to repeat ${named}?`,
      answers: [
        [`Quero repetir ${named} devagar.`, `אני רוצה לחזור על ${named} לאט.`, `I'd like to repeat ${named} slowly.`],
        [`Pode repetir ${named} de novo?`, `אפשר לחזור על ${named} שוב?`, `Could you repeat ${named} again?`],
      ] },
    { text: `Por que quer repetir ${named}?`, he: `למה תרצה לחזור על ${named}?`, en: `Why would you like to repeat ${named}?`,
      answers: [
        [`Quero repetir ${named} porque ainda não lembro bem desse nome.`, `אני רוצה לחזור על ${named} כי אני עדיין לא זוכר היטב את השם הזה.`, `I'd like to repeat ${named} because I don't remember that name well yet.`],
        [`Quero ouvir ${named} de novo, porque quero lembrar.`, `אני רוצה לשמוע את ${named} שוב, כי אני רוצה לזכור.`, `I'd like to hear ${named} again because I want to remember.`],
      ] },
    { text: `Como pediria ajuda com ${named}?`, he: `איך היית מבקש עזרה עם ${named}?`, en: `How would you ask for help with ${named}?`,
      answers: [
        [`Não entendi ${named}. Pode explicar esse nome com palavras simples? Quero entender melhor para usar na conversa.`, `לא הבנתי את ${named}. אפשר להסביר את השם הזה במילים פשוטות? אני רוצה להבין טוב יותר כדי להשתמש בו בשיחה.`, `I didn't understand ${named}. Could you explain that name in simple words? I'd like to understand it better to use it in conversation.`],
        [`Não lembro de ${named}. Pode repetir esse nome mais devagar?`, `אני לא זוכר את ${named}. אפשר לחזור על השם הזה לאט יותר?`, `I don't remember ${named}. Could you repeat that name more slowly?`],
      ] },
    { text: `Como reformularia seu pedido sobre ${named}?`, he: `איך היית מנסח מחדש את הבקשה שלך לגבי ${named}?`, en: `How would you rephrase your request about ${named}?`,
      answers: [
        [`Eu explicaria que quero entender o nome ${named}. Pediria uma explicação curta, porque preciso usar esse nome numa conversa com meus colegas na próxima aula.`, `הייתי מסביר שאני רוצה להבין את השם ${named}. הייתי מבקש הסבר קצר, כי אני צריך להשתמש בשם הזה בשיחה עם חבריי בשיעור הבא.`, `I'd explain that I want to understand the name ${named}. I'd ask for a short explanation, because I need to use the name in a conversation with my classmates at the next class.`],
        [`Eu diria que preciso ouvir ${named} mais devagar. Se isso não ajudasse, pediria outra explicação para conseguir usar esse nome numa conversa.`, `הייתי אומר שאני צריך לשמוע את ${named} לאט יותר. אם זה לא היה עוזר, הייתי מבקש הסבר אחר כדי להשתמש בשם הזה בשיחה.`, `I'd say I need to hear ${named} more slowly. If that didn't help, I'd ask for another explanation so I could use the name in conversation.`],
      ] },
  ];
  let model = models[level - 2];
  if (question === 1 || question === 4) {
    model = { ...models[0], text: `Quer repetir ${named} devagar?`,
      he: `תרצה לחזור על ${named} לאט?`, en: `Would you like to repeat ${named} slowly?` };
  } else if (question === 6) {
    model = { ...models[0], text: `O que ajudaria você a repetir ${named}?`,
      he: `מה יעזור לך לחזור על ${named}?`, en: `What would help you repeat ${named}?` };
  }
  return { text: model.text, translation: model[he ? "he" : "en"],
    suggested_replies: model.answers.map(answer => ({ text: answer[0], translation: answer[he ? 1 : 2] })) };
}
