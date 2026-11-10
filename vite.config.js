import { defineConfig } from 'vite';
export default defineConfig({
  server: {
    host:'0.0.0.0',port:4173,allowedHosts:['terminal.local'],
    // API сервера запускается отдельно: npm run server (см. docs/SERVER-AUTH.md).
    proxy:{'/api':process.env.GABER_API_URL||'http://127.0.0.1:8788'}
  },
  build: { chunkSizeWarningLimit:1100,rollupOptions:{output:{manualChunks:{three:['three'],react:['react','react-dom']}}} }
});
