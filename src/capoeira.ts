// Original bilingual learning notes. Sources and terminology caveats are recorded
// in docs/abada-curriculum.md; these are language prompts, not movement tutorials.
export type CapoeiraTerm = { word: string; en: string; he: string; aliases: string[] };
const term = (word: string, en: string, he: string, ...aliases: string[]): CapoeiraTerm => ({ word, en, he, aliases });
export const CAPOEIRA_TERMS: CapoeiraTerm[] = [
  term("martelo", "round kick (literally: hammer)", "בעיטה מעגלית (מילולית: פטיש)"),
  term("queixada", "outward crescent kick", "בעיטה מעגלית מבפנים החוצה"),
  term("armada", "spinning kick", "בעיטת סיבוב"),
  term("meia-lua de frente", "front crescent kick", "בעיטת חצי־ירח קדמית"),
  term("berimbau", "musical bow that leads the roda's rhythm and game", "בירימבאו — כלי קשת מוזיקלי שמוביל את המקצב והמשחק ברודה"),
  term("pandeiro", "Brazilian frame drum with jingles", "פנדיירו — תוף מסגרת עם מצילות"),
  term("atabaque", "tall hand drum", "אטבאקי — תוף ידיים גבוה"),
  term("agogô", "paired percussion bells", "אגוגו — כלי הקשה בעל זוג פעמונים"),
  term("corda crua", "natural, undyed beginner's cord", "חבל התחלתי בצבע טבעי, לא צבוע"),
  term("corda crua e amarela", "natural-and-yellow cord", "חבל בצבע טבעי וצהוב", "corda crua-amarela", "corda crua/amarela"),
  term("corda amarela", "yellow cord", "חבל צהוב"),
  term("corda amarela e laranja", "yellow-and-orange cord", "חבל צהוב וכתום", "corda amarela-laranja", "corda amarela/laranja"),
  term("esquiva diagonal", "diagonal evasion", "התחמקות אלכסונית"),
  term("cocorinha", "crouching evasion", "התחמקות בכריעה נמוכה"),
  term("negativa", "low defensive position", "תנוחת הגנה נמוכה"),
  term("rolê", "low turning transition", "מעבר נמוך בסיבוב"),
  term("aquecimento", "warm-up", "חימום"),
  term("alongamento", "stretching", "מתיחות"),
  term("repetição", "repetition", "חזרה"),
  term("dupla", "pair of practice partners", "זוג מתאמנים"),
  term("rasteira", "leg sweep", "גריפת רגל"),
  term("banda", "leg-assisted takedown", "הפלה בעזרת הרגל"),
  term("tesoura", "scissor takedown", "הפלת מספריים"),
  term("vingativa", "close-range takedown (literally: vengeful)", "הפלה מקרוב (מילולית: נקמנית)"),
  term("caxixi", "small woven shaker used with the berimbau", "קשישי — רעשן קלוע קטן המלווה את הבירימבאו"),
  term("baqueta", "stick used to strike the berimbau wire", "מקל לנגינה על מיתר הבירימבאו"),
  term("dobrão", "coin or metal disc used with the berimbau", "מטבע או דיסקית מתכת לנגינה בבירימבאו"),
  term("cabaça", "gourd resonator of the berimbau", "דלעת התהודה של הבירימבאו"),
  term("bênção", "front pushing kick (literally: blessing)", "בעיטת דחיפה קדמית (מילולית: ברכה)", "benção"),
  term("chapa", "pushing kick using the sole", "בעיטת דחיפה עם הסוליה"),
  term("ponteira", "straight front kick", "בעיטה קדמית ישרה"),
  term("pisão", "stamping or pushing kick", "בעיטת דריכה או דחיפה"),
  term("corda laranja", "orange cord", "חבל כתום"),
  term("corda laranja e azul", "orange-and-blue cord", "חבל כתום וכחול", "corda laranja-azul", "corda laranja/azul"),
  term("corda azul", "blue cord; start of ABADÁ's adult graduated-student group", "חבל כחול — תחילת קבוצת התלמידים הבוגרים המוסמכים באבאדה"),
  term("corda azul e verde", "blue-and-green cord", "חבל כחול וירוק", "corda azul-verde", "corda azul/verde"),
  term("aú", "cartwheel", "גלגלון"),
  term("aú sem mão", "aerial cartwheel without hand support", "גלגלון באוויר ללא תמיכת הידיים", "aú sem mãos", "au sem mau"),
  term("aú aberto", "open cartwheel with extended, spread legs", "גלגלון פתוח עם רגליים ישרות ופרושות"),
  term("aú fechado", "compact cartwheel with tucked legs", "גלגלון סגור עם רגליים מכונסות"),
  term("aú batido", "cartwheel variation with a kick", "גרסת גלגלון המשלבת בעיטה"),
  term("aú de cabeça", "head-supported cartwheel variation", "גרסת גלגלון בתמיכת הראש"),
  term("aú helicóptero", "helicopter cartwheel with circling leg movement; variations differ by school", "גלגלון מסוק עם תנועת רגליים מעגלית; הגרסה תלויה בבית הספר"),
  term("macaco", "backward acrobatic transition (literally: monkey)", "מעבר אקרובטי לאחור (מילולית: קוף)"),
  term("bananeira", "handstand (literally: banana tree)", "עמידת ידיים (מילולית: עץ בננה)"),
  term("queda de rins", "elbow-supported balance", "תנוחת שיווי משקל בתמיכה על המרפק", "queda de rim"),
  term("finta", "feint", "הטעיה"),
  term("troca", "change or switch; specify side or stance in context", "החלפה — של צד או בסיס, לפי ההקשר"),
  term("atravessa", "cross or go across; a contextual class instruction", "חצה או עבור לרוחב — הוראה לפי ההקשר"),
  term("meia-volta", "half turn", "חצי סיבוב"),
  term("meia-lua de compasso", "spinning crescent kick", "בעיטת חצי־ירח בסיבוב"),
  term("rabo de arraia", "stingray-tail kick; name and variation depend on the school", "בעיטת זנב־טריגון; השם והגרסה תלויים בבית הספר"),
  term("martelo rodado", "spinning martelo variation", "גרסת מרטלו בסיבוב"),
  term("corda verde", "green cord", "חבל ירוק"),
  term("corda verde e roxa", "green-and-purple cord", "חבל ירוק וסגול", "corda verde-roxa", "corda verde/roxa"),
  term("corda roxa", "purple cord; ABADÁ instructor group", "חבל סגול — קבוצת המדריכים באבאדה"),
  term("corda roxa e marrom", "purple-and-brown cord", "חבל סגול וחום", "corda roxa-marrom", "corda roxa/marrom"),
  term("s-dobrado", "S-shaped acrobatic transition", "מעבר אקרובטי בתבנית S"),
  term("chapéu de couro", "named capoeira movement (literally: leather hat); variations differ", "שם של תנועה בקפואירה (מילולית: כובע עור); קיימות גרסאות שונות"),
  term("arrastão", "pulling takedown", "הפלה במשיכה"),
  term("cabeçada", "head strike", "נגיחה"),
  term("ginga", "basic swaying capoeira footwork", "תנועת הבסיס המתנדנדת של הקפואירה"),
  term("volta ao mundo", "walk around the roda during the game", "הליכה סביב הרודה במהלך המשחק"),
  term("roda", "circle where capoeira is played", "מעגל הקפואירה"),
  term("voo do morcego", "flying double-foot kick (literally: flight of the bat)", "בעיטה מעופפת בשתי רגליים (מילולית: מעוף העטלף)", "vôo do morcego"),
  term("palmas", "rhythmic clapping", "מחיאות כפיים בקצב"),
  term("coro", "group sung response", "מענה בשירה של הקבוצה"),
  term("toque", "berimbau rhythm or rhythmic pattern in the roda", "טוקי — המקצב שמנגן הבירימבאו ברודה"),
  term("ritmo", "rhythm", "קצב"),
  term("corda marrom", "brown cord; ABADÁ professor group", "חבל חום — קבוצת המורים באבאדה"),
  term("corda marrom e vermelha", "brown-and-red cord", "חבל חום ואדום", "corda marrom-vermelha", "corda marrom/vermelha"),
  term("corda vermelha", "red cord; ABADÁ mestrando group", "חבל אדום — דרגת מסטרנדו באבאדה"),
  term("corda vermelha e branca", "red-and-white cord; ABADÁ mestre group", "חבל אדום ולבן — דרגת מסטרה באבאדה", "corda vermelha-branca", "corda vermelha/branca"),
  term("corda branca", "white cord; ABADÁ's highest graduation", "חבל לבן — הדרגה הגבוהה ביותר באבאדה"),
  term("batizado", "capoeira initiation ceremony", "טקס חניכה בקפואירה"),
  term("troca de cordas", "cord-changing graduation ceremony", "טקס החלפת חבלים ועליית דרגה"),
  term("apelido", "capoeira nickname", "כינוי בקפואירה"),
  term("gunga", "low-register berimbau", "בירימבאו בעל צליל נמוך"),
  term("médio", "middle-register berimbau", "בירימבאו בעל צליל בינוני"),
  term("viola", "high-register berimbau in this context", "בירימבאו בעל צליל גבוה בהקשר הזה"),
  term("bateria", "full ensemble of instruments accompanying the roda", "בטריה — כלל הרכב כלי הנגינה המלווה את הרודה"),
  term("são bento grande da regional", "Regional berimbau rhythm associated with fast, energetic play", "מקצב של קפואירה רגיונל המזוהה עם משחק מהיר ואנרגטי", "são bento grande de regional", "são bento grande regional", "são bento grande de bimba"),
  term("benguela", "measured capoeira rhythm and game with controlled, flowing movement", "בנגלה — מקצב ומשחק מדוד עם תנועה מבוקרת וזורמת"),
  term("iúna", "rhythm traditionally for experienced players, usually without singing; clapping customs vary", "יוּנָה — מקצב למשחק של מתקדמים, לרוב בלי שירה; מחיאות הכפיים תלויות במסורת"),
  term("são bento pequeno", "measured berimbau rhythm; its role and pace vary with the roda", "מקצב מדוד בבירימבאו; תפקידו ומהירותו משתנים לפי הרודה"),
  term("amazonas", "rhythm used for greetings in some schools and animal-inspired play in some ABADÁ teaching", "אמזונס — מקצב לברכות בחלק מהקבוצות, ובאבאדה גם למשחק בהשראת בעלי חיים"),
  term("santa maria", "traditional berimbau rhythm with uses that vary by school", "סנטה מריה — מקצב מסורתי בבירימבאו ששימושו משתנה בין קבוצות"),
  term("idalina", "Regional berimbau rhythm often played at a measured pace; uses vary by school", "אידלינה — מקצב של רגיונל, לרוב מדוד; השימוש בו משתנה בין קבוצות"),
  term("cavalaria", "berimbau warning rhythm, historically associated with approaching mounted police", "קבלריה — מקצב התראה, המזוהה היסטורית עם התקרבות שוטרים רכובים"),
  term("angola", "Angola rhythm, often slow and associated with low, strategic play; also a capoeira style", "אנגולה — מקצב שלרוב מלווה משחק איטי, נמוך וערמומי; גם שם של סגנון קפואירה"),
  term("samba de roda", "circle samba dance and its music, distinct from a capoeira game", "סמבה דה רודה — ריקוד סמבה במעגל והמוזיקה שלו, ולא משחק קפואירה"),
  term("maculelê", "Afro-Brazilian stick dance and its accompanying rhythms, often presented at capoeira events", "מקוללה — ריקוד מקלות אפרו־ברזילאי והמקצבים המלווים אותו, המוצג גם באירועי קפואירה"),
  term("ladainha", "solo opening song, especially in Capoeira Angola", "לדאיניה — שיר פתיחה בסולו, במיוחד בקפואירה אנגולה"),
  term("louvação", "sung praise with group responses, often following the opening song", "לובסאו — קטע שבח ומענה של המעגל, לרוב אחרי שיר הפתיחה"),
  term("chula", "song form; in some schools the praise-and-response section after the opening song", "שולה — סוג של שיר; בחלק מהקבוצות קטע השבח והמענה אחרי הפתיחה"),
  term("quadra", "short song stanza traditionally based on four lines", "קוואדרה — בית שירי קצר המבוסס בדרך כלל על ארבע שורות"),
  term("corrido", "call-and-response song in which the solo singer sings and the circle answers", "קורידו — שיר קריאה ומענה: הסולן שר והמעגל עונה"),
  term("entra na roda sem medo", "enter the roda without fear", "היכנס למעגל בלי פחד"),
  term("deixa o berimbau falar", "let the berimbau speak", "תן לבירימבאו לדבר"),
  term("cantar junto", "sing together or join in the singing", "לשיר יחד או להצטרף לשירה"),
  term("roda de aniversário", "birthday celebration roda; customs vary by group", "רודה לכבוד יום הולדת; המנהגים משתנים בין קבוצות"),
  term("aniversariante", "person whose birthday is being celebrated", "מי שחוגג יום הולדת"),
  term("parabéns pra você", "happy birthday to you; also the familiar Brazilian birthday-song title", "יום הולדת שמח לך — גם שם שיר יום ההולדת המוכר בברזיל", "parabéns para você", "parabéns a você"),
  term("festa", "party or celebration", "מסיבה או חגיגה"),
];

