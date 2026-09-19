import type { Reply, Session } from "./models.js";

export const vocabularyTokens = (text: string) => text.normalize("NFC").toLowerCase().match(/[a-zà-öø-ÿ]+/g) ?? [];

// Count actual Portuguese exposure, not translations, help-language requests, or invented examples.
export function sessionVocabulary(session: Session): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (text: string) => {
    for (const word of vocabularyTokens(text)) counts.set(word, (counts.get(word) ?? 0) + 1);
  };
  const partner = (reply: Reply) => {
    add(reply.text);
    const natural = reply.turn_feedback?.kind === "correction" ? reply.turn_feedback.natural : "";
    if (natural && !(` ${vocabularyTokens(reply.text).join(" ")} `).includes(` ${vocabularyTokens(natural).join(" ")} `)) add(natural);
    for (const idea of reply.suggested_replies ?? []) add(idea.text);
  };
  partner(session.opening);
  for (const turn of session.turns) {
    if (!turn.help) add(turn.text);
    partner(turn.reply);
  }
  return new Map([...counts].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")));
}
