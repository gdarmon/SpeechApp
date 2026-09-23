// Cache the account preference locally. App versions never invalidate it.
export function createWalkthrough({ preferences, account, language, stopAudio, onSeen = () => {} }) {
  const dialog = document.getElementById('walkthrough');
  const card = document.getElementById('walkthrough-card');
  const spot = document.getElementById('walkthrough-spot');
  const title = document.getElementById('walkthrough-title');
  const body = document.getElementById('walkthrough-body');
  const count = document.getElementById('walkthrough-count');
  const next = document.getElementById('walkthrough-next');
  const back = document.getElementById('walkthrough-back');
  const skip = document.getElementById('walkthrough-skip');
  const key = () => `walkthroughSeen:${account()}`;
  const seen = new Set();
  const requested = new Set();
  const remembered = () => seen.has(key()) || preferences.get(key()) === 'true';
  let step = 0, frame;
  const selectors = ['.playback', '#ideas-card .row, #show-ideas', '#microphone', '#online-draft', '#round'];
  const copy = {
    en: [
      ['Listen to the question', 'Tap Listen to hear the Portuguese. Slower gives you more time. The translation helps you understand.'],
      ['Find your first words', 'Open Ideas for your reply when you need help. Tap an idea to copy it. Each idea has Normal and Slow playback buttons. Choose a comfortable pace, then make the words your own.'],
      ['Hold, speak, release', 'Hold the microphone, wait for Listening, then speak. Release when you finish. Prefer typing? That works too.'],
      ['Check, then send', 'Your words appear here first. Edit them if needed, then tap the send arrow. Recording never sends an answer automatically.'],
      ['One reply at a time', 'After 10 replies, review your feedback and useful words. Take your time. You can reopen this guide in Settings.'],
    ],
    he: [
      ['מתחילים בהקשבה', 'לחצו על Listen כדי לשמוע את השאלה בפורטוגזית. Slower משמיע לאט יותר, והתרגום עוזר להבין.'],
      ['מוצאים מילים לתשובה', 'צריכים עזרה? פתחו את הרעיונות לתשובה. לחיצה על רעיון מעתיקה אותו לעריכה. ליד כל רעיון יש השמעה רגילה והשמעה איטית — בחרו בקצב שנוח לכם.'],
      ['לוחצים, מדברים, משחררים', 'החזיקו את כפתור המיקרופון, חכו שיופיע Listening ודברו. סיימתם? שחררו. אפשר גם להקליד.'],
      ['בודקים ורק אז שולחים', 'המילים שלכם יופיעו כאן. אפשר לתקן אותן ואז ללחוץ על חץ השליחה. ההקלטה לא שולחת תשובה אוטומטית.'],
      ['תשובה אחת בכל פעם', 'אחרי 10 תשובות תקבלו משוב ומילים לחזרה. אין צורך למהר. אפשר לפתוח את ההדרכה שוב בהגדרות.'],
    ],
  };
  function target() {
    return [...document.querySelectorAll(selectors[step])].find(el => el.getClientRects().length);
  }
  function position() {
    if (!dialog.open) return;
    const height = dialog.clientHeight, width = dialog.clientWidth, margin = 12;
    const rect = target()?.getBoundingClientRect();
    const origin = dialog.getBoundingClientRect();
    const y = rect ? rect.top - origin.top : 0;
    const top = rect && y + rect.height / 2 > height / 2;
    card.style.top = `${top ? margin : Math.max(margin, height - card.offsetHeight - margin)}px`;
    card.style.left = `${Math.max(margin, (width - card.offsetWidth) / 2)}px`;
    spot.hidden = !rect;
    if (rect) Object.assign(spot.style, {
      left: `${Math.max(3, rect.left - origin.left - 4)}px`, top: `${Math.max(3, y - 4)}px`,
      width: `${Math.min(width - 6, rect.width + 8)}px`, height: `${rect.height + 8}px`,
    });
  }
  function render() {
    const he = language() === 'he-IL';
    dialog.lang = he ? 'he' : 'en'; card.dir = he ? 'rtl' : 'ltr';
    [title.textContent, body.textContent] = copy[he ? 'he' : 'en'][step];
    count.textContent = `${step + 1} / ${selectors.length}`;
    next.textContent = step === selectors.length - 1 ? (he ? 'בואו נתחיל' : 'Let’s try it') : (he ? 'הבא' : 'Next');
    back.textContent = he ? 'הקודם' : 'Back'; back.hidden = step === 0;
    skip.textContent = he ? 'דלגו על ההדרכה' : 'Skip tour';
    target()?.scrollIntoView({ block: 'center', behavior: 'instant' });
    position(); cancelAnimationFrame(frame); frame = requestAnimationFrame(position);
    title.focus({ preventScroll: true });
  }
  function close() { dialog.close(); }
  next.onclick = () => { if (step === selectors.length - 1) close(); else { step++; render(); } };
  back.onclick = () => { step = Math.max(0, step - 1); render(); };
  skip.onclick = close;
  dialog.addEventListener('close', () => { cancelAnimationFrame(frame); if (!document.getElementById('conversation').hidden) document.getElementById('listen').focus({ preventScroll: true }); });
  window.addEventListener('resize', position);
  window.visualViewport?.addEventListener('resize', position);
  document.getElementById('conversation-content').addEventListener('scroll', position);
  new ResizeObserver(position).observe(card);
  return {
    get active() { return dialog.open; },
    needed() { return requested.has(key()) || !remembered(); },
    request() { requested.add(key()); },
    restore(serverSeen) {
      if (serverSeen) { seen.add(key()); preferences.set(key(), 'true'); }
      else if (remembered()) onSeen();
    },
    open(force = false) {
      if (!force && !this.needed()) return false;
      stopAudio();
      // Remember display as well as completion, so closing the app never causes a repeated interruption.
      seen.add(key()); preferences.set(key(), 'true');
      requested.delete(key()); onSeen();
      step = 0; dialog.showModal(); render(); return true;
    },
    close,
  };
}
