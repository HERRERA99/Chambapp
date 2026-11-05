// Builds the browser extension into extension/dist.
//   node extension/build.mjs          production build
//   node extension/build.mjs --watch  rebuild on changes (reload the extension in chrome://extensions)
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
if (!isSupabaseUrl(supabaseUrl) || !isPublicApiKey(supabaseKey)) {
  console.error(
    'Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local (los mismos de la app) antes de compilar la extensión.',
  );
  process.exit(1);
}

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
const supabaseOrigin = new URL(supabaseUrl).origin;
manifest.host_permissions = manifest.host_permissions.map((value) =>
  value.replace('__SUPABASE_ORIGIN__', supabaseOrigin),
);
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
console.log(
  `Extensión compilada en ${outDir} y ${firefoxDir}${watch ? ' (vigilando cambios)' : ''}`,
);
