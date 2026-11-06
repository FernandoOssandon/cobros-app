// Tu cuenta de Google: una sola conexión para el respaldo en Drive y para leer los correos del banco en Gmail.
//
// Permisos:
// - drive.file: la app solo ve los archivos que ella crea (la carpeta de respaldos);
// - gmail.readonly: lectura del correo. La app solo busca correos de bancos y no envía, borra ni mueve nada.
// El permiso dura una hora y solo se renueva con un toque (así funciona Google sin un servidor).
import { SCOPE_DRIVE } from './lib/drive';
import { ErrorDrive } from './lib/drive';
import { SCOPE_GMAIL } from './lib/gmail';

/** Los dos permisos se piden juntos: un toque sirve para respaldar y para leer el correo. */
export const SCOPES = [SCOPE_DRIVE, SCOPE_GMAIL];

/** El ID de cliente puede venir en la compilación (variable VITE_GOOGLE_CLIENT_ID en Netlify) o escribirse en la app. */
const CLIENT_ID_COMPILADO = (import.meta.env?.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || undefined;
export const hayClientIdCompilado = !!CLIENT_ID_COMPILADO;
export const clientIdDe = (cfg?: { clientId?: string }) => cfg?.clientId || CLIENT_ID_COMPILADO;

const CLAVE_TOKEN = 'a-mano-drive-token';

export function leerLocal<T>(k: string): T | null {
  try {
    const s = localStorage.getItem(k);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
export function escribirLocal(k: string, v: unknown) {
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
  /** Permisos que dio Google. Los tokens de la 3.0 no lo traen: solo tenían Drive. */
  scopes?: string[];
}
let token: Token | null = typeof window !== 'undefined' ? leerLocal<Token>(CLAVE_TOKEN) : null;

/** Hay permiso vigente (con un minuto de margen) y, si se pide, incluye ese permiso. */
export function tokenValido(scope?: string): boolean {
  if (!token || token.vence - 60_000 <= Date.now()) return false;
  return !scope || (token.scopes ?? [SCOPE_DRIVE]).includes(scope);
}

const oyentes = new Set<() => void>();
/** Avisa cuando cambia el permiso (para refrescar las pantallas). */
export function alCambiarPermiso(f: () => void) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}
const avisar = () => {
  for (const f of oyentes) f();
};

export function olvidarToken() {
  token = null;
  escribirLocal(CLAVE_TOKEN, null);
  avisar();
}

// ---------- Google Identity Services ----------

interface RespuestaToken {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
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
          initTokenClient(c: {
            client_id: string;
            scope: string;
            include_granted_scopes?: boolean;
            callback: (r: RespuestaToken) => void;
            error_callback?: (e: { type?: string }) => void;
          }): ClienteToken;
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

/** Pide permiso a Google para Drive y Gmail (abre su ventana). Tiene que llamarse desde un toque. */
export async function pedirPermiso(clientId: string, primeraVez = false): Promise<string> {
  await cargarGoogle();
  return new Promise<string>((ok, mal) => {
    const cliente = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES.join(' '),
      include_granted_scopes: true,
      callback: (r) => {
        if (r.error || !r.access_token) return mal(new ErrorDrive(r.error_description || 'Google no dio permiso.'));
        // Si Google no informa los permisos, se asume que dio los que se pidieron.
        const scopes = r.scope ? r.scope.split(/\s+/) : SCOPES;
        token = { valor: r.access_token, vence: Date.now() + Number(r.expires_in ?? 3600) * 1000, scopes };
        escribirLocal(CLAVE_TOKEN, token);
        avisar();
        ok(r.access_token);
      },
      error_callback: (e) => mal(new ErrorDrive(e?.type === 'popup_closed' ? 'Cerraste la ventana de Google.' : 'No se abrió la ventana de Google. Revisa que el navegador no la bloquee.')),
    });
    cliente.requestAccessToken({ prompt: primeraVez ? 'consent' : '' });
  });
}

/**
 * El token para usar Drive o Gmail. Sin `interactivo` solo devuelve el vigente (o null);
 * con `interactivo` (desde un toque) pide permiso si hace falta.
 */
export async function obtenerToken(interactivo: boolean, scope: string, cfg?: { clientId?: string }): Promise<string | null> {
  if (tokenValido(scope)) return token!.valor;
  if (!interactivo) return null;
  const cid = clientIdDe(cfg);
  if (!cid) throw new ErrorDrive('Falta el ID de cliente de Google.');
  await pedirPermiso(cid);
  if (!tokenValido(scope)) throw new ErrorDrive(scope === SCOPE_GMAIL ? 'Google no dio permiso para leer el correo.' : 'Google no dio permiso para Drive.');
  return token!.valor;
}

/** Revoca el permiso (al desconectar). */
export function revocarPermiso() {
  const t = token?.valor;
  olvidarToken();
  if (t) window.google?.accounts.oauth2.revoke?.(t);
}
