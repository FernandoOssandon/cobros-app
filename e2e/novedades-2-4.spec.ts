// 2.4: períodos por tarjeta, presupuestos e ingresos.
import path from 'node:path';
import { expect, FIXTURES, test } from './ayuda';
import type { Page } from '@playwright/test';

const RESPALDO_24 = path.join(FIXTURES, 'respaldo-2-4.json');

async function con24(page: Page) {
  await page.goto('#/ajustes');
  await page.locator('input[type=file][accept*="json"]').setInputFiles(RESPALDO_24);
  await page.getByRole('button', { name: 'Sí, restaurar' }).click();
  await expect(page.getByText('Respaldo restaurado')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await con24(page);
});

test('período de la tarjeta: Resumen y Gastos comparten la selección', async ({ page }) => {
  await page.goto('#/');
  await page.getByRole('button', { name: 'Período: noviembre 2026' }).click();
  await page.getByRole('dialog').getByText('CMR Falabella').click();
  await expect(page.getByRole('button', { name: 'Período: Falabella · 14 nov – 13 dic' })).toBeVisible();
  await expect(page.getByText('Llegará en tu estado de cuenta')).toBeVisible();
  await expect(page.getByText('$74.580')).toBeVisible();
  await expect(page.getByText('Cierra en 18 días · 13 dic')).toBeVisible();
  await page.getByRole('button', { name: 'Ver en Gastos' }).click();
  await expect(page.getByRole('button', { name: 'Período: Falabella · 14 nov – 13 dic' })).toBeVisible();
  await expect(page.locator('.list-row')).toHaveCount(2);
  // El período anterior ya se facturó
  await page.getByRole('button', { name: 'Período anterior' }).click();
  await expect(page.getByText('Falabella · sábanas')).toBeVisible();
  await expect(page.getByText(/facturado el 13 nov/)).toBeVisible();
});

test('tocar una tarjeta de crédito en "tus medios." elige su período', async ({ page }) => {
  await page.goto('#/');
  await page.locator('.card').filter({ hasText: 'CMR Falabella' }).click();
  await expect(page.getByText('cargos del período.')).toBeVisible();
  await expect(page.getByText('Todo tuyo')).toBeHidden();
  await expect(page.getByText('$22.990 pendientes')).toBeVisible();
});

test('ingresos y presupuestos en el Resumen', async ({ page }) => {
  await page.goto('#/');
  await expect(page.getByText('Te quedan', { exact: true })).toBeVisible();
  await expect(page.getByText('Sueldo llegó el 20 nov a Cuenta RUT · 1 ingreso suelto')).toBeVisible();
  await expect(page.getByText('presupuestos en riesgo.')).toBeVisible();
  await expect(page.getByText('te pasaste por $6.750')).toBeVisible();
  await page.getByText('Ver los 3').click();
  await expect(page.getByText('cerca del límite')).toBeVisible();
  await expect(page.getByText('vas bien')).toBeVisible();
});

test('nuevo presupuesto por categoría reemplaza al que ya había', async ({ page }) => {
  await page.goto('#/presupuesto/nuevo');
  await page.getByText('Algunas categorías').click();
  await page.getByRole('button', { name: 'Salidas', exact: true }).click();
  await page.getByRole('button', { name: 'Mes', exact: true }).click();
  await expect(page.getByText('Ya tienes «Salidas» con lo mismo y por mes ($40.000). Si guardas, lo reemplazas.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Límite' }).fill('60000');
  await expect(page.getByText('Así quedaría hoy')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar presupuesto' }).click();
  await expect(page.getByText('Presupuesto guardado · $60.000 al mes')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Presupuesto Salidas' })).toHaveCount(1);
  await expect(page.getByText('$46.750')).toBeVisible();
  await expect(page.getByText('de $60.000')).toBeVisible();
});

test('ingreso suelto: suma a la cuenta y al mes, y se puede borrar', async ({ page }) => {
  await page.goto('#/ingresos');
  await page.getByRole('button', { name: 'Ingreso', exact: true }).click();
  await page.getByRole('button', { name: 'Suelto' }).click();
  await page.getByLabel('Monto').fill('35000');
  await page.getByLabel('¿De qué fue?').fill('Reembolso Isapre');
  await page.getByRole('button', { name: 'Tenpo' }).click();
  await expect(page.getByText('Suma $35.000 a Tenpo. No es gasto ni aparece en Gastos.')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar ingreso' }).click();
  await expect(page.getByText('Ingreso anotado · +$35.000 en Tenpo')).toBeVisible();
  await expect(page.getByText('$1.605.000')).toBeVisible();
  await page.getByText('Reembolso Isapre').click();
  await page.getByText('Borrar ingreso').click();
  await page.getByRole('button', { name: 'Sí, borrar' }).click();
  await expect(page.getByText('$1.570.000')).toBeVisible();
});

test('sueldo fijo nuevo: se anota solo y aparece en Recurrentes', async ({ page }) => {
  await page.goto('#/ingreso/nuevo');
  await page.getByLabel('Nombre').fill('Honorarios');
  await page.getByLabel('Monto').fill('200000');
  for (let i = 0; i < 20; i++) await page.getByRole('button', { name: 'Día anterior' }).click();
  await expect(page.getByText('Se anota solo cada mes, el día 10.')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar ingreso' }).click();
  await expect(page.getByText('Listo. Honorarios se anota solo el día 10.')).toBeVisible();
  // El día 10 ya pasó este mes: llegó
  await page.goto('#/ingresos');
  await expect(page.getByText('llegó el 10 nov')).toBeVisible();
  await expect(page.getByText('$1.770.000')).toBeVisible();
  await page.goto('#/recurrentes');
  await expect(page.getByText('ingresos fijos.')).toBeVisible();
  await expect(page.getByText('+$200.000')).toBeVisible();
});

test('transferencia de alguien que no está en Personas se anota como ingreso', async ({ page }) => {
  await page.evaluate(async () => {
    const req = indexedDB.open('me-debes');
    const db: IDBDatabase = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const tx = db.transaction('ajustes', 'readwrite');
    const st = tx.objectStore('ajustes');
    const a = await new Promise<Record<string, unknown>>((r) => {
      const q = st.get('main');
      q.onsuccess = () => r(q.result);
    });
    st.put({ ...a, correo: { url: 'https://x', clave: 'k', ultimaLectura: new Date().toISOString() } });
    await new Promise((r) => (tx.oncomplete = r));
  });
  await page.goto('#/correo');
  await expect(page.getByText('No está en Personas · se anota como ingreso en Cuenta RUT')).toBeVisible();
  await page.getByRole('button', { name: 'Anotar ingreso' }).click();
  await expect(page.getByText('Ingreso anotado · +$180.000 en Cuenta RUT')).toBeVisible();
  await page.goto('#/ingresos');
  await expect(page.getByText('Transferencia de Rodrigo Silva')).toBeVisible();
});
