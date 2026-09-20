import { Recorder, Voice } from './voice.js';
import { familyLessons, familyReply } from './family.js';

const $ = id => document.getElementById(id);
const show = (id, visible = true) => { $(id).hidden = !visible; };
const text = (id, value) => { $(id).textContent = value ?? ''; };
const preferences = { get: key => { try { return localStorage.getItem(`fala.${key}`); } catch { return null; } }, set: (key, value) => { try { localStorage.setItem(`fala.${key}`, value); } catch { /* Private browsing may disallow storage. */ } } };
let language = preferences.get('language') === 'en-US' ? 'en-US' : 'he-IL';
let mode = location.hash === '#family' ? 'family' : 'online', user = null, session = null, reply = null, lesson = null, familyIndex = 0;
let busy = false, epoch = 0, retryAction = null, recordingUrl = null, recorded = null, speechMs = 0;
let ideasHidden = preferences.get('hideIdeas') === 'true', assisted = !ideasHidden, pendingTurn = null, pendingStart = null, audioCache = null;
const voice = new Voice(value => text('voice-state', value));
const recorder = new Recorder(state => {
  $('microphone').dataset.recording = state === 'recording' ? 'true' : state === 'starting' ? 'starting' : 'false';
  text('microphone', state === 'recording' ? 'Speaking… release when done' : state === 'starting' ? 'Allow microphone access…' : 'Hold to speak');
  $('send').disabled = busy || state !== 'idle';
}, recording => { void recordedAnswer(recording); }, error => failure(error));

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(55000), ...options });
  } catch { throw new Error('The connection was interrupted. Your answer is still here. Try again when you’re online.'); }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const failure = new Error(error.detail || 'Fala is unavailable. Please try again.'); failure.status = response.status; throw failure;
  }
  return options.audio ? response.arrayBuffer() : response.json();
}
const post = (path, body = {}, options = {}) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...options });
function failure(error, retry = null) {
  text('error', error.message); show('error'); retryAction = retry; show('retry', !!retry);
}
function clearError() { show('error', false); show('retry', false); retryAction = null; }
function setBusy(value) {
  busy = value;
  for (const id of ['start', 'send', 'finish', 'microphone', 'draft', 'help', 'signout', 'login-begin']) $(id).disabled = value;
  for (const id of ['microphone', 'draft', 'help']) $(id).disabled = value || !!pendingTurn;
  for (const id of ['topic', 'level', 'home-language']) $(id).disabled = value || !!pendingStart;
}
async function task(action, status = '') {
  if (busy) return;
  const current = epoch; clearError(); setBusy(true); text('notice', status); show('notice', !!status);
  try { await action(current); }
  catch (error) {
    if (current === epoch) {
      if (error.status === 401) { leave(); user = null; screen('welcome'); failure(new Error('Please sign in again. Saved conversations will be waiting in your history.')); }
      else failure(error, () => task(action, status));
    }
  } finally { if (current === epoch) { setBusy(false); show('notice', false); } }
}
function screen(id) { document.querySelectorAll('.screen').forEach(element => { element.hidden = element.id !== id; }); window.scrollTo({ top: 0, behavior: 'instant' }); }
function translated(element, value) { element.textContent = value || ''; element.lang = language === 'he-IL' ? 'he' : 'en'; element.dir = language === 'he-IL' ? 'rtl' : 'ltr'; }
function setLanguage(value) {
  language = value; preferences.set('language', language); $('language').value = $('home-language').value = language;
}
setLanguage(language);
for (const id of ['language', 'home-language']) $(id).onchange = event => setLanguage(event.target.value);
function discardRecording() {
  $('recording').pause(); $('recording').removeAttribute('src'); $('recording').load(); show('recording', false);
  if (recordingUrl) URL.revokeObjectURL(recordingUrl); recordingUrl = null; recorded = null; speechMs = 0;
}
function leave() {
  ++epoch; recorder.cancel(); voice.stop(); discardRecording(); pendingTurn = null; pendingStart = null; audioCache = null;
  setBusy(false); clearError(); show('notice', false); $('draft').value = ''; $('draft').lang = 'pt-BR'; $('help').checked = false;
}
async function home() {
  leave();
  if (mode === 'family') { screen('family-home'); return; }
  if (!user) { screen('welcome'); return; }
  screen('home'); text('account-email', user.email);
  await task(async current => {
    const dashboard = await api('/dashboard'); if (current !== epoch) return;
    const progress = dashboard.progress.practice;
    text('progress', progress ? `Level ${progress.level} · ${progress.title}. ${progress.goal}` : 'Start with short, simple replies.');
    $('history').replaceChildren();
    for (const item of dashboard.history.slice(0, 12)) {
      const button = document.createElement('button'); button.textContent = `${new Date(item.started_at).toLocaleDateString()} · ${item.topic} · ${item.ended_at ? 'Review' : 'Continue'}`;
      button.onclick = () => { voice.unlock(); void task(async current => {
        const saved = await api(`/sessions/${item.id}`); if (current !== epoch) return;
        session = saved; setLanguage(saved.support_language || language);
        if (saved.feedback) review(saved.feedback); else { renderSession(); listen(); }
      }, 'Opening your conversation…'); };
      $('history').append(button);
    }
    if (!dashboard.history.length) text('history', 'Your conversations will appear here.');
  });
}

