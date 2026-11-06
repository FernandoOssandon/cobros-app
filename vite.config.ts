/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// base relativa: la app funciona en la raíz de un dominio o dentro de una subcarpeta
// (por ejemplo GitHub Pages). La navegación usa rutas con # (HashRouter).
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': la versión nueva espera hasta que toques "Actualizar" (aviso en la app).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'a mano',
        short_name: 'a mano',
        description: 'Tus gastos, lo que te deben y dónde está tu plata.',
        lang: 'es-CL',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F3F0E6',
        theme_color: '#F3F0E6',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // "Compartir → a mano." con una cartola en Excel (lo recibe public/sw-compartir.js).
        share_target: {
          action: 'compartir',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [
              {
                name: 'archivo',
                accept: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/octet-stream', '.xlsx'],
              },
            ],
          },
        },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['sw-transicion.js', 'sw-compartir.js'],
        importScripts: ['sw-transicion.js', 'sw-compartir.js'],
      },
    }),
  ],
  test: {
    environment: 'node',
    // Las pruebas de punta a punta (e2e/) las corre Playwright, no Vitest.
    include: ['src/**/*.test.ts'],
  },
})
