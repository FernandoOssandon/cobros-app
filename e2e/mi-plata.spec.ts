import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, FIXTURES, teclear, test } from './ayuda';

const RESPALDO_PLATA = path.join(FIXTURES, 'respaldo-mi-plata.json');
const CORREOS = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'correos-ejemplo.json'), 'utf8'));

/** Respaldo con Mi plata: Mach, Tenpo, Mercado Pago, Cuenta RUT, efectivo y un depósito a plazo. */
async function conPlata(page: Page) {
  await page.goto('#/ajustes');
  await page.locator('input[type=file][accept*="json"]').setInputFiles(RESPALDO_PLATA);
  await page.getByRole('button', { name: 'Sí, restaurar' }).click();
  await expect(page.getByText('Respaldo restaurado')).toBeVisible();
}

/** El script de Gmail, simulado: responde con los correos de ejemplo. */
async function scriptFalso(page: Page, clave = 'una-clave-larga') {
  await page.context().route(/script\.google\.com/, async (r) => {
    const body = JSON.parse(r.request().postData() ?? '{}');
    await r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(body.clave === clave ? { ok: true, cuenta: 'sebastian.mora@gmail.com', mensajes: CORREOS } : { ok: false, error: 'clave' }),
    });
  });
}

async function conectar(page: Page, clave = 'una-clave-larga') {
  await page.goto('#/correo/conectar');
  await page.getByRole('button', { name: 'Conectar Gmail' }).click();
  await page.getByLabel('URL del script').fill('https://script.google.com/macros/s/prueba/exec');
  await page.getByLabel('Clave').fill(clave);
  await page.getByRole('button', { name: 'Probar y conectar' }).click();
}

test.beforeEach(async ({ page }) => {
  await conPlata(page);
});

