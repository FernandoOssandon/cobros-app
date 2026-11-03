// Presupuestos: guardar, ordenar y borrar.
import { db, now, uid, type Presupuesto } from './db';

export type PresupuestoDraft = Omit<Presupuesto, 'id' | 'creado' | 'orden' | 'archivado'> & Partial<Pick<Presupuesto, 'id' | 'archivado'>>;

export async function guardarPresupuesto(p: PresupuestoDraft): Promise<string> {
  const prev = p.id ? await db.presupuestos.get(p.id) : undefined;
  const id = p.id ?? uid();
  await db.presupuestos.put({
    archivado: false,
    ...prev,
    ...p,
    nombre: p.nombre.trim(),
    monto: Math.max(0, Math.round(p.monto)),
    id,
    orden: prev?.orden ?? (await db.presupuestos.count()) + 1,
    creado: prev?.creado ?? now(),
  });
  return id;
}

/** Borra un presupuesto. Devuelve una copia para deshacer. */
export async function borrarPresupuesto(id: string): Promise<Presupuesto | undefined> {
  const p = await db.presupuestos.get(id);
  await db.presupuestos.delete(id);
  return p;
}
