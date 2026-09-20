# ABADÁ conversation curriculum

The existing **Capoeira class** choice now uses an ABADÁ-focused curriculum on the server. Current Android clients receive it on their next new conversation; the installed app version remains 0.6.0. Existing conversations retain their saved topic and difficulty. No database migration or new Android bundle is needed.

## Coverage and sources

There are 19 interleaved lesson themes: kicks, instruments, first cord colors, evasions, class exercises, sweeps, berimbau parts, direct kicks, orange/blue cords, floor movements, game instructions, spinning movements, green/purple cords, demonstrations, roda language, clapping/singing, teacher cords, ceremonies and the berimbau ensemble. Each lesson supplies only three or four focus terms, with original English and Hebrew meaning notes. The learner's supplied movement lists are included, except **Meia-lua solta**, which they explicitly removed.

The references were checked on 20 September 2026:

- [ABADÁ Portugal: graduação](https://www.abadaportugal.org/site/abada/graduacao/) supplies the adult cord sequence and title groupings. Beginner *crua* means undyed, not the highest white cord. Mixed colors are retained. The adult order must not be applied to children's or senior systems. No Fala speaking level grants a capoeira rank.
- [ABADÁ San Francisco: batizado and graduation](https://www.abada.org/batizado-graduation/) describes the ceremony and explains that cord systems differ across populations. Lessons do not promise graduation dates or assume the learner's current cord.
- [ABADÁ Cantabria: instrumentos](https://abadacantabria.wordpress.com/instrumentos/) supports instrument names and berimbau components; [ABADÁ Berlin: music](https://www.abada-berlin.de/en/game-music/music/) supports the three berimbau registers. We teach musical vocabulary without asserting one universal ensemble arrangement or generating song lyrics.
- [AKBAN's capoeira recordings](https://www.akban.org/wiki/Portal:Capoeira) credit Calunga, Magoo and Gato of ABADÁ Israel and provide movement-name references. Its unrelated generic cord chart and historical assertions are not used for ABADÁ graduation or history.

User-supplied literal meanings are distinguished from practical capoeira meanings. *Macaco* is reviewed as an acrobatic transition, not simply a monkey; *queda de rins* remains a complete movement name. *Atravessa* can be an instruction to cross, rather than a universally named technique. *Rabo de arraia*, *chapéu de couro* and other variants are not given universal technical definitions. The catalog normalizes common spelling variants, including *benção/bênção*, *vôo/voo* and *queda de rim/rins*. Notes are concise language glosses, not physical execution instructions or an official ABADÁ syllabus.

## Rotation and conversation

At a new capoeira session, the server chooses the first curriculum theme absent from this learner's retained, non-demo session history. When all themes have been visited, it chooses the least recently started theme. Abandoned sessions count as visits so restarting does not trap the learner in the same lesson; failed starts and retries do not consume a new visit. Deleting history removes its rotation evidence.

The server saves `resolved_lesson: {id, visit}` beside `resolved_level` in existing request JSON. Clients cannot submit either server-owned field. Topic labels are supplied by the server, preventing a model's generic topic label from breaking rotation. The catalog uses versioned lesson IDs; later incompatible content changes should get new IDs. Retries and resumed sessions keep their selected theme. Legacy sessions without a lesson still work.

Each of the ten questions has a communicative purpose, such as requesting, clarifying, telling a partner or recapping. Open questions are checked to prevent them becoming repeated yes/no or A-or-B choices; two confirmation turns and one choice turn are allowed. A revisit rotates the opening vocabulary and style. Only the current lesson and current task are sent, plus the existing short dialogue context; this does not send the whole catalog on every turn. Five recent openings help avoid repeated introductions. Exact repeats are rejected within the provider's existing single regeneration budget, except requested repetition, clarification, help and closing. Semantic variety remains an AI quality goal, not a guarantee that every sentence is novel.

The conversation must remain responsive to the learner. Capoeira knowledge never overrides Portuguese difficulty. Advanced movement names can appear in a simple sentence at level 1 without requiring the learner to perform them. Voice recognition and playback are unchanged.

## Focused review and privacy

Reviews remain capped at five useful items from actual dialogue. Longest-match vocabulary extraction preserves names such as *meia-lua de compasso*, *volta ao mundo* and *s-dobrado*, including punctuation/accent variants. Two-letter *aú* is a valid review item. Unused answer ideas remain excluded.

The same bounded word/phrase candidates are checked against prior actual utterances for exposure; aliases are recognized without returning other sessions' text from the database. Curated English/Hebrew meanings are used for known catalog terms in curriculum sessions; other meanings remain contextual AI output. Prior exposure means encountered, not mastered. Old saved reports remain readable and are not rewritten.

Lesson history, opening history, exposure and deletion use the same per-user scoped database relations as other learner memory. No global counter or cross-user conversation data influences a learner's rotation.

## Names raised by the learner

The conversation also receives a small reference of known terms mentioned by the learner or in the latest partner sentence, even when they are outside the current lesson's four planned words. Full movement names take precedence over their component words. This works for continuing sessions as well as new ones; no client update or database migration is required.

`aú sem mão` means an aerial cartwheel without hand support; see [Lalaue's movement reference](https://www.lalaue.com/moves/au-sem-mao/) and [Grand Rapids Capoeira's curriculum](https://www.grcapoeira.com/curriculum). `aú sem mãos`, unaccented spellings and the learner's `au sem mau` spelling map to the complete name in capoeira context. The original transcript is retained. This does not change the meaning of `mau` elsewhere or assess pronunciation from spelling. These are language meanings, not an official ABADÁ syllabus or physical execution instructions.
