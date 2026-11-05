// 2.6: tarjetas con cupo, débito ligado a su cuenta y pago de tarjetas.
import path from 'node:path';
import { expect, FIXTURES, teclear, test } from './ayuda';

test.beforeEach(async ({ page }) => {
  await page.goto('#/ajustes');
  await page.locator('input[type=file][accept*="json"]').setInputFiles(path.join(FIXTURES, 'respaldo-2-4.json'));
  await page.getByRole('button', { name: 'Sí, restaurar' }).click();
  await expect(page.getByText('Respaldo restaurado')).toBeVisible();
});

test('el débito ligado a la Cuenta RUT baja su saldo', async ({ page }) => {
  await page.goto('#/cuenta/rut');
  await expect(page.locator('.t-hero-58')).toHaveText('$1.936.300');
  await page.goto('#/medio/deb');
  await page.getByRole('button', { name: 'Cuenta RUT', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar medio' }).click();
  await expect(page.getByText('sale de Cuenta RUT')).toBeVisible();
  await page.goto('#/cuenta/rut');
  // Jumbo (23 nov) y Farmacia (22 nov) se pagaron con débito después del cuadre del 20
  await expect(page.locator('.t-hero-58')).toHaveText('$1.880.930');
  await page.getByText('Jumbo').click();
  await expect(page).toHaveURL(/#\/gasto\//);
});

test('cupo de la tarjeta, lo usado y pagarla', async ({ page }) => {
  await page.goto('#/medio/visa');
  await page.getByLabel('Cupo').fill('1000000');
  await page.getByLabel('Usado hoy').fill('300000');
  await page.getByRole('button', { name: 'Guardar medio' }).click();
  const visa = page.locator('div.card').filter({ hasText: 'Visa BCI' });
  await expect(visa).toContainText('Usado $300.000 de $1.000.000');
  await expect(visa).toContainText('disponible $700.000');
  await visa.getByRole('button', { name: 'Pagar Visa BCI' }).click();
  await page.getByRole('button', { name: 'Cuenta RUT', exact: true }).click();
  await teclear(page, '100000', '.sheet');
  await page.getByRole('button', { name: 'Anotar pago' }).click();
  await expect(page.getByText('Pago anotado · $100.000 a Visa BCI desde Cuenta RUT')).toBeVisible();
  await expect(visa).toContainText('Usado $200.000');
  await page.goto('#/cuenta/rut');
  await expect(page.getByText('Pago Visa BCI')).toBeVisible();
});

test('un pago por transferencia entra a la cuenta elegida', async ({ page }) => {
  await page.goto('#/persona/p1/pago');
  await teclear(page, '5000');
  await page.getByRole('button', { name: 'Cuenta RUT', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  await page.goto('#/cuenta/rut');
  await expect(page.getByText(/Te pagó Camila/)).toBeVisible();
});
