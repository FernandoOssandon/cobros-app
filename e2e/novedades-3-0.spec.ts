// 3.0: presupuestos con varias categorías, recurrentes sugeridos, cuentas en dólares y respaldo en Google Drive.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page, Route } from '@playwright/test';
import { expect, FIXTURES, test } from './ayuda';

const RESPALDO = path.join(FIXTURES, 'respaldo-2-7.json');
const CLIENT_ID = '123-abc.apps.googleusercontent.com';

async function restaurar(page: Page, datos: unknown = JSON.parse(readFileSync(RESPALDO, 'utf8'))) {
  await page.goto('#/ajustes');
  await page.locator('input[type=file][accept*="json"]').setInputFiles({ name: 'respaldo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(datos)) });
  await page.getByRole('button', { name: 'Sí, restaurar' }).click();
  await expect(page.getByText('Respaldo restaurado')).toBeVisible();
}

test('un presupuesto semanal para dos categorías', async ({ page }) => {
  await restaurar(page);
  await page.goto('#/presupuesto/nuevo');
  await page.getByRole('button', { name: /Algunas categorías/ }).click();
  await page.getByRole('button', { name: 'Comida', exact: true }).click();
  await page.getByRole('button', { name: 'Salidas', exact: true }).click();
  await expect(page.getByLabel('Nombre del presupuesto')).toHaveAttribute('placeholder', 'Comida y Salidas');
  await page.getByRole('textbox', { name: 'Límite' }).fill('80000');
  await page.getByRole('button', { name: 'Guardar presupuesto' }).click();
  await expect(page.getByText('Presupuesto guardado · $80.000 a la semana')).toBeVisible();
  const tarjeta = page.getByRole('button', { name: 'Presupuesto Comida y Salidas' });
  await expect(tarjeta).toContainText('de $80.000');
  // Otro, mensual, para la casa: conviven.
  await page.goto('#/presupuesto/nuevo');
  await page.getByRole('button', { name: /Algunas categorías/ }).click();
  await page.getByRole('button', { name: 'Casa', exact: true }).click();
  await page.getByRole('button', { name: 'Mes', exact: true }).click();
  await page.getByRole('textbox', { name: 'Límite' }).fill('400000');
  await page.getByLabel('Nombre del presupuesto').fill('Hogar');
  await page.getByRole('button', { name: 'Guardar presupuesto' }).click();
  await expect(page.getByRole('button', { name: 'Presupuesto Hogar' })).toContainText('Mensual · noviembre · Casa');
  await expect(page.getByRole('button', { name: 'Presupuesto Comida y Salidas' })).toBeVisible();
});

test('sugiere hacer recurrente lo que se repite cada mes', async ({ page }) => {
  const datos = JSON.parse(readFileSync(RESPALDO, 'utf8'));
  const base = datos.gastos.find((x: { id: string }) => x.id === 'g-bencina');
  datos.gastos.push(
    { ...base, id: 'pac-oct', descripcion: 'Seguro del auto', total: 30000, miParte: 30000, fecha: '2026-10-15', categoriaId: 'cat-transporte' },
    { ...base, id: 'pac-nov', descripcion: 'Seguro del auto', total: 30000, miParte: 30000, fecha: '2026-11-15', categoriaId: 'cat-transporte' },
  );
  await restaurar(page, datos);
  await page.goto('#/recurrentes');
  const sug = page.getByTestId('sugerido').filter({ hasText: 'Seguro del auto' });
  await expect(sug).toContainText('todos los meses el 15 · Débito Santander');
  await expect(sug).toContainText('$30.000');
  await sug.getByRole('button', { name: 'Hacerlo recurrente' }).click();
  await expect(page.getByText('Seguro del auto es recurrente · se anota solo desde el 15 dic')).toBeVisible();
  await expect(page.getByTestId('sugerido')).toHaveCount(0);
});

test('una cuenta en dólares suma en pesos con el dólar del día', async ({ page }) => {
  await page.route('https://mindicador.cl/api', (r) =>
    r.fulfill({
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ uf: { valor: 40000, fecha: '2026-11-25T03:00:00.000Z' }, dolar: { valor: 980, fecha: '2026-11-25T03:00:00.000Z' }, euro: { valor: 1100, fecha: '2026-11-25T03:00:00.000Z' } }),
    }),
  );
  await restaurar(page);
  await page.goto('#/cuenta/nueva');
  await page.getByLabel('Nombre').fill('Meli Dólar');
  await page.getByRole('button', { name: 'Inversión' }).click();
  await page.getByRole('button', { name: 'Dólares' }).click();
  await page.getByLabel('Saldo hoy').fill('10,5');
  await page.getByRole('button', { name: 'Guardar cuenta' }).click();
  await expect(page.locator('.t-hero-58')).toHaveText('US$ 10,5');
  await expect(page.getByText('≈ $10.290 · dólar a $980')).toBeVisible();
  // Depositar con decimales.
  await page.getByRole('button', { name: 'Depositar' }).click();
  for (const k of ['2', ',', '2', '5']) await page.locator(`.sheet .keypad button[aria-label="${k}"]`).click();
  await expect(page.locator('.sheet').getByLabel('Monto')).toHaveText('US$ 2,25');
  await page.locator('.sheet').getByRole('button', { name: 'Depositar' }).click();
  await expect(page.locator('.t-hero-58')).toHaveText('US$ 12,75');
  await page.goto('#/plata');
  await expect(page.getByRole('button', { name: /Meli Dólar/ })).toContainText('≈ $12.495');
});

