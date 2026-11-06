// Cartolas de los bancos (lógica pura): reconoce el archivo y lo deja como una lista de movimientos.
// Por ahora: cuenta corriente o vista Santander ("Últimos movimientos" en Excel) y tarjeta CMR Falabella
// (movimientos facturados y por facturar, en Excel).
import { fechaExcel, type Celda, type Hoja } from './xlsx';

export type FormatoCartola = 'santander-cuenta' | 'cmr';

export interface LineaCartola {
  fecha: string; // YYYY-MM-DD
  /** Detalle tal como lo escribe el banco. */
  detalle: string;
  /**
   * Cuenta: + entra, − sale.
   * Tarjeta: + compra o cargo (sube lo usado), − pago o abono (lo baja).
   */
  monto: number;
  /** Cuenta: saldo después del movimiento, si el banco lo informa. */
  saldo?: number;
  /** Tarjeta: compra en cuotas (cuántas en total y el valor de cada una). */
  cuotas?: number;
  valorCuota?: number;
  /** Posición en orden cronológico (0 = el más antiguo del archivo). */
  orden: number;
}

export interface Cartola {
  formato: FormatoCartola;
  banco: string;
  tipo: 'cuenta' | 'tarjeta';
  /** Identifica la cuenta o tarjeta del archivo, para recordar a cuál de la app corresponde. */
  clave: string;
  /** "Cuenta Corriente 0-000-87-10691-8", "CMR Falabella · por facturar". */
  titulo: string;
  /** Nombre del titular, si el archivo lo trae (sirve para reconocer traspasos entre tus cuentas). */
  titular?: string;
  /** Movimientos del más antiguo al más nuevo. */
  lineas: LineaCartola[];
  desde: string;
  hasta: string;
  /**
   * Fechas que cubre el archivo, sin contar compras antiguas que siguen en cuotas (la CMR las lista con su fecha original).
   * El primer y el último día pueden venir incompletos.
   */
  cobertura: { desde: string; hasta: string };
  /** Cuenta: saldo al final del último día del archivo. */
  saldoFinal?: number;
}

export class ErrorCartola extends Error {}

/** Minúsculas, sin tildes y con espacios simples. */
export const plano = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const texto = (c: Celda | undefined) => (c === null || c === undefined ? '' : String(c).trim());

/** "$1.234", "1234", 1234, "" → número (0 si no hay). */
export function numero(c: Celda | undefined): number {
  if (typeof c === 'number') return Math.round(c);
  const s = texto(c);
  if (!s) return 0;
  const neg = /^-|\(.*\)/.test(s);
  const n = parseInt(s.replace(/[^\d]/g, ''), 10) || 0;
  return neg ? -n : n;
}

/** "05-11-2026", "05/11/2026", "2026-11-05" o número de serie de Excel → "2026-11-05". */
export function fecha(c: Celda | undefined): string | undefined {
  if (typeof c === 'number' && c > 20_000 && c < 80_000) return fechaExcel(c);
  const s = texto(c);
  let m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return undefined;
}

/** Busca la fila de encabezados que tiene todas las columnas pedidas; devuelve la fila y la posición de cada columna. */
function encabezados(filas: Celda[][], buscar: Record<string, RegExp>, max = 15) {
  for (let i = 0; i < Math.min(filas.length, max); i++) {
    const celdas = filas[i].map((c) => plano(texto(c)));
    const pos: Record<string, number> = {};
    for (const [k, re] of Object.entries(buscar)) {
      const j = celdas.findIndex((c) => re.test(c));
      if (j >= 0) pos[k] = j;
    }
    if (Object.keys(buscar).every((k) => k in pos)) return { fila: i, pos };
  }
  return undefined;
}

/** Ordena del más antiguo al más nuevo (los bancos listan del más nuevo al más antiguo) y numera. */
function cobertura(lineas: LineaCartola[]) {
  const f = lineas.filter((l) => !l.cuotas).map((l) => l.fecha);
  const todas = f.length ? f : lineas.map((l) => l.fecha);
  return { desde: todas[0], hasta: todas[todas.length - 1] };
}

function cronologico(lineas: Omit<LineaCartola, 'orden'>[]): LineaCartola[] {
  // Dentro de un mismo día se respeta el orden inverso del archivo (el banco pone primero lo último).
  return lineas
    .map((l, i) => ({ l, i }))
    .sort((a, b) => a.l.fecha.localeCompare(b.l.fecha) || b.i - a.i)
    .map(({ l }, orden) => ({ ...l, orden }));
}

function santanderCuenta(h: Hoja): Cartola | undefined {
  const enc = encabezados(h.filas, { fecha: /^fecha/, detalle: /^detalle|^descripcion/, cargo: /cargo/, abono: /abono/, saldo: /^saldo/ });
  if (!enc) return undefined;
  const { pos } = enc;
  let titular: string | undefined;
  let tipoCuenta = 'Cuenta';
  let num = '';
  for (let i = 0; i < enc.fila; i++) {
    for (const c of h.filas[i]) {
      const s = texto(c);
      const m = /^(cuenta[^:]*?|chequera[^:]*?):\s*([\d-]+)/i.exec(s);
      if (m) {
        tipoCuenta = m[1].trim();
        num = m[2];
      } else if (s && !titular && !/movimientos|cartola|santander/i.test(s)) titular = s;
    }
  }
  const lineas: Omit<LineaCartola, 'orden'>[] = [];
  for (const fila of h.filas.slice(enc.fila + 1)) {
    const f = fecha(fila[pos.fecha]);
    const detalle = texto(fila[pos.detalle]);
    if (!f || !detalle) continue;
    const monto = numero(fila[pos.abono]) - numero(fila[pos.cargo]);
    if (!monto) continue;
    const saldoTxt = texto(fila[pos.saldo]);
    lineas.push({ fecha: f, detalle, monto, saldo: saldoTxt ? numero(fila[pos.saldo]) : undefined });
  }
  if (!lineas.length) return undefined;
  const ord = cronologico(lineas);
  return {
    formato: 'santander-cuenta',
    banco: 'Santander',
    tipo: 'cuenta',
    clave: `santander:${num || plano(tipoCuenta)}`,
    titulo: num ? `${tipoCuenta} ${num}` : tipoCuenta,
    titular,
    lineas: ord,
    desde: ord[0].fecha,
    hasta: ord[ord.length - 1].fecha,
    cobertura: cobertura(ord),
    saldoFinal: ord[ord.length - 1].saldo,
  };
}

