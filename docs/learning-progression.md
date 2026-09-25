# Practice levels and learning at your pace

Starting with 0.14.1, Fala keeps the learner at their chosen practice difficulty. It no longer moves the default level up after two qualifying conversations. A harder level is an optional challenge, supported by repeated independent practice over time. There is no expected number of sessions to master a level.

## Five manageable steps

| Level | Goal | Useful practice |
|---|---|---|
| 1 · First phrases | Familiar words and short phrases for one concrete need | Listen to a model, reuse a phrase, then recall it when comfortable |
| 2 · Simple sentences | One familiar sentence with one useful detail | Change one slot, such as a name, drink or direction |
| 3 · Connected ideas | Link two familiar ideas | Give a short reason or sequence using porque, depois or mas |
| 4 · Explain and clarify | Explain one point or request clarification | Say what was unclear and ask for one useful explanation |
| 5 · Flexible conversations | Adapt familiar language to a small change | Explain a choice or offer an alternative |

There is no sentence-count quota. A relevant short answer is valid at every level. Repetition, examples, typing, listening again and returning to an easier task are normal parts of learning. Beginners may need many sessions with the same patterns; intermediate learners also need consolidation before adding complexity. XP and capoeira knowledge do not establish Portuguese proficiency.

Each conversation retains its saved difficulty through resume and retry. New conversations default to the most recently practised non-demo level, including an explicit easier choice. The learner can choose any level. Starting a harder task does not certify mastery; it changes the practice difficulty. Deleting the most recent session can reveal the previous chosen level; deleting all practice returns to level 1. Old session transcripts and reports are retained as originally saved.

## What supports an optional challenge

A completed ten-answer session contributes evidence when at least six spoken answers received `ok` feedback, without recorded assistance or copied visible suggestions. At levels 1 and 2, those successes need at least three and four different formulations respectively; levels 3–5 need six. Reusing a useful pattern can count; repeating only one answer cannot establish readiness.

The evidence filter uses modest length floors of 2 / 4 / 6 / 8 / 10 words. These are internal heuristics, not instructions to learners or proof that a communication goal was achieved. They replace the previous 2 / 5 / 10 / 16 / 24 floors, which overemphasized longer answers. `ok` feedback comes from a language model and is imperfect. Text and timestamps cannot establish pronunciation, fluency, audio-only comprehension, confidence or unaided recall outside Fala.

The server examines up to 60 completed sessions at the current level, including sessions needing help, and ignores evidence older than 90 days. It offers the next level only when all safeguards hold:

| Safeguard | Levels 1–2 | Levels 3–4 |
|---|---|---|
| Different dates with qualifying practice | At least 4 | At least 5 |
| Span between earliest and latest qualifying practice | At least 7 full days | At least 14 full days |
| Different contexts | At least 2 | At least 3 |
| Recent consistency | Latest session qualifies, and at least 2 of the latest 3 qualify | Same |
| Recency | Latest completed practice within 14 days | Same |

Level 5 offers continued practice, never a sixth level. Dates are counted in UTC; the full elapsed-span safeguard prevents sessions around midnight from simulating a week of practice. Capoeira contexts use stable lesson IDs. Everyday contexts use normalized saved topic labels, an imperfect proxy for transfer to a different situation.

These numbers are conservative **product safeguards**, not validated educational thresholds, a lesson quota, a countdown or a promise of readiness after a week. The interface does not show an unlock bar. Many learners will need more practice. Even after these conditions hold, the learner decides whether to try the next level. A recent assisted/difficult session prompts supportive consolidation advice; it does not erase history or demote the learner.

`resolved_level`, `practice_result` and the recommendation are server-owned and scoped to the authenticated learner. The API returns the current `level`, nullable `next_level`, and translatable `guidance`. Legacy `ready_sessions`/`sessions_needed` fields remain for compatibility, but new screens do not use a promotion counter. No database migration or extra AI call is required. Old native versions still contain the old help text and need the new Android binary; server behavior changes reach existing clients on new requests.

## Teaching and support

A session focuses on two target terms at levels 1–2 and up to three at higher levels, introducing one at a time. Reviewed intermediate examples use short explanations without filler. Ten-turn plans alternate modeling, guided use, retrieval after intervening exchanges and small applications of a familiar focus. Help remains available. Coach and summary instructions normalize repeated practice, suggest one manageable next action and prohibit session/day/XP promises or requests to pad answers.

**Try without answer ideas** hides ideas for subsequent questions. Revealing an idea marks that answer as assisted even if it is hidden again. Resuming an active session conservatively marks pending assistance because earlier exposure cannot be reconstructed locally. **Listen first** hides question text and ideas until requested. Reading a question is separate from reading an answer; no audio-only comprehension score is inferred.

Capoeira uses the [28-theme curriculum](abada-curriculum.md). Topic rotation is unchanged in this revision and is not an adaptive spaced-repetition schedule. A future curriculum improvement can add learner-controlled revisits and retention checks; do not claim those features are already implemented.

## Focused review

End-of-session reviews retain at most five words or expressions actually used in the dialogue, favoring relevant lesson terms, corrections and help phrases. Common function words are omitted; related inflections share slots and multiword capoeira names remain intact. Fewer than five useful items are fine. Unused hidden suggestions are excluded. Prior exposure is not a mastery claim.

## Educational basis and evaluation limits

The [Council of Europe descriptors](https://www.coe.int/en/web/common-european-framework-reference-languages/cefr-descriptors-search) support concrete communicative goals and assisted early language use. Fala's five levels are not A1–C2 grades or a validated placement test.

The [IES practice guide](https://ies.ed.gov/ncee/wwc/PracticeGuide/1) supports learning spaced over time, examples alongside practice and retrieval opportunities. It does not specify Fala's thresholds or demonstrate this app's effectiveness. The separate [0.13.6 review](didactic-review.md) records earlier teaching changes.

Evaluate the new behavior with beginners and intermediate learners: can they recall familiar phrases on another day, use them in another situation, and comfortably choose their next task? Record whether suggestions feel premature. Automated checks validate the rules, isolation and UI behavior; they cannot establish educational effectiveness.