export const termKey = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[a-z]+/g)?.join(" ") ?? "";
const termsByKey = new Map(CAPOEIRA_TERMS.flatMap(t => [t.word, ...t.aliases].map(alias => [termKey(alias), t] as const)));
export const capoeiraTerm = (text: string) => termsByKey.get(termKey(text));
export const isCapoeira = (topic: string) => /capoeira|abad[aá]/i.test(topic);

type Lesson = { id: string; title: string; situation: string; words: string[] };
const lesson = (id: string, title: string, situation: string, words: string): Lesson => ({ id, title, situation, words: words.split("|") });
// Interleave categories: a new session is not another ten versions of left/right.
export const CAPOEIRA_LESSONS = [
  lesson("kicks-v1", "Kicks in class", "Discuss which kick the instructor named, choose a familiar one, and ask about an unfamiliar name.", "martelo|queixada|armada|meia-lua de frente"),
  lesson("instruments-v1", "Instruments in the roda", "Get ready for the music: identify, choose and ask for instruments with classmates.", "berimbau|pandeiro|atabaque|agogô"),
  lesson("first-cords-v1", "First cord colors", "Talk with a classmate about their cord and the batizado. Ask which cord they have, without assuming they have one. Cords are awarded, not chosen or ordered.", "corda crua|corda crua e amarela|corda amarela|corda amarela e laranja"),
  lesson("evasions-v1", "Evasions and transitions", "Understand the names in the instructor's announced sequence and ask what comes next.", "esquiva diagonal|cocorinha|negativa|rolê"),
  lesson("exercises-v1", "Warm-up and partner exercises", "Follow a verbal class plan: warm-up, stretching, repetitions and working with a partner. Discuss the plan, not execution mechanics.", "aquecimento|alongamento|repetição|dupla"),
  lesson("sweeps-v1", "Sweeps and takedown names", "Discuss the names in a teacher's demonstration and ask which one was mentioned. No physical execution instructions.", "rasteira|banda|tesoura|vingativa"),
  lesson("berimbau-parts-v1", "Getting the berimbau ready", "Help a classmate identify and find the parts used with a berimbau.", "caxixi|baqueta|dobrão|cabaça"),
  lesson("direct-kicks-v1", "More kick names", "Discuss the named kicks on today's class plan and ask the instructor to clarify a name.", "bênção|chapa|ponteira|pisão"),
  lesson("student-cords-v1", "Orange and blue cords", "Discuss adult ABADÁ cord colors with a classmate before a graduation event.", "corda laranja|corda laranja e azul|corda azul|corda azul e verde"),
  lesson("floor-v1", "Floor movements and balances", "Talk about movement names while watching an imagined class demonstration, including what you want explained again.", "aú|macaco|bananeira|queda de rins"),
  lesson("changes-v1", "Changes during the game", "Understand short instructor comments about feints, switching, crossing and turning; clarify what the speaker means.", "finta|troca|atravessa|meia-volta"),
  lesson("spinning-v1", "Spinning movement names", "Ask about names and variations mentioned in class. Do not claim different names always mean the same technique.", "meia-lua de compasso|rabo de arraia|martelo rodado"),
  lesson("graduated-cords-v1", "Green and purple cords", "Talk about adult ABADÁ graduated-student and instructor cord colors at an event.", "corda verde|corda verde e roxa|corda roxa|corda roxa e marrom"),
  lesson("demonstration-v1", "Watching a demonstration", "Ask a teacher about the names in an imagined demonstration, without explaining how to perform acrobatics or takedowns.", "s-dobrado|chapéu de couro|arrastão|cabeçada"),
  lesson("roda-v1", "Language around the roda", "Discuss the names heard while watching a roda and ask for a name to be repeated.", "ginga|volta ao mundo|roda|voo do morcego"),
  lesson("music-v1", "Clapping and singing", "Join a conversation about the song, group response and rhythm during class. Use original short language, not song lyrics.", "palmas|coro|toque|ritmo"),
  lesson("teacher-cords-v1", "Teacher cord colors", "Identify adult ABADÁ instructor titles and cord colors at an event. Do not assign the learner a rank.", "corda marrom|corda marrom e vermelha|corda vermelha|corda vermelha e branca"),
  lesson("ceremony-v1", "At the batizado", "Chat about the ceremony, nicknames and adult graduation. The white cord is the highest graduation, not the beginner's undyed cord.", "batizado|troca de cordas|apelido|corda branca"),
  lesson("ensemble-v1", "The berimbau ensemble", "Talk to classmates about the berimbaus and their sound registers while getting ready for the roda.", "gunga|médio|viola|bateria"),
  lesson("cartwheel-shapes-v1", "Recognizing cartwheel names", "Ask a classmate which cartwheel name the instructor used and request a short explanation or repetition. Keep the Portuguese at the learner's level, even for an advanced movement name.", "aú aberto|aú fechado|aú sem mão"),
  lesson("cartwheel-variations-v1", "Cartwheel variations in a demonstration", "Discuss names heard during an imagined demonstration. Ask the teacher to repeat or explain a name, acknowledging that variations differ by school. Talk about the vocabulary, without giving physical execution instructions.", "aú batido|aú de cabeça|aú helicóptero"),
  lesson("roda-rhythms-v1", "Talking about the rhythm of the game", "Chat with a classmate about named rhythms and the pace of the roda. Ask which name they want repeated or explained. Angola also appears in ABADÁ; do not assume every roda uses every rhythm or quiz recognition of audio that was not played.", "são bento grande da regional|benguela|são bento pequeno|angola"),
  lesson("traditional-toques-v1", "Asking about traditional toques", "Ask a classmate about rhythm names on an event's program. Explain one name at a time in simple Portuguese. Customs, clapping, eligible players and uses vary by school; ask about the learner's own teacher's practice instead of prescribing universal rules.", "iúna|amazonas|santa maria|idalina"),
  lesson("event-music-v1", "Music and dance at a capoeira event", "Talk with a classmate about an event's music and dance demonstrations. Cavalaria is a warning rhythm; samba de roda and maculelê are distinct dance traditions with their own music. Discuss what the learner wants explained or repeated, without claiming a real emergency or asking them to identify unheard music.", "cavalaria|samba de roda|maculelê"),
  lesson("opening-songs-v1", "Talking about the opening song", "Ask a classmate about the names of the opening song and the praise-and-response section. Explain one name at a time and offer simple requests for clarification. Louvação and chula overlap in some traditions but are not universal synonyms; do not impose one song order on every ABADÁ roda. Discuss the singing without quoting song lyrics or pretending to play music.", "ladainha|louvação|chula"),
  lesson("song-responses-v1", "Joining the singing in the roda", "Chat with a classmate about a short verse, the singer's call and the circle's response. Practice asking when to join in or requesting an explanation. Explain quadra as traditionally four lines and corrido as call-and-response; keep this a simple language conversation, not a definition quiz or a task requiring unheard music or song lyrics.", "quadra|corrido|coro"),
  lesson("song-phrases-v1", "Useful phrases from capoeira song titles", "Practice the two supplied short song-title phrases listed by ABADÁ Berlin: use one as spoken Portuguese, explain it briefly, then help the learner respond or use its words in an original class conversation. Cantar junto is an original practice expression, not a quoted lyric. Do not continue lyrics, claim ABADÁ authorship or ask the learner to sing. Ask one simple question at a time.", "entra na roda sem medo|deixa o berimbau falar|cantar junto"),
  lesson("birthday-roda-v1", "Celebrating a birthday in the roda", "Role-play a birthday roda with a classmate. Begin by congratulating a fictional birthday celebrant and asking who is celebrating. Use the short birthday-song excerpt 'Parabéns pra você, nesta data querida.' once during the conversation, translating it naturally, then practise an original spoken reply. This is pronunciation playback, not singing or a recording. Do not supply the remaining lyrics. Discuss joining the celebration, thanking classmates and wishing someone a happy birthday. Group customs vary: do not prescribe rough play, compulsory participation or a universal birthday ritual. Keep names fictional; no date of birth is needed.", "roda de aniversário|aniversariante|parabéns pra você|festa"),
];

