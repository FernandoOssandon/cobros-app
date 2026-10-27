import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de punta a punta: abren la app compilada (dist/) en un Chrome de celular.
 * Correr con `npm run e2e` (compila y prueba). La primera vez: `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173/',
    ...devices['Pixel 7'],
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    // Sin service worker: así cada prueba ve la versión recién compilada.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'celular', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
  },
});
