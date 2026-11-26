import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Pipefy-User-Id, X-Pipefy-Pipe-Id',
      'Content-Security-Policy': "frame-ancestors https://app.pipefy.com https://*.pipefy.com 'self'"
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4174',
        changeOrigin: true
      }
    }
  },
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm']
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
});
