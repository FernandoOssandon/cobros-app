// Base de datos local (IndexedDB vía Dexie): esquema, migraciones y operaciones.
//
// Modelo (versión 2 de los datos):
// - Gasto: todo lo que se paga. Puede ser solo mío, compartido o pagado por otra persona.
// - Movimiento: lo que cambia el saldo con una persona.
//     cargo  → la persona me debe           (+)
//     pago   → la persona me pagó           (−)
//     deuda  → yo le debo (pagó por mí)     (−)
//     abono  → yo le pagué                  (+)
//   Saldo neto = cargos − pagos − deudas + abonos. Positivo: te debe. Negativo: le debes.
// - Recurrente: plantilla que genera gastos o cargos cada cierto tiempo.
import Dexie, { type EntityTable, type Transaction } from 'dexie';
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

export type TipoMedio = 'credito' | 'debito' | 'efectivo' | 'transferencia';

/** Paletas del diseño v2 (los textos sobre estos colores van siempre en #0E1A12). */
export const AVATAR_COLORS = ['#7FD9A8', '#FFD36E', '#9EC9FF', '#FF9E8A', '#D9B8FF', '#BDE7E0'];
export const CAT_COLORS = ['#FFD36E', '#9EC9FF', '#7FD9A8', '#D9B8FF', '#FF9E8A', '#BDE7E0'];
export const MEDIO_COLORS = ['#9EC9FF', '#FFD36E', '#7FD9A8', '#FF9E8A', '#D9B8FF', '#E9E4D4'];
export const ICONOS_CATEGORIA = ['comida', 'transporte', 'casa', 'subs', 'salidas', 'salud', 'regalo', 'libro'] as const;

/** Medio de pago con nombre (ej. "Visa BCI"). */
export interface Medio {
  id: string;
  nombre: string;
  tipo: TipoMedio;
  /** Color de la tarjeta (uno de MEDIO_COLORS). */
  color: string;
  /** Día de facturación de una tarjeta de crédito (1–31), para agrupar por período. */
  diaFacturacion?: number;
  archivado: boolean;
  orden: number;
  creado: string;
}

export interface Categoria {
  id: string;
  nombre: string;
  /** Clave del ícono (una de ICONOS_CATEGORIA; la interfaz la traduce a un SVG). */
  icono: string;
  /** Color pastel (uno de CAT_COLORS). */
  color: string;
  orden: number;
  archivada: boolean;
}

/** Grupo o evento (ej. "Viaje a Pucón"). */
export interface Grupo {
  id: string;
  nombre: string;
  archivado: boolean;
  creado: string;
}

/** 'solo' = gasto 100% mío; el resto son los modos de reparto entre personas. */
export type ModoGasto = SplitMode | 'solo';

export interface Gasto {
  id: string;
  descripcion: string;
  total: number;
  fecha: string; // YYYY-MM-DD
  /** 'yo' o el id de la persona que pagó. */
  pagador: 'yo' | string;
  medioId?: string;
  categoriaId?: string;
  grupoId?: string;
  recurrenteId?: string;
  modo: ModoGasto;
  yoIncluido: boolean;
  miParte: number;
  misPartes: number;
  participantes: string[];
  exactos: Record<string, number>;
  partes: Record<string, number>;
  /** Parte calculada de cada participante (incluida la de quien pagó, si no fui yo). */
  montos?: Record<string, number>;
  nota?: string;
  creado: string;
}

export type TipoMovimiento = 'cargo' | 'pago' | 'deuda' | 'abono';

