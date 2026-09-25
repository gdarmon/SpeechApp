import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { translate } from '../public/app/i18n.js';
import { CAPOEIRA_LESSONS } from '../src/capoeira.ts';

describe('complete Hebrew and English interface', () => {
  it('translates controls, nested level labels, account errors and lesson titles without touching Portuguese', () => {
    const he = value => translate(value, 'he-IL');
    expect(he('Talk')).toBe('מתחילים לדבר');
    expect(he('Practice level 1 · First phrases')).toBe('רמת תרגול 1 · ביטויים ראשונים');
    expect(he('Level 2 · Speaking practice')).toBe('רמה 2 · תרגול דיבור');
    expect(he('2000 XP')).toBe('2000 נקודות');
    expect(he('Please sign in to Fala again.')).toBe('התחברו שוב ל־Fala.');
    expect(he('Qual nome quer ouvir?')).toBe('Qual nome quer ouvir?');
    expect(translate('Talk', 'en-US')).toBe('Talk');
    for (const lesson of CAPOEIRA_LESSONS) expect(he(`ABADÁ capoeira · ${lesson.title}`)).not.toMatch(/[a-z]{3}/);
  });
  it('provides Hebrew for every static web interface label', async () => {
    const html = await readFile(new URL('../public/app/index.html', import.meta.url), 'utf8');
    const allowed = new Set(['Fala', 'English', 'PT–BR']);
    for (const match of html.matchAll(/>([^<>]+)</g)) {
      const source = match[1].trim();
      if (!/[A-Za-z]/.test(source) || allowed.has(source)) continue;
      expect(translate(source, 'he-IL'), source).not.toBe(source);
    }
  });
});
