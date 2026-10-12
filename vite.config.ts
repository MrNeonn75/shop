import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    open: false,
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (normalized.includes('/node_modules/')) {
            if (
              normalized.includes('/node_modules/react/') ||
              normalized.includes('/node_modules/react-dom/') ||
              normalized.includes('/node_modules/react-router-dom/') ||
              normalized.includes('/node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
            if (normalized.includes('/node_modules/lucide-react/')) {
              return 'vendor-icons';
            }
            if (normalized.includes('/node_modules/@radix-ui/')) {
              return 'vendor-radix';
            }
            if (normalized.includes('/node_modules/@tanstack/')) {
              return 'vendor-tanstack';
            }
            if (
              normalized.includes('/node_modules/i18next/') ||
              normalized.includes('/node_modules/react-i18next/')
            ) {
              return 'vendor-i18n';
            }
            if (
              normalized.includes('/node_modules/recharts/') ||
              normalized.includes('/node_modules/d3-') ||
              normalized.includes('/node_modules/victory-vendor/')
            ) {
              return 'vendor-charts';
            }
            if (
              normalized.includes('/node_modules/zod/') ||
              normalized.includes('/node_modules/date-fns/') ||
              normalized.includes('/node_modules/axios/') ||
              normalized.includes('/node_modules/zustand/')
            ) {
              return 'vendor-utils';
            }
          }
          if (
            normalized.includes('/src/shared/adapters/mock/') ||
            normalized.includes('/src/shared/adapters/mockData/')
          ) {
            return 'demo-seeds';
          }
        },
      },
    },
  },
});

