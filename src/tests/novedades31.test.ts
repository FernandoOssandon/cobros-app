// 3.1: una sola conexión con Google para el respaldo en Drive y para leer los correos del banco en Gmail.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Un navegador mínimo (localStorage y Google Identity Services de mentira), antes de cargar los módulos.
const g = vi.hoisted(() => {
  const store = new Map<string, string>();
  const glob = globalThis as unknown as Record<string, unknown>;
  glob.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) };
  const estado = { scope: '' as string, pedidos: 0 };
  glob.window = Object.assign(globalThis, {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (c: { scope: string; callback: (r: unknown) => void }) => ({
            requestAccessToken: () => {
              estado.pedidos++;
              c.callback({ access_token: `tok-${estado.pedidos}`, expires_in: 3600, scope: estado.scope || c.scope });
            },
          }),
        },
      },
    },
  });
  return { store, estado };
});

import { leerCorreo } from '../correo';
import { db, guardarAjustes } from '../db';
import { olvidarToken, pedirPermiso, SCOPES, tokenValido } from '../google';
import type { CorreoCrudo } from '../lib/correo';
import { SCOPE_DRIVE } from '../lib/drive';
import { aCorreoCrudo, BUSQUEDA_BANCOS, correosDelBanco, decodificarBase64Url, MAX_TEXTO, SCOPE_GMAIL } from '../lib/gmail';

const CORREOS: CorreoCrudo[] = JSON.parse(readFileSync(path.join(__dirname, '../../e2e/fixtures/correos-ejemplo.json'), 'utf8'));
const b64 = (t: string) => Buffer.from(t, 'utf8').toString('base64url');

