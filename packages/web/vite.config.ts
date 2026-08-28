/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';
import webfontDownload from 'vite-plugin-webfont-dl';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    rollupOptions: {
      plugins: [
        mode === 'analyze' &&
          visualizer({
            open: true,
            filename: 'dist/stats.html',
            gzipSize: true,
            brotliSize: true,
          }),
      ],
    },
  },
  resolve: { alias: { './runtimeConfig': './runtimeConfig.browser' } },
  plugins: [
    react(),
    svgr(),
    nodePolyfills({
      globals: {
        Buffer: true,
        process: true,
      },
    }),
    webfontDownload(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
      },
      injectRegister: 'auto',
      workbox: {
        globDirectory: 'dist',
        // GeoJSON intentionally excluded from precache (geojson/ is ~9MB total)
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        swDest: 'dist/sw.js',
        maximumFileSizeToCacheInBytes: 5000000,
      },
      manifest: {
        name: 'Mimir',
        short_name: 'Mimir',
        description: 'Chat with your documents',
        start_url: '/chat',
        display: 'minimal-ui',
        theme_color: '#1C256C',
        background_color: '#FFFFFF',
        icons: [
          {
            src: '/favicon.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/images/mimir-logo.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'use-case-builder',
          include: ['tests/use-case-builder/**/*.test.{ts,tsx}'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'web-ui',
          include: [
            'tests/components/**/*.test.{ts,tsx}',
            'tests/hooks/**/*.test.{ts,tsx}',
            'tests/utils/**/*.test.{ts,tsx}',
          ],
          environment: 'jsdom',
          globals: true,
          setupFiles: [],
        },
      },
    ],
  },
}));
