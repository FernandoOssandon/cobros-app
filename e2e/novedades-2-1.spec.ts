import { BOLETA, conDatos, expect, test } from './ayuda';

test.beforeEach(async ({ page }) => {
  await conDatos(page);
});

test('editar la cuota de un cobro recurrente desde la persona', async ({ page }) => {
  await page.goto('#/persona/p2');
  await page.locator('.bub.cargo', { hasText: 'Cuota mensual' }).click();
  const hoja = page.getByRole('dialog', { name: 'Cargo' });
  await expect(hoja).toContainText('Viene de “Cuota de Diego”. Cambiarla aquí no toca las próximas');
  await hoja.getByLabel('Monto').fill('15000');
  await hoja.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cargo actualizado')).toBeVisible();
  await expect(page.locator('.bub.cargo', { hasText: 'Cuota mensual' })).toContainText('+$15.000');

  // Desde la misma hoja se llega al recurrente
  await page.locator('.bub.cargo', { hasText: 'Cuota mensual' }).click();
  await page.getByRole('button', { name: 'Ver el cobro recurrente' }).click();
  await expect(page).toHaveURL(/#\/recurrente\/r5$/);
});

test('borrar la cuota de un cobro recurrente y deshacer', async ({ page }) => {
  await page.goto('#/persona/p2');
  const cuota = page.locator('.bub.cargo', { hasText: 'Cuota mensual' });
  await cuota.click();
  await page.getByRole('button', { name: 'Borrar este cargo' }).click();
  await expect(cuota).toHaveCount(0);
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(cuota).toHaveCount(1);
});

test('un gasto recurrente se edita y lleva a su plantilla', async ({ page }) => {
  await page.goto('#/gasto/e12');
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(page.getByText('editar gasto.')).toBeVisible();
  await page.getByLabel('Descripción').fill('Arriendo noviembre');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('h1')).toHaveText('Arriendo noviembre');
  await page.getByText('Editar el recurrente').click();
  await expect(page).toHaveURL(/#\/recurrente\/r1$/);
});

test('agregar, cambiar y quitar la foto desde el detalle', async ({ page }) => {
  await page.goto('#/gasto/e3');
  await expect(page.locator('img[alt="Boleta"]')).toHaveCount(0);
  await page.getByLabel('Elegir foto de la boleta').setInputFiles(BOLETA);
  await expect(page.locator('img[alt="Boleta"]')).toBeVisible();
  await expect(page.getByText('Foto guardada')).toBeVisible();

  await page.getByLabel('Elegir foto de la boleta').setInputFiles(BOLETA);
  await expect(page.getByText('Foto cambiada')).toBeVisible();

  await page.getByRole('button', { name: 'Quitar', exact: true }).click();
  await expect(page.locator('img[alt="Boleta"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.locator('img[alt="Boleta"]')).toBeVisible();
});

test('crear, renombrar, terminar y borrar un grupo', async ({ page }) => {
  await page.goto('#/grupos');
  await page.getByRole('button', { name: 'Nuevo' }).click();
  await page.getByLabel('Nombre del grupo').fill('Depto');
  await page.getByRole('button', { name: 'Crear grupo' }).click();
  await expect(page.locator('.card', { hasText: 'Depto' })).toBeVisible();

  // Renombrar y terminar el viaje
  await page.locator('.card', { hasText: 'Viaje a Pucón' }).click();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByLabel('Nombre del grupo').fill('Pucón 2026');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('h1')).toHaveText('Pucón 2026');
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByRole('button', { name: 'Marcar como terminado' }).click();
  await expect(page.getByText('Grupo terminado', { exact: true })).toBeVisible();

  // Terminado: ya no aparece al anotar un gasto
  await page.goto('#/gasto/nuevo');
  await page.getByRole('button', { name: 'Grupo o evento' }).click();
  await expect(page.getByRole('dialog')).not.toContainText('Pucón 2026');
  await expect(page.getByRole('dialog')).toContainText('Cumpleaños de la Vale');

  // Borrar: los gastos se quedan, sin grupo. Deshacer los devuelve.
  await page.goto('#/grupos');
  await expect(page.getByText('terminados.')).toBeVisible();
  await page.locator('.card', { hasText: 'Pucón 2026' }).click();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByRole('button', { name: 'Borrar grupo' }).click();
  await expect(page.getByText('Los 4 gastos se quedan como están')).toBeVisible();
  await page.getByRole('button', { name: 'Sí, borrar' }).click();
  await expect(page).toHaveURL(/#\/grupos$/);
  await expect(page.locator('.card', { hasText: 'Pucón 2026' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.locator('.card', { hasText: 'Pucón 2026' })).toBeVisible();
  await page.goto('#/gasto/e6');
  await expect(page.getByText('Pucón 2026')).toBeVisible();
});
