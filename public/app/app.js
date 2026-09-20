import { Recorder, Voice } from './voice.js';
import { createRewards } from './rewards.js';

const $ = id => document.getElementById(id);
const show = (id, visible = true) => { $(id).hidden = !visible; };
const text = (id, value) => { $(id).textContent = value ?? ''; };
const preferences = { get: key => { try { return localStorage.getItem(`fala.${key}`); } catch { return null; } }, set: (key, value) => { try { localStorage.setItem(`fala.${key}`, value); } catch { /* Private browsing may disallow storage. */ } } };
let language = preferences.get('language') === 'en-US' ? 'en-US' : 'he-IL';
let user = null, session = null, reply = null;
let busy = false, epoch = 0, retryAction = null, recordingUrl = null, recorded = null, speechMs = 0;
let ideasHidden = preferences.get('hideIdeas') === 'true', assisted = !ideasHidden, pendingTurn = null, pendingStart = null;
const audioCache = new Map();
const voice = new Voice(value => text('voice-state', value));
const recorder = new Recorder(state => {
  $('microphone').dataset.recording = state === 'recording' ? 'true' : state === 'starting' ? 'starting' : 'false';
  text('mic-label', state === 'recording' ? 'Listening… release when done' : state === 'starting' ? 'Allow microphone access…' : 'Hold to speak');
  $('send').disabled = busy || state !== 'idle' || !$('draft').value.trim();
  $('options').disabled = state !== 'idle';
  document.querySelectorAll('#ideas button').forEach(button => { button.disabled = busy || state !== 'idle' || !!pendingTurn; });
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
const rewards = createRewards({api,post,task,screen,home});
function failure(error, retry = null) {
  text('error', error.message); show('error'); retryAction = retry; show('retry', !!retry);
}
function clearError() { show('error', false); show('retry', false); retryAction = null; }
function setBusy(value) {
  busy = value;
  document.querySelectorAll('#reward-nav button, #reward-settings input, #reward-settings select, #reward-settings button').forEach(button => { button.disabled = value; });
  for (const id of ['start', 'send', 'finish', 'complete', 'microphone', 'draft', 'help', 'signout', 'login-begin']) $(id).disabled = value;
  for (const id of ['microphone', 'draft', 'help']) $(id).disabled = value || !!pendingTurn;
  for (const id of ['topic', 'level', 'home-language']) $(id).disabled = value || !!pendingStart;
  $('send').disabled = value || recorder.active || !$('draft').value.trim();
  document.querySelectorAll('#ideas button').forEach(button => { button.disabled = value || recorder.active || !!pendingTurn; });
}
async function task(action, status = '') {
  if (busy) return;
  const current = epoch; clearError(); setBusy(true); text('notice', status); show('notice', !!status);
  try { await action(current); }
  catch (error) {
    if (current === epoch) {
      if (error.status === 401) { leave(); user = null; rewards.reset(); screen('welcome'); failure(new Error('Please sign in again. Saved conversations will be waiting in your history.')); }
      else failure(error, () => task(action, status));
    }
  } finally { if (current === epoch) { setBusy(false); show('notice', false); } }
}
function screen(id) {
  document.querySelectorAll('.screen').forEach(element => { element.hidden = element.id !== id; });
  document.body.classList.toggle('in-conversation', id === 'conversation');
  show('reward-nav',!!user&&['home','friends-screen','rewards-screen','reminders-screen'].includes(id));
  document.querySelectorAll('#reward-nav button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.page===id)));
  $('conversation-options').close();
  $('conversation-content').scrollTop = 0;
  window.scrollTo({ top: 0, behavior: 'instant' });
  fitViewport();
}
function fitViewport() {
  const viewport = window.visualViewport;
  document.documentElement.style.setProperty('--app-height', `${viewport?.height || window.innerHeight}px`);
  document.documentElement.style.setProperty('--viewport-top', `${viewport?.offsetTop || 0}px`);
}
window.visualViewport?.addEventListener('resize', fitViewport);
window.visualViewport?.addEventListener('scroll', fitViewport);
window.addEventListener('resize', fitViewport);
function updateDraft() {
  $('draft').style.height = '48px';
  $('draft').style.height = `${Math.max(48, Math.min(76, $('draft').scrollHeight + 2))}px`;
  $('send').disabled = busy || recorder.active || !$('draft').value.trim();
}
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
  ++epoch; recorder.cancel(); voice.stop(); discardRecording(); pendingTurn = null; pendingStart = null; audioCache.clear();
  setBusy(false); clearError(); show('notice', false); $('draft').value = ''; $('draft').lang = 'pt-BR'; $('help').checked = false;
}
async function home() {
  leave();
  if (!user) { screen('welcome'); return; }
  screen('home'); text('account-email', user.email);
  await task(async current => {
    const dashboard = await api('/dashboard'); if (current !== epoch) return;
    await rewards.initialize(dashboard.rewards); if(current!==epoch)return;
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

// Load Google only when the learner chooses to sign in.
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
  if (!$('eligible').checked) { failure(new Error('Online AI practice is for ages 13 and up with parent or guardian permission under 18.')); return; }
  void task(async current => {
    const [challenge] = await Promise.all([post('/auth/google/challenge'), loadGoogle()]); if (current !== epoch) return;
    google.accounts.id.initialize({ client_id: challenge.google_client_id, nonce: challenge.nonce, auto_select: false,
      callback: credential => { void task(async current => {
        const account = await post('/auth/web/google', { challenge_id: challenge.challenge_id, id_token: credential.credential, age_eligible: true });
        if (current !== epoch) return; user = account; await home();
      }, 'Signing you in…'); } });
    $('google-sign-in').replaceChildren();
    google.accounts.id.renderButton($('google-sign-in'), { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', width: Math.min(320, $('google-sign-in').clientWidth) });
  }, 'Preparing Google sign-in…');
};
$('signout').onclick = () => { void task(async current => { try{await rewards.disconnect();}catch{} await post('/auth/logout'); if (current !== epoch) return; user = null; rewards.reset(); leave(); screen('welcome'); }); };
$('start').onclick = () => {
  voice.unlock();
  if (!pendingStart) {
    pendingStart = { request_id: crypto.randomUUID(), topic: $('topic').value, support_language: language };
    if (+$('level').value) pendingStart.practice_level = +$('level').value;
  }
  const input = pendingStart;
  void task(async current => {
    const saved = await post('/sessions', input); if (current !== epoch) return;
    pendingStart = null; session = saved; renderSession(); listen();
  }, 'Fala is starting a conversation…');
};
function renderSession() {
  const last = session.turns.at(-1); reply = last?.reply || session.opening;
  const count = session.turns.filter(turn => !turn.help).length;
  $('conversation-progress').value = Math.min(count, 10);
  renderReply(`${Math.min(count + 1, 10)} / 10`, `${session.topic} · Level ${session.practice?.level || 1}`, count >= 10);
}
function renderReply(round, topic, complete = false) {
  recorder.cancel(); voice.stop(); discardRecording(); pendingTurn = null; pendingStart = null; audioCache.clear();
  $('draft').value = ''; $('draft').lang = 'pt-BR'; $('help').checked = false; assisted = !ideasHidden;
  $('draft').placeholder = 'Your reply… speak or type'; updateDraft();
  screen('conversation'); text('round', round); text('session-topic', topic);
  text('partner-text', reply.text); translated($('partner-translation'), reply.translation);
  const feedback = reply.turn_feedback;
  translated($('feedback'), feedback ? [feedback.message, feedback.kind === 'correction' ? feedback.natural : ''].filter(Boolean).join(' · ') : ''); show('feedback', !!feedback);
  $('ideas').replaceChildren();
  for (const [index, idea] of (reply.suggested_replies || []).entries()) {
    const row = document.createElement('div'); row.className = 'idea';
    const phrase = document.createElement('button'); phrase.type = 'button'; phrase.className = 'idea-text';
    phrase.setAttribute('aria-label', `Use suggested answer ${index + 1}: ${idea.text}`);
    phrase.onclick = () => {
      if (busy || recorder.active || pendingTurn) return;
      voice.stop(); $('recording').pause(); speechMs = 0; assisted = true;
      $('help').checked = false; $('draft').lang = 'pt-BR'; $('draft').placeholder = 'Your reply… speak or type';
      $('draft').value = idea.text; updateDraft();
      text('voice-state', 'Make it your own, then send. Or hold the microphone to say it.');
    };
    const pt = document.createElement('span'); pt.className = 'pt'; pt.lang = 'pt-BR'; pt.textContent = idea.text;
    const meaning = document.createElement('span'); meaning.className = 'meaning'; translated(meaning, idea.translation);
    phrase.append(pt, meaning);
    const controls = document.createElement('div'); controls.className = 'idea-actions';
    for (const slow of [false, true]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = slow ? 'text-button' : 'secondary';
      button.textContent = slow ? '0.8×' : '▶';
      button.title = slow ? 'Listen slowly' : 'Listen to this answer';
      button.setAttribute('aria-label', `${slow ? 'Slowly listen' : 'Listen'} to suggested answer ${index + 1}: ${idea.text}`);
      button.onclick = () => { voice.unlock(); listen(slow, index); };
      controls.append(button);
    }
    row.append(phrase, controls); $('ideas').append(row);
  }
  show('ideas-card', !ideasHidden && !complete); show('show-ideas', ideasHidden && !complete);
  show('online-draft', !complete); show('microphone', !complete); show('mic-hint', !complete);
  show('complete', complete);
  text('finish', complete ? 'See my summary' : 'Finish and review');
  text('voice-disclosure', 'AI-generated voice. Recording is sent to OpenAI for transcription when you release. Check the words before sending your answer.');
  text('mic-hint', 'Hold, speak, release. Check your words, then send.');
  if (complete) text('voice-state', 'Conversation complete. Listen, then open your summary.');
}
function listen(slow = false, suggestionIndex = null) {
  if (!reply || recorder.active) return;
  const selected = suggestionIndex === null ? reply : reply.suggested_replies[suggestionIndex];
  if (!selected) return;
  if (suggestionIndex !== null) assisted = true;
  $('recording').pause();
  const turnId = session.turns.at(-1)?.id ?? null;
  const key = `${session.id}:${turnId ?? 'opening'}:${suggestionIndex ?? 'partner'}`;
  if (!audioCache.has(key)) audioCache.set(key, { promise: null });
  const cached = audioCache.get(key);
  void voice.play(() => {
    cached.promise ??= post(`/sessions/${session.id}/speech`, { turn_id: turnId, suggestion_index: suggestionIndex }, { audio: true }).catch(error => { cached.promise = null; throw error; });
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
  $('draft').blur(); clearError(); voice.stop(); $('recording').pause(); void recorder.start();
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
  const requestedLanguage = $('help').checked ? language.slice(0, 2) : 'pt';
  await task(async current => {
    const result = await api(`/speech/transcribe?language=${requestedLanguage}`, { method: 'POST', headers: { 'Content-Type': recording.blob.type }, body: recording.blob });
    if (current !== epoch) return; $('draft').value = result.text; speechMs = recording.duration; updateDraft();
    text('voice-state', 'Your words are ready. Check, then send.');
  }, 'Listening to your recording…');
}
$('draft').oninput = () => { speechMs = 0; pendingTurn = null; clearError(); updateDraft(); };
$('help').onchange = () => {
  pendingTurn = null; clearError(); $('draft').lang = $('help').checked ? language : 'pt-BR';
  $('draft').placeholder = $('help').checked ? `Say it in ${language === 'he-IL' ? 'Hebrew' : 'English'} first…` : 'Your reply… speak or type';
};
$('options').onclick = () => { voice.stop(); $('conversation-options').showModal(); };
$('close-options').onclick = () => $('conversation-options').close();
$('conversation-options').onclose = () => $('recording').pause();
$('send').onclick = () => {
  if (recorder.active) return;
  if (!$('draft').value.trim()) { failure(new Error('Record or type a short answer first.')); return; }
  voice.unlock();
  pendingTurn ??= { request_id: crypto.randomUUID(), text: $('draft').value.trim(), help: $('help').checked, language: $('help').checked ? language : 'pt-BR',
    speech_ms: speechMs, source: speechMs ? 'speech' : 'typed', assisted, ideas_hidden: !assisted && ideasHidden };
  const input = pendingTurn, id = session.id;
  $('draft').blur(); voice.stop();
  void task(async current => {
    await post(`/sessions/${id}/turns`, input); if (current !== epoch) return;
    const saved = await api(`/sessions/${id}`); if (current !== epoch) return;
    session = saved; renderSession(); listen();
  }, 'Fala is thinking…');
};
function review(report) {
  voice.stop(); recorder.cancel(); discardRecording(); screen('review');
  show('reward-celebration',false);
  translated($('summary'), report.summary); $('pointers').replaceChildren(); $('words').replaceChildren();
  for (const pointer of report.pointers || []) { const p = document.createElement('p'); translated(p, pointer); $('pointers').append(p); }
  for (const word of (report.vocabulary || []).slice(0, 5)) {
    const card = document.createElement('div'); card.className = 'word';
    const name = document.createElement('strong'); name.lang = 'pt-BR'; name.textContent = word.word;
    const meaning = document.createElement('p'); translated(meaning, word.translation); card.append(name, meaning); $('words').append(card);
  }
}
$('finish').onclick = () => {
  $('conversation-options').close();
  recorder.cancel(); voice.stop();
  const id = session.id;
  void task(async current => { const report = await post(`/sessions/${id}/finish`); if (current === epoch) { review(report); await rewards.celebrate(); } }, 'Preparing your short review…');
};
$('complete').onclick = () => $('finish').click();
$('back').onclick = () => { void home(); };
$('again').onclick = () => { void home(); };
$('retry').onclick = () => retryAction?.();
document.addEventListener('visibilitychange', () => { if (document.hidden) { recorder.cancel(); voice.stop(); $('recording').pause(); } });
window.addEventListener('pagehide', () => { recorder.cancel(); voice.stop(); discardRecording(); });
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; show('install'); });
$('install').onclick = async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; show('install', false); } };
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/app/sw.js').catch(() => { /* Online practice still works without installation. */ });
// Session credentials are HttpOnly cookies. Browser storage holds preferences only.
try { user = await api('/auth/me'); if (!$('welcome').hidden) await home(); }
catch { /* Keep the sign-in screen available when there is no active session. */ }
