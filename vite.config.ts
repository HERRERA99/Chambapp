import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    rolldownOptions: {
      output: {
        // Keep stable runtime libraries cacheable independently of feature pages.
        // https://rolldown.rs/reference/OutputOptions.codeSplitting
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /[\\/]node_modules[\\/](?:react|react-dom|scheduler|react-router|react-router-dom)[\\/]/,
              priority: 30,
            },
            { name: 'supabase', test: /[\\/]node_modules[\\/]@supabase[\\/]/, priority: 20 },
            { name: 'query', test: /[\\/]node_modules[\\/]@tanstack[\\/]/, priority: 10 },
            { name: 'time', test: /[\\/]node_modules[\\/]luxon[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
});
