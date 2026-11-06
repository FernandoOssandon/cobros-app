// 3.1: una sola conexión con Google para el respaldo en Drive y para leer los correos del banco (sin script).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { conDatos, expect, FIXTURES, test } from './ayuda';
import { driveFalso, type CorreoEjemplo } from './google-falso';

const CLIENT_ID = '123-abc.apps.googleusercontent.com';
const CORREOS: CorreoEjemplo[] = JSON.parse(readFileSync(path.join(FIXTURES, 'correos-ejemplo.json'), 'utf8'));

/** Cambia los ajustes guardados directamente en la base (y recarga). */
async function ajustar(page: Page, cambio: Record<string, unknown>) {
  await page.evaluate(async (c) => {
    const req = indexedDB.open('me-debes');
    const db: IDBDatabase = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const tx = db.transaction('ajustes', 'readwrite');
    const st = tx.objectStore('ajustes');
    const a = await new Promise<Record<string, unknown>>((r) => {
      const q = st.get('main');
      q.onsuccess = () => r(q.result);
    });
    const nuevo = { ...a };
    for (const [k, v] of Object.entries(c)) nuevo[k] = typeof v === 'object' && v && !Array.isArray(v) ? { ...(a[k] as object), ...v } : v;
    st.put(nuevo);
    await new Promise((r) => (tx.oncomplete = r));
    db.close();
  }, cambio);
  await page.reload();
}

async function ajustes(page: Page) {
  return page.evaluate(async () => {
    const req = indexedDB.open('me-debes');
    const db: IDBDatabase = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const q = db.transaction('ajustes').objectStore('ajustes').get('main');
    const a = await new Promise<Record<string, unknown>>((r) => (q.onsuccess = () => r(q.result)));
    db.close();
    return a as { correo?: Record<string, unknown>; drive?: Record<string, unknown> };
  });
}

/** Hace como si el permiso de Google hubiera vencido. */
async function vencerPermiso(page: Page) {
  await page.evaluate(() => {
    const t = JSON.parse(localStorage.getItem('a-mano-drive-token')!);
    localStorage.setItem('a-mano-drive-token', JSON.stringify({ ...t, vence: 0 }));
  });
}

const pedidos = (page: Page) => page.evaluate(() => (window as unknown as { __pedidos?: number }).__pedidos ?? 0);

