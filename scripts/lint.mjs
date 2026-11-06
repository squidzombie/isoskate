#!/usr/bin/env node
// Dusklane lint (TECH §1): no dependencies. Two kinds of rule over src/**/*.ts:
//  1. Determinism bans in the deterministic layers (sim/, tricks/, world/gen/, core/): clocks, randomness,
//     DOM/browser globals and any `three` import (core/view.ts may `import type` from three).
//  2. Import boundaries: a module may import another module only through its index.ts (or anything in core/);
//     the deterministic layers may import only core/, sim/, tricks/ and world/gen/.
// Usage: node scripts/lint.mjs   (exit code 1 on any violation)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DETERMINISTIC = ['sim', 'tricks', 'world/gen', 'core'];
const DET_ALLOWED_DEPS = new Set(['core', 'sim', 'tricks', 'world/gen']);
const BANNED = ['Math.random', 'Date', 'performance', 'window', 'document', 'requestAnimationFrame', 'navigator',
  'localStorage', 'sessionStorage', 'setTimeout', 'setInterval', 'globalThis', 'crypto'];
const ALLOWED_BARE = new Set(['three', 'three/addons/utils/BufferGeometryUtils.js']);

const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.ts$/.test(n) && !/\.d\.ts$/.test(n)) files.push(p);
  }
})(SRC);

/** Module id of a path under src/: top folder, with world/ split into world/gen and world/render. */
function moduleOf(abs) {
  const parts = relative(SRC, abs).split(sep);
  if (parts.length === 1) return '.';                       // src/main.ts (boot entry)
  return parts[0] === 'world' && parts.length > 2 ? `world/${parts[1]}` : parts[0];
}
/** Blank out comments, strings and template literals (keeps newlines so line numbers survive). */
function strip(src, keepStrings) {
  let out = '', i = 0;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { const e = src.indexOf('\n', i); const j = e < 0 ? src.length : e; out += blank(src.slice(i, j)); i = j; }
    else if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); const j = e < 0 ? src.length : e + 2; out += blank(src.slice(i, j)); i = j; }
    else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      j = Math.min(j + 1, src.length);
      out += keepStrings ? src.slice(i, j) : c + blank(src.slice(i + 1, j - 1)) + c; i = j;
    } else { out += c; i++; }
  }
  return out;
}
const lineOf = (s, idx) => s.slice(0, idx).split('\n').length;

const errors = [];
const err = (f, line, msg) => errors.push(`${relative(ROOT, f)}:${line}  ${msg}`);

for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  const mod = moduleOf(f);
  const rel = relative(SRC, f).split(sep).join('/');
  const det = DETERMINISTIC.some((d) => rel.startsWith(d + '/'));
  const code = strip(raw, false);
  const withStrings = strip(raw, true);

  if (det) {
    for (const b of BANNED) {
      const re = new RegExp(`(?<![\\w$.])${b.replace('.', '\\s*\\.\\s*')}(?![\\w$])`, 'g');
      for (const m of code.matchAll(re)) err(f, lineOf(code, m.index), `determinism: '${b}' is banned in ${DETERMINISTIC.join(', ')}`);
    }
  }

  const importRe = /(?:^|[;\s}])(?:import|export)\s+(type\s+)?(?:[\w*${}\s,]+?\s+from\s+)?(['"])([^'"]+)\2|import\s*\(\s*(['"])([^'"]+)\4\s*\)/g;
  for (const m of withStrings.matchAll(importRe)) {
    const isType = !!m[1];
    const spec = m[3] ?? m[5];
    const line = lineOf(withStrings, m.index);
    if (!spec.startsWith('.')) {
      if (spec === 'three' || spec.startsWith('three/')) {
        if (!ALLOWED_BARE.has(spec)) err(f, line, `three: only 'three' and BufferGeometryUtils may be imported (got '${spec}')`);
        if (det && !(rel === 'core/view.ts' && isType)) err(f, line, `determinism: no three import in ${DETERMINISTIC.join(', ')}`);
      } else err(f, line, `dependency: '${spec}' is not an allowed runtime import (only three)`);
      continue;
    }
    const target = resolve(dirname(f), spec);
    if (!target.startsWith(SRC + sep)) { err(f, line, `boundary: import escapes src/ ('${spec}')`); continue; }
    const tmod = moduleOf(target.endsWith('.ts') || target.endsWith('.css') ? target : target + '.ts');
    if (tmod === mod) continue;
    const trel = relative(SRC, target).split(sep).join('/').replace(/\.ts$/, '');
    if (mod === 'core' && tmod !== 'core') err(f, line, `boundary: core/ must be self-contained (imports '${spec}')`);
    if (det && !DET_ALLOWED_DEPS.has(tmod)) err(f, line, `boundary: ${mod}/ may only import core/, sim/, tricks/, world/gen/ (imports ${tmod}/)`);
    const isIndex = trel === tmod || trel === `${tmod}/index`;
    if (tmod !== 'core' && tmod !== 'fonts' && !isIndex) err(f, line, `boundary: '${spec}' reaches into ${tmod}/ internals; import ${tmod}/index.ts instead`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\nlint: ${errors.length} problem(s) in ${files.length} files`);
  process.exit(1);
}
console.log(`lint: ok (${files.length} files)`);
