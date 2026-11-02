/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createWorkerSource } from './src/features/pwa/serviceWorker.ts';

export default defineConfig({
  plugins: [react(), {
    name: 'sol-portal-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter(path => path.startsWith('assets/') && !path.endsWith('.map')).map(path => '/' + path);
      const precache = new Set<string>();
      const addChunk = (name: string) => {
        const chunk = bundle[name];
        if (chunk?.type !== 'chunk' || precache.has('/' + name)) return;
        precache.add('/' + name);
        chunk.imports.forEach(addChunk);
      };
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && file.isEntry) addChunk(file.fileName);
        if (file.fileName.endsWith('.css')) precache.add('/' + file.fileName);
      }
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: createWorkerSource(Date.now().toString(36), assets, [...precache]) });
    },
  }],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (
            normalized.includes('node_modules/react/') ||
            normalized.includes('node_modules/react-dom/') ||
            normalized.includes('node_modules/scheduler/')
          ) {
            return 'react-vendor';
          }
          if (normalized.includes('node_modules/react-router')) {
            return 'router-vendor';
          }
        },
      },
    },
  },
  test: {
    environment: 'happy-dom',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
