// Signs the Firefox build with Mozilla (addons.mozilla.org, "unlisted" channel: it is
// distributed from Chambapp, not listed in the store) and stores the result in
// extension/signed/chambapp-firefox-<version>.xpi, which `ext:pack` then serves.
//
// Needs an AMO developer account and its API credentials
// (https://addons.mozilla.org/developers/addon/api/key/) in .env.local or the environment:
//   AMO_API_KEY=user:12345:67
//   AMO_API_SECRET=...
// Each version can be signed only once: raise "version" in extension/manifest.json first.
//
// Usage: npm run ext:sign:firefox
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFiles, zipEntries } from './zip.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const firefoxDist = resolve(here, '../dist-firefox');

function fromEnvFile(name) {
  try {
    const line = readFileSync(join(root, '.env.local'), 'utf8')
      .split(/\r?\n/)
      .find((entry) => entry.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : undefined;
  } catch {
    return undefined;
  }
}

const apiKey = process.env.AMO_API_KEY ?? fromEnvFile('AMO_API_KEY');
const apiSecret = process.env.AMO_API_SECRET ?? fromEnvFile('AMO_API_SECRET');
if (!apiKey || !apiSecret) {
  console.error(
    'Faltan AMO_API_KEY y AMO_API_SECRET (en .env.local). Créalas en https://addons.mozilla.org/developers/addon/api/key/',
  );
  process.exit(1);
}

const build = spawnSync(process.execPath, [join(here, '../build.mjs')], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
const { version } = JSON.parse(readFileSync(join(firefoxDist, 'manifest.json'), 'utf8'));
const target = resolve(here, `../signed/chambapp-firefox-${version}.xpi`);
if (existsSync(target)) {
  console.error(`La versión ${version} ya está firmada (${target}). Sube la versión del manifest.`);
  process.exit(1);
}

// The add-on is bundled with Vite, so Mozilla asks for the sources and how to build them.
const work = mkdtempSync(join(tmpdir(), 'chambapp-sign-'));
const instructions = join(work, 'COMO-COMPILAR.md');
writeFileSync(
  instructions,
  [
    '# Compilar la extensión de Chambapp para Firefox',
    '',
    'Requisitos: Node.js 24 o superior y npm.',
    '',
    '1. `npm ci`',
    '2. Crea `.env.local` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (clave pública del proyecto; ver `.env.example`).',
    '3. `node extension/build.mjs`',
    '',
    'El resultado para Firefox queda en `extension/dist-firefox/`.',
    '',
  ].join('\n'),
);
const sourceRoots = [
  'src',
  'extension/src',
  'extension/public',
  'extension/scripts',
  'public/brand',
];
const sourceFiles = [
  ...sourceRoots.flatMap((folder) => listFiles(join(root, folder))),
  ...[
    'extension/build.mjs',
    'extension/manifest.json',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'tsconfig.extension.json',
    '.env.example',
  ].map((file) => join(root, file)),
];
const sourcesZip = join(work, 'chambapp-extension-sources.zip');
writeFileSync(
  sourcesZip,
  zipEntries([
    ...sourceFiles.map((path) => ({ path, name: relative(root, path).split(sep).join('/') })),
    { path: instructions, name: 'COMO-COMPILAR.md' },
  ]),
);

const artifacts = join(work, 'signed');
console.log('Enviando a Mozilla para firmar (puede tardar unos minutos)…');
// One command string: npx needs a shell on Windows, and passing an argument list
// together with `shell` is deprecated. The paths are ours (temp and project folders).
const command = [
  'npx --yes web-ext@8 sign --channel=unlisted',
  `--source-dir="${firefoxDist}"`,
  `--artifacts-dir="${artifacts}"`,
  `--upload-source-code="${sourcesZip}"`,
].join(' ');
const sign = spawnSync(command, {
  stdio: 'inherit',
  shell: true,
  // Credentials go through the environment, never on the command line.
  env: { ...process.env, WEB_EXT_API_KEY: apiKey, WEB_EXT_API_SECRET: apiSecret },
});
if (sign.status !== 0) {
  console.error('Mozilla no devolvió la extensión firmada. Revisa el mensaje anterior.');
  process.exit(sign.status ?? 1);
}
const produced = existsSync(artifacts)
  ? readdirSync(artifacts).find((name) => name.endsWith('.xpi'))
  : undefined;
if (!produced) {
  console.error('No se encontró el .xpi firmado.');
  process.exit(1);
}
mkdirSync(dirname(target), { recursive: true });
renameSync(join(artifacts, produced), target);
console.log(`Firmada: ${target}. Ejecuta \`npm run ext:pack\` y haz commit de ese archivo.`);
