// Respaldo: exportar e importar todos los datos en un archivo JSON.
// Formato v3 (actual). También acepta respaldos v2 (primera versión de la app) y los convierte.
import {
  AJUSTES_DEFAULT, db, now, guardarAjustes,
  type Ajustes, type Categoria, type Cobro, type Gasto, type Grupo, type Medio,
  type Movimiento, type Pendiente, type Persona, type Recurrente,
} from './db';

export interface FotoRespaldo {
  id: string;
  gastoId: string;
  /** Imagen como data URL (base64). */
  dataUrl: string;
  creado: string;
}

export interface Respaldo {
  app: 'me-debes';
  version: 3;
  exportado: string;
  personas: Persona[];
  gastos: Gasto[];
  movimientos: Movimiento[];
  cobros: Cobro[];
  medios: Medio[];
  categorias: Categoria[];
  grupos: Grupo[];
  recurrentes: Recurrente[];
  pendientes: Pendiente[];
  fotos: FotoRespaldo[];
  ajustes: Ajustes;
}

const blobToDataUrl = async (b: Blob) => {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${b.type || 'application/octet-stream'};base64,${btoa(bin)}`;
};

const dataUrlToBlob = (u: string) => {
  const [head, b64] = u.split(',');
  const type = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
};

/** Arma el respaldo completo. No marca la fecha de respaldo (eso se hace cuando el archivo sale del teléfono). */
export async function construirRespaldo(): Promise<Respaldo> {
  const [personas, gastos, movimientos, cobros, medios, categorias, grupos, recurrentes, pendientes, fotos, ajustes] = await Promise.all([
    db.personas.toArray(), db.gastos.toArray(), db.movimientos.toArray(), db.cobros.toArray(),
    db.medios.toArray(), db.categorias.toArray(), db.grupos.toArray(), db.recurrentes.toArray(),
    db.pendientes.toArray(), db.fotos.toArray(), db.ajustes.get('main'),
  ]);
  return {
    app: 'me-debes', version: 3, exportado: now(),
    personas, gastos, movimientos, cobros, medios, categorias, grupos, recurrentes, pendientes,
    fotos: await Promise.all(fotos.map(async (f) => ({ id: f.id, gastoId: f.gastoId, creado: f.creado, dataUrl: await blobToDataUrl(f.blob) }))),
    ajustes: { ...AJUSTES_DEFAULT, ...ajustes },
  };
}

export const marcarRespaldo = (fecha = now()) => guardarAjustes({ ultimoRespaldo: fecha });

const TIPOS = new Set(['cargo', 'pago', 'deuda', 'abono']);

/** Valida un respaldo leído desde un archivo (v2 o v3). Lanza un Error con un mensaje legible si no sirve. */
export function validarRespaldo(data: unknown): Respaldo {
  const r = data as Record<string, unknown> | null;
  if (!r || r.app !== 'me-debes' || (r.version !== 2 && r.version !== 3)) throw new Error('El archivo no es un respaldo de Me Debes');
  const v3 = r.version === 3 ? (r as unknown as Respaldo) : convertirV2(r);
  for (const k of ['personas', 'gastos', 'movimientos', 'cobros'] as const) {
    if (!Array.isArray(v3[k])) throw new Error('El respaldo está incompleto');
  }
  for (const m of v3.movimientos) {
    if (typeof m.monto !== 'number' || !m.personaId || !TIPOS.has(m.tipo)) throw new Error('El respaldo tiene movimientos dañados');
  }
  return {
    ...v3,
    medios: v3.medios ?? [], categorias: v3.categorias ?? [], grupos: v3.grupos ?? [],
    recurrentes: v3.recurrentes ?? [], pendientes: v3.pendientes ?? [], fotos: v3.fotos ?? [],
  };
}

/** Respaldo v2 (cargos) → v3 (gastos). */
function convertirV2(r: Record<string, unknown>): Respaldo {
  if (!Array.isArray(r.cargos) || !Array.isArray(r.movimientos)) throw new Error('El respaldo está incompleto');
  return {
    app: 'me-debes', version: 3, exportado: String(r.exportado ?? now()),
    personas: r.personas as Persona[],
    gastos: (r.cargos as Gasto[]).map((c) => ({ ...c, pagador: 'yo' })),
    movimientos: (r.movimientos as (Movimiento & { cargoId?: string })[]).map(({ cargoId, ...m }) => ({ ...m, ...(cargoId ? { gastoId: cargoId } : {}) })),
    cobros: r.cobros as Cobro[],
    medios: [], categorias: [], grupos: [], recurrentes: [], pendientes: [], fotos: [],
    ajustes: { ...AJUSTES_DEFAULT, ...(r.ajustes as Partial<Ajustes>) },
  };
}

/** Reemplaza todos los datos por los del respaldo. Si el respaldo no trae categorías, conserva las actuales. */
export async function importarRespaldo(r: Respaldo) {
  const tablas = [db.personas, db.gastos, db.movimientos, db.cobros, db.medios, db.categorias, db.grupos, db.recurrentes, db.pendientes, db.fotos, db.ajustes];
  await db.transaction('rw', tablas, async () => {
    await Promise.all([db.personas, db.gastos, db.movimientos, db.cobros, db.medios, db.grupos, db.recurrentes, db.pendientes, db.fotos].map((t) => t.clear()));
    await db.personas.bulkAdd(r.personas);
    await db.gastos.bulkAdd(r.gastos);
    await db.movimientos.bulkAdd(r.movimientos);
    await db.cobros.bulkAdd(r.cobros);
    await db.medios.bulkAdd(r.medios);
    if (r.categorias.length) {
      await db.categorias.clear();
      await db.categorias.bulkAdd(r.categorias);
    }
    await db.grupos.bulkAdd(r.grupos);
    await db.recurrentes.bulkAdd(r.recurrentes);
    await db.pendientes.bulkAdd(r.pendientes);
    await db.fotos.bulkAdd(r.fotos.map((f) => ({ id: f.id, gastoId: f.gastoId, creado: f.creado, blob: dataUrlToBlob(f.dataUrl) })));
    if (r.ajustes) await db.ajustes.put({ ...AJUSTES_DEFAULT, ...r.ajustes, id: 'main' });
  });
}

/** ¿Hay que recordar respaldar? Cuenta desde el último respaldo o, si nunca hubo, desde el primer registro. */
export function diasSinRespaldo(ajustes: Ajustes, primerRegistro: string | undefined, hoy = new Date()): number | null {
  const desde = ajustes.ultimoRespaldo ?? primerRegistro;
  if (!desde) return null;
  return Math.floor((hoy.getTime() - new Date(desde).getTime()) / 86_400_000);
}

/** Entrega el archivo: menú de compartir del teléfono si está disponible; si no, descarga. Devuelve false si el usuario canceló. */
export async function entregarArchivo(nombre: string, contenido: string, tipo: string): Promise<boolean> {
  const file = new File([contenido], nombre, { type: tipo });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && typeof nav.share === 'function') {
    try {
      await nav.share({ files: [file], title: nombre });
      return true;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return false;
      // Otro error (p. ej. permiso): se cae a la descarga normal.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