// Load Google only for an explicitly chosen online sign-in, never for family practice.
let googleScript;
function loadGoogle() {
  googleScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    script.onload = resolve; script.onerror = () => { script.remove(); googleScript = null; reject(new Error('Google sign-in could not load. Check your connection and try again.')); };
    document.head.append(script);
  });
  return googleScript;
}
$('login-begin').onclick = () => {
  if (!$('eligible').checked) { failure(new Error('Online AI practice is for ages 13 and up with parent or guardian permission under 18. Younger learners can use Family practice below.')); return; }
  void task(async current => {
    const [challenge] = await Promise.all([post('/auth/google/challenge'), loadGoogle()]); if (current !== epoch) return;
    google.accounts.id.initialize({ client_id: challenge.google_client_id, nonce: challenge.nonce, auto_select: false,
      callback: credential => { void task(async current => {
        const account = await post('/auth/web/google', { challenge_id: challenge.challenge_id, id_token: credential.credential, age_eligible: true });
        if (current !== epoch) return; user = account; mode = 'online'; await home();
      }, 'Signing you in…'); } });
    $('google-sign-in').replaceChildren();
    google.accounts.id.renderButton($('google-sign-in'), { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', width: Math.min(320, $('google-sign-in').clientWidth) });
  }, 'Preparing Google sign-in…');
};
$('signout').onclick = () => { void task(async current => { await post('/auth/logout'); if (current !== epoch) return; user = null; leave(); screen('welcome'); }); };
$('start').onclick = () => {
  voice.unlock();
  if (!pendingStart) {
    pendingStart = { request_id: crypto.randomUUID(), topic: $('topic').value, support_language: language };
    if (+$('level').value) pendingStart.practice_level = +$('level').value;
  }
  const input = pendingStart;
  void task(async current => {
    const saved = await post('/sessions', input); if (current !== epoch) return;
    pendingStart = null; mode = 'online'; session = saved; renderSession(); listen();
  }, 'Fala is starting a conversation…');
};
function renderSession() {
  const last = session.turns.at(-1); reply = last?.reply || session.opening;
  const count = session.turns.filter(turn => !turn.help).length;
  renderReply(`${Math.min(count + 1, 10)} / 10`, `${session.topic} · Level ${session.practice?.level || 1}`, count >= 10);
}
function renderReply(round, topic, complete = false) {
  recorder.cancel(); voice.stop(); discardRecording(); pendingTurn = null; pendingStart = null; audioCache = null;
  $('draft').value = ''; $('draft').lang = 'pt-BR'; $('help').checked = false; assisted = !ideasHidden;
  screen('conversation'); text('round', round); text('session-topic', topic);
  text('partner-text', reply.text); translated($('partner-translation'), reply.translation);
  const feedback = reply.turn_feedback;
  translated($('feedback'), feedback ? [feedback.message, feedback.kind === 'correction' ? feedback.natural : ''].filter(Boolean).join(' · ') : ''); show('feedback', !!feedback);
  $('ideas').replaceChildren();
  for (const idea of reply.suggested_replies || []) {
    const row = document.createElement('div'); row.className = 'idea';
    const pt = document.createElement('p'); pt.className = 'pt'; pt.lang = 'pt-BR'; pt.textContent = idea.text;
    const meaning = document.createElement('p'); meaning.className = 'meaning'; translated(meaning, idea.translation);
    row.append(pt, meaning); $('ideas').append(row);
  }
  show('ideas-card', !ideasHidden && !complete); show('show-ideas', ideasHidden && !complete);
  show('online-draft', mode === 'online' && !complete); show('family-next', mode === 'family'); show('microphone', !complete); show('mic-hint', !complete);
  text('family-next', familyIndex === 9 ? 'I practiced it · See my words' : 'I practiced it · Continue');
  text('finish', complete ? 'See my summary' : 'Finish and review');
  text('voice-disclosure', mode === 'family' ? 'Prepared examples read by your device’s voice. Your recording stays here and is discarded when you continue. No automatic grading.' : 'AI-generated voice. Recording is sent to OpenAI for transcription when you release. Check the words before sending your answer.');
  text('mic-hint', mode === 'family' ? 'Hold to record, release to listen to yourself. No recording is uploaded.' : 'Hold while speaking. Release to transcribe, then check and send. Up to 45 seconds.');
  if (complete) text('voice-state', 'Conversation complete. Listen, then open your summary.');
}
function listen(slow = false) {
  if (!reply) return;
  $('recording').pause();
  if (mode === 'family') { voice.speak(reply.text, slow); return; }
  const key = `${session.id}:${session.turns.at(-1)?.id ?? 'opening'}`;
  if (audioCache?.key !== key) audioCache = { key, promise: null };
  const cached = audioCache;
  void voice.play(() => {
    cached.promise ??= post(`/sessions/${session.id}/speech`, { turn_id: session.turns.at(-1)?.id ?? null }, { audio: true }).catch(error => { cached.promise = null; throw error; });
    return cached.promise;
  }, slow);
}
$('listen').onclick = () => { voice.unlock(); listen(); };
$('slow').onclick = () => { voice.unlock(); listen(true); };
$('stop-audio').onclick = () => voice.stop();
$('recording').onplay = () => voice.stop();
$('hide-ideas').onclick = () => { ideasHidden = true; preferences.set('hideIdeas', 'true'); show('ideas-card', false); show('show-ideas'); };
$('show-ideas').onclick = () => { ideasHidden = false; assisted = true; preferences.set('hideIdeas', 'false'); show('ideas-card'); show('show-ideas', false); };

function beginRecording() {
  if (busy || pendingTurn || recorder.active) return;
  clearError(); voice.stop(); $('recording').pause(); void recorder.start();
}
$('microphone').onpointerdown = event => { if (event.button !== 0) return; event.preventDefault(); $('microphone').setPointerCapture(event.pointerId); beginRecording(); };
$('microphone').onpointerup = event => { event.preventDefault(); recorder.stop(); };
$('microphone').onpointercancel = () => recorder.cancel();
$('microphone').onlostpointercapture = () => { if (recorder.active) recorder.cancel(); };
$('microphone').oncontextmenu = event => event.preventDefault();
$('microphone').onkeydown = event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); if (!event.repeat) beginRecording(); } };
$('microphone').onkeyup = event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); recorder.stop(); } };
$('microphone').onblur = () => { if (recorder.active) recorder.cancel(); };
async function recordedAnswer(recording) {
  discardRecording(); recorded = recording; recordingUrl = URL.createObjectURL(recording.blob); $('recording').src = recordingUrl; show('recording');
  if (mode === 'family') { text('voice-state', 'Play your recording and compare it with the example. Try again whenever you like.'); return; }
  const requestedLanguage = $('help').checked ? language.slice(0, 2) : 'pt';
  await task(async current => {
    const result = await api(`/speech/transcribe?language=${requestedLanguage}`, { method: 'POST', headers: { 'Content-Type': recording.blob.type }, body: recording.blob });
    if (current !== epoch) return; $('draft').value = result.text; speechMs = recording.duration;
    text('voice-state', 'Check the words below, then send your answer.');
  }, 'Listening to your recording…');
}
$('draft').oninput = () => { speechMs = 0; pendingTurn = null; clearError(); };
$('help').onchange = () => { pendingTurn = null; clearError(); $('draft').lang = $('help').checked ? language : 'pt-BR'; };
$('send').onclick = () => {
  if (recorder.active) return;
  if (!$('draft').value.trim()) { failure(new Error('Record or type a short answer first.')); return; }
  voice.unlock();
  pendingTurn ??= { request_id: crypto.randomUUID(), text: $('draft').value.trim(), help: $('help').checked, language: $('help').checked ? language : 'pt-BR',
    speech_ms: speechMs, source: speechMs ? 'speech' : 'typed', assisted, ideas_hidden: !assisted && ideasHidden };
  const input = pendingTurn, id = session.id;
  void task(async current => {
    await post(`/sessions/${id}/turns`, input); if (current !== epoch) return;
    const saved = await api(`/sessions/${id}`); if (current !== epoch) return;
    session = saved; renderSession(); listen();
  }, 'Fala is thinking…');
};
function review(report) {
  voice.stop(); recorder.cancel(); discardRecording(); screen('review');
  translated($('summary'), report.summary); $('pointers').replaceChildren(); $('words').replaceChildren();
  for (const pointer of report.pointers || []) { const p = document.createElement('p'); translated(p, pointer); $('pointers').append(p); }
  for (const word of (report.vocabulary || []).slice(0, 5)) {
    const card = document.createElement('div'); card.className = 'word';
    const name = document.createElement('strong'); name.lang = 'pt-BR'; name.textContent = word.word;
    const meaning = document.createElement('p'); translated(meaning, word.translation); card.append(name, meaning); $('words').append(card);
  }
}
$('finish').onclick = () => {
  recorder.cancel(); voice.stop();
  if (mode === 'family') { familyReview(); return; }
  const id = session.id;
  void task(async current => { const report = await post(`/sessions/${id}/finish`); if (current === epoch) review(report); }, 'Preparing your short review…');
};
$('back').onclick = () => { void home(); };
$('again').onclick = () => { void home(); };
$('family-begin').onclick = () => { leave(); mode = 'family'; screen('family-home'); };
$('family-back').onclick = () => { leave(); mode = 'online'; if (user) void home(); else screen('welcome'); };
$('family-start').onclick = () => { leave(); mode = 'family'; lesson = familyLessons[+$('family-topic').value]; familyIndex = 0; renderFamily(); };
function renderFamily() { reply = familyReply(lesson, familyIndex, language); renderReply(`${familyIndex + 1} / 10`, `Family practice · ${lesson.title}`); listen(); }
$('family-next').onclick = () => { clearError(); if (familyIndex < 9) { familyIndex++; renderFamily(); } else familyReview(true); };
function familyReview(completed = false) {
  const he = language === 'he-IL';
  review({ summary: he ? (completed ? 'סיימתם עשרה משפטים. כל הכבוד על התרגול!' : 'התרגול הסתיים. אפשר לחזור ולתרגל בכל זמן.') : (completed ? 'You practiced ten short exchanges. Well done for making time to speak!' : 'Practice finished. Come back to these phrases whenever you like.'),
    pointers: [he ? 'אין כאן ציון אוטומטי. נסו לחזור על משפט אחד בלי לקרוא את ההצעה, ולהקשיב יחד להבדלים.' : 'There is no automatic score. Try one phrase without reading the suggestion, and listen together for differences.'],
    vocabulary: lesson.words.filter(word => lesson.steps.slice(0, familyIndex + 1).some(step => `${step.text} ${step.answer}`.toLowerCase().includes(word.text))).map(word => ({ word: word.text, translation: he ? word.he : word.en })) });
}
$('retry').onclick = () => retryAction?.();
document.addEventListener('visibilitychange', () => { if (document.hidden) { recorder.cancel(); voice.stop(); $('recording').pause(); } });
window.addEventListener('pagehide', () => { recorder.cancel(); voice.stop(); discardRecording(); });
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; show('install'); });
$('install').onclick = async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; show('install', false); } };
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/app/sw.js').catch(() => { /* Online practice still works without installation. */ });
// Session credentials are HttpOnly cookies. Browser storage holds preferences only.
try { if (mode === 'family') screen('family-home'); else { user = await api('/auth/me'); if (mode === 'online' && !$('welcome').hidden) await home(); } }
catch { /* Family practice remains available without an account or a network. */ }