export interface Movimiento {
  id: string;
  personaId: string;
  tipo: TipoMovimiento;
  /** Cargo/deuda: descripción. Pago/abono: medio (Transferencia / Efectivo). */
  detalle: string;
  monto: number;
  fecha: string; // YYYY-MM-DD
  gastoId?: string;
  recurrenteId?: string;
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

export type TipoRecurrente = 'mio' | 'compartido' | 'cobro';
export type UnidadFrecuencia = 'dia' | 'semana' | 'mes' | 'anio';

export interface Frecuencia {
  unidad: UnidadFrecuencia;
  /** Cada cuántas unidades (1 = todos los meses, 2 = cada 2 meses…). */
  cada: number;
  /** Para 'mes': día del mes (1–31; si el mes es más corto, se usa el último día). */
  dia?: number;
}

export interface Reparto {
  /** Total con que se definió el reparto (para escalar montos exactos cuando el monto es variable). */
  baseTotal?: number;
  modo: SplitMode;
  yoIncluido: boolean;
  misPartes: number;
  participantes: string[];
  exactos: Record<string, number>;
  partes: Record<string, number>;
}

export interface Recurrente {
  id: string;
  nombre: string;
  tipo: TipoRecurrente;
  /** 'fijo' se anota solo; 'variable' queda "por confirmar" para ingresar el monto real. */
  montoTipo: 'fijo' | 'variable';
  /** Monto fijo o, si es variable, el último monto como referencia. */
  monto: number;
  frecuencia: Frecuencia;
  inicio: string; // YYYY-MM-DD, primera ocurrencia
  fin?: string; // YYYY-MM-DD, inclusive
  medioId?: string;
  categoriaId?: string;
  /** Solo para 'compartido'. */
  reparto?: Reparto;
  /** Solo para 'cobro'. */
  personaId?: string;
  /** Última fecha ya generada (o confirmada/saltada). */
  generadoHasta?: string;
  /** Fecha de la última ocurrencia variable confirmada (para "en octubre llegaron $X"). */
  ultimoConfirmado?: string;
  activo: boolean;
  creado: string;
}

/**
 * Ocurrencia de un recurrente que espera una acción:
 * - 'confirmar': monto variable, hay que decir cuánto llegó.
 * - 'anotar': monto fijo de un mes anterior (la app no se abrió a tiempo); se anota con "Anotar los N".
 */
export interface Pendiente {
  id: string;
  recurrenteId: string;
  fecha: string;
  tipo: 'confirmar' | 'anotar';
  creado: string;
}

export interface Foto {
  id: string;
  gastoId: string;
  blob: Blob;
  creado: string;
}

export type Tema = 'claro' | 'oscuro' | 'sistema';

export interface Ajustes {
  id: 'main';
  miNombre: string;
  datosBancarios: string;
  incluirDatos: boolean;
  tema: Tema;
  ultimoRespaldo?: string;
  /** Avisar si pasan más de 7 días sin respaldo. */
  recordarRespaldo: boolean;
  /** Ya pasó (o saltó) la pantalla "Agrega tus tarjetas". */
  onboardingHecho: boolean;
}

export const AJUSTES_DEFAULT: Ajustes = {
  id: 'main',
  miNombre: '',
  datosBancarios: '',
  incluirDatos: true,
  tema: 'sistema',
  recordarRespaldo: true,
  onboardingHecho: false,
};

export const CATEGORIAS_DEFAULT: Omit<Categoria, 'archivada'>[] = [
  { id: 'cat-comida', nombre: 'Comida', icono: 'comida', color: '#FFD36E', orden: 1 },
  { id: 'cat-transporte', nombre: 'Transporte', icono: 'transporte', color: '#9EC9FF', orden: 2 },
  { id: 'cat-casa', nombre: 'Casa', icono: 'casa', color: '#7FD9A8', orden: 3 },
  { id: 'cat-suscripciones', nombre: 'Suscripciones', icono: 'subs', color: '#D9B8FF', orden: 4 },
  { id: 'cat-salidas', nombre: 'Salidas', icono: 'salidas', color: '#FF9E8A', orden: 5 },
  { id: 'cat-salud', nombre: 'Salud', icono: 'salud', color: '#BDE7E0', orden: 6 },
];

/** El efectivo viene incluido (pantalla "Agrega tus tarjetas"). */
export const MEDIO_EFECTIVO: Omit<Medio, 'creado'> = {
  id: 'medio-efectivo', nombre: 'Efectivo', tipo: 'efectivo', color: '#7FD9A8', archivado: false, orden: 0,
};

type DB = Dexie & {
  personas: EntityTable<Persona, 'id'>;
  gastos: EntityTable<Gasto, 'id'>;
  movimientos: EntityTable<Movimiento, 'id'>;
  cobros: EntityTable<Cobro, 'id'>;
  ajustes: EntityTable<Ajustes, 'id'>;
  medios: EntityTable<Medio, 'id'>;
  categorias: EntityTable<Categoria, 'id'>;
  grupos: EntityTable<Grupo, 'id'>;
  recurrentes: EntityTable<Recurrente, 'id'>;
  pendientes: EntityTable<Pendiente, 'id'>;
  fotos: EntityTable<Foto, 'id'>;
};

export const db = new Dexie('me-debes') as DB;

// v1: primera versión publicada (cargos compartidos).
db.version(1).stores({
  personas: 'id',
  cargos: 'id, fecha',
  movimientos: 'id, personaId, cargoId, fecha',
  cobros: 'id, personaId, fecha',
  ajustes: 'id',
});

// v2: modelo de gastos. Copia cada cargo como un gasto pagado por mí y renombra cargoId → gastoId.
db.version(2)
  .stores({
    gastos: 'id, fecha, pagador, medioId, categoriaId, grupoId, recurrenteId',
    movimientos: 'id, personaId, cargoId, gastoId, recurrenteId, fecha',
    medios: 'id',
    categorias: 'id',
    grupos: 'id',
    recurrentes: 'id',
    pendientes: 'id, recurrenteId, fecha',
    fotos: 'id, gastoId',
  })
  .upgrade(migrarV1aV2);

// v3: elimina la tabla antigua de cargos y el índice cargoId.
db.version(3).stores({
  cargos: null,
  movimientos: 'id, personaId, gastoId, recurrenteId, fecha',
});

// v4 (app 2.0): colores de categorías y medios, efectivo incluido, montos por persona y tipo de pendiente.
db.version(4)
  .stores({ pendientes: 'id, recurrenteId, fecha, tipo' })
  .upgrade(migrarV3aV4);

/** Migración v3 → v4. Exportada para poder probarla. */
export async function migrarV3aV4(tx: Transaction) {
  // Categorías: color e ícono del diseño 2.0. "Otros" se quita si nadie la usa.
  const porDefecto = new Map(CATEGORIAS_DEFAULT.map((c) => [c.id, c]));
  const usadas = new Set((await tx.table('gastos').toArray()).map((g: Gasto) => g.categoriaId).filter(Boolean));
  const cats = (await tx.table('categorias').toArray()) as Categoria[];
  for (const [i, c] of cats.entries()) {
    const d = porDefecto.get(c.id);
    if (c.id === 'cat-otros' && !usadas.has(c.id)) {
      await tx.table('categorias').delete(c.id);
      continue;
    }
    const icono = d?.icono ?? (ICONOS_CATEGORIA.includes(c.icono as never) ? c.icono : 'regalo');
    await tx.table('categorias').put({ ...c, icono, color: c.color ?? d?.color ?? CAT_COLORS[i % CAT_COLORS.length] });
  }
  // Medios: el color pasa de índice a hex. El efectivo viene incluido.
  const medios = (await tx.table('medios').toArray()) as (Omit<Medio, 'color'> & { color: unknown })[];
  for (const m of medios) {
    if (typeof m.color === 'number') await tx.table('medios').put({ ...m, color: MEDIO_COLORS[m.color % MEDIO_COLORS.length] });
  }
  if (!medios.some((m) => m.tipo === 'efectivo')) await tx.table('medios').put({ ...MEDIO_EFECTIVO, creado: new Date().toISOString() });
  // Gastos: guarda la parte de cada participante (antes solo estaba en los movimientos).
  const movs = (await tx.table('movimientos').toArray()) as Movimiento[];
  await tx
    .table('gastos')
    .toCollection()
    .modify((g: Gasto) => {
      if (g.montos) return;
      g.montos = Object.fromEntries(movs.filter((m) => m.gastoId === g.id && m.tipo === 'cargo').map((m) => [m.personaId, m.monto]));
    });
  await tx
    .table('pendientes')
    .toCollection()
    .modify((p: Pendiente) => {
      if (!p.tipo) p.tipo = 'confirmar';
    });
  const aj = await tx.table('ajustes').get('main');
  if (aj && aj.onboardingHecho === undefined) await tx.table('ajustes').put({ ...aj, onboardingHecho: false });
}

/** Migración v1 → v2. Exportada para poder probarla. */
export async function migrarV1aV2(tx: Transaction) {
  // Registros con la forma de la v1 (tipados sueltos a propósito).
  type CargoV1 = Omit<Gasto, 'pagador' | 'modo'> & { modo: SplitMode };
  type MovV1 = Movimiento & { cargoId?: string };
  const cargos = (await tx.table('cargos').toArray()) as CargoV1[];
  await tx.table('gastos').bulkPut(cargos.map((c): Gasto => ({ ...c, pagador: 'yo' })));
  await tx
    .table('movimientos')
    .toCollection()
    .modify((m: MovV1) => {
      if (m.cargoId) m.gastoId = m.cargoId;
      delete m.cargoId;
    });
  await sembrarCategorias(tx.table('categorias'));
  const aj = await tx.table('ajustes').get('main');
  if (aj && aj.recordarRespaldo === undefined) await tx.table('ajustes').put({ ...aj, recordarRespaldo: true });
}

async function sembrarCategorias(t: { count(): Promise<number>; bulkPut(x: unknown[]): Promise<unknown> }) {
  if ((await t.count()) === 0) await t.bulkPut(CATEGORIAS_DEFAULT.map((c) => ({ ...c, archivada: false })));
}

// Base nueva (primer uso): categorías por defecto y efectivo.
db.on('populate', async (tx) => {
  await sembrarCategorias(tx.table('categorias'));
  await tx.table('medios').put({ ...MEDIO_EFECTIVO, creado: new Date().toISOString() });
});

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
export const now = () => new Date().toISOString();

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

// ---------- Gastos ----------

export interface GastoDraft {
  descripcion: string;
  fecha: string;
  modo: ModoGasto;
  yoIncluido: boolean;
  misPartes: number;
  exactos: Record<string, number>;
  partes: Record<string, number>;
  pagador?: 'yo' | string;
  medioId?: string;
  categoriaId?: string;
  grupoId?: string;
  recurrenteId?: string;
  nota?: string;
}

/**
 * Construye el gasto y sus movimientos (sin guardar). Reglas:
 * - Pagué yo: cada participante con monto > 0 queda con un 'cargo' (me debe su parte).
 * - Pagó otra persona: solo se registra mi parte como 'deuda' con quien pagó
 *   (lo que otros le deban a esa persona no es asunto de esta app).
 */
export function armarGasto(d: GastoDraft, split: SplitResult, id: string, creado: string): { gasto: Gasto; movs: Movimiento[] } {
  const descripcion = d.descripcion.trim() || (d.modo === 'solo' ? 'Gasto' : 'Gasto compartido');
  const pagador = d.pagador ?? 'yo';
  const solo = d.modo === 'solo';
  const gasto: Gasto = {
    id,
    descripcion,
    total: split.amount,
    fecha: d.fecha,
    pagador,
    medioId: pagador === 'yo' ? d.medioId : undefined,
    categoriaId: d.categoriaId,
    grupoId: d.grupoId,
    recurrenteId: d.recurrenteId,
    modo: d.modo,
    yoIncluido: solo ? true : d.yoIncluido,
    miParte: solo ? split.amount : split.mine,
    misPartes: d.misPartes,
    participantes: solo ? [] : split.rows.map((r) => r.id),
    exactos: d.exactos,
    partes: d.partes,
    montos: solo ? {} : Object.fromEntries(split.rows.map((r) => [r.id, r.v])),
    nota: d.nota,
    creado,
  };
  let movs: Movimiento[] = [];
  if (pagador === 'yo') {
    movs = gasto.participantes
      .map((pid) => ({ pid, v: split.rows.find((r) => r.id === pid)?.v ?? 0 }))
      .filter((x) => x.v > 0)
      .map((x, i) => ({
        id: `${id}:${i}`,
        personaId: x.pid,
        tipo: 'cargo' as const,
        detalle: descripcion,
        monto: x.v,
        fecha: d.fecha,
        gastoId: id,
        recurrenteId: d.recurrenteId,
        creado,
      }));
  } else if (gasto.miParte > 0) {
    movs = [{ id: `${id}:deuda`, personaId: pagador, tipo: 'deuda', detalle: descripcion, monto: gasto.miParte, fecha: d.fecha, gastoId: id, recurrenteId: d.recurrenteId, creado }];
  }
  return { gasto, movs };
}

/** Crea o reemplaza un gasto y regenera sus movimientos. Devuelve el id. */
export async function guardarGasto(d: GastoDraft, split: SplitResult, existingId?: string, fixedId?: string): Promise<string> {
  const id = existingId ?? fixedId ?? uid();
  await db.transaction('rw', db.gastos, db.movimientos, async () => {
    const prev = await db.gastos.get(id);
    const { gasto, movs } = armarGasto(d, split, id, prev?.creado ?? now());
    await db.gastos.put(gasto);
    await db.movimientos.where('gastoId').equals(id).delete();
    await db.movimientos.bulkPut(movs);
  });
  return id;
}

/** Copia de lo borrado, para poder deshacer. */
export interface Snapshot {
  gastos: Gasto[];
  movimientos: Movimiento[];
  cobros: Cobro[];
  fotos?: Foto[];
}

export async function borrarGasto(id: string): Promise<Snapshot> {
  return db.transaction('rw', [db.gastos, db.movimientos, db.fotos], async () => {
    const g = await db.gastos.get(id);
    const movimientos = await db.movimientos.where('gastoId').equals(id).toArray();
    const fotos = await db.fotos.where('gastoId').equals(id).toArray();
    await db.movimientos.where('gastoId').equals(id).delete();
    await db.fotos.where('gastoId').equals(id).delete();
    await db.gastos.delete(id);
    return { gastos: g ? [g] : [], movimientos, cobros: [], fotos };
  });
}

export async function restaurar(s: Snapshot) {
  await db.transaction('rw', [db.gastos, db.movimientos, db.cobros, db.fotos], async () => {
    await db.gastos.bulkPut(s.gastos);
    await db.movimientos.bulkPut(s.movimientos);
    await db.cobros.bulkPut(s.cobros);
    if (s.fotos?.length) await db.fotos.bulkPut(s.fotos);
  });
}

// ---------- Pagos y abonos ----------

/** 'pago' = la persona me pagó · 'abono' = yo le pagué a la persona. */
export async function guardarPago(
  personaId: string,
  monto: number,
  medio: string,
  fecha: string,
  existingId?: string,
  tipo: 'pago' | 'abono' = 'pago',
) {
  if (existingId) {
    await db.movimientos.update(existingId, { monto, detalle: medio, fecha });
    return existingId;
  }
  const id = uid();
  await db.movimientos.add({ id, personaId, tipo, detalle: medio, monto, fecha, creado: now() });
  return id;
}

export async function borrarMovimiento(id: string): Promise<Snapshot> {
  const m = await db.movimientos.get(id);
  await db.movimientos.delete(id);
  return { gastos: [], movimientos: m ? [m] : [], cobros: [] };
}

// ---------- Cobros ----------

export async function registrarCobro(c: Omit<Cobro, 'id' | 'fecha' | 'medio'>) {
  await db.cobros.add({ ...c, id: uid(), fecha: now(), medio: 'WhatsApp' });
}

export async function borrarCobro(id: string): Promise<Snapshot> {
  const c = await db.cobros.get(id);
  await db.cobros.delete(id);
  return { gastos: [], movimientos: [], cobros: c ? [c] : [] };
}

// ---------- Medios, categorías y grupos ----------

export async function guardarMedio(m: Omit<Medio, 'id' | 'creado' | 'orden' | 'archivado'> & Partial<Pick<Medio, 'id' | 'archivado'>>) {
  const prev = m.id ? await db.medios.get(m.id) : undefined;
  const id = m.id ?? uid();
  await db.medios.put({ archivado: false, ...prev, ...m, id, orden: prev?.orden ?? (await db.medios.count()) + 1, creado: prev?.creado ?? now() });
  return id;
}

export async function guardarCategoria(c: Omit<Categoria, 'id' | 'orden' | 'archivada'> & Partial<Pick<Categoria, 'id' | 'archivada'>>) {
  const prev = c.id ? await db.categorias.get(c.id) : undefined;
  const id = c.id ?? uid();
  await db.categorias.put({ archivada: false, ...prev, ...c, id, orden: prev?.orden ?? (await db.categorias.count()) + 1 });
  return id;
}

export async function guardarGrupo(nombre: string, id?: string) {
  const prev = id ? await db.grupos.get(id) : undefined;
  const gid = id ?? uid();
  await db.grupos.put({ archivado: false, ...prev, id: gid, nombre: nombre.trim(), creado: prev?.creado ?? now() });
  return gid;
}

// ---------- Fotos ----------

export async function agregarFoto(gastoId: string, blob: Blob) {
  const id = uid();
  await db.fotos.add({ id, gastoId, blob, creado: now() });
  return id;
}

export const borrarFoto = (id: string) => db.fotos.delete(id);

// ---------- Ajustes ----------

export const guardarAjustes = async (patch: Partial<Omit<Ajustes, 'id'>>) => {
  const cur = (await db.ajustes.get('main')) ?? AJUSTES_DEFAULT;
  await db.ajustes.put({ ...AJUSTES_DEFAULT, ...cur, ...patch, id: 'main' });
};

export async function borrarTodo() {
  await db.transaction(
    'rw',
    [db.personas, db.gastos, db.movimientos, db.cobros, db.medios, db.grupos, db.recurrentes, db.pendientes, db.fotos],
    async () => {
      await Promise.all(
        [db.personas, db.gastos, db.movimientos, db.cobros, db.medios, db.grupos, db.recurrentes, db.pendientes, db.fotos].map((t) => t.clear()),
      );
      await db.medios.put({ ...MEDIO_EFECTIVO, creado: now() });
    },
  );
}

/** Quita un medio: si ningún gasto lo usa se borra; si no, se archiva (deja de aparecer en las opciones). */
export async function quitarMedio(id: string) {
  const usado = await db.gastos.where('medioId').equals(id).count();
  if (usado) await db.medios.update(id, { archivado: true });
  else await db.medios.delete(id);
}
