// 2.7: importar cartolas (cuenta Santander y CMR), comparar saldos y pagos que traen más de lo que se debía.
import path from 'node:path';
import { expect, FIXTURES, teclear, test } from './ayuda';

const CARTOLA = path.join(FIXTURES, 'cartola-santander.xlsx');
const CMR = path.join(FIXTURES, 'cmr-ultimos.xlsx');

test.beforeEach(async ({ page }) => {
  await page.goto('#/ajustes');
  await page.locator('input[type=file][accept*="json"]').setInputFiles(path.join(FIXTURES, 'respaldo-2-7.json'));
  await page.getByRole('button', { name: 'Sí, restaurar' }).click();
  await expect(page.getByText('Respaldo restaurado')).toBeVisible();
});

test('importar la cartola de la cuenta: revisar, cuadrar y no repetir', async ({ page }) => {
  await page.goto('#/cuenta/rut');
  await page.getByRole('button', { name: /Importar cartola/ }).click();
  await page.locator('input[type=file][accept*="xlsx"]').setInputFiles(CARTOLA);
  // Abierta desde la cuenta: no pregunta de cuál es.
  await expect(page.getByRole('heading', { name: 'revisar.' })).toBeVisible();
  const cmp = page.getByTestId('comparacion');
  await expect(cmp).toContainText('No cuadra');
  await expect(cmp).toContainText('Banco $1.894.605');

  // La farmacia: $500 de diferencia, manda el banco.
  const farmacia = page.getByTestId('parecido').filter({ hasText: 'Cruz Verde' });
  await expect(farmacia).toContainText('En la app: Farmacia Cruz Verde $12.990');
  await expect(farmacia).toContainText('Se corrige a $13.490 en la app.');

  // Lo nuevo y cómo se propone anotarlo.
  const nuevos = page.getByTestId('nuevo');
  await expect(nuevos).toHaveCount(4);
  await expect(nuevos.filter({ hasText: 'Camila' })).toContainText('Pago de Camila · $10.000 como ingreso');
  await expect(nuevos.filter({ hasText: 'Sebastian' })).toContainText('Traspaso desde otra cuenta tuya');
  await expect(nuevos.filter({ hasText: 'Tarjeta CMR' })).toContainText('Pago CMR Falabella');

  // Cambiar cómo se anota el PAC: con otra descripción y categoría.
  await nuevos.filter({ hasText: 'PAC Seguro Auto' }).getByRole('button', { name: 'Cambiar' }).click();
  await page.getByLabel('Descripción').fill('Seguro del auto');
  await page.locator('.sheet').getByRole('button', { name: 'Transporte' }).click();
  await page.getByRole('button', { name: 'Listo' }).click();
  await expect(nuevos.filter({ hasText: 'PAC Seguro Auto' })).toContainText('Gasto · Transporte · Débito Santander');

  // La bencina está solo en la app: al borrarla, el saldo cuadra.
  const bencina = page.getByTestId('solo-app').filter({ hasText: 'Bencina Copec' });
  await bencina.getByRole('button', { name: 'Borrar' }).click();
  await expect(cmp).toContainText('Cuadra');
  await expect(cmp).toContainText('App $1.894.605');

  await page.getByRole('button', { name: 'Importar · 4 nuevos, 1 corrección, 1 borrado' }).click();
  await expect(page.getByRole('heading', { name: 'Cuadra.' })).toBeVisible();
  await expect(page.getByText('Al 24 nov, la app y el banco tienen $1.894.605 en Cuenta Corriente Santander.')).toBeVisible();
  await page.getByRole('button', { name: 'Listo' }).click();
  await expect(page).toHaveURL(/#\/cuenta\/rut/);
  await expect(page.getByText('Traspaso desde otra cuenta tuya')).toBeVisible();
  await expect(page.getByText('Seguro del auto')).toBeVisible();

  // De nuevo el mismo archivo: ya estaba todo.
  await page.getByRole('button', { name: /Importar cartola/ }).click();
  await page.locator('input[type=file][accept*="xlsx"]').setInputFiles(CARTOLA);
  await expect(page.getByRole('heading', { name: 'Cuadra.' })).toBeVisible();
  await expect(page.getByText('Esta cartola ya estaba importada.')).toBeVisible();
});

test('importar los movimientos de la CMR: pregunta de qué tarjeta es y compara las compras', async ({ page }) => {
  await page.goto('#/plata');
  await page.getByRole('button', { name: /Importar cartola/ }).click();
  await page.locator('input[type=file][accept*="xlsx"]').setInputFiles(CMR);
  await expect(page.getByRole('heading', { name: '¿de qué tarjeta es?' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Crear tarjeta/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'CMR Falabella', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'revisar.' })).toBeVisible();
  const cmp = page.getByTestId('comparacion');
  await expect(cmp).toContainText('Compras 9 nov – 23 nov');
  await expect(cmp).toContainText('Cuadra');
  await expect(page.getByTestId('nuevo')).toHaveCount(3);
  await expect(page.getByTestId('nuevo').filter({ hasText: 'Pago Tarjeta CMR' })).toContainText('Pago de la tarjeta');
  // La compra antigua en cuotas y la de antes de que la tarjeta partiera en la app no se tocan.
  await expect(page.getByText(/2 son de antes del 9 nov/)).toBeVisible();
  await page.getByRole('button', { name: 'Importar · 3 nuevos' }).click();
  await expect(page.getByRole('heading', { name: 'Cuadra.' })).toBeVisible();

  // La próxima vez recuerda de qué tarjeta es (y que ya se importó).
  await page.getByRole('button', { name: 'Listo' }).click();
  await page.getByRole('button', { name: /Importar cartola/ }).click();
  await page.locator('input[type=file][accept*="xlsx"]').setInputFiles(CMR);
  await expect(page.getByText('Esta cartola ya estaba importada.')).toBeVisible();
});

test('un archivo que no es cartola lo dice', async ({ page }) => {
  await page.goto('#/importar');
  await page.locator('input[type=file][accept*="xlsx"]').setInputFiles({ name: 'otra.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('hola') });
  await expect(page.getByRole('alert')).toHaveText('No es un archivo .xlsx');
});

test('te pagan más de lo que te debían: el resto es un ingreso', async ({ page }) => {
  await page.goto('#/persona/p1/pago');
  await teclear(page, '30475');
  await expect(page.getByText('Te pagó $10.000 más de lo que te debía. ¿Qué es el resto?')).toBeVisible();
  await expect(page.getByText('Su deuda queda en $0 y $10.000 se anotan como ingreso suelto.')).toBeVisible();
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(page.getByText('Pago de $20.475 · +$10.000 como ingreso')).toBeVisible();
  await page.goto('#/ingresos');
  await expect(page.getByText('Transferencia de Camila (lo que sobró de su pago)')).toBeVisible();
});

test('compartido desde otra app: la pantalla lee el archivo que dejó el service worker', async ({ page }) => {
  const bytes = [...(await import('node:fs')).readFileSync(CARTOLA)];
  await page.evaluate(async (b) => {
    const cache = await caches.open('a-mano-compartido');
    await cache.put('/__compartido__', new Response(new Uint8Array(b), { headers: { 'x-nombre': 'cartola.xlsx' } }));
  }, bytes);
  await page.goto('#/importar?compartido=1');
  // No sabe de qué cuenta es (no se abrió desde una cuenta): pregunta.
  await expect(page.getByRole('heading', { name: '¿de qué cuenta es?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cuenta Corriente Santander', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'revisar.' })).toBeVisible();
  // El archivo se borra al leerlo.
  expect(await page.evaluate(async () => !!(await (await caches.open('a-mano-compartido')).match('/__compartido__')))).toBe(false);
});

test.describe('con service worker', () => {
  test.use({ serviceWorkers: 'allow' });
  test('el service worker recibe el archivo compartido y abre importar', async ({ page }) => {
    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const bytes = [...(await import('node:fs')).readFileSync(CARTOLA)];
    const destino = await page.evaluate(async (b) => {
      const fd = new FormData();
      fd.append('archivo', new File([new Uint8Array(b)], 'cartola.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const r = await fetch('./compartir', { method: 'POST', body: fd });
      // fetch no deja ver el "#…" del destino: basta con que termine en la app y no en /compartir.
      return { url: new URL(r.url).pathname, ok: r.ok };
    }, bytes);
    expect(destino.ok).toBe(true);
    expect(destino.url).not.toContain('compartir');
    const guardado = await page.evaluate(async () => {
      const r = await (await caches.open('a-mano-compartido')).match('/__compartido__');
      return r ? r.headers.get('x-nombre') : null;
    });
    expect(guardado).toBe('cartola.xlsx');
  });
});
