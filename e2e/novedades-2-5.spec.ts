// 2.5: cuotas, UF y dólares, metas de ahorro, tendencias y planillas.
import path from 'node:path';
import { expect, FIXTURES, teclear, test } from './ayuda';

const RESPALDO_24 = path.join(FIXTURES, 'respaldo-2-4.json');

test.beforeEach(async ({ page }) => {
  // mindicador.cl simulado (no salimos a internet en las pruebas).
  await page.route('https://mindicador.cl/api', (r) =>
    r.fulfill({
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        uf: { codigo: 'uf', valor: 40000, fecha: '2026-11-25T03:00:00.000Z' },
        dolar: { codigo: 'dolar', valor: 980, fecha: '2026-11-25T03:00:00.000Z' },
        euro: { codigo: 'euro', valor: 1100, fecha: '2026-11-25T03:00:00.000Z' },
      }),
    }),
  );
  await page.goto('#/ajustes');
  await page.locator('input[type=file][accept*="json"]').setInputFiles(RESPALDO_24);
  await page.getByRole('button', { name: 'Sí, restaurar' }).click();
  await expect(page.getByText('Respaldo restaurado')).toBeVisible();
});

test('compra en 3 cuotas: cada mes cuenta solo la cuota', async ({ page }) => {
  await page.goto('#/gasto/nuevo');
  await teclear(page, '300000');
  await page.getByLabel('Descripción').fill('Refrigerador');
  await page.getByRole('button', { name: 'CMR Falabella' }).click();
  await expect(page.getByText('Sin cuotas')).toBeVisible();
  await page.getByRole('button', { name: 'Más cuotas' }).click();
  await page.getByRole('button', { name: 'Más cuotas' }).click();
  await expect(page.getByText('En 3 cuotas')).toBeVisible();
  await expect(page.getByText('de $100.000 · la última llega en enero')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar gasto' }).click();
  await expect(page.getByText('Gasto guardado')).toBeVisible();

  await page.goto('#/gastos');
  const fila = page.locator('.list-row').filter({ hasText: 'Refrigerador' });
  await expect(fila).toContainText('cuota 1/3');
  await expect(fila).toContainText('$100.000');
  await fila.click();
  await expect(page.getByText('En 3 cuotas de $100.000')).toBeVisible();
  await expect(page.getByText(/Van 1 de 3 · la última llega en enero 2027/)).toBeVisible();

  // Resumen: el gasto real de noviembre sube solo la primera cuota
  await page.goto('#/');
  await expect(page.locator('.t-hero').first()).toHaveText('$764.365');
});

test('gasto en dólares: se convierte con el valor del día', async ({ page }) => {
  await page.goto('#/gasto/nuevo');
  await page.getByRole('button', { name: 'Moneda: pesos' }).click();
  await page.getByRole('button', { name: 'Dólar (US$)' }).click();
  for (const k of ['2', '0', ',', '5']) await page.locator(`.keypad button[aria-label="${k}"]`).click();
  await expect(page.getByLabel('Monto total')).toHaveText('US$ 20,5');
  await expect(page.getByText('= $20.090 · dólar a $980')).toBeVisible();
  await page.getByLabel('Descripción').fill('Suscripción');
  await page.getByRole('button', { name: 'Guardar gasto' }).click();
  await page.goto('#/gastos');
  await page.getByText('Suscripción').click();
  await expect(page.locator('.t-hero-64')).toHaveText('$20.090');
  await expect(page.getByText(/US\$ 20,5 a \$980/)).toBeVisible();
});

test('meta de ahorro con aportes a mano', async ({ page }) => {
  await page.goto('#/plata');
  await page.getByText('Crear meta').click();
  await page.getByLabel('Nombre de la meta').fill('Vacaciones');
  await page.getByLabel('Monto de la meta').fill('600000');
  await expect(page.getByText('Anotas tus aportes a mano en la meta.')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar meta' }).click();
  await expect(page.getByText('Meta creada · Vacaciones')).toBeVisible();
  await page.getByRole('button', { name: 'Aportar', exact: true }).click();
  await teclear(page, '150000', '.sheet');
  await page.getByRole('button', { name: 'Aportar $150.000' }).click();
  await expect(page.getByText('25 % de $600.000')).toBeVisible();
  await page.goto('#/plata');
  await expect(page.getByRole('button', { name: 'Meta Vacaciones' })).toContainText('$150.000 de $600.000');
});

test('meta en UF ligada a una cuenta', async ({ page }) => {
  await page.goto('#/meta/nueva');
  await page.getByLabel('Nombre de la meta').fill('Pie del depto');
  await page.getByRole('button', { name: 'UF', exact: true }).click();
  await page.getByLabel('Monto en UF').fill('100');
  await page.getByRole('button', { name: 'Mach', exact: true }).click();
  await expect(page.getByText('100 UF son $4.000.000 hoy.')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar meta' }).click();
  await expect(page.getByText(/El avance es el saldo estimado de Mach/)).toBeVisible();
  await expect(page.getByText(/Meta: 100 UF \(≈ \$4\.000\.000\)/)).toBeVisible();
});

test('tendencias: comparación a la misma fecha y por categoría', async ({ page }) => {
  await page.goto('#/');
  await page.getByRole('button', { name: 'Tendencias' }).click();
  await expect(page.getByRole('heading', { name: 'tendencias.' })).toBeVisible();
  await expect(page.getByText('Al 25 de noviembre')).toBeVisible();
  await expect(page.getByText('por categoría.')).toBeVisible();
  await expect(page.getByText('lo que te quedó.')).toBeVisible();
});

test('planillas de ingresos y presupuestos', async ({ page }) => {
  await page.goto('#/ajustes');
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Ingresos', exact: true }).click();
  const d = await descarga;
  expect(d.suggestedFilename()).toMatch(/^a-mano-ingresos-.*\.csv$/);
  const descarga2 = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Presupuestos', exact: true }).click();
  expect((await descarga2).suggestedFilename()).toMatch(/^a-mano-presupuestos-/);
});
