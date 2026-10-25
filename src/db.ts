// Base de datos local (IndexedDB vía Dexie) y todas las operaciones que la modifican.
import Dexie, { type EntityTable } from 'dexie';
import type { SplitMode, SplitResult } from './lib/split';

export interface Persona {
  id: string;
  nombre: string;
  /** Teléfono para WhatsApp (formato libre, ej. "+56 9 8123 4567"). */
  telefono: string;
  archivada: boolean;
  /** Índice del color de avatar, fijo desde que se crea. */
  color: number;
  creado: string;
}

/** Un gasto compartido. Cada participante tiene un Movimiento 'cargo' con su parte. */
export interface Cargo {
  id: string;
  descripcion: string;
  total: number;
  fecha: string; // YYYY-MM-DD
  modo: SplitMode;
  yoIncluido: boolean;
  miParte: number;
  misPartes: number;
  participantes: string[];
  exactos: Record<string, number>;
  partes: Record<string, number>;
  creado: string;
}

export interface Movimiento {
  id: string;
  personaId: string;
  tipo: 'cargo' | 'pago';
  /** Cargo: descripción del gasto. Pago: medio (Transferencia / Efectivo). */
  detalle: string;
  monto: number;
  fecha: string; // YYYY-MM-DD
  cargoId?: string;
  creado: string;
}

/** Cada vez que le cobré a alguien. */
export interface Cobro {
  id: string;
  personaId: string;
  fecha: string; // marca de tiempo ISO completa
  medio: 'WhatsApp';
  tono: string;
  monto: number;
  mensaje: string;
}

export type Tema = 'claro' | 'oscuro' | 'sistema';

export interface Ajustes {
  id: 'main';
  miNombre: string;
  datosBancarios: string;
  incluirDatos: boolean;
  tema: Tema;
  ultimoRespaldo?: string;
}

export const AJUSTES_DEFAULT: Ajustes = {
  id: 'main',
  miNombre: '',
  datosBancarios: '',
  incluirDatos: true,
  tema: 'sistema',
};

export const db = new Dexie('me-debes') as Dexie & {
  personas: EntityTable<Persona, 'id'>;
  cargos: EntityTable<Cargo, 'id'>;
  movimientos: EntityTable<Movimiento, 'id'>;
  cobros: EntityTable<Cobro, 'id'>;
  ajustes: EntityTable<Ajustes, 'id'>;
};

db.version(1).stores({
  personas: 'id',
  cargos: 'id, fecha',
  movimientos: 'id, personaId, cargoId, fecha',
  cobros: 'id, personaId, fecha',
  ajustes: 'id',
});

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
const now = () => new Date().toISOString();

// ---------- Personas ----------

export async function crearPersona(nombre: string, telefono = ''): Promise<string> {
  const id = uid();
  const n = await db.personas.count();
  await db.personas.add({ id, nombre: nombre.trim(), telefono: telefono.trim(), archivada: false, color: n % 5, creado: now() });
  return id;
}

export const actualizarPersona = (id: string, patch: Partial<Omit<Persona, 'id'>>) => db.personas.update(id, patch);

/** Solo se puede borrar a alguien sin historial; si tiene movimientos, se archiva. */
export async function borrarPersona(id: string): Promise<boolean> {
  const n = await db.movimientos.where('personaId').equals(id).count();
  if (n > 0) return false;
  await db.transaction('rw', db.personas, db.cobros, async () => {
    await db.cobros.where('personaId').equals(id).delete();
    await db.personas.delete(id);
  });
  return true;
}

// ---------- Cargos ----------

export interface CargoDraft {
  descripcion: string;
  fecha: string;
  modo: SplitMode;
  yoIncluido: boolean;
  misPartes: number;
  exactos: Record<string, number>;
  partes: Record<string, number>;
}

/** Crea o reemplaza un cargo y regenera los movimientos de cada participante. Devuelve el id. */
export async function guardarCargo(d: CargoDraft, split: SplitResult, existingId?: string): Promise<string> {
  const id = existingId ?? uid();
  const descripcion = d.descripcion.trim() || 'Gasto compartido';
  await db.transaction('rw', db.cargos, db.movimientos, async () => {
    const prev = existingId ? await db.cargos.get(existingId) : undefined;
    const creado = prev?.creado ?? now();
    await db.cargos.put({
      id,
      descripcion,
      total: split.amount,
      fecha: d.fecha,
      modo: d.modo,
      yoIncluido: d.yoIncluido,
      miParte: split.mine,
      misPartes: d.misPartes,
      participantes: split.rows.map((r) => r.id),
      exactos: d.exactos,
      partes: d.partes,
      creado,
    });
    await db.movimientos.where('cargoId').equals(id).delete();
    await db.movimientos.bulkAdd(
      split.rows
        .filter((r) => r.v > 0)
        .map((r) => ({ id: uid(), personaId: r.id, tipo: 'cargo' as const, detalle: descripcion, monto: r.v, fecha: d.fecha, cargoId: id, creado })),
    );
  });
  return id;
}

