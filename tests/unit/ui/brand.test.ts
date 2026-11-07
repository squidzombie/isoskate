// The name and brand contract (docs/BRAND.md §1, §2, §6.1): the player sees Isoskate everywhere (ISOSKATE only in the
// all-caps logo), while GAME_ID and every storage key keep 'dusklane' so saves survive; no player-facing string says
// Dusklane, uses a banned casing or calls the game isometric; the page head carries the name and the space-indigo theme
// colour; the four font files stay as they are.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAME_ID, GAME_NAME } from '../../../src/core/ids';

const ROOT = join(__dirname, '../../..');
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(n) && !/\.d\.ts$/.test(n) ? [p] : [];
});

/** Every string literal's text in a TypeScript source (comments skipped; a template literal is taken whole). */
function literals(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!, n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') { s += src[j + 1] ?? ''; j += 2; continue; } if (c !== '`' && src[j] === '\n') break; s += src[j]; j++; }
      out.push(s); i = j + 1; continue;
    }
    i++;
  }
  return out;
}

/** The internal names that keep the old id (BRAND §1.3). */
const INTERNAL = new Set(['dusklane', 'dusklane.save', '__dusklane_probe']);

describe('name (BRAND §1)', () => {
  it('GAME_NAME is Isoskate; GAME_ID stays dusklane (saves survive)', () => {
    expect(GAME_NAME).toBe('Isoskate');
    expect(GAME_NAME.toUpperCase()).toBe('ISOSKATE');
    expect(GAME_ID).toBe('dusklane');
  });

  it('no player-facing string in src says Dusklane, uses a banned casing, or calls the game isometric', () => {
    const bad: string[] = [];
    for (const f of files(join(ROOT, 'src'))) {
      for (const s of literals(readFileSync(f, 'utf8'))) {
        const rel = f.slice(ROOT.length + 1);
        if (/dusklane/i.test(s) && !INTERNAL.has(s)) bad.push(`${rel}: ${s.slice(0, 60)}`);
        if (/IsoSkate|ISO Skate|Iso-skate|iSoskate|ISOSKATE!/.test(s)) bad.push(`${rel}: ${s.slice(0, 60)}`);
        if (/isometric/i.test(s)) bad.push(`${rel}: ${s.slice(0, 60)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('index.html: the title, description and theme colour', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(html).not.toMatch(/dusklane/i);
    expect(html).toMatch(/<title>Isoskate<\/title>/);
    expect(html).toMatch(/<meta name="theme-color" content="#1B1D3F" \/>/);
    const desc = /<meta name="description" content="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(desc.startsWith('Isoskate: ')).toBe(true);
    expect(desc).not.toMatch(/isometric/i);
    expect(html).toMatch(/background: #1b1d3f/);           // first paint, boot and title are one continuous space
  });
});

describe('fonts (BRAND §2)', () => {
  it('four files: Bungee 400 and Nunito 700 / 800 / 900, latin only', () => {
    const css = readFileSync(join(ROOT, 'src/fonts/fonts.css'), 'utf8');
    const faces = [...css.matchAll(/@font-face\s*{[^}]*}/g)].map((m) => m[0]);
    expect(faces.length).toBe(4);
    expect(faces.map((f) => `${/font-family: '(\w+)'/.exec(f)?.[1]} ${/font-weight: (\d+)/.exec(f)?.[1]}`))
      .toEqual(['Bungee 400', 'Nunito 700', 'Nunito 800', 'Nunito 900']);
    expect(css).not.toMatch(/latin-ext/);
  });
});
