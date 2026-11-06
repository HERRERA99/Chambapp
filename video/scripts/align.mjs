// Corrige los subtítulos de Whisper con el texto exacto del guion.
// Whisper aporta los tiempos de cada palabra; el guion aporta la ortografía
// (marcas como "Chambapp", "Odoo" o "Markdown" que Whisper no conoce).
// Alinea ambas secuencias con programación dinámica y permite que una palabra
// del guion corresponda a dos tokens de Whisper ("Chamba app" → "Chambapp").
// Uso: node scripts/align.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(join(root, 'scripts/voiceover.json'), 'utf8'));
const whisper = JSON.parse(readFileSync(join(root, 'src/data/captions.whisper.json'), 'utf8'));

const norm = (w) =>
  w
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ]/g, '');

const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const cost = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  return lev(x, y) / Math.max(x.length, y.length, 1);
};

const align = (words, tokens) => {
  const n = words.length;
  const m = tokens.length;
  const best = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
  const from = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));
  best[0][0] = 0;
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++) {
      const here = best[i][j];
      if (here === Infinity) continue;
      const relax = (ni, nj, c, kind) => {
        if (ni <= n && nj <= m && here + c < best[ni][nj]) {
          best[ni][nj] = here + c;
          from[ni][nj] = { i, j, kind };
        }
      };
      if (i < n && j < m) relax(i + 1, j + 1, cost(words[i], tokens[j].text), '1:1');
      if (i < n && j + 1 < m) relax(i + 1, j + 2, cost(words[i], tokens[j].text + tokens[j + 1].text), '1:2');
      if (i + 1 < n && j < m) relax(i + 2, j + 1, cost(words[i] + words[i + 1], tokens[j].text), '2:1');
      if (i < n) relax(i + 1, j, 1, 'word');
      if (j < m) relax(i, j + 1, 1, 'token');
    }

  // Recorre el camino óptimo y asigna a cada palabra del guion sus tiempos.
  const steps = [];
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const step = from[i][j];
    steps.unshift({ ...step, ni: i, nj: j });
    i = step.i;
    j = step.j;
  }
  const out = [];
  let lastEnd = 0;
  for (const s of steps) {
    const ws = words.slice(s.i, s.ni);
    const ts = tokens.slice(s.j, s.nj);
    if (ws.length === 0) continue;
    const startMs = ts.length ? ts[0].startMs : lastEnd;
    const endMs = ts.length ? ts[ts.length - 1].endMs : lastEnd;
    // Dos palabras en un token: reparte su duración.
    const span = (endMs - startMs) / ws.length;
    ws.forEach((w, k) => {
      const a = Math.round(startMs + span * k);
      const b = Math.round(startMs + span * (k + 1));
      out.push({ text: ` ${w}`, startMs: a, endMs: b, timestampMs: Math.round((a + b) / 2), confidence: null });
    });
    lastEnd = endMs;
  }
  if (out.length) out[0].text = out[0].text.trimStart();
  return out;
};

const result = {};
for (const scene of config.scenes) {
  const words = scene.text.split(/\s+/).filter(Boolean);
  result[scene.id] = align(words, whisper[scene.id]);
  const changed = result[scene.id].filter((c, k) => norm(c.text) !== norm(whisper[scene.id][k]?.text ?? ''));
  console.log(`${scene.id}: ${words.length} palabras, ${whisper[scene.id].length} tokens`);
  if (changed.length) console.log('   ', result[scene.id].map((c) => `${c.text.trim()}@${c.startMs}`).join(' '));
}

writeFileSync(join(root, 'src/data/captions.json'), JSON.stringify(result, null, 2) + '\n');
