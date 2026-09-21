const $ = id => document.getElementById(id);
const el = (tag, text = '', className = '') => { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; };
const ids = new Set(['bananera', 'bateba', 'vesoura']);
function art(id, full = false) {
  const box = el('span', '', full ? 'partner-art' : 'partner-portrait'); box.dataset.partner = id;
  if (ids.has(id)) {
    const image = el('img'); image.src = `/app/instructors/${id}.png`; image.alt = ''; image.decoding = 'async';
    box.append(image);
  }
  return box;
}
function button(label, action, className = 'secondary') { const b = el('button', label, className); b.type = 'button'; b.onclick = action; return b; }

export function createPartners({ choose, openCollection }) {
  let state = null, capoeira = false;
  const current = () => state?.instructors?.find(i => i.id === state.profile.instructor && i.unlocked);
  function home() {
    const host = $('partner-home'); host.replaceChildren();
    host.hidden = !state?.instructors?.length || $('topic').value !== 'capoeira class';
    if (host.hidden) return;
    const selected = current(), copy = el('div', '', 'partner-home-copy');
    if (selected) host.append(art(selected.id));
    copy.append(el('small', 'YOUR CAPOEIRA PARTNER', 'eyebrow'), el('strong', selected?.name || 'Fala only'));
    host.append(copy, button('Change', openCollection, 'text-button'));
  }
  function conversation(session) {
    if (session) capoeira = session.capoeira ?? /capoeira/i.test(session.topic || '');
    const host = $('partner-identity'), selected = capoeira ? current() : null; host.replaceChildren();
    if (selected) {
      const copy = el('div'); copy.append(el('span', 'FALA · CAPOEIRA', 'eyebrow'), el('strong', selected.name));
      host.append(art(selected.id), copy);
    } else host.append(el('p', 'YOUR CONVERSATION PARTNER', 'eyebrow'));
  }
  function preview(item) {
    const dialog = $('partner-preview');
    $('partner-preview-title').textContent = item.name;
    $('partner-preview-art').replaceChildren(art(item.id, true));
    $('partner-preview-note').textContent = item.unlocked ? 'Ready for your next capoeira conversation.' : `${Math.max(0, item.xp - state.xp)} more XP to unlock. Keep practising at your own pace.`;
    const use = $('partner-preview-use'); use.textContent = `Use ${item.name}`;
    use.disabled = !item.unlocked || state.profile.instructor === item.id;
    use.onclick = () => { dialog.close(); choose(item.id); };
    dialog.showModal();
  }
  function render(data) {
    state = data; home(); conversation();
    const grid = $('instructor-list'); grid.replaceChildren();
    $('instructor-collection').hidden = !data?.instructors?.length;
    for (const item of data?.instructors || []) {
      const selected = data.profile.instructor === item.id;
      const card = el('article', '', 'instructor-card'); card.dataset.partner = item.id; card.dataset.selected = String(selected);
      const visual = button(`Preview ${item.name}`, () => preview(item), 'instructor-visual'); visual.replaceChildren(art(item.id, true)); visual.setAttribute('aria-label', `Preview ${item.name}`);
      const label = el('div', '', 'instructor-caption'); label.append(el('h3', item.name), el('span', item.color, 'fine'));
      card.append(visual, label, el('p', item.unlocked ? item.xp === 0 ? 'Ready from day one' : 'Unlocked through practice' : `${item.xp} XP · ${Math.max(0, item.xp - data.xp)} to go`, 'instructor-status'));
      const use = button(selected ? 'Selected' : item.unlocked ? `Use ${item.name}` : 'Preview', () => item.unlocked ? choose(item.id) : preview(item));
      use.disabled = selected; use.setAttribute('aria-pressed', String(selected)); card.append(use); grid.append(card);
    }
    const plain = $('partner-none'); plain.textContent = data?.profile.instructor === 'none' ? 'Fala only selected' : 'Use Fala without a character'; plain.disabled = data?.profile.instructor === 'none';
  }
  function celebrate(container, prior, next) {
    const unlocked = prior ? next.instructors?.filter(i => i.unlocked && i.xp > 0 && !prior.instructors?.some(old => old.id === i.id && old.unlocked)) || [] : [];
    const selected = unlocked.at(-1) || (capoeira ? current() : null);
    if (!selected) return;
    const row = el('div', '', 'partner-finish'), copy = el('div');
    copy.append(el('strong', unlocked.length ? `${unlocked.map(i => i.name).join(' & ')} unlocked` : 'Boa! One conversation further.'));
    copy.append(el('p', unlocked.length ? 'A new look for your next capoeira conversation.' : `${selected.name} will be here for your next capoeira practice.`, 'fine'));
    if (unlocked.length) copy.append(button('Choose a partner', openCollection));
    row.append(art(selected.id, true), copy); container.append(row);
  }
  $('topic').addEventListener('change', home);
  $('partner-none').onclick = () => choose('none');
  $('partner-preview-close').onclick = () => $('partner-preview').close();
  return { render, conversation, celebrate, reset() { state = null; capoeira = false; $('partner-preview').close(); render(null); } };
}