test('conectar el correo con Google: una ventana, Drive y Gmail juntos', async ({ page }) => {
  const g = await driveFalso(page, { correos: CORREOS });
  await conDatos(page);
  await page.goto('#/plata');
  await page.getByRole('button', { name: 'Conectar el correo' }).click();
  await expect(page).toHaveURL(/#\/correo\/conectar$/);
  await page.getByRole('button', { name: 'Conectar con Google' }).click();
  const hoja = page.getByRole('dialog', { name: 'Conectar con Google' });
  await hoja.getByLabel('ID de cliente de Google').fill(CLIENT_ID);
  await hoja.getByRole('button', { name: 'Conectar con Google' }).click();
  await expect(page.getByText(/Google conectado · \d+ cobros por revisar/)).toBeVisible();
  await expect(page).toHaveURL(/#\/correo$/);
  await expect(page.getByTestId('detectado').first()).toBeVisible();
  await expect(page.getByText(/con tu cuenta de Google · solo correos de bancos/)).toBeVisible();
  expect(await pedidos(page)).toBe(1);
  expect(g.leidos.length).toBeGreaterThanOrEqual(5);
  const a = await ajustes(page);
  expect(a.correo).toMatchObject({ modo: 'google', email: 'yo@gmail.com' });
  expect(a.correo).not.toHaveProperty('url');
  expect(a.drive).toMatchObject({ clientId: CLIENT_ID, email: 'yo@gmail.com' });
  // Con el mismo permiso quedó el respaldo en Drive.
  await expect.poll(() => g.subidas.length).toBe(1);

  // En Ajustes: una sola sección con las dos cosas.
  await page.goto('#/ajustes');
  const seccion = page.getByTestId('seccion-drive');
  await expect(seccion).toContainText('Cuenta de Google');
  await expect(seccion.getByTestId('correo-google')).toContainText('Leyendo los correos del banco · revisado recién');

  // El respaldo no lleva la conexión.
  const subido = JSON.parse([...g.archivos.values()].find((x) => !x.carpeta)!.contenido);
  expect(subido.ajustes).not.toHaveProperty('correo');
  expect(subido.ajustes).not.toHaveProperty('drive');
});

test('vence el permiso: un toque se pone al día con el respaldo y el correo', async ({ page }) => {
  const bandeja: CorreoEjemplo[] = [];
  const g = await driveFalso(page, { correos: bandeja });
  await conDatos(page);
  await page.goto('#/ajustes');
  await page.getByRole('button', { name: 'Conectar mi cuenta de Google' }).click();
  await page.getByLabel('ID de cliente de Google').fill(CLIENT_ID);
  await page.getByRole('dialog', { name: 'Conectar con Google' }).getByRole('button', { name: 'Conectar con Google' }).click();
  await expect(page.getByText('Google conectado · respaldo subido · sin cobros nuevos en tu correo')).toBeVisible();

  // Hace 4 horas que no se revisa el correo y venció el permiso: el resumen lo ofrece.
  await vencerPermiso(page);
  await ajustar(page, { correo: { ultimaLectura: new Date(Date.parse('2026-11-25T08:00:00-03:00')).toISOString() } });
  await page.goto('#/');
  const aviso = page.getByTestId('aviso-google');
  await expect(aviso).toContainText('Revisa los correos del banco');
  // Llegan correos nuevos del banco.
  bandeja.push(CORREOS[0], CORREOS[1]);
  const antes = await pedidos(page);
  await aviso.click();
  await expect(page.getByText('2 cobros nuevos en tu correo')).toBeVisible();
  expect(g.leidos.sort()).toEqual(['gm-c1', 'gm-c2']);
  expect(await pedidos(page)).toBe(antes + 1);
  await expect(aviso).toHaveCount(0);

  // Ahora con cambios sin respaldar y el correo atrasado: un solo aviso, una sola ventana de Google.
  await vencerPermiso(page);
  await ajustar(page, { correo: { ultimaLectura: new Date(Date.parse('2026-11-25T07:00:00-03:00')).toISOString() } });
  await page.goto('#/presupuesto/nuevo');
  await page.getByRole('textbox', { name: 'Límite' }).fill('90000');
  await page.getByRole('button', { name: 'Guardar presupuesto' }).click();
  await expect(page.getByText(/Presupuesto guardado/)).toBeVisible();
  await page.goto('#/');
  await expect(aviso).toContainText('Ponte al día con Google');
  const subidas = g.subidas.length;
  const antes2 = await pedidos(page);
  await aviso.click();
  await expect(page.getByText(/^Respaldado en Drive · sin cobros nuevos en tu correo$/)).toBeVisible();
  expect(await pedidos(page)).toBe(antes2 + 1);
  expect(g.subidas.length).toBe(subidas + 1);
  await expect(aviso).toHaveCount(0);
});

test('quien usaba el script se pasa a Google desde Ajustes', async ({ page }) => {
  const g = await driveFalso(page, { correos: CORREOS });
  // El script de antes (no tiene correos nuevos).
  await page.context().route(/script\.google\.com/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, mensajes: [] }) }));
  await conDatos(page);
  // Tenía el script y conecta Google para el respaldo: el script se mantiene hasta que lo cambie.
  await ajustar(page, { correo: { url: 'https://script.google.com/macros/s/x/exec', clave: 'una-clave-larga', email: 'yo@gmail.com' } });
  await page.goto('#/ajustes');
  await page.getByRole('button', { name: 'Conectar mi cuenta de Google' }).click();
  await page.getByLabel('ID de cliente de Google').fill(CLIENT_ID);
  await page.getByRole('dialog', { name: 'Conectar con Google' }).getByRole('button', { name: 'Conectar con Google' }).click();
  await expect(page.getByText('Google conectado · respaldo subido')).toBeVisible();
  const fila = page.getByTestId('correo-google');
  await expect(fila).toContainText('Se leen con el script de Google');
  expect((await ajustes(page)).correo).toMatchObject({ url: 'https://script.google.com/macros/s/x/exec' });

  await fila.getByRole('button', { name: 'Cambiar a Google' }).click();
  await expect(page.getByText(/\d+ cobros nuevos en tu correo/)).toBeVisible();
  await expect(fila).toContainText('Leyendo los correos del banco');
  const a = await ajustes(page);
  expect(a.correo).toMatchObject({ modo: 'google' });
  expect(a.correo).not.toHaveProperty('clave');
  expect(g.leidos.length).toBeGreaterThanOrEqual(5);

  // En Detectados, con el permiso vencido, se revisa con un toque.
  await vencerPermiso(page);
  await page.reload();
  await page.goto('#/correo');
  await page.getByRole('button', { name: /Revisar correos nuevos/ }).click();
  await expect(page.getByText('Sin cobros nuevos en tu correo')).toBeVisible();
  await expect(page.getByRole('button', { name: /Revisar correos nuevos/ })).toHaveCount(0);

  // Dejar de leer el correo no desconecta el respaldo.
  await page.getByRole('button', { name: 'Desconectar' }).click();
  await expect(page.getByText('Ya no se leen tus correos · el respaldo en Drive sigue')).toBeVisible();
  await page.goto('#/ajustes');
  await expect(page.getByTestId('seccion-drive')).toContainText('Conectado como yo@gmail.com.');
  await expect(page.getByTestId('correo-google')).toContainText('No se leen los correos del banco.');
});
