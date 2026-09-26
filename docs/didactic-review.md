# Fala didactic review — 0.13.6

This historical review covers five Portuguese levels, 28 capoeira topics, ten-turn practice, reply ideas, translation, feedback, summaries and progression. It is a design and implementation review; no user study established improved retention or alignment with a CEFR level. For current progression behavior, see [learning progression](learning-progression.md). The name-repetition models and exact-term requirement described below were found to cause poor conversations and were removed in 0.14.2; see [the correction and evaluation limits](lesson-quality.md). Do not restore those historical examples as current teaching guidance.

## Findings and changes

| Finding | Effect on the learner | Change in 0.13.6 |
|---|---|---|
| Level 1 allowed eight words in the opening but sixteen later | Difficulty increased within the same lesson | At most seven words in each question, reply idea, help phrase and corrected phrase |
| The fourth-turn instruction combined a new term with a question about a partner | The topic shifted away from the learning goal | Retrieve the first term after a short gap |
| Repeated questions were discouraged and many open questions required | Variety displaced practice; beginners had to invent content | Intentional repetition at defined stages; allow yes/no and choice questions |
| All levels introduced three or four terms | Language ability became entangled with capoeira expertise | Two target terms at level 1, up to three at level 2 and four later; introduce one at a time |
| Questions could grow to 65 words | The question became a memory test | Question limits of 7 / 12 / 18 / 24 / 32 words by level |
| Question-mark counting was the main single-focus check | Two requests could hide behind one question mark | Explicit single-focus instructions and combined-question checks |
| Literal translation of Quando | A time clause became another question | Preserve meaning, speaker roles and question count; distinguish a time clause from a separate question |
| Summaries preferred new words even when peripheral | Review drifted away from practiced material | Prefer lesson terms actually spoken; at most five items |
| Advancement required six different, relatively long answers | Successful reuse of a pattern counted for less | Six independent successes with at least three formulations at level 1 and four at level 2; one word may be valid without being enough advancement evidence |

The reported sentence, “Quando usamos a negativa na aula, quem costuma ser seu parceiro?”, is not necessarily two grammatical Portuguese questions: its opening can be a time clause. However, it is long, requires processing two ideas and shifts attention to a partner. The Hebrew translation also introduced a meaning error. Correcting only the translation would have been insufficient.

## Level progression reviewed at that time

Limits are product decisions, not official CEFR boundaries. A good short answer remains valid at every level; do not add words merely to satisfy a quota.

| Level | Communicative goal | Question words | Target terms | Modeled answer |
|---|---|---:|---:|---|
| 1 — First phrases | Request something, identify a need or repeat a name | 7 | 2 | A short phrase; two recurring patterns such as Quero… / Pode repetir? |
| 2 — Full sentences | Communicate one point with one detail | 12 | Up to 3 | One sentence; change one component at a time |
| 3 — Connected answers | Explain a reason or short sequence | 18 | Up to 4 | Two ideas with a familiar connector such as porque or depois |
| 4 — Explain and clarify | Explain an event or resolve one misunderstanding | 24 | Up to 4 | Two or three sentences on one point |
| 5 — Flexible conversations | Justify a choice and adapt to one change | 32 | Up to 4 | A concise explanation, reason or alternative |

Level 1 excludes definition questions, conditional sentences, why questions and assumptions about unintroduced movement sequences. Long technical names remain intact and move into an idea when they cannot fit in a short question. Word limits apply to Portuguese; a support-language explanation can supply meaning without another long Portuguese sentence.

Level 1 refers only to Portuguese. An experienced capoeira practitioner can be a Portuguese beginner. Knowing a movement name does not establish age, physical ability, cord rank or language level.

## Ten-turn structure

1. **Model:** one need supported by a short pattern.
2. **Guided use:** the same term and pattern; confirmation is allowed.
3. **Small expansion:** another term within the familiar pattern.
4. **Retrieval:** revisit the first term after the second.
5. **Practice:** change one detail. Level 1 still has only two target terms.
6. **Retrieval:** use previously introduced material again.
7. **Application:** related exchanges in the same situation without changing roles.
8. **Review after a gap:** reuse a familiar question.
9. **Further use:** no new target word.
10. **Brief concluding answer:** use a familiar pattern without summarizing the entire lesson.

After answer ten, close without a new question. Help does not consume a practice turn. A clarification or real learner request takes precedence over the plan. Ideas remain available by choice, including at the end; help is not forcibly hidden.

For example, with negativa and rolê, ask **Qual nome quer repetir?** — “Which name would you like to repeat?” — and suggest **Quero negativa.** or **Pode repetir?**. Revisit these words later. Do not add an unrelated partner question or ask about an unintroduced movement. These are models for requesting a name, not instructions for performing a movement.

## Enforcement and content evaluation

- Code limits length, question marks, Hebrew in Portuguese fields, some combined-question patterns and complex beginner openings.
- Ordinary capoeira turns include the focus term in the question or an idea and block deferred terms. Help or learner questions about another term are intentional exceptions.
- Failed validation uses the existing single repair attempt within its deadline. Do not truncate sentences or names, or show invalid responses after attempts are exhausted.
- Questions receive reviewed models with matching replies and translations to reduce implausible questions about unintroduced variants or sequences.
- Everyday conversations use the same stages and preserve opening anchor words. Anchor selection is a linguistic heuristic, not a curated catalog; additional content needs evaluation.
- At levels 3–5, modeling and retrieval require an idea demonstrating connected output. Example-length checks apply to system examples, not learner answers. Short confirmations remain valid during guided stages.
- Word counts cannot guarantee meaning, naturalness, reply alignment or feedback quality. Reading generated conversations exposed implausible questions and led to the reviewed models.
- Progress uses transcripts, answer source and recorded help. It is a practice indicator, not certification. Text cannot establish pronunciation; copying, typing and assistance do not establish independent speaking.

## Further measurement

Check whether beginners can use two patterns without reading an idea at lesson end and the next day. Within-session repetition does not replace practice across days. The 28-topic order and revisit mechanism were unchanged in 0.13.6; this review does not claim an optimal personalized review schedule.

Server changes reach installed clients on new requests. Saved messages are not rewritten. Lesson IDs, preferences and existing progress are retained.

## Sources and design judgment

The [Council of Europe CEFR descriptors](https://www.coe.int/en/web/common-european-framework-reference-languages/cefr-descriptors-search) describe concrete needs, basic phrases, simple sentences and clear repeated speech at early levels. They inform the design, not exact word counts or automatic CEFR mapping.

The [IES guide to organizing instruction and study](https://ies.ed.gov/ncee/wwc/PracticeGuide/1) recommends review over time, examples alongside practice and retrieval opportunities. This is general learning evidence, not a Fala-specific Portuguese study. Two terms, two patterns and ten turns are product choices to evaluate with learners.

## Implementation checks at the time

Reviewed models across five levels and 28 topics were checked, including long names, revisits, translation and bounded summaries. A live provider sample covered a complete level 1 conversation, openings and continuations at levels 2–5, everyday conversation and four topics with complex names. Findings prompted fixes. A further live check of expanded level 4–5 examples hit provider rate limits, so the sample is not comprehensive approval of every conversation. Models and enforcement passed automated tests.
