// Original bilingual learning notes. Sources and terminology caveats are recorded
// in docs/abada-curriculum.md; these are language prompts, not movement tutorials.
export type CapoeiraTerm = { word: string; en: string; he: string; aliases: string[] };
const term = (word: string, en: string, he: string, ...aliases: string[]): CapoeiraTerm => ({ word, en, he, aliases });
export const CAPOEIRA_TERMS: CapoeiraTerm[] = [
  term("martelo", "round kick (literally: hammer)", "בעיטה מעגלית (מילולית: פטיש)"),
  term("queixada", "outward crescent kick", "בעיטה מעגלית מבפנים החוצה"),
  term("armada", "spinning kick", "בעיטת סיבוב"),
  term("meia-lua de frente", "front crescent kick", "בעיטת חצי־ירח קדמית"),
  term("berimbau", "capoeira musical bow", "בירימבאו — כלי נגינה דמוי קשת"),
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
  term("toque", "instrument rhythm or rhythmic pattern", "מקצב נגינה"),
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
  term("bateria", "capoeira instrument ensemble", "הרכב כלי הנגינה בקפואירה"),
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
