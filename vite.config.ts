import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { appShellPlugin } from './src/pwa/appShellPlugin';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), appShellPlugin()],
    build: {
      rollupOptions: {
        output: {
          advancedChunks: {
            groups: [
              {
                name: 'vendor-vite-runtime',
                test: /vite\/preload-helper|vite\/modulepreload-polyfill/,
              },
              {
                name: 'vendor-react',
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              },
              {
                name: 'vendor-firebase',
                test: /[\\/]node_modules[\\/](firebase|@firebase)[\\/]/,
              },
              {
                name: 'vendor-documents',
                test: /[\\/]node_modules[\\/](xlsx|docx|jspdf|jspdf-autotable|mammoth|jszip|fflate|pako)[\\/]/,
              },
            ],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
