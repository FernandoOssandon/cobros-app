// Cobros detectados en el correo: pide los correos nuevos al script de Gmail, los interpreta
// y los deja "por confirmar". Nada se anota solo: tú decides si es un gasto, si ya estaba o si se descarta.
import { db, guardarAjustes, guardarPago, now, guardarGasto, type ConfigCorreo, type Detectado } from './db';
import { buscarParecido, interpretarCorreo, reconocerMedio, reconocerPersona, sugerirCategoria, type CorreoCrudo } from './lib/correo';
import { sumarDias } from './lib/recurrence';
import { todayISO } from './lib/format';

/** La primera vez se leen los últimos 30 días. */
const DIAS_PRIMERA_LECTURA = 30;

export interface ResultadoLectura {
  /** Movimientos nuevos por confirmar. */
  nuevos: number;
  /** Correos que no eran movimientos (estados de cuenta, claves…). */
  ignorados: number;
}

export class ErrorCorreo extends Error {}

/** Pide los correos al script. Usa text/plain para que el navegador no haga una consulta previa (CORS). */
export async function pedirCorreos(cfg: ConfigCorreo, desde: string, f: typeof fetch = fetch): Promise<{ mensajes: CorreoCrudo[]; email?: string }> {
  let res: Response;
  try {
    res = await f(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ clave: cfg.clave, desde }), redirect: 'follow' });
  } catch {
    throw new ErrorCorreo('No se pudo conectar con el script. Revisa tu conexión o la dirección.');
  }
  let data: { ok?: boolean; error?: string; mensajes?: CorreoCrudo[]; cuenta?: string };
  try {
    data = await res.json();
  } catch {
    throw new ErrorCorreo('El script no respondió como se esperaba. ¿Está publicado como aplicación web?');
  }
  if (!data.ok) throw new ErrorCorreo(data.error === 'clave' ? 'La clave no coincide con la del script.' : 'El script respondió con un error.');
  return { mensajes: Array.isArray(data.mensajes) ? data.mensajes : [], email: typeof data.cuenta === 'string' ? data.cuenta : undefined };
}

/** Interpreta y guarda los correos que no se habían leído. */
export async function guardarCorreos(mensajes: CorreoCrudo[]): Promise<ResultadoLectura> {
  const r: ResultadoLectura = { nuevos: 0, ignorados: 0 };
  await db.transaction('rw', [db.detectados, db.medios, db.gastos, db.categorias, db.personas], async () => {
    const [medios, gastos, previos, categorias, personas] = await Promise.all([
      db.medios.toArray(), db.gastos.toArray(), db.detectados.toArray(), db.categorias.toArray(), db.personas.toArray(),
    ]);
    const ya = new Set(previos.map((d) => d.id));
    const usados = new Set(previos.map((d) => d.parecidoA ?? d.gastoId).filter(Boolean) as string[]);
    for (const c of mensajes) {
      if (ya.has(c.id)) continue;
      const l = interpretarCorreo(c);
      // El pago de la tarjeta no es un gasto nuevo: se ignora.
      if (!l || l.tipo === 'otro') {
        r.ignorados++;
        continue;
      }
      const esGasto = l.tipo === 'compra' || l.tipo === 'transferencia';
      const medioId = reconocerMedio(l, medios);
      const parecidoA = esGasto ? buscarParecido({ ...l, medioId }, gastos, usados) : undefined;
      if (parecidoA) usados.add(parecidoA);
      const d: Detectado = {
        id: c.id,
        ...l,
        medioId,
        parecidoA,
        categoriaId: esGasto ? sugerirCategoria(l.comercio, gastos, categorias) : undefined,
        personaId: l.tipo === 'compra' ? undefined : reconocerPersona(l.comercio, personas),
        remitente: c.de,
        asunto: c.asunto,
        estado: 'pendiente',
        creado: now(),
      };
      await db.detectados.put(d);
      ya.add(c.id);
      r.nuevos++;
    }
  });
  return r;
}

