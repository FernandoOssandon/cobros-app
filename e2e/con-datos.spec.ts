import fs from 'node:fs';
import { conDatos, expect, teclear, test } from './ayuda';

test.beforeEach(async ({ page }) => {
  await conDatos(page);
});

test('borrar un gasto y deshacer', async ({ page }) => {
  await page.goto('#/gasto/e1');
  await page.getByText('Borrar gasto').click();
  await page.getByRole('button', { name: 'Sí, borrar' }).click();
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await page.goto('#/gasto/e1');
  await expect(page.locator('h1')).toHaveText('Sushi con Cami y Javi');
});

test('buscar gastos', async ({ page }) => {
  await page.goto('#/gastos');
  const buscar = page.getByLabel('Buscar gasto o persona');
  await buscar.fill('pucón');
  await expect(page.locator('.list-row')).toHaveCount(2);
  await buscar.fill('zzz');
  await expect(page.getByText('Nada por aquí')).toBeVisible();
});

test('ponerle categoría a un gasto desde el detalle', async ({ page }) => {
  await page.goto('#/gasto/e9');
  await expect(page.getByText('Este gasto anda sin categoría.')).toBeVisible();
  await page.getByRole('button', { name: 'Comida', exact: true }).click();
  await expect(page.getByText('Este gasto anda sin categoría.')).toBeHidden();
});

test('confirmar un recurrente variable (la luz)', async ({ page }) => {
  await page.goto('#/');
  await page.getByText('¿Cuánto llegó?').first().click();
  await teclear(page, '28450', '.sheet');
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.goto('#/gastos');
  await expect(page.getByText('Luz de noviembre')).toBeVisible();
});

test('cobrar por WhatsApp deja el registro en el historial', async ({ page }) => {
  await page.goto('#/persona/p1/cobro');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Mandar por WhatsApp' }).click();
  expect((await popup).url()).toContain('wa.me/');
  await expect(page).toHaveURL(/#\/persona\/p1$/, { timeout: 5000 });
  await expect(page.locator('.aviso')).toHaveCount(2);
});

test('exportar respaldo v4', async ({ page }) => {
  await page.goto('#/ajustes');
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar' }).click();
  const r = JSON.parse(fs.readFileSync((await (await descarga).path())!, 'utf8'));
  expect(r.version).toBe(4);
  expect(r.cuentas).toEqual([]);
  expect(r.gastos).toHaveLength(13);
  expect(r.recurrentes).toHaveLength(5);
});

test('anotar los últimos 4 dígitos de una tarjeta', async ({ page }) => {
  await page.goto('#/medios');
  await page.locator('.card').filter({ hasText: 'Crédito' }).first().click();
  await page.getByLabel('Últimos 4 dígitos').fill('48a21');
  await expect(page.getByLabel('Últimos 4 dígitos')).toHaveValue('4821');
  await page.getByRole('button', { name: 'Guardar medio' }).click();
  await expect(page.getByText('•••• 4821')).toBeVisible();
});
