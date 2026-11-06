// Google Drive (API REST v3) para los respaldos automáticos. Sin librerías: fetch y el token de acceso.
// Permiso "drive.file": la app solo ve los archivos que ella misma creó (la carpeta de respaldos), nada más de tu Drive.

export const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.file';
export const NOMBRE_CARPETA = 'a mano · respaldos';
/** Respaldos que se guardan (uno por día); los más antiguos se borran. */
export const CONSERVAR = 30;

const API = 'https://www.googleapis.com/drive/v3';
const SUBIDA = 'https://www.googleapis.com/upload/drive/v3';
const CAMPOS = 'id,name,modifiedTime,size';
const MIME_CARPETA = 'application/vnd.google-apps.folder';

export interface ArchivoDrive {
  id: string;
  name: string;
  modifiedTime: string;
  /** Bytes (Drive lo manda como texto). */
  size?: string;
}

/** Error de Drive. `sinPermiso`: el token venció o se revocó (hay que volver a conectar). */
export class ErrorDrive extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
  get sinPermiso() {
    return this.status === 401 || this.status === 403;
  }
}

type Fetch = typeof fetch;

async function pedir<T>(token: string, url: string, init: RequestInit = {}, f: Fetch = fetch, comoTexto = false): Promise<T> {
  let res: Response;
  try {
    res = await f(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  } catch {
    throw new ErrorDrive('Sin conexión con Google Drive.');
  }
  if (!res.ok) {
    const msg = res.status === 401 ? 'El permiso de Google venció.' : res.status === 403 ? 'Google no dio permiso para Drive.' : `Google Drive respondió ${res.status}.`;
    throw new ErrorDrive(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (comoTexto ? res.text() : res.json()) as Promise<T>;
}

const q = (s: string) => encodeURIComponent(s);
const comillas = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** El correo de la cuenta de Google conectada. */
export async function quienSoy(token: string, f: Fetch = fetch): Promise<string | undefined> {
  const r = await pedir<{ user?: { emailAddress?: string } }>(token, `${API}/about?fields=${q('user(emailAddress)')}`, {}, f);
  return r.user?.emailAddress;
}

/** La carpeta de respaldos (creada antes por la app), si existe. */
export async function buscarCarpeta(token: string, f: Fetch = fetch): Promise<string | undefined> {
  const consulta = `name = '${comillas(NOMBRE_CARPETA)}' and mimeType = '${MIME_CARPETA}' and trashed = false`;
  const r = await pedir<{ files: ArchivoDrive[] }>(token, `${API}/files?q=${q(consulta)}&fields=${q(`files(${CAMPOS})`)}&orderBy=createdTime&spaces=drive`, {}, f);
  return r.files[0]?.id;
}

export async function crearCarpeta(token: string, f: Fetch = fetch): Promise<string> {
  const r = await pedir<ArchivoDrive>(
    token,
    `${API}/files?fields=${q(CAMPOS)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: NOMBRE_CARPETA, mimeType: MIME_CARPETA }) },
    f,
  );
  return r.id;
}

/** Busca la carpeta de respaldos y, si no está, la crea. */
export async function asegurarCarpeta(token: string, f: Fetch = fetch): Promise<string> {
  return (await buscarCarpeta(token, f)) ?? crearCarpeta(token, f);
}

/** Respaldos de la carpeta, del más nuevo al más antiguo. */
export async function listarRespaldos(token: string, carpetaId: string, f: Fetch = fetch): Promise<ArchivoDrive[]> {
  const consulta = `'${comillas(carpetaId)}' in parents and trashed = false and mimeType = 'application/json'`;
  const r = await pedir<{ files: ArchivoDrive[] }>(token, `${API}/files?q=${q(consulta)}&fields=${q(`files(${CAMPOS})`)}&orderBy=${q('name desc')}&pageSize=100&spaces=drive`, {}, f);
  return r.files;
}

/** "a-mano-respaldo-2026-11-06.json": uno por día (los cambios del mismo día van al mismo archivo). */
export const nombreRespaldo = (fecha: string) => `a-mano-respaldo-${fecha}.json`;

/** Fecha del respaldo según su nombre. */
export const fechaRespaldo = (a: Pick<ArchivoDrive, 'name' | 'modifiedTime'>) => /(\d{4}-\d{2}-\d{2})/.exec(a.name)?.[1] ?? a.modifiedTime.slice(0, 10);

/**
 * Sube el respaldo: si ya existe el de hoy, lo reemplaza; si no, crea uno nuevo en la carpeta.
 * El contenido es el mismo JSON que "Exportar" (se puede abrir y leer en Drive).
 */
export async function subirRespaldo(token: string, carpetaId: string, nombre: string, contenido: string, existenteId?: string, f: Fetch = fetch): Promise<ArchivoDrive> {
  if (existenteId) {
    return pedir<ArchivoDrive>(token, `${SUBIDA}/files/${q(existenteId)}?uploadType=media&fields=${q(CAMPOS)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: contenido }, f);
  }
  const limite = `a-mano-${Math.random().toString(36).slice(2)}`;
  const cuerpo =
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: nombre, parents: [carpetaId], mimeType: 'application/json' }) +
    `\r\n--${limite}\r\nContent-Type: application/json\r\n\r\n` +
    contenido +
    `\r\n--${limite}--`;
  return pedir<ArchivoDrive>(
    token,
    `${SUBIDA}/files?uploadType=multipart&fields=${q(CAMPOS)}`,
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${limite}` }, body: cuerpo },
    f,
  );
}

export const descargarRespaldo = (token: string, id: string, f: Fetch = fetch) => pedir<string>(token, `${API}/files/${q(id)}?alt=media`, {}, f, true);

export const borrarArchivo = (token: string, id: string, f: Fetch = fetch) => pedir<void>(token, `${API}/files/${q(id)}`, { method: 'DELETE' }, f);

/** Los que sobran: se conservan los `conservar` más nuevos (por la fecha del nombre). */
export function paraBorrar(archivos: ArchivoDrive[], conservar = CONSERVAR): ArchivoDrive[] {
  const orden = [...archivos].sort((a, b) => fechaRespaldo(b).localeCompare(fechaRespaldo(a)) || b.modifiedTime.localeCompare(a.modifiedTime));
  return orden.slice(conservar);
}
