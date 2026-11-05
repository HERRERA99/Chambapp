// Packages the built extension for the web app's download button (public/downloads/):
// - chambapp-extension.zip: Chrome and Edge ("Cargar descomprimida").
// - chambapp-extension-firefox.xpi: Firefox. The copy signed by Mozilla
//   (extension/signed/, made with `npm run ext:sign:firefox`) is used when it matches
//   the current version; otherwise an unsigned build, which Firefox only accepts as a
//   temporary add-on.
// - extension.json: version and whether the Firefox file is signed (read by the tutorial).
// Usage: node extension/build.mjs && node extension/scripts/pack.mjs
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const signed = resolve(here, `../signed/chambapp-firefox-${version}.xpi`);
const firefoxSigned = existsSync(signed);
if (firefoxSigned) copyFileSync(signed, xpi);
else writeFileSync(xpi, zipFiles(listFiles(firefoxDist), firefoxDist));

writeFileSync(
  join(downloads, 'extension.json'),
  `${JSON.stringify({ version, firefoxSigned }, null, 2)}\n`,
);
console.log(
  `Extensión ${version} empaquetada en ${relative(process.cwd(), downloads)}: zip (${Math.round(chrome.length / 1024)} KB) y xpi ${firefoxSigned ? 'firmado' : 'SIN FIRMAR (solo complemento temporal)'}`,
);
