// Google de mentira para las pruebas: inicio de sesión, Drive y Gmail.
import type { Page, Route } from '@playwright/test';

export interface CorreoEjemplo {
  id: string;
  fecha: string;
  de: string;
  asunto: string;
  texto: string;
}

interface Archivo {
  id: string;
  name: string;
  modifiedTime: string;
  contenido: string;
  carpeta?: boolean;
}

/**
 * Simula Google: el inicio de sesión (Google Identity Services), la API de Drive (en memoria) y la de Gmail
 * (con los `correos` dados, en el mismo formato que entregaba el script).
 */
export async function driveFalso(page: Page, op: { correos?: CorreoEjemplo[]; scope?: string } = {}) {
  const archivos = new Map<string, Archivo>();
  let n = 0;
  const subidas: string[] = [];
  await page.route('https://accounts.google.com/gsi/client', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: `window.google = { accounts: { oauth2: {
        initTokenClient: (c) => ({ requestAccessToken: () => { window.__pedidos = (window.__pedidos || 0) + 1; setTimeout(() => c.callback({ access_token: 'tok-' + Math.random(), expires_in: 3600, scope: ${JSON.stringify(op.scope ?? '')} || c.scope }), 20); } }),
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
  // Gmail: la lista (con paginación de a 2 para probarla) y cada mensaje en formato "full".
  const leidos: string[] = [];
  const b64 = (t: string) => Buffer.from(t, 'utf8').toString('base64url');
  await page.route('https://gmail.googleapis.com/**', async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    const correos = op.correos ?? [];
    const id = /\/messages\/([^/?]+)/.exec(url.pathname)?.[1];
    if (id) {
      const c = correos.find((x) => x.id === decodeURIComponent(id))!;
      leidos.push(c.id);
      return json(r, {
        id: c.id,
        internalDate: String(new Date(c.fecha).getTime()),
        payload: {
          mimeType: 'multipart/alternative',
          headers: [{ name: 'From', value: c.de }, { name: 'Subject', value: c.asunto }],
          parts: [{ mimeType: 'text/plain', body: { data: b64(c.texto) } }, { mimeType: 'text/html', body: { data: b64(`<p>${c.texto}</p>`) } }],
        },
      });
    }
    const despues = Number(/after:(\d+)/.exec(url.searchParams.get('q') ?? '')?.[1] ?? 0) * 1000;
    const todos = correos.filter((c) => new Date(c.fecha).getTime() > despues);
    const desde = Number(url.searchParams.get('pageToken') ?? 0);
    const pagina = todos.slice(desde, desde + 2);
    return json(r, { messages: pagina.map((c) => ({ id: c.id })), ...(desde + 2 < todos.length ? { nextPageToken: String(desde + 2) } : {}) });
  });
  return { archivos, subidas, leidos };
}

