// Genera la voz en off de cada escena con Edge TTS (voces neuronales, sin clave de API).
// Requiere: pip install edge-tts. Uso: node scripts/generate-voice.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(join(root, 'scripts/voiceover.json'), 'utf8'));
const outDir = join(root, 'public/voice');
mkdirSync(outDir, { recursive: true });

// La voz pronuncia mejor "Chamba app" que "Chambapp".
const spoken = (text) => text.replaceAll('Chambapp', 'Chamba app');

const durations = {};
for (const scene of config.scenes) {
  const file = join(outDir, `${scene.id}.mp3`);
  execFileSync('python', [
    '-m',
    'edge_tts',
    '--voice',
    config.voice,
    `--rate=${config.rate}`,
    '--text',
    spoken(scene.text),
    '--write-media',
    file,
  ]);
  const seconds = Number(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      file,
    ])
      .toString()
      .trim(),
  );
  durations[scene.id] = seconds;
  console.log(`${scene.id}: ${seconds.toFixed(2)} s`);
}

writeFileSync(join(root, 'src/data/durations.json'), JSON.stringify(durations, null, 2) + '\n');