test('patrimonio y desglose', async ({ page }) => {
  await page.goto('#/plata');
  await expect(page.locator('.t-pat')).toHaveText('$4.395.360');
  const fila = (n: string) => page.locator('.pat-row', { hasText: n });
  await expect(fila('Ahorros')).toContainText('3 cuentas y 1 depósito a plazo');
  await expect(fila('Ahorros')).toContainText('$4.237.500');
  await expect(fila('Tarjetas por pagar')).toContainText('−$394.390');
  await expect(page.getByText('Que tu banco te avise y la app anote')).toBeVisible();
  await expect(page.locator('.card', { hasText: 'Banco Estado' })).toContainText('faltan 37 días');
  await expect(page.locator('.card', { hasText: 'Banco Estado' })).toContainText('$2.027.000');
  // "Te deben" lleva a Personas
  await fila('Te deben').click();
  await expect(page).toHaveURL(/#\/personas\?tab=in/);
});

test('cuenta nueva, depositar desde la Cuenta RUT y cuadrar', async ({ page }) => {
  await page.goto('#/plata');
  await page.getByRole('button', { name: 'Agregar cuenta' }).click();
  await page.getByRole('button', { name: 'Mercado Pago' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Fintual');
  await page.getByRole('button', { name: 'Inversión' }).click();
  await page.getByLabel('Tasa').fill('6');
  await page.getByLabel('Saldo hoy').fill('500000');
  await page.getByRole('button', { name: 'Guardar cuenta' }).click();
  await expect(page.locator('h1')).toHaveText('fintual.');
  await expect(page.locator('.t-hero-58')).toHaveText('$500.000');

  await page.getByRole('button', { name: 'Depositar' }).click();
  await teclear(page, '100000', '.sheet');
  await expect(page.locator('.sheet')).toContainText('En Cuenta RUT quedan $386.300');
  await page.locator('.sheet').getByRole('button', { name: 'Depositar' }).click();
  await expect(page.getByText('Depositaste $100.000 en Fintual')).toBeVisible();
  await expect(page.locator('.t-hero-58')).toHaveText('$600.000');
  await expect(page.locator('.mov-row', { hasText: 'Depósito desde Cuenta RUT' })).toContainText('+$100.000');

  // No se puede depositar más de lo que hay en la cuenta de origen
  await page.getByRole('button', { name: 'Depositar' }).click();
  await teclear(page, '999999', '.sheet');
  await expect(page.locator('.sheet').getByRole('button', { name: 'Depositar' })).toBeDisabled();
  await page.locator('.sheet').getByRole('button', { name: 'Depositar' }).click({ force: true });
  await expect(page.getByText('No alcanza el saldo')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByText('Cuadrar con el saldo real').click();
  await teclear(page, '603000', '.sheet');
  await expect(page.locator('.sheet')).toContainText('Estimábamos $600.000 · diferencia +$3.000');
  await page.locator('.sheet').getByRole('button', { name: 'Cuadrar' }).click();
  await expect(page.getByText('Cuadrado · diferencia de +$3.000')).toBeVisible();
  await expect(page.locator('.mov-row', { hasText: 'Ajuste al cuadrar' })).toContainText('+$3.000');

  // La Cuenta RUT quedó con $100.000 menos
  await page.goto('#/plata');
  await expect(page.locator('.pat-row', { hasText: 'Cuentas vista' })).toContainText('$386.300');
});

test('cuadrar el efectivo desde Mi plata', async ({ page }) => {
  await page.goto('#/plata');
  await page.locator('.pat-row', { hasText: 'Efectivo' }).click();
  await expect(page.locator('.sheet')).toContainText('¿Cuánto tienes en la billetera?');
  await teclear(page, '25000', '.sheet');
  await page.locator('.sheet').getByRole('button', { name: 'Cuadrar' }).click();
  await expect(page.locator('.pat-row', { hasText: 'Efectivo' })).toContainText('$25.000');
});

test('nuevo depósito a plazo', async ({ page }) => {
  await page.goto('#/deposito/nuevo');
  await page.getByLabel('Monto').fill('1500000');
  await page.getByRole('button', { name: 'Santander' }).click();
  await page.getByRole('button', { name: '180 d' }).click();
  await expect(page.getByText('Lunes 24 may 2027')).toBeVisible();
  await expect(page.getByText('$1.540.500')).toBeVisible();
  await page.getByRole('switch', { name: 'Renovar al vencer' }).click();
  await page.getByRole('button', { name: 'Guardar depósito' }).click();
  await expect(page).toHaveURL(/#\/plata/);
  const card = page.locator('.card', { hasText: 'Santander' });
  await expect(card).toContainText('180 días · 0,45% cada 30 días · se renueva');
  await expect(card).toContainText('$1.540.500');
  // Cobrarlo a la Cuenta RUT
  await card.click();
  await page.getByRole('button', { name: 'Lo cobré antes' }).click();
  await page.getByRole('button', { name: 'Pasar $1.540.500' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('.pat-row', { hasText: 'Cuentas vista' })).toContainText('$2.026.800');
});

test('conectar Gmail y revisar lo detectado', async ({ page }) => {
  await scriptFalso(page);
  // Clave equivocada: error legible y no queda conectado
  await conectar(page, 'otra-clave-mala');
  await expect(page.getByRole('alert')).toContainText('La clave no coincide');
  await page.keyboard.press('Escape');

  await conectar(page);
  await expect(page).toHaveURL(/#\/correo$/);
  const items = page.getByTestId('detectado');
  await expect(items).toHaveCount(5); // el estado de cuenta se ignora
  await expect(page.getByText('sebastian.mora@gmail.com')).toBeVisible();

  const item = (t: string) => items.filter({ hasText: t });
  await expect(item('Líder Express')).toContainText('Débito Banco Estado · Comida (sugerida)');
  await expect(item('Copec Av. Grecia')).toContainText('Visa BCI · Transporte (sugerida)');
  await expect(item('Jumbo Bilbao')).toContainText('Ya anotaste Jumbo por $42.380 el 23 nov. ¿Es el mismo?');
  await expect(item('Camila Rojas')).toContainText('Se anota como pago de Camila · te debe $20.475');

  // Anotar → gasto nuevo
  await item('Líder Express').getByRole('button', { name: 'Anotar' }).click();
  await expect(page.getByText('Anotado · Líder Express $18.450')).toBeVisible();
  // Es el mismo → no duplica
  await item('Jumbo Bilbao').getByRole('button', { name: 'Es el mismo' }).click();
  await expect(page.getByText('Listo, no se duplica')).toBeVisible();
  // Transferencia → pago de Camila
  await item('Camila Rojas').getByRole('button', { name: 'Anotar pago' }).click();
  await expect(page.getByText('Pago anotado · $12.000')).toBeVisible();
  // Descartar y deshacer
  await item('Copec').getByRole('button', { name: 'Descartar' }).click();
  await expect(item('Copec')).toHaveCount(0);
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(item('Copec')).toHaveCount(1);
  // Editar → Nuevo gasto precargado
  await item('Spotify').getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByText('nuevo gasto.')).toBeVisible();
  await expect(page.getByLabel('Monto total')).toContainText('$6.500');
  await expect(page.getByLabel('Descripción')).toHaveValue('Spotify');
  await page.getByRole('button', { name: 'Guardar gasto' }).click();
  await expect(page.getByText('Gasto guardado')).toBeVisible();
  await page.goto('#/correo');
  await expect(items).toHaveCount(1);

  // Los anotados quedaron donde corresponde
  await page.goto('#/gastos');
  await expect(page.getByText('Líder Express')).toBeVisible();
  await expect(page.getByText('Spotify')).toBeVisible();
  await expect(page.getByText('Jumbo Bilbao')).toHaveCount(0);
  await page.goto('#/persona/p1');
  await expect(page.locator('.bub.pago').last()).toContainText('−$12.000');

  // Mi plata muestra el banner y desconectar lo saca
  await page.goto('#/plata');
  await expect(page.locator('.banner-det')).toContainText('1 cobro detectado en tu correo');
  await page.locator('.banner-det').click();
  await page.getByRole('button', { name: 'Desconectar' }).click();
  await expect(page).toHaveURL(/#\/plata/);
  await expect(page.getByText('Que tu banco te avise y la app anote')).toBeVisible();
});
