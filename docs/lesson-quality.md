# Meaningful capoeira conversations — 0.14.2

## Report and cause

The owner reported a 0.14.1 Android question, `Quer ouvir corda verde e roxa?`, translated into Hebrew with the Portuguese description left in quotes. The ideas were `Sim, quero ouvir.` and `Não, prefiro outro.`. A cord is an object with literal colors, not an idiom or audio selection; `e` means **and**, so this describes one green-and-purple cord. The [ABADÁ Portugal graduation reference](https://www.abadaportugal.org/site/abada/graduacao/) lists that combined cord. In Hebrew the practical meaning is **חגורה ירוקה וסגולה**.

This was a code-level regression, not just an unfortunate generated sentence. The previous reviewed models supplied variations of asking to hear/repeat a name for all ten turns, across unrelated topics and levels. A validator required the scheduled exact term in every question or suggestion. Together they encouraged mechanical name drills and reduced the model's freedom to respond meaningfully. Passing length/schema tests did not establish teaching quality.

The screenshot also showed the native progress counter in the wrong visual direction under Hebrew layout. Its text now explicitly uses LTR direction.

## Current behavior

- Beginner opening examples fit the situation: possession of a cord, playing an instrument, practising a movement, or familiarity with a rhythm. These are optional opening examples, not continuation scripts.
- Later questions must respond to the learner's answer. No cord, no instrument experience, unfamiliarity and clarification requests take precedence over the scheduled focus. A relevant pronoun or practice follow-up can omit the catalog name.
- Cord descriptions receive literal color translations. Known Hebrew glosses use חגורה with matching feminine color forms. Genuine movement names and rhythm names retain their identity.
- Positive feedback acknowledges what the learner communicated; it should not repeatedly praise use of a formula such as “the Não structure.”
- Validation rejects the reported cord-as-audio/name-drill pattern and a missing cord meaning in the question or ideas. Explicit help, repetition and language questions retain exceptions. These are narrow guards, not a general semantic classifier.
- Ten answers, bounded vocabulary, one question, optional editable suggestions, saved difficulty, request idempotency, learner isolation and the five-item review cap remain in force. There is no automatic promotion or promise of fast mastery.

The server changes apply to newly generated replies on existing clients. Saved messages are not rewritten; a fresh conversation avoids carrying the previous bad script as context. The counter fix needs the new Android binary. No database migration is required.

## Review examples

These are designed acceptance examples, **not a transcript from the live provider**.

| Situation | Meaningful exchange | Reject or investigate |
|---|---|---|
| Cord description | `Qual é a sua corda?` with an editable cord answer and `Ainda não tenho corda.` | Hearing/ordering a cord; leaving its colors untranslated |
| Learner has no cord | `Ainda não tenho corda.` → `Você treina há muito tempo?` | Assigning a rank or asking its color as though the learner has one |
| No instrument experience | `Ainda não toco berimbau.` → `Quer aprender a tocar?` | Asking how often they play as though they answered yes |
| Familiar movement | `Você treina martelo?` with short, directly matching ideas | Asking for physical performance, an unseen demonstration or an unstated sequence |
| Real repetition request | `Pode repetir?` → repeat/simplify the pending question | Treating the request as proof of independent understanding |
| Intermediate learner | A relevant reason, clarification or alternative about their actual experience | Filling the answer with extra words just to satisfy a minimum |

Human review must check the full exchange, including both ideas and Hebrew/English meaning. Look for contradictions across turns, repeated personal questions, imagined facts, misleading praise, unrelated targets and confusing literal translations. Short questions are not necessarily good questions.

## Automated and optional live checks

`tests/pedagogy.test.ts` covers the screenshot regression, accepted responsive follow-ups, actual repetition requests, untranslated cord descriptions, and bounded plans/opening examples across all themes and levels. The other provider, API, browser and native suites protect existing contracts. Mocked acceptance examples do not prove that the live model consistently generates them.

For an authorized live synthetic review, use `scripts/evaluate-lessons.ts`. It calls the configured AI provider directly, accesses no database or learner account and uses invented answers only. It exercises a full beginner cord conversation, an instrument refusal and an intermediate English-supported cord conversation. Later answers alternate generated ideas and are explicitly marked assisted. It stops on a provider failure and saves partial results rather than silently substituting another provider.

1. Use Node/npm from the handoff and install dependencies.
2. Configure the intended provider and its own authorized key in the process environment. For Groq this means `FALA_AI_PROVIDER=groq`, `GROQ_API_KEY`, and the intended `FALA_GROQ_MODEL`; see `.env.example`. Inspect the intended routing first. Do not copy masked Netlify values, borrow credentials from another project or switch providers to make the check pass.
3. Bundle and opt in explicitly:

```bash
npx --no-install esbuild scripts/evaluate-lessons.ts --bundle --platform=node \
  --format=esm --packages=external --outfile=artifacts/evaluate-lessons.mjs
FALA_RUN_LESSON_EVAL=true node artifacts/evaluate-lessons.mjs
```

4. Read every exchange in ignored `artifacts/lesson-evaluation.json`, including translations and feedback. Record provider/model, date, completion/partial state and semantic findings in the release receipt. Quota and generation failures are failures to finish, not a passing conversation. Provider timings are not phone end-to-end latency.

The 26 September 2026 local live attempt stopped before generation: the existing Netlify connection exposed the production route as Groq but returned its credential masked. No live teaching-quality or production-latency result is claimed for that attempt. A physical-device visual/audio check and a live multi-turn content sample remain outstanding.