const ES_PAGO_TARJETA = /^(pago|abono|nota de credito|reverso|devolucion)\b|pago tarjeta/;

function cmr(h: Hoja): Cartola | undefined {
  const enc = encabezados(h.filas, { fecha: /^fecha/, detalle: /^descripcion/, monto: /^monto/, pendientes: /cuotas pendientes/, valor: /valor cuota/ });
  if (!enc) return undefined;
  const { pos } = enc;
  const lineas: Omit<LineaCartola, 'orden'>[] = [];
  for (const fila of h.filas.slice(enc.fila + 1)) {
    const f = fecha(fila[pos.fecha]);
    const detalle = texto(fila[pos.detalle]);
    if (!f || !detalle) continue;
    const bruto = Math.abs(numero(fila[pos.monto]));
    const valor = numero(fila[pos.valor]);
    if (!bruto) continue;
    const pago = valor < 0 || ES_PAGO_TARJETA.test(plano(detalle));
    const pendientes = numero(fila[pos.pendientes]);
    const l: Omit<LineaCartola, 'orden'> = { fecha: f, detalle, monto: pago ? -bruto : bruto };
    if (!pago && pendientes > 0 && valor > 0 && valor < bruto) {
      l.cuotas = Math.max(2, Math.round(bruto / valor));
      l.valorCuota = valor;
    }
    lineas.push(l);
  }
  if (!lineas.length) return undefined;
  const ord = cronologico(lineas);
  const facturados = /factur/.test(plano(h.nombre)) && !/no factur|por factur/.test(plano(h.nombre));
  return {
    formato: 'cmr',
    banco: 'Falabella',
    tipo: 'tarjeta',
    clave: 'cmr',
    titulo: `CMR Falabella · ${facturados ? 'facturados' : 'por facturar'}`,
    lineas: ord,
    desde: ord[0].fecha,
    hasta: ord[ord.length - 1].fecha,
    cobertura: cobertura(ord),
  };
}

/** Reconoce el archivo. Si no es un formato conocido, explica cuáles sirven. */
export function reconocerCartola(hojas: Hoja[]): Cartola {
  for (const h of hojas) {
    const c = santanderCuenta(h) ?? cmr(h);
    if (c) return c;
  }
  throw new ErrorCartola('No reconocemos este archivo. Sirven la cartola de tu cuenta Santander (Últimos movimientos, en Excel) y los movimientos de tu CMR Falabella (en Excel).');
}

// ---------- Textos ----------

const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'a', 'en', 'por']);
/** Siglas que quedan en mayúsculas ("PAC Seguro Auto", "Sodimac HC"). */
const SIGLAS = new Set(['pac', 'spa', 'hc', 'nt', 'cmr', 'bci', 'cns', 'tc', 'sa', 'ltda', 'bice', 'afp', 'sii', 'tag', 'vtr', 'wom', 'kfc', 'jp']);

/** "DANIELA IGNACIA OSSANDON" → "Daniela Ignacia Ossandon"; deja tal cual siglas con punto o números. */
export function titulo(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (/[.\d]/.test(w) || SIGLAS.has(w) ? w.toUpperCase() : i > 0 && MINUSCULAS.has(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

/**
 * Detalle del banco → descripción para la app.
 * "0189555040 TRANSF A DANIELA IGNACIA OSSANDON" → "Transferencia a Daniela Ignacia Ossandon"
 * "COMPRA MERPAGO*JASNITAPASTEL*" → "Jasnitapastel"
 */
export function descripcionDe(detalle: string): string {
  let d = detalle.replace(/^\d{6,}[kK]?\s+/, '').trim();
  let m = /^transf(?:erencia)?\.?\s+a\s+(.+)$/i.exec(d);
  if (m) return `Transferencia a ${titulo(m[1])}`;
  m = /^transf(?:erencia)?\.?\s+(?:de\s+)?(.+)$/i.exec(d);
  if (m) return `Transferencia de ${titulo(m[1])}`;
  d = d
    .replace(/^compra(\s+nacional|\s+internacional|\s+en\s+cuotas|\s+cuotas\s+sin\s+interes)?\s+/i, '')
    .replace(/^(merpago|mp|tuu|payu|dl|agpro)\s*\*\s*/i, '')
    .replace(/\*/g, ' ')
    .replace(/\s+\d{8,}$/, '')
    .trim();
  return titulo(d) || detalle;
}

/** Clave para recordar decisiones: el detalle sin números (el mismo comercio o persona, otro día). */
export const claveDetalle = (detalle: string) =>
  plano(detalle)
    .replace(/^\d{6,}k?\s+/, '')
    .replace(/[\d*.,:#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
