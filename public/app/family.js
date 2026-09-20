// Fixed language examples: no account, personalisation, grading or AI requests.
const step = (text, en, he, answer, answerEn, answerHe) => ({ text, en, he, answer, answerEn, answerHe });
const word = (text, en, he) => ({ text, en, he });
export const familyLessons = [
  { title: 'Kicks and movements', steps: [
    step('Oi! Vamos falar de capoeira?', 'Hi! Shall we talk about capoeira?', 'היי! נדבר על קפואירה?', 'Vamos!', 'Let’s do it!', 'בואו!'),
    step('Você conhece a ginga?', 'Do you know the ginga?', 'מכירים את הג׳ינגה?', 'Sim, conheço a ginga.', 'Yes, I know the ginga.', 'כן, אני מכיר את הג׳ינגה.'),
    step('Qual chute você conhece?', 'Which kick do you know?', 'איזו בעיטה אתם מכירים?', 'Conheço o martelo.', 'I know the martelo.', 'אני מכיר את המרטלו.'),
    step('Você gosta do martelo?', 'Do you like the martelo?', 'אוהבים את המרטלו?', 'Sim, gosto do martelo.', 'Yes, I like the martelo.', 'כן, אני אוהב את המרטלו.'),
    step('E a queixada?', 'And the queixada?', 'ומה עם הקיישאדה?', 'Conheço a queixada também.', 'I know the queixada too.', 'אני מכיר גם את הקיישאדה.'),
    step('Queixada ou martelo?', 'Queixada or martelo?', 'קיישאדה או מרטלו?', 'Prefiro o martelo.', 'I prefer the martelo.', 'אני מעדיף את המרטלו.'),
    step('Você conhece a armada?', 'Do you know the armada?', 'מכירים את הארמדה?', 'Sim, conheço.', 'Yes, I do.', 'כן, אני מכיר.'),
    step('A armada é fácil?', 'Is the armada easy?', 'הארמדה קלה?', 'Ainda é difícil para mim.', 'It’s still difficult for me.', 'זה עדיין קשה לי.'),
    step('E o aú?', 'And the aú?', 'ומה עם האאו?', 'Gosto do aú.', 'I like the aú.', 'אני אוהב את האאו.'),
    step('Qual movimento você quer aprender?', 'Which movement do you want to learn?', 'איזו תנועה תרצו ללמוד?', 'Quero aprender a armada.', 'I want to learn the armada.', 'אני רוצה ללמוד את הארמדה.'),
  ], words: [word('ginga', 'Capoeira’s basic swaying step', 'תנועת הבסיס של הקפואירה'), word('martelo', 'A roundhouse kick', 'בעיטת פטיש מהצד'), word('queixada', 'An outward crescent kick', 'בעיטה מעגלית מבפנים החוצה'), word('armada', 'A spinning kick', 'בעיטת סיבוב'), word('aú', 'A cartwheel', 'גלגלון')] },
  { title: 'Instruments in the roda', steps: [
    step('Vamos falar de música?', 'Shall we talk about music?', 'נדבר על מוזיקה?', 'Vamos!', 'Let’s do it!', 'בואו!'),
    step('Você conhece o berimbau?', 'Do you know the berimbau?', 'מכירים את הברימבאו?', 'Sim, conheço.', 'Yes, I do.', 'כן, אני מכיר.'),
    step('Você toca berimbau?', 'Do you play berimbau?', 'מנגנים בברימבאו?', 'Ainda não.', 'Not yet.', 'עדיין לא.'),
    step('Quer aprender?', 'Do you want to learn?', 'רוצים ללמוד?', 'Sim, quero aprender.', 'Yes, I want to learn.', 'כן, אני רוצה ללמוד.'),
    step('E o pandeiro?', 'And the pandeiro?', 'ומה עם הפנדיירו?', 'Gosto do pandeiro.', 'I like the pandeiro.', 'אני אוהב את הפנדיירו.'),
    step('Você conhece o atabaque?', 'Do you know the atabaque?', 'מכירים את האטבאקי?', 'Sim, é um tambor.', 'Yes, it’s a drum.', 'כן, זה תוף.'),
    step('Qual instrumento você prefere?', 'Which instrument do you prefer?', 'איזה כלי נגינה אתם מעדיפים?', 'Prefiro o berimbau.', 'I prefer the berimbau.', 'אני מעדיף את הברימבאו.'),
    step('Você já ouviu o agogô?', 'Have you heard the agogô?', 'שמעתם את האגוגו?', 'Sim, já ouvi.', 'Yes, I have.', 'כן, שמעתי.'),
    step('O ritmo está rápido?', 'Is the rhythm fast?', 'הקצב מהיר?', 'Sim, está rápido.', 'Yes, it’s fast.', 'כן, הוא מהיר.'),
    step('Vamos cantar juntos?', 'Shall we sing together?', 'נשיר יחד?', 'Vamos cantar!', 'Let’s sing!', 'בואו נשיר!'),
  ], words: [word('berimbau', 'A musical bow', 'ברימבאו — כלי מיתר בצורת קשת'), word('pandeiro', 'A hand-held frame drum with jingles', 'פנדיירו — תוף מסגרת עם מצילות'), word('atabaque', 'A tall hand drum', 'אטבאקי — תוף גבוה'), word('agogô', 'A bell instrument', 'אגוגו — כלי פעמונים'), word('ritmo', 'Rhythm', 'קצב')] },
  { title: 'In capoeira class', steps: [
    step('Tudo bem?', 'How are you?', 'מה שלומכם?', 'Tudo bem!', 'I’m well!', 'הכול טוב!'),
    step('Vamos começar?', 'Shall we start?', 'נתחיל?', 'Vamos!', 'Let’s do it!', 'בואו!'),
    step('Você entendeu?', 'Did you understand?', 'הבנתם?', 'Pode repetir?', 'Can you repeat?', 'אפשר לחזור על זה?'),
    step('Mais devagar?', 'More slowly?', 'יותר לאט?', 'Sim, mais devagar, por favor.', 'Yes, more slowly, please.', 'כן, יותר לאט בבקשה.'),
    step('Para a direita ou para a esquerda?', 'To the right or to the left?', 'ימינה או שמאלה?', 'Para a direita.', 'To the right.', 'ימינה.'),
    step('E agora, para qual lado?', 'And now, which side?', 'ועכשיו, לאיזה צד?', 'Para a esquerda.', 'To the left.', 'שמאלה.'),
    step('Vamos formar uma dupla?', 'Shall we make a pair?', 'נתחלק לזוג?', 'Vamos formar uma dupla.', 'Let’s make a pair.', 'בואו נהיה זוג.'),
    step('Quer repetir a frase?', 'Want to repeat the phrase?', 'רוצים לחזור על המשפט?', 'Quero repetir.', 'I want to repeat.', 'אני רוצה לחזור.'),
    step('Você precisa de uma pausa?', 'Do you need a break?', 'צריכים הפסקה?', 'Sim, preciso de uma pausa.', 'Yes, I need a break.', 'כן, אני צריך הפסקה.'),
    step('Até a próxima aula?', 'See you next class?', 'נתראה בשיעור הבא?', 'Até a próxima!', 'See you next time!', 'להתראות בפעם הבאה!'),
  ], words: [word('devagar', 'Slowly', 'לאט'), word('direita', 'Right', 'ימין'), word('esquerda', 'Left', 'שמאל'), word('dupla', 'A pair', 'זוג'), word('repetir', 'To repeat', 'לחזור')] },
];
export function familyReply(lesson, index, language) {
  const item = lesson.steps[index], hebrew = language === 'he-IL';
  return { text: item.text, translation: hebrew ? item.he : item.en,
    suggested_replies: [{ text: item.answer, translation: hebrew ? item.answerHe : item.answerEn }] };
}
