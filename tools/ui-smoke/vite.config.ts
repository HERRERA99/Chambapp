import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  cacheDir: 'node_modules/.vite-ui-smoke',
  plugins: [react()],
  resolve: { alias: [{ find: /^.*workspace\.repository$/, replacement: fileURLToPath(new URL('./repository.ts', import.meta.url)) }] },
  server: { host: '127.0.0.1', port: 5174 },
});
