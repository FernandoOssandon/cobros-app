import { test as base, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.join(aqui, 'fixtures');
export const RESPALDO = path.join(FIXTURES, 'respaldo-ejemplo.json');
export const BOLETA = path.join(FIXTURES, 'boleta.jpg');

/** Los datos de ejemplo están pensados para este día (Luz por confirmar, Netflix ya anotado, etc.). */
export const HOY = '2026-11-25T12:00:00-03:00';

/**
 * `test` con dos extras:
 * - congela la fecha en HOY;
 * - falla la prueba si la app tira un error en la consola.
 */
export const test = base.extend<{ errores: string[] }>({
  errores: [
    async ({ page }, use) => {
      const errores: string[] = [];
      page.on('pageerror', (e) => errores.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
      await page.clock.setFixedTime(HOY);
      // WhatsApp: no salimos a internet, solo miramos a dónde iba el enlace.
      await page.context().route(/wa\.me|api\.whatsapp\.com/, (r) => r.fulfill({ body: 'ok' }));
      await use(errores);
      expect(errores, 'errores en la consola').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/** Carga el respaldo de ejemplo (5 personas, 13 gastos, 5 recurrentes, 2 grupos) desde Ajustes. */
export async function conDatos(page: Page) {
  await page.goto('#/ajustes');
  await page.locator('input[type=file][accept*="json"]').setInputFiles(RESPALDO);
  await page.getByRole('button', { name: 'Sí, restaurar' }).click();
  await expect(page.getByText('Respaldo restaurado')).toBeVisible();
}

/** Escribe un monto con el teclado numérico de la app. */
export async function teclear(page: Page, monto: string, dentroDe = '') {
  for (const k of monto) await page.locator(`${dentroDe} .keypad button[aria-label="${k}"]`).click();
}
