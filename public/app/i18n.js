import hebrew from './i18n-catalog.js';

let language = 'en-US';
const sources = new WeakMap();
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.entries(hebrew).filter(([key]) => /\{\d+\}/.test(key))
  .sort(([a], [b]) => b.replace(/\{\d+\}/g, '').length - a.replace(/\{\d+\}/g, '').length)
  .map(([key, value]) => ({ pattern: new RegExp('^' + key.split(/\{\d+\}/).map(escaped).join('(.*?)') + '$', 's'), value }));
export function translate(value, locale = language, depth = 0) {
  const text = String(value ?? '');
  if (locale !== 'he-IL' || !text || depth > 4) return text;
  if (Object.hasOwn(hebrew, text)) return hebrew[text];
  for (const {pattern, value} of patterns) {
    const match = text.match(pattern);
    if (match) return value.replace(/\{(\d+)\}/g, (_, n) => translate(match[Number(n) + 1], locale, depth + 1));
  }
  if (text.includes('\n')) return text.split('\n').map(part => translate(part, locale, depth + 1)).join('\n');
  if (text.includes(' · ')) return text.split(' · ').map(part => translate(part, locale, depth + 1)).join(' · ');
  const numbered = text.match(/^(\d+[. ]+)\s*(.+)$/s);
  if (numbered) return numbered[1] + translate(numbered[2], locale, depth + 1);
  const badge = text.match(/^([✓○] )(.+)$/s);
  if (badge) return badge[1] + translate(badge[2], locale, depth + 1);
  return text;
}
export const t = value => translate(value);
export const uiLanguage = () => language;
export function setText(element, value) {
  const source = String(value ?? '');
  element.textContent = source;
  if (element.closest('[translate="no"], [lang="pt-BR"]')) return;
  if (element.firstChild) localizeNode(element.firstChild);
}
function localizeNode(node) {
  const current = node.nodeValue;
  const saved = sources.get(node);
  const source = saved && current === saved.output ? saved.source : current;
  const output = source.replace(/\S[\s\S]*\S|\S/, part => t(part));
  sources.set(node, { source, output });
  if (current !== output) node.nodeValue = output;
}
export function localizeTree(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement?.closest('[translate="no"], [lang="pt-BR"], script, style, textarea, #google-sign-in')) localizeNode(node);
  }
  for (const element of root.querySelectorAll('[aria-label], [placeholder], [title]')) {
    if (element.closest('[translate="no"]')) continue;
    for (const attr of ['aria-label', 'placeholder', 'title']) {
      if (!element.hasAttribute(attr)) continue;
      const current = element.getAttribute(attr);
      // Attribute sources survive switching languages, just like text nodes.
      const stored = element.getAttribute('data-source-' + attr);
      const original = stored && [stored, translate(stored, 'he-IL')].includes(current) ? stored : current;
      element.setAttribute('data-source-' + attr, original);
      element.setAttribute(attr, t(original));
    }
  }
}
export function setUiLanguage(value) {
  language = value === 'he-IL' ? 'he-IL' : 'en-US';
  document.documentElement.lang = language === 'he-IL' ? 'he' : 'en';
  document.documentElement.dir = language === 'he-IL' ? 'rtl' : 'ltr';
  document.title = t("Fala — Let's talk");
  localizeTree();
  for (const label of document.querySelectorAll('[data-weekday]')) label.textContent = new Date(label.dataset.weekday + 'T12:00:00').toLocaleDateString(language, {weekday:'narrow'});
}
