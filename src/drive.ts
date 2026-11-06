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
import { cambiosDatos, db, guardarAjustes, type ConfigDrive } from './db';
import {
  asegurarCarpeta, borrarArchivo, descargarRespaldo, ErrorDrive, listarRespaldos, nombreRespaldo, paraBorrar, quienSoy, SCOPE_DRIVE, subirRespaldo,
  type ArchivoDrive,
} from './lib/drive';
import { todayISO } from './lib/format';

/** El ID de cliente puede venir en la compilación (variable VITE_GOOGLE_CLIENT_ID en Netlify) o escribirse en la app. */
const CLIENT_ID_COMPILADO = (import.meta.env?.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || undefined;
export const hayClientIdCompilado = !!CLIENT_ID_COMPILADO;
export const clientIdDe = (cfg?: ConfigDrive) => cfg?.clientId || CLIENT_ID_COMPILADO;

/** Espera tras el último cambio antes de subir (para juntar varios cambios seguidos). */
export const DEMORA_MS = 90_000;

// ---------- Token de acceso (dura ~1 hora; se guarda en este teléfono para no pedirlo de nuevo al reabrir) ----------

const CLAVE_TOKEN = 'a-mano-drive-token';
const CLAVE_PENDIENTE = 'a-mano-drive-pendiente';

function leer<T>(k: string): T | null {
  try {
    const s = localStorage.getItem(k);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
function escribir(k: string, v: unknown) {
  try {
    if (v === null || v === undefined) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // Sin almacenamiento (modo privado): igual funciona mientras la app esté abierta.
  }
}

interface Token {
  valor: string;
  vence: number;
}
let token: Token | null = typeof window !== 'undefined' ? leer<Token>(CLAVE_TOKEN) : null;
/** Con un minuto de margen. */
export const tokenValido = () => !!token && token.vence - 60_000 > Date.now();
function olvidarToken() {
  token = null;
  escribir(CLAVE_TOKEN, null);
}

// ---------- Estado para la interfaz ----------

export interface EstadoDrive {
  /** Desde cuándo hay cambios sin subir (ISO). */
  pendienteDesde?: string;
  subiendo: boolean;
  error?: string;
  /** Hay permiso vigente (se puede subir sin tocar nada). */
  tokenOk: boolean;
}

let estado: EstadoDrive = { pendienteDesde: typeof window !== 'undefined' ? (leer<string>(CLAVE_PENDIENTE) ?? undefined) : undefined, subiendo: false, tokenOk: tokenValido() };
const oyentes = new Set<() => void>();
function cambiar(p: Partial<EstadoDrive> = {}) {
  estado = { ...estado, ...p, tokenOk: tokenValido() };
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

let ultimoCambio = 0;
function marcarPendiente() {
  ultimoCambio = Date.now();
  if (!estado.pendienteDesde) {
    const desde = new Date().toISOString();
    escribir(CLAVE_PENDIENTE, desde);
    cambiar({ pendienteDesde: desde });
  }
}
cambiosDatos.addEventListener('cambio', marcarPendiente);

// ---------- Inicio de sesión con Google (Google Identity Services) ----------

interface RespuestaToken {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}
interface ClienteToken {
  requestAccessToken(o?: { prompt?: string }): void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(c: { client_id: string; scope: string; callback: (r: RespuestaToken) => void; error_callback?: (e: { type?: string }) => void }): ClienteToken;
          revoke?(token: string, cb?: () => void): void;
        };
      };
    };
  }
}

let gis: Promise<void> | null = null;
/** Carga el script de Google (se precarga para que el toque abra la ventana sin demora). */
export function cargarGoogle(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gis ??= new Promise<void>((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => {
      gis = null;
      mal(new ErrorDrive('No se pudo cargar el inicio de sesión de Google. Revisa tu conexión.'));
    };
    document.head.appendChild(s);
  });
  return gis;
}

/** Pide permiso a Google (abre su ventana). Tiene que llamarse desde un toque. */
export async function pedirPermiso(clientId: string, primeraVez = false): Promise<string> {
  await cargarGoogle();
  return new Promise<string>((ok, mal) => {
    const cliente = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE_DRIVE,
      callback: (r) => {
        if (r.error || !r.access_token) return mal(new ErrorDrive(r.error_description || 'Google no dio permiso.'));
        token = { valor: r.access_token, vence: Date.now() + Number(r.expires_in ?? 3600) * 1000 };
        escribir(CLAVE_TOKEN, token);
        cambiar({ error: undefined });
        ok(r.access_token);
      },
      error_callback: (e) => mal(new ErrorDrive(e?.type === 'popup_closed' ? 'Cerraste la ventana de Google.' : 'No se abrió la ventana de Google. Revisa que el navegador no la bloquee.')),
    });
    cliente.requestAccessToken({ prompt: primeraVez ? 'consent' : '' });
  });
}

async function permiso(interactivo: boolean): Promise<string | null> {
  if (tokenValido()) return token!.valor;
  if (!interactivo) return null;
  const cid = clientIdDe((await db.ajustes.get('main'))?.drive);
  if (!cid) throw new ErrorDrive('Falta el ID de cliente de Google.');
  return pedirPermiso(cid);
}

// ---------- Conectar, respaldar, listar, restaurar ----------

/** Un respaldo sin nada no se sube solo: así un teléfono nuevo (vacío) no pisa el respaldo bueno. */
export const respaldoVacio = (r: Pick<Respaldo, 'gastos' | 'personas' | 'cuentas' | 'ingresos'>) => !r.gastos.length && !r.personas.length && !r.cuentas.length && !r.ingresos.length;

/** Conecta (pide permiso por primera vez) y prepara la carpeta. Devuelve los respaldos que ya hay en Drive. */
export async function conectarDrive(clientIdEscrito?: string): Promise<ArchivoDrive[]> {
  const prev = (await db.ajustes.get('main'))?.drive;
  const cid = clientIdEscrito?.trim() || clientIdDe(prev);
  if (!cid) throw new ErrorDrive('Falta el ID de cliente de Google.');
  const t = await pedirPermiso(cid, true);
  const email = await quienSoy(t).catch(() => undefined);
  const carpetaId = await asegurarCarpeta(t);
  const archivos = await listarRespaldos(t, carpetaId);
  await guardarAjustes({ drive: { ...prev, clientId: clientIdEscrito?.trim() || prev?.clientId, email, carpetaId } });
  return archivos;
}

export async function desconectarDrive() {
  const t = token?.valor;
  olvidarToken();
  if (t) window.google?.accounts.oauth2.revoke?.(t);
  await guardarAjustes({ drive: undefined });
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
  const inicio = Date.now();
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
    if (ultimoCambio < inicio) {
      escribir(CLAVE_PENDIENTE, null);
      cambiar({ pendienteDesde: undefined });
    }
    return 'ok';
  } catch (e) {
    if (e instanceof ErrorDrive && e.sinPermiso) {
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
