// Respaldo automático en Google Drive.
//
// Cómo funciona:
// - Te conectas una vez con tu cuenta de Google (permiso "drive.file": la app solo ve lo que ella crea).
// - Cada vez que cambian tus datos, al minuto y medio se sube el respaldo del día a la carpeta "a mano · respaldos"
//   (un archivo por día, el mismo JSON que "Exportar"; se guardan los últimos 30).
// - El permiso de Google dura una hora y solo se renueva con un toque (así funciona Google sin un servidor):
//   si vence y hay cambios sin subir, la app muestra "Respaldar" para hacerlo con un toque.
import { useSyncExternalStore } from 'react';
import { construirRespaldo, marcarRespaldo, validarRespaldo, type Respaldo } from './backup';
import { cambiosDatos, db, guardarAjustes } from './db';
import { alCambiarPermiso, clientIdDe, escribirLocal, leerLocal, obtenerToken, olvidarToken, pedirPermiso, revocarPermiso, tokenValido } from './google';
import {
  asegurarCarpeta, borrarArchivo, descargarRespaldo, ErrorDrive, listarRespaldos, nombreRespaldo, paraBorrar, quienSoy, SCOPE_DRIVE, subirRespaldo,
  type ArchivoDrive,
} from './lib/drive';
import { todayISO } from './lib/format';

export { cargarGoogle, clientIdDe, hayClientIdCompilado } from './google';

/** Espera tras el último cambio antes de subir (para juntar varios cambios seguidos). */
export const DEMORA_MS = 90_000;

const CLAVE_PENDIENTE = 'a-mano-drive-pendiente';

// ---------- Estado para la interfaz ----------

export interface EstadoDrive {
  /** Desde cuándo hay cambios sin subir (ISO). */
  pendienteDesde?: string;
  subiendo: boolean;
  error?: string;
  /** Hay permiso vigente (se puede subir sin tocar nada). */
  tokenOk: boolean;
}

let estado: EstadoDrive = {
  pendienteDesde: typeof window !== 'undefined' ? (leerLocal<string>(CLAVE_PENDIENTE) ?? undefined) : undefined,
  subiendo: false,
  tokenOk: tokenValido(SCOPE_DRIVE),
};
const oyentes = new Set<() => void>();
function cambiar(p: Partial<EstadoDrive> = {}) {
  estado = { ...estado, ...p, tokenOk: tokenValido(SCOPE_DRIVE) };
  for (const f of oyentes) f();
}
export const estadoDrive = () => estado;
export function useEstadoDrive(): EstadoDrive {
  return useSyncExternalStore(
    (s) => {
      oyentes.add(s);
      return () => oyentes.delete(s);
    },
    () => estado,
  );
}
/** Recalcula si el permiso sigue vigente (se llama cada minuto). */
export const refrescarEstado = () => cambiar();

/** Cuenta los cambios: si cambió algo mientras se subía, queda pendiente para la próxima. */
let cambios = 0;
function marcarPendiente() {
  cambios++;
  if (!estado.pendienteDesde) {
    const desde = new Date().toISOString();
    escribirLocal(CLAVE_PENDIENTE, desde);
    cambiar({ pendienteDesde: desde });
  }
}
cambiosDatos.addEventListener('cambio', marcarPendiente);
alCambiarPermiso(() => cambiar());

async function permiso(interactivo: boolean): Promise<string | null> {
  return obtenerToken(interactivo, SCOPE_DRIVE, (await db.ajustes.get('main'))?.drive);
}

// ---------- Conectar, respaldar, listar, restaurar ----------

/** Un respaldo sin nada no se sube solo: así un teléfono nuevo (vacío) no pisa el respaldo bueno. */
export const respaldoVacio = (r: Pick<Respaldo, 'gastos' | 'personas' | 'cuentas' | 'ingresos'>) => !r.gastos.length && !r.personas.length && !r.cuentas.length && !r.ingresos.length;

/**
 * Conecta tu cuenta de Google (una sola vez, para Drive y Gmail): pide los permisos, prepara la carpeta de respaldos
 * y, si `correo`, deja la lectura de correos con Google (si leías con el script, se reemplaza).
 * Devuelve los respaldos que ya hay en Drive.
 */
export async function conectarGoogle(clientIdEscrito?: string, op: { correo?: boolean } = {}): Promise<ArchivoDrive[]> {
  const aj = await db.ajustes.get('main');
  const prev = aj?.drive;
  const cid = clientIdEscrito?.trim() || clientIdDe(prev);
  if (!cid) throw new ErrorDrive('Falta el ID de cliente de Google.');
  const t = await pedirPermiso(cid, true);
  const email = await quienSoy(t).catch(() => undefined);
  const carpetaId = await asegurarCarpeta(t);
  const archivos = await listarRespaldos(t, carpetaId);
  const correoPrevio = aj?.correo?.modo === 'google' ? aj.correo : undefined;
  await guardarAjustes({
    drive: { ...prev, clientId: clientIdEscrito?.trim() || prev?.clientId, email, carpetaId },
    ...(op.correo ? { correo: { modo: 'google' as const, email, ultimaLectura: correoPrevio?.ultimaLectura } } : {}),
  });
  return archivos;
}

