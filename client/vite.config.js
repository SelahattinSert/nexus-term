import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Speech-to-text runs transformers.js inside a module worker (src/voice/sttWorker.js);
  // ES-format workers are required because onnxruntime-web uses dynamic imports.
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // Pre-bundling breaks onnxruntime-web's import.meta.url-relative WASM loading.
    exclude: ['@huggingface/transformers'],
  },
  build: {
    rolldownOptions: {
      // Two pages: the app itself and the live-share viewer for guests
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        share: resolve(import.meta.dirname, 'share.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