/** Lee el correo desde la última lectura (o los últimos 30 días) y guarda la hora de esta lectura. */
export async function leerCorreo(f: typeof fetch = fetch): Promise<ResultadoLectura | null> {
  const cfg = (await db.ajustes.get('main'))?.correo;
  if (!cfg?.url || !cfg.clave) return null;
  const inicio = now();
  // Un margen de 1 día por si un correo llegó atrasado; los repetidos se descartan por id.
  const desde = cfg.ultimaLectura ? new Date(new Date(cfg.ultimaLectura).getTime() - 86_400_000).toISOString() : new Date(`${sumarDias(todayISO(), -DIAS_PRIMERA_LECTURA)}T00:00:00`).toISOString();
  const { mensajes, email } = await pedirCorreos(cfg, desde, f);
  const r = await guardarCorreos(mensajes);
  await guardarAjustes({ correo: { ...cfg, email: email ?? cfg.email, ultimaLectura: inicio } });
  return r;
}

export const conectarCorreo = (url: string, clave: string) => guardarAjustes({ correo: { url: url.trim(), clave: clave.trim() } });

/** Deja de leer el correo y borra los detectados que estaban por confirmar (los anotados se quedan). */
export async function desconectarCorreo() {
  await db.detectados.where('estado').equals('pendiente').delete();
  await guardarAjustes({ correo: undefined });
}

export interface CambiosDetectado {
  descripcion?: string;
  monto?: number;
  fecha?: string;
  medioId?: string;
  categoriaId?: string;
}

/** Anota un detectado como gasto propio ("solo yo"). Si es compartido, se edita después como cualquier gasto. */
export async function anotarDetectado(id: string, cambios: CambiosDetectado = {}): Promise<string | undefined> {
  const d = await db.detectados.get(id);
  if (!d || d.estado !== 'pendiente') return undefined;
  const monto = cambios.monto ?? d.monto;
  const gastoId = await guardarGasto(
    {
      descripcion: cambios.descripcion ?? d.comercio,
      fecha: cambios.fecha ?? d.fecha,
      modo: 'solo',
      yoIncluido: true,
      misPartes: 1,
      exactos: {},
      partes: {},
      pagador: 'yo',
      medioId: cambios.medioId ?? d.medioId,
      categoriaId: cambios.categoriaId ?? d.categoriaId,
      nota: `Detectado en el correo: ${d.asunto}`,
    },
    { amount: monto, rows: [], mine: monto, remaining: 0, ok: true },
  );
  await db.detectados.update(id, { estado: 'anotado', gastoId });
  return gastoId;
}

/**
 * Transferencia → pago con una persona: si la recibí, "me pagó"; si la envié, "le pagué".
 */
export async function anotarPagoDetectado(id: string, personaId?: string, monto?: number): Promise<string | undefined> {
  const d = await db.detectados.get(id);
  const pid = personaId ?? d?.personaId;
  if (!d || d.estado !== 'pendiente' || !pid) return undefined;
  const movId = await guardarPago(pid, monto ?? d.monto, 'Transferencia', d.fecha, undefined, d.tipo === 'recibido' ? 'pago' : 'abono');
  await db.detectados.update(id, { estado: 'anotado', personaId: pid, movimientoId: movId });
  return movId;
}

/** "Ya lo tenía": lo vincula al gasto que ya estaba anotado, sin crear otro. */
export async function vincularDetectado(id: string, gastoId: string) {
  await db.detectados.update(id, { estado: 'anotado', gastoId });
}

export async function descartarDetectado(id: string): Promise<Detectado | undefined> {
  const d = await db.detectados.get(id);
  await db.detectados.update(id, { estado: 'descartado' });
  return d;
}

/** Deshacer: vuelve a dejarlo como estaba. */
export const restaurarDetectado = (d: Detectado) => db.detectados.put(d);
