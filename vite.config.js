import {defineConfig} from 'vite';
export default defineConfig({
  server: {host: '0.0.0.0', port: 4173, allowedHosts: ['terminal.local']},
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: {output: {manualChunks: {three: ['three'], react: ['react', 'react-dom']}}}
  }
});
