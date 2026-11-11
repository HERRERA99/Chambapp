// Packages the built extension for the web app's download button (public/downloads/):
// - chambapp-extension.zip: Chrome and Edge ("Cargar descomprimida").
// - chambapp-extension-firefox.xpi: Firefox. The copy signed by Mozilla
//   (extension/signed/, made with `npm run ext:sign:firefox`) is used when it matches
//   the current version; otherwise an unsigned build, which Firefox only accepts as a
//   temporary add-on.
// - extension.json: version and whether the Firefox file is signed (read by the tutorial).
// Usage: node extension/build.mjs && node extension/scripts/pack.mjs
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFiles, zipFiles } from './zip.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../dist');
const firefoxDist = resolve(here, '../dist-firefox');
const downloads = resolve(here, '../../public/downloads');

if (!existsSync(join(dist, 'manifest.json')) || !existsSync(join(firefoxDist, 'manifest.json'))) {
  console.error('Falta la compilación: ejecuta antes `node extension/build.mjs`.');
  process.exit(1);
}
const { version } = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
mkdirSync(downloads, { recursive: true });

const chrome = zipFiles(listFiles(dist), dist, 'chambapp-extension');
writeFileSync(join(downloads, 'chambapp-extension.zip'), chrome);

const xpi = join(downloads, 'chambapp-extension-firefox.xpi');
const signedDir = resolve(here, '../signed');
const compareVersions = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1)
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};
// The copy signed for this version; otherwise the newest signed one (an older version
// that Firefox still installs permanently, better than a temporary add-on).
const signedVersions = existsSync(signedDir)
  ? readdirSync(signedDir)
      .map((name) => /^chambapp-firefox-(\d+(?:\.\d+)*)\.xpi$/.exec(name)?.[1])
      .filter(Boolean)
      .sort(compareVersions)
  : [];
const firefoxVersion = signedVersions.includes(version) ? version : (signedVersions.at(-1) ?? null);
const firefoxSigned = firefoxVersion !== null;
if (firefoxSigned) copyFileSync(join(signedDir, `chambapp-firefox-${firefoxVersion}.xpi`), xpi);
else writeFileSync(xpi, zipFiles(listFiles(firefoxDist), firefoxDist));
if (firefoxSigned && firefoxVersion !== version)
  console.warn(
    `Aviso: no hay copia firmada de la ${version}; Firefox recibe la ${firefoxVersion} firmada. Firma la nueva con «npm run ext:sign:firefox».`,
  );

const buildInfo = resolve(here, '../.build-info.json');
const { cloud = true } = existsSync(buildInfo) ? JSON.parse(readFileSync(buildInfo, 'utf8')) : {};
writeFileSync(
  join(downloads, 'extension.json'),
  `${JSON.stringify({ version, firefoxSigned, firefoxVersion: firefoxVersion ?? version, cloud }, null, 2)}\n`,
);
console.log(
  `Extensión ${version} empaquetada en ${relative(process.cwd(), downloads)}: zip (${Math.round(chrome.length / 1024)} KB) y xpi ${firefoxSigned ? `firmado (${firefoxVersion})` : 'SIN FIRMAR (solo complemento temporal)'}${cloud ? '' : ', solo local'}`,
);
