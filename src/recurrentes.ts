// Recurrentes: guardar plantillas y generar sus gastos/cargos al abrir la app.
//
// Tipos:
// - 'mio':        gasto fijo propio (arriendo, luz, gimnasio) → genera un gasto 100% mío.
// - 'compartido': pago el total y se reparte (Netflix con amigos) → genera un gasto con cargos a cada uno.
// - 'cobro':      alguien me paga una cuota (préstamo, pieza) → genera un cargo a esa persona, sin gasto mío.
//
// Monto fijo: se anota solo. Monto variable: queda "por confirmar" hasta que ingrese el monto real.
// Los ids generados son deterministas (`<recurrente>@<fecha>`), así que generar dos veces no duplica nada.
import { db, guardarGasto, now, uid, type Recurrente } from './db';
import { computeSplit, type SplitResult } from './lib/split';
import { ocurrenciasEntre } from './lib/recurrence';
import { todayISO } from './lib/format';

export const idOcurrencia = (recurrenteId: string, fecha: string) => `${recurrenteId}@${fecha}`;

export async function guardarRecurrente(r: Omit<Recurrente, 'id' | 'creado' | 'activo'> & Partial<Pick<Recurrente, 'id' | 'activo'>>) {
  const prev = r.id ? await db.recurrentes.get(r.id) : undefined;
  const id = r.id ?? uid();
  // Guarda el total con que se definió un reparto exacto, para poder escalarlo si el monto cambia.
  const reparto = r.reparto && { ...r.reparto, baseTotal: r.reparto.baseTotal ?? r.monto };
  await db.recurrentes.put({ activo: true, ...prev, ...r, reparto, id, creado: prev?.creado ?? now() });
  return id;
}

/** Borra la plantilla y lo que esté por confirmar. Lo ya anotado se mantiene en el historial. */
export async function borrarRecurrente(id: string) {
  await db.transaction('rw', db.recurrentes, db.pendientes, async () => {
    await db.pendientes.where('recurrenteId').equals(id).delete();
    await db.recurrentes.delete(id);
  });
}

/** Reparto de un monto según la plantilla. Si los montos exactos ya no cuadran (monto variable), se reparte en proporción. */
export function repartoRecurrente(r: Recurrente, monto: number): SplitResult {
  const rep = r.reparto;
  if (!rep) return { amount: monto, rows: [], mine: monto, remaining: 0, ok: monto > 0 };
  const base = { amount: monto, ids: rep.participantes, me: rep.yoIncluido, exact: rep.exactos, parts: rep.partes, myParts: rep.misPartes };
  const baseTotal = rep.baseTotal ?? r.monto;
  if (rep.modo !== 'exact' || monto === baseTotal) return computeSplit({ ...base, mode: rep.modo });
  // Montos exactos con un total distinto (monto variable): se reparte en la misma proporción.
  const sumaExactos = rep.participantes.reduce((s, id) => s + (rep.exactos[id] || 0), 0);
  const miParteBase = rep.yoIncluido ? Math.max(0, baseTotal - sumaExactos) : 0;
  return computeSplit({ ...base, mode: 'shares', parts: rep.exactos, myParts: miParteBase });
}

/** Anota una ocurrencia con el monto dado. */
export async function materializar(r: Recurrente, fecha: string, monto: number) {
  const id = idOcurrencia(r.id, fecha);
  if (r.tipo === 'cobro') {
    if (!r.personaId || monto <= 0) return;
    await db.movimientos.put({ id, personaId: r.personaId, tipo: 'cargo', detalle: r.nombre, monto, fecha, recurrenteId: r.id, creado: now() });
    return;
  }
  const comun = { descripcion: r.nombre, fecha, medioId: r.medioId, categoriaId: r.categoriaId, recurrenteId: r.id, exactos: {}, partes: {}, misPartes: 1 };
  if (r.tipo === 'mio') {
    await guardarGasto({ ...comun, modo: 'solo', yoIncluido: true }, { amount: monto, rows: [], mine: monto, remaining: 0, ok: true }, undefined, id);
    return;
  }
  const rep = r.reparto!;
  await guardarGasto(
    { ...comun, modo: rep.modo, yoIncluido: rep.yoIncluido, misPartes: rep.misPartes, exactos: rep.exactos, partes: rep.partes },
    repartoRecurrente(r, monto),
    undefined,
    id,
  );
}

/**
 * Se pone al día con todos los recurrentes hasta `hoy`. Se llama al abrir la app.
 * Devuelve cuántas ocurrencias se anotaron solas y cuántas quedaron por confirmar.
 */
export async function generarRecurrentes(hoy = todayISO()): Promise<{ anotados: number; porConfirmar: number }> {
  let anotados = 0;
  let porConfirmar = 0;
  const lista = (await db.recurrentes.toArray()).filter((r) => r.activo);
  for (const r of lista) {
    const fechas = ocurrenciasEntre(r.frecuencia, r.inicio, r.generadoHasta, hoy, r.fin);
    if (!fechas.length) continue;
    for (const fecha of fechas) {
      if (r.montoTipo === 'variable') {
        await db.pendientes.put({ id: idOcurrencia(r.id, fecha), recurrenteId: r.id, fecha, creado: now() });
        porConfirmar++;
      } else {
        await materializar(r, fecha, r.monto);
        anotados++;
      }
    }
    await db.recurrentes.update(r.id, { generadoHasta: fechas[fechas.length - 1] });
  }
  return { anotados, porConfirmar };
}

/** Confirma una ocurrencia variable con el monto real (y lo deja como referencia para la próxima). */
export async function confirmarPendiente(pendienteId: string, monto: number) {
  const p = await db.pendientes.get(pendienteId);
  if (!p) return;
  const r = await db.recurrentes.get(p.recurrenteId);
  if (r) {
    await materializar(r, p.fecha, monto);
    await db.recurrentes.update(r.id, { monto });
  }
  await db.pendientes.delete(pendienteId);
}

export const saltarPendiente = (pendienteId: string) => db.pendientes.delete(pendienteId);
