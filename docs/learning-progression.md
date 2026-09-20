# Practice levels and focused reviews

Fala 0.6.0 uses five **practice difficulty levels**, separate from the older provisional assessment. The aim is to make the next speaking task clear while avoiding an invented formal language grade or a calendar-based promise.

| Level | Speaking target | Capoeira example task |
|---|---|---|
| 1 · First phrases | A short phrase in your own words | Identify a direction or repeat the meaning of one instruction |
| 2 · Full sentences | A full sentence with one detail | Say what you will do and on which side |
| 3 · Connected answers | Two connected sentences | Explain a two-step instruction |
| 4 · Explain and clarify | About three sentences | Explain what was misunderstood and ask for clarification |
| 5 · Flexible conversations | Three or more connected sentences | Explain a choice and adapt when the instructor changes a sequence |

The focus on practical tasks and connected speech is informed by the [Council of Europe's descriptions](https://www.coe.int/en/web/common-European-framework-reference-languages/table-1-cefr-3.3-common-reference-levels-global-scale). These five app levels are our design, **not** a mapping to A1–C2 or a validated placement test. Ten minutes daily is a useful routine to aim for, not a guarantee of reaching any particular skill after a year. Actual class listening also differs from clear phone playback.

The learner can choose any level, or use the recommendation. A level is fixed in the session request when it begins; retries and resumed sessions retain it even if the recommendation changes. The phone remembers the selected topic and listen-first preference. A manually chosen level remains an override during that signed-in app session; it does not itself change the recommendation.

## How the recommendation changes

A qualifying session has at least ten Portuguese answers and six distinct answers that:

- Were submitted as speech, without assistance. Answers matching a previously offered idea are excluded unless the current app explicitly recorded that ideas stayed hidden; an ordinary correct answer may coincide with an unseen suggestion. Copies of a help phrase remain guided.
- Received `ok` feedback for the current answer.
- Meet a modest answer-length threshold: 3, 5, 10, 16 or 24 words at levels 1–5 respectively.

Word count is a coarse signal for connected output; speech recognition punctuation cannot establish sentence count. The app does not measure pronunciation from transcripts. Repeating the same answer cannot fill the six-answer requirement. Typed answers, visible answer ideas, English/Hebrew help, corrections, clarification requests, incomplete sessions and demos do not manufacture advancement evidence.

Two qualifying retained sessions at a level support a recommendation one level higher, capped at 5. Demonstrating a harder chosen level can support a higher recommendation directly; choosing it without qualifying does not. This is a conservative practice heuristic, not proof of mastery. Deleting a session removes its evidence, so the recommendation can decrease; deleting all practice returns it to level 1. All aggregation and context are scoped to the signed-in learner.

The `resolved_level` in session request JSON is server-owned. `practice_result` in feedback JSON contains the recorded evidence; no migration is required. A client cannot submit either field to claim advancement. The client can submit a bounded `practice_level` from 1 through 5 to choose a challenge.

## Help and listening

At first, translated suggestions stay available as before. **Try without answer ideas** hides them for subsequent questions. Revealing an idea keeps the current answer marked as assisted, even if it is hidden again. Reopening an active session conservatively marks the pending answer as assisted because earlier hint exposure cannot be reconstructed locally. **Listen first** hides question text and answer ideas until requested. Revealing the question is separate from revealing an answer; no claim of audio-only comprehension is made in the progress calculation.

Capoeira mode now rotates through [19 ABADÁ lesson themes](abada-curriculum.md), including movement names, instruments, adult cord colors, class exercises and clarification. The learner answers verbally; Fala does not observe or assess movements. The linked curriculum documents sources and terminology differences. Prompts are original, and Fala does not teach physical technique or assign a capoeira cord/rank.

## Four or five useful words

The server selects at most five actual dialogue words or expressions, favoring relevance, novelty in retained history, corrections/help phrases and repetition. Frequent function words are omitted; a small set of common inflections share a review slot. Known multiword capoeira names stay together. The model translates only the selected words; catalog terms in curriculum sessions use curated English/Hebrew meanings. If fewer than four useful words occurred, Fala shows fewer rather than inventing fillers.

Counts and prior exposure use Portuguese partner text, spoken correction text and learner answers. Unused generated suggestions are excluded because they may be hidden; a used suggestion is counted as the learner's answer. A repeated word means prior exposure, not mastery. Older reports are compacted when returned to the app without deleting their stored translations or transcripts.