// ---------- Google Drive de mentira ----------

interface Archivo {
  id: string;
  name: string;
  modifiedTime: string;
  contenido: string;
  carpeta?: boolean;
}

/** Simula Google: el inicio de sesión (Google Identity Services) y la API de Drive, en memoria. */
async function driveFalso(page: Page) {
  const archivos = new Map<string, Archivo>();
  let n = 0;
  const subidas: string[] = [];
  await page.route('https://accounts.google.com/gsi/client', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: `window.google = { accounts: { oauth2: {
        initTokenClient: (c) => ({ requestAccessToken: () => setTimeout(() => c.callback({ access_token: 'tok-' + Math.random(), expires_in: 3600 }), 20) }),
        revoke: () => {},
      } } };`,
    }),
  );
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  const meta = (a: Archivo) => ({ id: a.id, name: a.name, modifiedTime: a.modifiedTime, size: String(a.contenido.length) });
  await page.route('https://www.googleapis.com/**', async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    const ahora = new Date().toISOString();
    if (url.pathname.endsWith('/about')) return json(r, { user: { emailAddress: 'yo@gmail.com' } });
    const id = /\/files\/([^/?]+)/.exec(url.pathname)?.[1];
    if (url.pathname.startsWith('/upload/')) {
      if (req.method() === 'POST') {
        const cuerpo = req.postData() ?? '';
        const partes = cuerpo.split(/\r\n--[^\r\n]+/);
        const m = JSON.parse(/\r\n\r\n([\s\S]*)/.exec(partes[0])![1]);
        const contenido = /\r\n\r\n([\s\S]*)/.exec(partes[1])![1];
        const a = { id: `f${++n}`, name: m.name, modifiedTime: ahora, contenido };
        archivos.set(a.id, a);
        subidas.push(a.name);
        return json(r, meta(a));
      }
      const a = archivos.get(id!)!;
      a.contenido = req.postData() ?? '';
      a.modifiedTime = ahora;
      subidas.push(a.name);
      return json(r, meta(a));
    }
    if (id && url.searchParams.get('alt') === 'media') return r.fulfill({ headers: cors, contentType: 'application/json', body: archivos.get(id)!.contenido });
    if (id && req.method() === 'DELETE') {
      archivos.delete(id);
      return r.fulfill({ status: 204, headers: cors });
    }
    if (req.method() === 'POST') {
      const a = { id: 'carpeta', name: JSON.parse(req.postData()!).name, modifiedTime: ahora, contenido: '', carpeta: true };
      archivos.set(a.id, a);
      return json(r, meta(a));
    }
    const q = url.searchParams.get('q') ?? '';
    const lista = q.includes('google-apps.folder') ? [...archivos.values()].filter((a) => a.carpeta) : [...archivos.values()].filter((a) => !a.carpeta).sort((a, b) => b.name.localeCompare(a.name));
    return json(r, { files: lista.map(meta) });
  });
  return { archivos, subidas };
}