/** La API de Gmail de mentira (lista paginada de a 2 y cada mensaje en formato "full"). */
function gmailFalso(correos: CorreoCrudo[], status = 200) {
  const urls: string[] = [];
  const f = (async (input: string | URL) => {
    const url = new URL(String(input));
    urls.push(url.toString());
    if (status !== 200) return new Response('{}', { status });
    const id = /\/messages\/([^/?]+)/.exec(url.pathname)?.[1];
    if (id) {
      const c = correos.find((x) => x.id === decodeURIComponent(id))!;
      return Response.json({
        id: c.id,
        internalDate: String(new Date(c.fecha).getTime()),
        payload: {
          mimeType: 'multipart/mixed',
          headers: [{ name: 'From', value: c.de }, { name: 'Subject', value: c.asunto }],
          parts: [{ mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/html', body: { data: b64(`<b>${c.texto}</b>`) } }, { mimeType: 'text/plain', body: { data: b64(c.texto) } }] }],
        },
      });
    }
    const despues = Number(/after:(\d+)/.exec(url.searchParams.get('q') ?? '')?.[1] ?? 0) * 1000;
    const todos = correos.filter((c) => new Date(c.fecha).getTime() > despues);
    const desde = Number(url.searchParams.get('pageToken') ?? 0);
    return Response.json({ messages: todos.slice(desde, desde + 2).map((c) => ({ id: c.id })), ...(desde + 2 < todos.length ? { nextPageToken: String(desde + 2) } : {}) });
  }) as typeof fetch;
  return { f, urls, mensajes: () => urls.filter((u) => /\/messages\/[^/?]+/.test(new URL(u).pathname)).length };
}

describe('lectura de Gmail', () => {
  it('decodifica base64url con tildes, eñes y signos', () => {
    expect(decodificarBase64Url(b64('Compra por $12.990 en Ñuñoa — café'))).toBe('Compra por $12.990 en Ñuñoa — café');
  });

  it('arma el correo como lo entregaba el script: texto plano antes que HTML, fecha del mensaje y largo máximo', () => {
    const c = aCorreoCrudo({
      id: 'm1',
      internalDate: String(Date.parse('2026-11-25T10:42:00-03:00')),
      payload: {
        headers: [{ name: 'from', value: 'BancoEstado <notificaciones@bancoestado.cl>' }, { name: 'SUBJECT', value: 'Compra' }],
        parts: [{ mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/html', body: { data: b64('<p>html</p>') } }, { mimeType: 'text/plain', body: { data: b64('x'.repeat(5000)) } }] }],
      },
    });
    expect(c).toMatchObject({ id: 'm1', fecha: '2026-11-25T13:42:00.000Z', de: 'BancoEstado <notificaciones@bancoestado.cl>', asunto: 'Compra' });
    expect(c.texto).toHaveLength(MAX_TEXTO);
    // Solo HTML: queda el HTML (la app lo limpia al interpretar).
    expect(aCorreoCrudo({ id: 'm2', payload: { mimeType: 'text/html', body: { data: b64('<p>Hola</p>') } } }).texto).toBe('<p>Hola</p>');
  });

  it('busca solo correos de bancos desde la fecha, recorre las páginas y no vuelve a pedir los ya leídos', async () => {
    const g1 = gmailFalso(CORREOS);
    const desde = '2026-11-22T00:00:00-03:00';
    const r = await correosDelBanco('tok', new Date(desde).toISOString(), new Set(['gm-c2']), g1.f);
    const q = new URL(g1.urls[0]).searchParams.get('q')!;
    expect(q).toContain(BUSQUEDA_BANCOS);
    expect(q).toContain(`after:${Date.parse(desde) / 1000}`);
    // gm-c1, gm-c3, gm-c4 y gm-c5 (de las 00:01); gm-c2 ya estaba; gm-c6 es anterior.
    expect(r.map((c) => c.id).sort()).toEqual(['gm-c1', 'gm-c3', 'gm-c4', 'gm-c5']);
    expect(g1.mensajes()).toBe(4);
    expect(g1.urls.filter((u) => u.includes('pageToken'))).toHaveLength(2);
    expect(r.find((c) => c.id === 'gm-c1')!.texto).toBe(CORREOS[0].texto);
  });

  it('un error de Google llega con su código', async () => {
    await expect(correosDelBanco('tok', '2026-11-01T00:00:00Z', new Set(), gmailFalso(CORREOS, 403).f)).rejects.toMatchObject({ status: 403 });
  });
});

describe('una sola conexión con Google', () => {
  beforeEach(async () => {
    await db.detectados.clear();
    await guardarAjustes({ correo: undefined, drive: undefined });
    g.estado.scope = '';
    olvidarToken();
  });

  it('un permiso sirve para Drive y Gmail; el de la 3.0 (sin la lista de permisos) solo para Drive', async () => {
    expect(tokenValido()).toBe(false);
    await pedirPermiso('cid');
    expect(tokenValido(SCOPE_DRIVE) && tokenValido(SCOPE_GMAIL)).toBe(true);
    expect(SCOPES).toEqual([SCOPE_DRIVE, SCOPE_GMAIL]);
    // Si la persona solo marcó Drive en la ventana de Google:
    g.estado.scope = SCOPE_DRIVE;
    await pedirPermiso('cid');
    expect(tokenValido(SCOPE_DRIVE)).toBe(true);
    expect(tokenValido(SCOPE_GMAIL)).toBe(false);
    // Token guardado por la 3.0: sin "scopes".
    const t = JSON.parse(g.store.get('a-mano-drive-token')!);
    delete t.scopes;
    g.store.set('a-mano-drive-token', JSON.stringify(t));
    vi.resetModules();
    const otro = await import('../google');
    expect(otro.tokenValido(SCOPE_DRIVE)).toBe(true);
    expect(otro.tokenValido(SCOPE_GMAIL)).toBe(false);
  });

  it('lee los correos con Google y guarda la hora; sin permiso vigente no abre nada y espera el toque', async () => {
    await guardarAjustes({ drive: { clientId: 'cid' }, correo: { modo: 'google', email: 'yo@gmail.com' } });
    const sin = gmailFalso(CORREOS);
    expect(await leerCorreo(sin.f)).toBeNull();
    expect(sin.urls).toHaveLength(0);

    const antes = g.estado.pedidos;
    const g1 = gmailFalso(CORREOS);
    const r = await leerCorreo(g1.f, true);
    expect(g.estado.pedidos).toBe(antes + 1);
    expect(r?.nuevos).toBeGreaterThan(0);
    expect((await db.ajustes.get('main'))?.correo).toMatchObject({ modo: 'google', email: 'yo@gmail.com' });
    expect((await db.ajustes.get('main'))?.correo?.ultimaLectura).toBeTruthy();
    const detectados = await db.detectados.count();
    expect(detectados).toBe(r!.nuevos);

    // La segunda vez no vuelve a pedir los cobros que ya se leyeron (solo el estado de cuenta, que no se guarda).
    const g2 = gmailFalso(CORREOS);
    const r2 = await leerCorreo(g2.f);
    expect(r2).toEqual({ nuevos: 0, ignorados: 1 });
    expect(g2.mensajes()).toBe(1);
    expect(g.estado.pedidos).toBe(antes + 1);
  });

  it('si Google dice que el permiso venció, se olvida y se espera el toque', async () => {
    await guardarAjustes({ drive: { clientId: 'cid' }, correo: { modo: 'google' } });
    await pedirPermiso('cid');
    expect(await leerCorreo(gmailFalso(CORREOS, 401).f)).toBeNull();
    expect(tokenValido(SCOPE_GMAIL)).toBe(false);
  });

  it('sin la Gmail API activada, el mensaje dice qué revisar', async () => {
    await guardarAjustes({ drive: { clientId: 'cid' }, correo: { modo: 'google' } });
    await pedirPermiso('cid');
    await expect(leerCorreo(gmailFalso(CORREOS, 403).f)).rejects.toThrow(/Gmail API/);
  });
});
