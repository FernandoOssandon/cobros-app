// UF, dólar y euro: formato, conversión a pesos y borradores con decimales. Lógica pura.
import type { CodigoMoneda } from '../db';

export const MONEDAS: CodigoMoneda[] = ['UF', 'USD', 'EUR'];

export interface ValorIndicador {
  /** Pesos por unidad. */
  valor: number;
  /** Fecha del valor (YYYY-MM-DD). */
  fecha: string;
}

export type Indicadores = Partial<Record<CodigoMoneda, ValorIndicador>> & { actualizado?: string };

export const nombreMoneda = (c: CodigoMoneda) => ({ UF: 'UF', USD: 'dólar', EUR: 'euro' })[c];
export const simboloMoneda = (c: CodigoMoneda | 'CLP') => ({ CLP: '$', UF: 'UF', USD: 'US$', EUR: '€' })[c];

const dec = (n: number, max: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: max });

/** "12,5 UF", "US$ 19,99", "€ 20". */
export function fmtMoneda(c: CodigoMoneda, monto: number): string {
  if (c === 'UF') return `${dec(monto, 2)} UF`;
  return `${simboloMoneda(c)} ${dec(monto, 2)}`;
}

/** "$41.268,88" (valores de indicadores, con decimales). */
export const fmtValor = (v: number) => `$${dec(v, 2)}`;

/** Monto en pesos, redondeado. */
export const aPesos = (monto: number, valor: number) => Math.round(monto * valor);

/** "12,35" o "12.35" → 12.35 (0 si no es un número). */
export function leerDecimal(s: string): number {
  const t = s.trim();
  const limpio = (t.includes(',') ? t.replace(/\./g, '') : t).replace(',', '.');
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Teclado propio con coma: máximo 2 decimales y 7 enteros. */
export function teclaDecimal(v: string, k: string): string {
  if (k === '⌫') return v.slice(0, -1);
  if (k === ',') return v.includes(',') ? v : (v || '0') + ',';
  const n = (v + k).replace(/^0+(?=\d)/, '');
  const [ent, d] = n.split(',');
  if (ent.length > 7 || (d !== undefined && d.length > 2)) return v;
  return n;
}

/** Muestra el borrador con miles: "1.250,5". */
export function mostrarDecimal(v: string): string {
  if (!v) return '';
  const [ent, d] = v.split(',');
  const e = Number(ent || '0').toLocaleString('es-CL');
  return d !== undefined ? `${e},${d}` : e;
}

/** Borrador a partir de un número: 12.5 → "12,5". */
export const aBorrador = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Lee la respuesta de mindicador.cl/api. */
export function leerMindicador(json: unknown, ahora = new Date()): Indicadores {
  const j = json as Record<string, { valor?: unknown; fecha?: unknown } | undefined>;
  const out: Indicadores = { actualizado: ahora.toISOString() };
  const pares: [CodigoMoneda, string][] = [['UF', 'uf'], ['USD', 'dolar'], ['EUR', 'euro']];
  for (const [c, k] of pares) {
    const x = j?.[k];
    if (x && typeof x.valor === 'number' && x.valor > 0 && typeof x.fecha === 'string') {
      // "2026-11-04T03:00:00.000Z" = 4 nov en Chile.
      const d = new Date(x.fecha);
      const pad = (n: number) => String(n).padStart(2, '0');
      const fecha = Number.isNaN(d.getTime()) ? x.fecha.slice(0, 10) : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      out[c] = { valor: x.valor, fecha };
    }
  }
  return out;
}
