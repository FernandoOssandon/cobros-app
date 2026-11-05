// Metas de ahorro: guardar, borrar y aportes a mano.
import { CAT_COLORS, db, now, uid, type Meta } from './db';
import { todayISO } from './lib/format';

export type MetaDraft = Omit<Meta, 'id' | 'creado' | 'orden' | 'archivada' | 'color' | 'aportes'> & Partial<Pick<Meta, 'id' | 'aportes'>>;

export async function guardarMeta(m: MetaDraft): Promise<string> {
  const prev = m.id ? await db.metas.get(m.id) : undefined;
  const id = m.id ?? uid();
  const n = await db.metas.count();
  await db.metas.put({
    archivada: false,
    aportes: [],
    color: CAT_COLORS[n % CAT_COLORS.length],
    ...prev,
    ...m,
    nombre: m.nombre.trim(),
    monto: Math.max(0, Math.round(m.monto)),
    id,
    orden: prev?.orden ?? n + 1,
    creado: prev?.creado ?? now(),
  });
  return id;
}

/** Borra una meta (la plata no se toca: la meta es solo una marca). Devuelve una copia para deshacer. */
export async function borrarMeta(id: string): Promise<Meta | undefined> {
  const m = await db.metas.get(id);
  await db.metas.delete(id);
  return m;
}

/** Aporte (positivo) o retiro (negativo) a una meta sin cuenta ligada. */
export async function aportarMeta(id: string, monto: number, fecha = todayISO()): Promise<string | undefined> {
  const m = await db.metas.get(id);
  if (!m || !monto) return undefined;
  const aid = uid();
  await db.metas.update(id, { aportes: [...m.aportes, { id: aid, fecha, monto: Math.round(monto) }] });
  return aid;
}

export async function quitarAporte(id: string, aporteId: string) {
  const m = await db.metas.get(id);
  if (m) await db.metas.update(id, { aportes: m.aportes.filter((a) => a.id !== aporteId) });
}
