import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: 'BerryScan · Control de calidad de arándanos',
        short_name: 'BerryScan',
        description: 'Detecta arándanos deshidratados (arrugamiento) con visión artificial, directamente en el celular.',
        lang: 'es',
        theme_color: '#ffffff',
        background_color: '#f6f6f8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // La app, el modelo (6 MB) y el motor WebAssembly (~15 MB, 4 MB comprimido) quedan guardados para usarla sin conexión.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,onnx,wasm,woff2}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        globIgnores: ['og.png'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  define: {
    __VERSION__: JSON.stringify(pkg.version),
    __FECHA__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
})
