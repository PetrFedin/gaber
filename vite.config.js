import {defineConfig} from 'vite';
export default defineConfig({
  // По умолчанию сервер виден только этому компьютеру. Для проверки с телефона: npm run dev:lan.
  server: {
    host: '127.0.0.1',
    port: 4173,
    // API запускается отдельно: npm run server (см. docs/server.md).
    proxy: {'/api': process.env.GABER_API_URL || 'http://127.0.0.1:8787'}
  },
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: {output: {manualChunks: {three: ['three'], react: ['react', 'react-dom']}}}
  }
});
