import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) {
          return;
        }
        warn(warning);
      }
    }
  },
  server: {
    allowedHosts: ["huntrr-dailyy.ai.studio"],
    hmr: false,
  },
  preview: {
    allowedHosts: ["huntrr-dailyy.ai.studio"],
  }
});
