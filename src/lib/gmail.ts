// Gmail (API REST v1): busca los correos de bancos y los deja igual que los entregaba el script de Apps Script.
// Todo pasa en el teléfono, con tu permiso de Google; la app no envía, borra ni mueve correos.
import { ErrorDrive } from './drive';
import type { CorreoCrudo } from './correo';

export const SCOPE_GMAIL = 'https://www.googleapis.com/auth/gmail.readonly';

/** Remitentes de bancos y billeteras (los mismos que el script). Solo se buscan estos. */
export const BUSQUEDA_BANCOS =
  'from:(bancoestado.cl OR bci.cl OR santander.cl OR bancochile.cl OR bancoedwards.cl OR itau.cl OR ' +
  'scotiabank.cl OR bancofalabella.cl OR bancoripley.cl OR bice.cl OR security.cl OR coopeuch.cl OR ' +
  'somosmach.com OR mach.cl OR tenpo.cl OR mercadopago.cl OR mercadopago.com OR tapp.cl)';

/** Máximo de correos por lectura y largo máximo del texto de cada uno (como el script). */
export const MAX_CORREOS = 100;
export const MAX_TEXTO = 4000;

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
type Fetch = typeof fetch;

async function pedir<T>(token: string, url: string, f: Fetch): Promise<T> {
  let res: Response;
  try {
    res = await f(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new ErrorDrive('Sin conexión con Gmail.');
  }
  if (!res.ok) throw new ErrorDrive(res.status === 401 ? 'El permiso de Google venció.' : res.status === 403 ? 'Google no dio permiso para leer el correo.' : `Gmail respondió ${res.status}.`, res.status);
  return res.json() as Promise<T>;
}

interface Parte {
  mimeType?: string;
  body?: { data?: string };
  parts?: Parte[];
  headers?: { name: string; value: string }[];
}
interface MensajeGmail {
  id: string;
  internalDate?: string;
  payload?: Parte;
}

/** base64url → texto UTF-8. */
export function decodificarBase64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/** El primer cuerpo de un tipo (buscando en las partes anidadas). */
function cuerpo(p: Parte | undefined, tipo: string): string | undefined {
  if (!p) return undefined;
  if (p.mimeType?.startsWith(tipo) && p.body?.data) return decodificarBase64Url(p.body.data);
  for (const h of p.parts ?? []) {
    const t = cuerpo(h, tipo);
    if (t !== undefined) return t;
  }
  return undefined;
}

/** Un mensaje de la API → el formato del script (texto plano si hay; si no, el HTML, que la app limpia después). */
export function aCorreoCrudo(m: MensajeGmail): CorreoCrudo {
  const header = (n: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? '';
  const fecha = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date(header('date') || Date.now()).toISOString();
  const texto = cuerpo(m.payload, 'text/plain') ?? cuerpo(m.payload, 'text/html') ?? (m.payload?.body?.data ? decodificarBase64Url(m.payload.body.data) : '');
  return { id: m.id, fecha, de: header('from'), asunto: header('subject'), texto: texto.slice(0, MAX_TEXTO) };
}

/**
 * Los correos de bancos desde `desde` (ISO). Los que ya se leyeron (`yaVistos`, por id) no se vuelven a pedir.
 * Los ids son los mismos que daba el script: si antes usabas el script, no se repite nada.
 */
export async function correosDelBanco(token: string, desde: string, yaVistos: Set<string> = new Set(), f: Fetch = fetch): Promise<CorreoCrudo[]> {
  const q = `${BUSQUEDA_BANCOS} after:${Math.floor(new Date(desde).getTime() / 1000)}`;
  const ids: string[] = [];
  let pagina: string | undefined;
  do {
    const url = `${API}/messages?q=${encodeURIComponent(q)}&maxResults=${MAX_CORREOS}${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ''}`;
    const r = await pedir<{ messages?: { id: string }[]; nextPageToken?: string }>(token, url, f);
    ids.push(...(r.messages ?? []).map((x) => x.id));
    pagina = r.nextPageToken;
  } while (pagina && ids.length < MAX_CORREOS);
  const nuevos = ids.slice(0, MAX_CORREOS).filter((id) => !yaVistos.has(id));
  const out: CorreoCrudo[] = [];
  // De a cinco a la vez, para no saturar.
  for (let i = 0; i < nuevos.length; i += 5) {
    const tanda = await Promise.all(nuevos.slice(i, i + 5).map((id) => pedir<MensajeGmail>(token, `${API}/messages/${encodeURIComponent(id)}?format=full`, f)));
    out.push(...tanda.map(aCorreoCrudo).filter((c) => c.fecha > desde));
  }
  return out;
}