export type LessonChoice = { id: string; visit: number };
export type LessonHistory = { id: string; visits: number; last_used: string };
export function chooseLesson(topic: string, history: LessonHistory[]): LessonChoice | undefined {
  if (!isCapoeira(topic)) return undefined;
  const used = new Map(history.map(item => [item.id, item]));
  const next = CAPOEIRA_LESSONS.find(item => !used.has(item.id)) ?? [...CAPOEIRA_LESSONS].sort((a,b) =>
    used.get(a.id)!.last_used.localeCompare(used.get(b.id)!.last_used) || a.id.localeCompare(b.id))[0];
  return { id: next.id, visit: (used.get(next.id)?.visits ?? 0) + 1 };
}

const tasks = [
  "Open with one concrete question about the learner's class, preference or need in this situation. Use the focus term in an answer idea if it does not fit the question. No definition quiz.",
  "Follow their answer: ask which part or name they want the teacher/classmate to explain. Make this a request, not another choice between moves.",
  "Mention the focus term in a short class remark and check whether the learner wants it repeated or explained. A yes/no answer is fine here.",
  "Introduce the next term naturally in the situation and ask for one detail, such as who their partner is or when it appears in class. No technical quiz.",
  "Offer two simple ways to continue in this situation, such as hearing a name again or moving on. This is the one A-or-B choice turn.",
  "Introduce the last term in a short remark and ask what they would request from their instructor about it. Do not ask the learner to define or teach it.",
  "Ask how they would tell a classmate one detail already discussed. Suggest a short useful statement, not two move names to choose between.",
  "Confirm a detail from their actual answer or check whether they want another explanation. A yes/no answer is fine here.",
  "Ask what they would like the teacher or classmate to include next time, using familiar vocabulary.",
  "Ask what they would tell their instructor or classmate about today's practice. Invite a short recap, not another preference or definition.",
];
const formats = ["open", "open", "yes_no", "open", "choice", "open", "open", "yes_no", "open", "open"];
const termOrder = [0, 1, 0, 2, 1, 3, 2, 3, 0, 1];
export function lessonContext(choice: LessonChoice | undefined, question = 0, language = "en-US") {
  const selected = CAPOEIRA_LESSONS.find(item => item.id === choice?.id);
  if (!selected || !choice) return undefined;
  const offset = (choice.visit - 1) % selected.words.length;
  const words = [...selected.words.slice(offset), ...selected.words.slice(0,offset)];
  return { id: selected.id, title: selected.title, school: "ABADÁ", situation: selected.situation,
    vocabulary: words.map(word => { const entry = capoeiraTerm(word)!; return { term: entry.word, meaning: entry.en, translation: language === "he-IL" ? entry.he : entry.en }; }),
    next_prompt: question >= 10 ? { task: "Close this practice without a new question or term." } : {
      task: tasks[question], format: formats[question], focus_term: words[termOrder[question] % words.length],
      opening_style: ["Ask a preference", "Ask which item they need", "Ask about their own class"][(CAPOEIRA_LESSONS.indexOf(selected) + choice.visit - 1) % 3],
    },
  };
}