test('respaldo en Google Drive: conectar, se sube solo, avisa si venció el permiso y se restaura', async ({ page }) => {
  const drive = await driveFalso(page);
  await restaurar(page);
  await page.goto('#/ajustes');
  const seccion = page.getByTestId('seccion-drive');
  await seccion.getByRole('button', { name: 'Conectar Google Drive' }).click();
  await page.getByLabel('ID de cliente de Google').fill('esto-no');
  await page.getByRole('button', { name: 'Conectar con Google' }).click();
  await expect(page.getByRole('alert')).toHaveText('El ID de cliente termina en .apps.googleusercontent.com');
  await page.getByLabel('ID de cliente de Google').fill(CLIENT_ID);
  await page.getByRole('button', { name: 'Conectar con Google' }).click();
  await expect(page.getByText('Drive conectado · respaldo subido')).toBeVisible();
  await expect(seccion).toContainText('Conectado como yo@gmail.com.');
  expect(drive.subidas).toEqual(['a-mano-respaldo-2026-11-25.json']);
  const subido = JSON.parse([...drive.archivos.values()].find((a) => !a.carpeta)!.contenido);
  expect(subido).toMatchObject({ app: 'me-debes', version: 8 });
  expect(subido.gastos.length).toBeGreaterThan(10);
  expect(subido.ajustes).not.toHaveProperty('drive');

  // Un cambio y salir de la app: se sube solo (mismo archivo del día).
  await page.goto('#/presupuesto/nuevo');
  await page.getByRole('textbox', { name: 'Límite' }).fill('90000');
  await page.getByRole('button', { name: 'Guardar presupuesto' }).click();
  await expect(page.getByText(/Presupuesto guardado/)).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => drive.subidas.length).toBe(2);
  expect([...drive.archivos.values()].filter((a) => !a.carpeta)).toHaveLength(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  // El permiso vence y hay cambios: aparece "Respaldar" en el resumen; un toque y se sube.
  await page.evaluate(() => {
    const t = JSON.parse(localStorage.getItem('a-mano-drive-token')!);
    localStorage.setItem('a-mano-drive-token', JSON.stringify({ ...t, vence: 0 }));
  });
  await page.reload();
  await page.goto('#/presupuestos');
  await page.getByRole('button', { name: /Presupuesto Total semanal/ }).click();
  await page.getByRole('textbox', { name: 'Límite' }).fill('95000');
  await page.getByRole('button', { name: 'Guardar presupuesto' }).click();
  await expect(page.getByText('Presupuesto actualizado')).toBeVisible();
  await page.goto('#/');
  await page.getByRole('button', { name: /Tienes cambios sin respaldar/ }).click();
  await expect(page.getByText('Respaldado en Drive')).toBeVisible();
  expect(drive.subidas.length).toBe(3);
  await expect(page.getByRole('button', { name: /Tienes cambios sin respaldar/ })).toHaveCount(0);

  // Restaurar desde Drive (en otro teléfono sería igual: conectar y elegir el respaldo).
  await page.goto('#/ajustes');
  await seccion.getByRole('button', { name: 'Restaurar' }).click();
  await page.getByRole('button', { name: /Hoy, 25 nov/ }).click();
  await expect(page.getByText(/¿Reemplazar todo con el respaldo del/)).toBeVisible();
  await page.getByRole('button', { name: 'Sí, restaurar' }).click();
  await expect(page.getByText(/Respaldo restaurado · \d+ gastos/)).toBeVisible();
  // Sigue conectado después de restaurar.
  await expect(seccion).toContainText('Conectado como yo@gmail.com.');
});

test('teléfono nuevo: al conectar Drive ofrece traer el respaldo en vez de subir uno vacío', async ({ page }) => {
  const drive = await driveFalso(page);
  drive.archivos.set('carpeta', { id: 'carpeta', name: 'a mano · respaldos', modifiedTime: '2026-11-20T10:00:00Z', contenido: '', carpeta: true });
  drive.archivos.set('viejo', { id: 'viejo', name: 'a-mano-respaldo-2026-11-24.json', modifiedTime: '2026-11-24T22:00:00Z', contenido: readFileSync(RESPALDO, 'utf8') });
  await page.goto('#/ajustes');
  await page.getByRole('button', { name: 'Conectar Google Drive' }).click();
  await page.getByLabel('ID de cliente de Google').fill(CLIENT_ID);
  await page.getByRole('button', { name: 'Conectar con Google' }).click();
  await expect(page.getByText('Encontramos respaldos en tu Drive. ¿Traemos uno a este teléfono?')).toBeVisible();
  expect(drive.subidas).toEqual([]);
  await page.getByRole('button', { name: /Ayer/ }).click();
  await page.getByRole('button', { name: 'Sí, restaurar' }).click();
  await expect(page.getByText(/Respaldo restaurado · \d+ gastos/)).toBeVisible();
});
