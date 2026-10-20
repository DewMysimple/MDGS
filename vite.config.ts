import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

// Vite 6 treats dev port 0 as its default port. Ask the OS for a free
// candidate instead; Vite can still recover if another app binds it first.
async function availablePort() {
  const listener = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      listener.once('error', reject);
      listener.listen(0, resolve);
    });
    const address = listener.address();
    if (!address || typeof address === 'string') throw new Error('Unable to allocate a development port.');
    return address.port;
  } finally {
    if (listener.listening) await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  }
}

export default defineConfig(async ({ command, isPreview }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react()],
  server: {
    port: command === 'serve' && !isPreview ? await availablePort() : 0,
    strictPort: false,
    // Source Blender archives and generated art masters are read by offline
    // tools. Watching them can hit Windows file locks during an asset save.
    // Runtime assets in public remain watched for the current browser preview.
    watch: { ignored: ['**/artwork/**', '**/reports/**', '**/source/**', '**/wiki_memory/**', '**/tmp/**'] },
  },
  preview: { port: 0, strictPort: false },
  build: { chunkSizeWarningLimit: 650, rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
}));