/** Desconecta tu cuenta de Google: deja de respaldar en Drive y, si leía el correo con Google, también eso. */
export async function desconectarDrive() {
  revocarPermiso();
  const aj = await db.ajustes.get('main');
  await guardarAjustes({ drive: undefined, ...(aj?.correo?.modo === 'google' ? { correo: undefined } : {}) });
  cambiar({ error: undefined });
}

export type ResultadoRespaldo = 'ok' | 'sin-permiso' | 'no-conectado' | 'vacio' | 'error';

let enCurso: Promise<ResultadoRespaldo> | null = null;

/**
 * Sube el respaldo del día. Sin `interactivo`, solo si hay permiso vigente (no abre ventanas).
 * Con `interactivo` (desde un toque), pide permiso si hace falta.
 */
export function respaldarEnDrive(op: { interactivo?: boolean } = {}): Promise<ResultadoRespaldo> {
  enCurso ??= subir(!!op.interactivo).finally(() => {
    enCurso = null;
  });
  return enCurso;
}

async function subir(interactivo: boolean): Promise<ResultadoRespaldo> {
  const cfg = (await db.ajustes.get('main'))?.drive;
  if (!cfg) return 'no-conectado';
  let t: string | null;
  try {
    t = await permiso(interactivo);
  } catch (e) {
    cambiar({ error: (e as Error).message });
    return 'error';
  }
  if (!t) {
    cambiar();
    return 'sin-permiso';
  }
  const cambiosAlInicio = cambios;
  cambiar({ subiendo: true, error: undefined });
  try {
    const r = await construirRespaldo();
    if (!interactivo && respaldoVacio(r)) {
      cambiar({ error: 'La app está vacía: no se respalda sola para no pisar tu último respaldo.' });
      return 'vacio';
    }
    const contenido = JSON.stringify(r, null, 1);
    const nombre = nombreRespaldo(todayISO());
    let carpetaId = cfg.carpetaId ?? (await asegurarCarpeta(t));
    let archivos = await listarRespaldos(t, carpetaId);
    let hoy = archivos.find((a) => a.name === nombre);
    try {
      await subirRespaldo(t, carpetaId, nombre, contenido, hoy?.id);
    } catch (e) {
      // La carpeta (o el archivo de hoy) ya no existe: se vuelve a crear.
      if (!(e instanceof ErrorDrive) || e.status !== 404) throw e;
      carpetaId = await asegurarCarpeta(t);
      archivos = await listarRespaldos(t, carpetaId);
      hoy = archivos.find((a) => a.name === nombre);
      await subirRespaldo(t, carpetaId, nombre, contenido, hoy?.id);
    }
    const todos = hoy ? archivos : [{ id: '', name: nombre, modifiedTime: new Date().toISOString() }, ...archivos];
    for (const a of paraBorrar(todos)) if (a.id) await borrarArchivo(t, a.id).catch(() => undefined);
    await guardarAjustes({ drive: { ...cfg, carpetaId, ultimaSubida: new Date().toISOString() } });
    await marcarRespaldo(r.exportado);
    // Si cambió algo mientras se subía, queda pendiente para la próxima.
    if (cambios === cambiosAlInicio) {
      escribirLocal(CLAVE_PENDIENTE, null);
      cambiar({ pendienteDesde: undefined });
    }
    return 'ok';
  } catch (e) {
    if (e instanceof ErrorDrive && e.status === 401) {
      olvidarToken();
      cambiar({ error: undefined });
      return 'sin-permiso';
    }
    cambiar({ error: e instanceof ErrorDrive ? e.message : 'No se pudo respaldar en Drive.' });
    return 'error';
  } finally {
    cambiar({ subiendo: false });
  }
}

/** Respaldos en Drive (pide permiso si hace falta: llamar desde un toque). */
export async function respaldosEnDrive(): Promise<ArchivoDrive[]> {
  const cfg = (await db.ajustes.get('main'))?.drive;
  if (!cfg) return [];
  const t = await permiso(true);
  const carpetaId = cfg.carpetaId ?? (await asegurarCarpeta(t!));
  return listarRespaldos(t!, carpetaId);
}

/** Descarga y valida un respaldo de Drive (no lo aplica: eso lo confirma la persona). */
export async function bajarRespaldo(id: string): Promise<Respaldo> {
  const t = await permiso(true);
  const texto = await descargarRespaldo(t!, id);
  try {
    return validarRespaldo(JSON.parse(texto));
  } catch (e) {
    throw e instanceof SyntaxError ? new ErrorDrive('Ese archivo no es un respaldo válido.') : e;
  }
}
