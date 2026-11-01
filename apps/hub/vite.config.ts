import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repo = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Relative URLs, so the same build works from GitHub Pages, a zip on disk and
  // Generator Library's local server.
  base: './',
  worker: { format: 'es' },
  server: { fs: { allow: [repo] } },
  build: {
    outDir: `${repo}/dist`,
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
