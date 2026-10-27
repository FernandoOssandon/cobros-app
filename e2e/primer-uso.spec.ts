import { BOLETA, expect, teclear, test } from './ayuda';

test('primer uso: tarjeta, personas, gasto compartido y resumen', async ({ page }) => {
  // Onboarding
  await page.goto('');
  await expect(page).toHaveURL(/#\/bienvenida/);
  await page.getByText('Agregar tarjeta').click();
  await page.getByLabel('Nombre', { exact: true }).fill('Visa BCI');
  await page.getByRole('button', { name: 'Guardar medio' }).click();
  await expect(page).toHaveURL(/#\/bienvenida/);
  await expect(page.getByText('Visa BCI', { exact: true })).toBeVisible();
  await page.getByText('Listo, a anotar').click();
  await expect(page.getByText('Mes en blanco.')).toBeVisible();

  // Dos personas
  await page.getByRole('button', { name: 'Personas' }).click();
  for (const [nombre, tel] of [['Camila Rojas', '+56 9 8123 4567'], ['Diego Fuentes', '']]) {
    await page.getByRole('button', { name: 'Persona', exact: true }).click();
    await page.getByLabel('Nombre', { exact: true }).fill(nombre);
    if (tel) await page.getByLabel('Teléfono').fill(tel);
    await page.getByText('Agregar persona').click();
  }

  // Gasto compartido con grupo nuevo, foto y "repetir cada mes"
  await page.getByRole('button', { name: 'Nuevo gasto' }).click();
  await teclear(page, '30000');
  await page.getByText('Listo').click();
  await page.getByLabel('Descripción').fill('Asado');
  await page.getByRole('button', { name: 'Comida', exact: true }).click();
  await page.getByRole('button', { name: 'Iguales', exact: true }).click();
  await page.locator('.pick', { hasText: 'Camila' }).click();
  await page.locator('.pick', { hasText: 'Diego' }).click();
  await expect(page.locator('.foot')).toContainText('Tu parte $10.000 · por cobrar $20.000');
  await page.getByRole('button', { name: 'Grupo o evento' }).click();
  await page.getByLabel('Nombre del grupo nuevo').fill('Viaje a Pucón');
  await page.getByRole('button', { name: 'Crear' }).click();
  await page.locator('input[type=file][accept="image/*"]').setInputFiles(BOLETA);
  await expect(page.getByText('boleta.jpg')).toBeVisible();
  await page.getByRole('switch', { name: 'Repetir cada mes' }).click();
  await page.getByRole('button', { name: 'Guardar gasto' }).click();
  await expect(page.getByText('Gasto guardado · $20.000 por cobrar')).toBeVisible();

  // Gasto que pagó otra persona
  await page.getByRole('button', { name: 'Nuevo gasto' }).click();
  await teclear(page, '16000');
  await page.getByText('Listo').click();
  await page.getByLabel('Descripción').fill('Uber a la casa');
  await page.getByRole('button', { name: 'Otra persona' }).click();
  await page.locator('.hscroll .pick', { hasText: 'Diego' }).first().click();
  await page.getByRole('button', { name: 'Iguales', exact: true }).click();
  await expect(page.locator('.foot')).toContainText('Le debes $8.000 a Diego');
  await page.getByRole('button', { name: 'Guardar gasto' }).click();
  await expect(page.getByText('Gasto guardado · le debes $8.000 a Diego')).toBeVisible();

  // Resumen: gasto real 18.000 (10.000 del asado + 8.000 del Uber)
  await page.goto('#/');
  const cuerpo = page.locator('body');
  await expect(cuerpo).toContainText('$18.000');
  await expect(cuerpo).toContainText('Salió de tus medios $30.000');
  await expect(cuerpo).toContainText('adelantaste $20.000');

  // Diego: me debe 10.000, le debo 8.000 → neto 2.000. Paga y queda a mano.
  await page.goto('#/personas?tab=in');
  await page.getByText('Diego Fuentes').click();
  await page.getByRole('button', { name: 'Pagó', exact: true }).click();
  await page.getByText('Todo · $2.000').click();
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(page.getByText('a mano, sin deudas')).toBeVisible();

  // Los datos sobreviven a una recarga
  await page.reload();
  await expect(page.getByText('a mano, sin deudas')).toBeVisible();
});