/** Copia de lo borrado, para poder deshacer. */
export interface Snapshot {
  cargos: Cargo[];
  movimientos: Movimiento[];
  cobros: Cobro[];
}

export async function borrarCargo(id: string): Promise<Snapshot> {
  return db.transaction('rw', db.cargos, db.movimientos, async () => {
    const c = await db.cargos.get(id);
    const cargos = c ? [c] : [];
    const movimientos = await db.movimientos.where('cargoId').equals(id).toArray();
    await db.movimientos.where('cargoId').equals(id).delete();
    await db.cargos.delete(id);
    return { cargos, movimientos, cobros: [] };
  });
}

export async function restaurar(s: Snapshot) {
  await db.transaction('rw', db.cargos, db.movimientos, db.cobros, async () => {
    await db.cargos.bulkPut(s.cargos);
    await db.movimientos.bulkPut(s.movimientos);
    await db.cobros.bulkPut(s.cobros);
  });
}

// ---------- Pagos ----------

export async function guardarPago(personaId: string, monto: number, medio: string, fecha: string, existingId?: string) {
  if (existingId) {
    await db.movimientos.update(existingId, { monto, detalle: medio, fecha });
    return existingId;
  }
  const id = uid();
  await db.movimientos.add({ id, personaId, tipo: 'pago', detalle: medio, monto, fecha, creado: now() });
  return id;
}

export async function borrarMovimiento(id: string): Promise<Snapshot> {
  const m = await db.movimientos.get(id);
  await db.movimientos.delete(id);
  return { cargos: [], movimientos: m ? [m] : [], cobros: [] };
}

// ---------- Cobros ----------

export async function registrarCobro(c: Omit<Cobro, 'id' | 'fecha' | 'medio'>) {
  await db.cobros.add({ ...c, id: uid(), fecha: now(), medio: 'WhatsApp' });
}

export async function borrarCobro(id: string): Promise<Snapshot> {
  const c = await db.cobros.get(id);
  await db.cobros.delete(id);
  return { cargos: [], movimientos: [], cobros: c ? [c] : [] };
}

// ---------- Ajustes ----------

export const guardarAjustes = async (patch: Partial<Omit<Ajustes, 'id'>>) => {
  const cur = (await db.ajustes.get('main')) ?? AJUSTES_DEFAULT;
  await db.ajustes.put({ ...cur, ...patch, id: 'main' });
};

// ---------- Respaldo ----------

export interface Respaldo {
  app: 'me-debes';
  version: 2;
  exportado: string;
  personas: Persona[];
  cargos: Cargo[];
  movimientos: Movimiento[];
  cobros: Cobro[];
  ajustes: Ajustes;
}

export async function exportarRespaldo(): Promise<Respaldo> {
  const exportado = now();
  await guardarAjustes({ ultimoRespaldo: exportado });
  const [personas, cargos, movimientos, cobros, ajustes] = await Promise.all([
    db.personas.toArray(),
    db.cargos.toArray(),
    db.movimientos.toArray(),
    db.cobros.toArray(),
    db.ajustes.get('main'),
  ]);
  return { app: 'me-debes', version: 2, exportado, personas, cargos, movimientos, cobros, ajustes: ajustes ?? AJUSTES_DEFAULT };
}

/** Valida un respaldo leído desde un archivo. Lanza un Error con un mensaje legible si no sirve. */
export function validarRespaldo(data: unknown): Respaldo {
  const r = data as Partial<Respaldo>;
  if (!r || r.app !== 'me-debes' || r.version !== 2) throw new Error('El archivo no es un respaldo de Me Debes');
  for (const k of ['personas', 'cargos', 'movimientos', 'cobros'] as const) {
    if (!Array.isArray(r[k])) throw new Error('El respaldo está incompleto');
  }
  for (const m of r.movimientos!) {
    if (typeof m.monto !== 'number' || !m.personaId || (m.tipo !== 'cargo' && m.tipo !== 'pago')) {
      throw new Error('El respaldo tiene movimientos dañados');
    }
  }
  return r as Respaldo;
}

export async function importarRespaldo(r: Respaldo) {
  await db.transaction('rw', [db.personas, db.cargos, db.movimientos, db.cobros, db.ajustes], async () => {
    await Promise.all([db.personas.clear(), db.cargos.clear(), db.movimientos.clear(), db.cobros.clear()]);
    await db.personas.bulkAdd(r.personas);
    await db.cargos.bulkAdd(r.cargos);
    await db.movimientos.bulkAdd(r.movimientos);
    await db.cobros.bulkAdd(r.cobros);
    if (r.ajustes) await db.ajustes.put({ ...AJUSTES_DEFAULT, ...r.ajustes, id: 'main' });
  });
}

export async function borrarTodo() {
  await db.transaction('rw', [db.personas, db.cargos, db.movimientos, db.cobros], async () => {
    await Promise.all([db.personas.clear(), db.cargos.clear(), db.movimientos.clear(), db.cobros.clear()]);
  });
}
