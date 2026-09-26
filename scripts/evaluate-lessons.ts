// Opt-in, synthetic conversation review against the configured provider. No DB,
// authentication session, microphone recording or learner history is accessed.
import { mkdir, writeFile } from 'node:fs/promises';
import { CompatibleProvider } from '../src/provider.js';
import { settingsFromEnv } from '../src/config.js';
import { lessonContext } from '../src/capoeira.js';
import { teachingPlan } from '../src/pedagogy.js';
import { practiceLevel } from '../src/learning.js';
import { Timing } from '../src/timing.js';
import type { Reply } from '../src/models.js';

if (process.env.FALA_RUN_LESSON_EVAL !== 'true') throw new Error('Set FALA_RUN_LESSON_EVAL=true to explicitly enable live synthetic requests.');
const settings = settingsFromEnv({ ...process.env, FALA_TOKEN: 'synthetic-evaluation-token-not-for-auth',
  DATABASE_URL: 'postgres://localhost/unused_evaluation_database' });
if (!settings.apiKey) throw new Error('Configure the intended AI provider through the existing authorized connection.');
const cases = [
  { id: 'graduated-cords-v1', visit: 2, level: 1, language: 'he-IL', first: 'Ainda não tenho corda.', rounds: 10 },
  { id: 'instruments-v1', visit: 1, level: 1, language: 'he-IL', first: 'Ainda não toco berimbau.', rounds: 3 },
  { id: 'graduated-cords-v1', visit: 2, level: 3, language: 'en-US', first: 'Tenho corda verde e roxa, mas ainda estou aprendendo português.', rounds: 3 },
];
const results: Record<string, unknown>[] = [];
for (const scenario of cases) {
  const turns: { text: string; help: boolean; source: string; assisted: boolean; reply: Reply }[] = [];
  let opening: Reply | undefined;
  const exchanges: Record<string, unknown>[] = [];
  const timing = new Timing();
  const provider = new CompatibleProvider(settings, timing);
  try {
    for (let round = 0; round <= scenario.rounds; round++) {
      const previous = turns.at(-1)?.reply ?? opening;
      const answer = round === 1 ? scenario.first : previous?.suggested_replies[(round % 2)].text;
      const input = round ? { text: answer, source: 'typed', assisted: round > 1, help: false, language: 'pt-BR' } : undefined;
      const reply = await provider.reply({ action: round ? 'continue' : 'start', topic: 'capoeira class', kind: 'conversation',
        practice: practiceLevel(scenario.level), support_language: scenario.language, practice_target: 10, practice_round: round,
        lesson: lessonContext({ id: scenario.id, visit: scenario.visit }, round, scenario.language, scenario.level),
        teaching: teachingPlan(scenario.level, round), opening, turns, turn_count: turns.length,
        last_turn: round === 10, input, weaknesses: [], recent_topics: [], recent_openings: [] });
      exchanges.push({ round, answer, reply });
      console.log(JSON.stringify({ scenario: `${scenario.id}/${scenario.level}/${scenario.language}`, round, answer,
        text: reply.text, translation: reply.translation, ideas: reply.suggested_replies, feedback: reply.turn_feedback }));
      if (round) turns.push({ text: answer!, help: false, source: 'typed', assisted: round > 1, reply });
      else opening = reply;
    }
    results.push({ ...scenario, status: 'completed', timing: timing.header(), exchanges });
  } catch (error) {
    results.push({ ...scenario, status: 'incomplete', error: error instanceof Error ? error.message : 'Provider failed', exchanges });
    process.exitCode = 1;
    break; // Do not burn more calls after a quota or provider failure.
  }
}
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/lesson-evaluation.json', JSON.stringify({ at: new Date().toISOString(), provider: new URL(settings.baseUrl).hostname,
  model: settings.model, results }, null, 2) + '\n');
console.log('Synthetic transcript saved to artifacts/lesson-evaluation.json; human content review is still required.');
