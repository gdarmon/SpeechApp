import type { Feedback, Reply, Session } from "./models.js";
import { CAPOEIRA_LESSONS, CAPOEIRA_TERMS, capoeiraTerm, isCapoeira, termKey } from "./capoeira.js";

export const vocabularyTokens = (text: string) => text.normalize("NFC").toLowerCase().match(/[a-zà-öø-ÿ]+/g) ?? [];
const phrases = CAPOEIRA_TERMS.flatMap(term => [term.word, ...term.aliases].map(alias => ({ word: term.word, parts: termKey(alias).split(" ") })))
  .sort((a,b) => b.parts.length - a.parts.length);
export const vocabularyForms = (word: string) => [...new Set([word, ...(capoeiraTerm(word)?.aliases ?? [])].map(termKey))];
export function vocabularyUnits(text: string, capoeira: boolean): string[] {
  const tokens = vocabularyTokens(text);
  if (!capoeira) return tokens;
  const keys = tokens.map(termKey), units: string[] = [];
  for (let index = 0; index < tokens.length;) {
    const phrase = phrases.find(entry => entry.parts.every((part, offset) => keys[index + offset] === part));
    units.push(phrase?.word ?? tokens[index]);
    index += phrase?.parts.length ?? 1;
  }
  return units;
}

// Retrieve complete names from this exchange, even outside the lesson's small
// teaching vocabulary. The learner's original transcript stays unchanged.
export function mentionedCapoeiraTerms(topic: string, texts: string[], language = "en-US") {
  if (!isCapoeira(topic)) return [];
  return [...new Set(texts.flatMap(text => vocabularyUnits(text, true)))]
    .map(capoeiraTerm).filter(term => term !== undefined).slice(0, 6)
    .map(term => ({ term: term.word, meaning: term.en, translation: language === "he-IL" ? term.he : term.en }));
}

const common = new Set("a o as os um uma uns umas e ou de do da dos das em no na nos nas ao aos à às por para com sem que qual quais como onde quando quem porque eu você vocês ele ela eles elas nós me se meu minha seu sua seus suas sim não oi olá bom boa bem tudo muito mais menos esse essa isso isto aqui ali então é são foi ser estar está estou tá também favor obrigado obrigada até tchau legal claro ótimo ok quero quer querer tenho tem ter vou vai ir".split(" "));
const classWords = new Set("ginga gingar esquiva esquivar roda mestre professor professora treino treinar aula direita direito esquerda esquerdo frente trás lado devagar rápido rápida repetir repita novo vez perna pernas braço braços mão mãos pé pés cabeça joelho atenção pare parar comece começar troque trocar parceiro parceira dupla sequência ritmo primeiro depois antes junto juntos".split(" "));
const families: Record<string, string> = { gingar: "ginga", esquivar: "esquiva", direita: "direção-direita", direito: "direção-direita", esquerda: "direção-esquerda", esquerdo: "direção-esquerda", rápido: "rápido", rápida: "rápido", repetir: "repetir", repita: "repetir", perna: "perna", pernas: "perna", braço: "braço", braços: "braço", mão: "mão", mãos: "mão", pé: "pé", pés: "pé", troque: "trocar", trocar: "trocar", treino: "treino", treinar: "treino" };

// Keep a small, useful review. Novelty means absent from retained Fala history,
// not unknown to the learner; function words never crowd out useful content.
export function focusWords(session: Session, counts: Map<string, number>, seen: Set<string>): string[] {
  const capoeira = isCapoeira((session.request?.topic ?? "") + " " + session.topic);
  const focus = new Set(session.turns.flatMap(turn => vocabularyUnits(
    turn.reply.turn_feedback?.kind === "correction" ? turn.reply.turn_feedback.natural : turn.help ? turn.reply.practice_phrase : "", capoeira)));
  const relevant = (word: string) => classWords.has(word) || !!capoeiraTerm(word);
  const lessonWords = new Set(CAPOEIRA_LESSONS.find(lesson => lesson.id === session.request?.resolved_lesson?.id)?.words ?? []);
  const score = (word: string, count: number) => (seen.has(word) ? 0 : 5) + (focus.has(word) ? 3 : 0)
    + (capoeira && relevant(word) ? 4 : 0) + (lessonWords.has(word) ? 3 : 0) + Math.min(3, Math.log2(count + 1));
  const ranked = [...counts].filter(([word]) => !common.has(word) && (word.length >= 3 || capoeira && relevant(word)))
    .sort((a,b) => score(b[0], b[1]) - score(a[0], a[1]) || a[0].localeCompare(b[0], "pt-BR"));
  const used = new Set<string>();
  return ranked.filter(([word]) => { const family = families[word] ?? word; if (used.has(family)) return false; used.add(family); return true; })
    .slice(0,5).map(([word]) => word);
}

export function compactFeedback(feedback: Feedback, session: Session): Feedback {
  if (feedback.vocabulary.length <= 5) return feedback;
  const counts = new Map(feedback.vocabulary.map(word => [word.word, word.occurrences ?? 1]));
  const seen = new Set(feedback.vocabulary.filter(word => word.seen_before).map(word => word.word));
  const selected = focusWords(session, counts, seen);
  return { ...feedback, vocabulary: selected.map(word => feedback.vocabulary.find(item => item.word === word)!) };
}

// Count actual Portuguese exposure, not translations, help-language requests, or invented examples.
export function sessionVocabulary(session: Session): Map<string, number> {
  const counts = new Map<string, number>();
  const capoeira = isCapoeira((session.request?.topic ?? "") + " " + session.topic);
  const add = (text: string) => {
    for (const word of vocabularyUnits(text, capoeira)) counts.set(word, (counts.get(word) ?? 0) + 1);
  };
  const partner = (reply: Reply) => {
    add(reply.text);
    const natural = reply.turn_feedback?.kind === "correction" ? reply.turn_feedback.natural : "";
    if (natural && !(` ${vocabularyTokens(reply.text).join(" ")} `).includes(` ${vocabularyTokens(natural).join(" ")} `)) add(natural);
    // Unused answer ideas may be hidden in listening/independent practice. A used
    // idea enters the counts through the learner's answer instead.
  };
  partner(session.opening);
  for (const turn of session.turns) {
    if (!turn.help) add(turn.text);
    partner(turn.reply);
  }
  return new Map([...counts].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")));
}
