// Builds the browser extension into extension/dist.
//   node extension/build.mjs          production build
//   node extension/build.mjs --watch  rebuild on changes (reload the extension in chrome://extensions)
//   node extension/build.mjs --allow-local-only  without the cloud values: a local-only extension
// Pages and the service worker are ES modules; content scripts are self-contained IIFE files.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(here, 'dist');
const firefoxDir = resolve(here, 'dist-firefox');
const watch = process.argv.includes('--watch');
const mode = watch ? 'development' : 'production';

const env = loadEnv(mode, root, 'VITE_');
const supabaseUrl = env.VITE_SUPABASE_URL ?? '';
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
const { isPublicApiKey, isSupabaseUrl } = await import('../src/lib/supabase/clientConfig.ts');
// Without the cloud project's public values the extension is still built, but it only
// works with Chambapp local (the Docker edition). See extension/src/shared/cloud.ts.
// The cloud build (npm run build) must have them; only --allow-local-only (Docker) may skip them.
const cloud = isSupabaseUrl(supabaseUrl) && isPublicApiKey(supabaseKey);
if (!cloud && !process.argv.includes('--allow-local-only')) {
  console.error(
    'Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY (los mismos de la app) o usa --allow-local-only.',
  );
  process.exit(1);
}
if (!cloud)
  console.warn(
    'Sin VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY: la extensión se compila solo para Chambapp local.',
  );

rmSync(outDir, { recursive: true, force: true });
rmSync(firefoxDir, { recursive: true, force: true });

const common = {
  configFile: false,
  envDir: root,
  mode,
  logLevel: 'warn',
  define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
};
const watchOptions = watch ? { watch: {} } : {};

const pages = build({
  ...common,
  root: resolve(here, 'src'),
  base: '/',
  publicDir: resolve(here, 'public'),
  plugins: [react()],
  build: {
    outDir,
    emptyOutDir: false,
    sourcemap: watch ? 'inline' : false,
    minify: !watch,
    modulePreload: false,
    ...watchOptions,
    rolldownOptions: {
      input: {
        popup: resolve(here, 'src/popup/index.html'),
        options: resolve(here, 'src/options/index.html'),
        background: resolve(here, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});

const contentScripts = ['app-bridge', 'odoo-detect', 'odoo-timesheet', 'autofill-page'].map(
  (name) =>
    build({
      ...common,
      publicDir: false,
      build: {
        outDir: resolve(outDir, 'content'),
        emptyOutDir: false,
        sourcemap: watch ? 'inline' : false,
        minify: !watch,
        ...watchOptions,
        lib: {
          entry: resolve(here, `src/content/${name}.ts`),
          formats: ['iife'],
          name: `chambapp_${name.replace(/-/g, '_')}`,
          fileName: () => `${name}.js`,
        },
      },
    }),
);

await Promise.all([pages, ...contentScripts]);

const manifest = JSON.parse(readFileSync(resolve(here, 'manifest.json'), 'utf8'));
manifest.host_permissions = cloud
  ? manifest.host_permissions.map((value) =>
      value.replace('__SUPABASE_ORIGIN__', new URL(supabaseUrl).origin),
    )
  : manifest.host_permissions.filter((value) => !value.includes('__SUPABASE_ORIGIN__'));
if (watch) manifest.name = `${manifest.name} (desarrollo)`;
writeFileSync(resolve(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// Firefox: same files, its own manifest. Firefox has no background service worker
// (it runs the same module as an event page), needs an add-on id and, for new
// extensions, the data-collection declaration shown at install time.
const { key: _key, minimum_chrome_version: _chrome, background, ...shared } = manifest;
void _key;
void _chrome;
// Firefox ignores match patterns that name a port: drop it (the worker checks exact origins).
const withoutPort = (pattern) => pattern.replace(/^([a-z]+:\/\/[^/:]+):\d+\//, '$1/');
const firefoxManifest = {
  ...shared,
  host_permissions: shared.host_permissions.map(withoutPort),
  content_scripts: shared.content_scripts.map((script) => ({
    ...script,
    matches: script.matches.map(withoutPort),
  })),
  background: { scripts: [background.service_worker], type: 'module' },
  browser_specific_settings: {
    gecko: {
      id: 'extension@chambapp-tracker.vercel.app',
      strict_min_version: '140.0',
      data_collection_permissions: {
        // Sent to the user's own Chambapp account (Supabase): sign-in, account email,
        // and Odoo task data read from the page. Vault entries travel encrypted.
        required: ['authenticationInfo', 'personallyIdentifyingInfo', 'websiteContent'],
      },
    },
  },
};
cpSync(outDir, firefoxDir, { recursive: true });
writeFileSync(
  resolve(firefoxDir, 'manifest.json'),
  `${JSON.stringify(firefoxManifest, null, 2)}\n`,
);
writeFileSync(resolve(here, '.build-info.json'), `${JSON.stringify({ cloud }, null, 2)}\n`);
console.log(
  `Extensión compilada en ${outDir} y ${firefoxDir}${cloud ? '' : ' (solo local)'}${watch ? ' (vigilando cambios)' : ''}`,
);
