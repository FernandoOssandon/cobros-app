// 3.2: ¿cómo termino el mes? Hasta el sueldo y el cierre del ciclo.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, FIXTURES, test } from './ayuda';

const RESPALDO = path.join(FIXTURES, 'respaldo-2-7.json');

/** Los datos de la 2.7 (sueldo el 20, hoy 25 nov) con un gasto del ciclo anterior completo. */
async function restaurar(page: Page) {
  const datos = JSON.parse(readFileSync(RESPALDO, 'utf8'));
  datos.gastos.push({ ...datos.gastos[0], id: 'g-octubre', descripcion: 'Almuerzo de octubre', fecha: '2026-10-22', creado: '2026-10-22T13:00:00.000Z' });
  await page.goto('#/ajustes');
  await page.locator('input[type=file][accept*="json"]').setInputFiles({ name: 'respaldo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(datos)) });
  await page.getByRole('button', { name: 'Sí, restaurar' }).click();
  await expect(page.getByText('Respaldo restaurado')).toBeVisible();
}

const pesos = (t: string) => Number(t.replace(/[^\d−-]/g, '').replace('−', '-'));

test('hasta el sueldo: cuánto por día, la cuenta y qué cuentas cuentan', async ({ page }) => {
  await restaurar(page);
  await page.goto('#/');
  const tarjeta = page.getByTestId('hasta-sueldo');
  await expect(tarjeta).toContainText('Hasta el sueldo');
  await expect(tarjeta).toContainText('25 días · Sueldo llega el 20 dic');
  await tarjeta.click();
  await expect(page).toHaveURL(/#\/proyeccion$/);
  await expect(page.getByRole('heading', { name: 'hasta el sueldo.' })).toBeVisible();

  // Lo que tienes: la cuenta corriente y el efectivo (las remuneradas son ahorro).
  const caja = page.locator('div', { has: page.getByText('Lo que tienes', { exact: true }) }).last();
  await expect(caja).toContainText('Cuenta Corriente Santander');
  await expect(caja).not.toContainText('Mach');
  await expect(caja).toContainText('Ya gastado con tarjeta');
  await expect(caja).toContainText('Visa BCI');
  // Lo que viene: el arriendo (día 5) y la luz de diciembre, antes del 20; la de noviembre sigue por confirmar.
  await expect(page.getByTestId('viene').filter({ hasText: 'Arriendo' })).toContainText('5 dic');
  await expect(page.getByTestId('viene').filter({ hasText: 'Luz' }).filter({ hasText: '10 dic' })).toContainText('monto estimado');
  await expect(page.getByTestId('viene').filter({ hasText: 'Luz' }).filter({ hasText: 'por confirmar' })).toContainText('10 nov');

  // Por día = lo que queda / 25 días.
  const quedan = async () => pesos((await page.getByText(/^(Te quedan|Te faltan)$/).locator('..').innerText()).split('\n')[1]);
  const antes = await quedan();
  if (antes > 0) expect(pesos(await page.getByTestId('por-dia').innerText())).toBe(Math.floor(antes / 25));

  // Mach pasa a contar: lo que queda sube en su saldo.
  await page.getByRole('button', { name: 'Elegir cuentas' }).first().click();
  const sw = page.getByRole('switch', { name: 'Mach cuenta para el mes' });
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(caja).toContainText('Mach');
  const despues = await quedan();
  expect(despues).toBeGreaterThan(antes);
  expect(pesos(await page.getByTestId('por-dia').innerText())).toBe(Math.floor(despues / 25));
});

test('llegó el sueldo: cerrar el ciclo anterior', async ({ page }) => {
  await restaurar(page);
  await page.goto('#/');
  const aviso = page.getByTestId('aviso-cierre');
  await expect(aviso).toContainText('Llegó el sueldo: cierra el ciclo anterior');
  await expect(aviso).toContainText('20 oct – 19 nov');
  await aviso.getByRole('button', { name: 'Cerrar el ciclo' }).click();
  await expect(page).toHaveURL(/#\/cierre$/);
  await expect(page.getByText('20 oct – 19 nov · de sueldo a sueldo')).toBeVisible();
  const numeros = page.getByTestId('cierre-numeros');
  await expect(numeros).toContainText('Ingresos');
  await expect(numeros).toContainText('$1.570.000');
  await expect(numeros).toContainText(/Te quedó|Gastaste de más/);
  await expect(page.getByText('por ordenar.')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar el ciclo' }).click();
  await expect(page.getByText(/^Ciclo cerrado/)).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);
  await expect(aviso).toHaveCount(0);
  // Se puede volver a ver desde "hasta el sueldo".
  await page.getByTestId('hasta-sueldo').click();
  await page.getByRole('button', { name: /Cierre del ciclo anterior/ }).click();
  await expect(page.getByText(/ya lo cerraste/)).toBeVisible();
});
