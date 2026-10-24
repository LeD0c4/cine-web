import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import legacy from '@vitejs/plugin-legacy';
import { readFileSync } from 'node:fs';

// En développement, /jellyfin est relayé vers le serveur (comme le fait nginx en production).
const target = process.env.JELLYFIN_URL ?? 'https://demo.jellyfin.org/stable';
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

// « npm run build:app » : version intégrée aux applis (LG webOS, Xbox…), ouverte depuis les fichiers
// de l'appli (adresses relatives, une seule version compatible avec les vieux moteurs web).
export default defineConfig(({ mode }) => {
  const app = mode === 'app';
  return {
    base: app ? './' : '/',
    plugins: [
      svelte(),
      // Télés au moteur web ancien (LG webOS, vieux Android TV) : une seconde version compatible,
      // chargée automatiquement par les navigateurs qui ne comprennent pas la version moderne.
      legacy({ targets: ['chrome >= 53', 'safari >= 11'], modernPolyfills: true, renderModernChunks: !app }),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(version),
      'import.meta.env.VITE_STANDALONE': JSON.stringify(app ? '1' : ''),
    },
    server: {
      host: true,
      port: 5180,
      proxy: {
        '/jellyfin': {
          target,
          changeOrigin: true,
          ws: true,
          rewrite: (p: string) => p.replace(/^\/jellyfin/, ''),
        },
      },
    },
    build: {
      outDir: app ? 'dist-app' : 'dist',
      chunkSizeWarningLimit: 2000,
      cssTarget: ['chrome61', 'safari11'],
    },
  };
});
