// Tendencias: gasto real por mes, comparación con el mes anterior (a la misma fecha si el mes va en curso)
// y por categoría. Recibe los gastos ya imputados (las cuotas en su mes). Lógica pura.
import type { Gasto, Ingreso } from '../db';
import { sumarMes, todayISO } from './format';
import { sumarDias } from './recurrence';

const ultimoDia = (mes: string) => sumarDias(`${sumarMes(mes, 1)}-01`, -1);
const suma = (gs: Gasto[]) => gs.reduce((s, g) => s + g.miParte, 0);

/** Los últimos `n` meses hasta `hasta` (incluido), del más antiguo al más nuevo. */
export const ultimosMeses = (hasta: string, n: number) => Array.from({ length: n }, (_, i) => sumarMes(hasta, i - n + 1));

export interface MesTendencia {
  mes: string;
  gasto: number;
  ingresos: number;
  /** Es el mes en curso (todavía no termina). */
  enCurso: boolean;
}

/**
 * Gasto e ingresos de los últimos `n` meses. Se quitan los meses vacíos del principio
 * (antes de que empezaras a anotar), dejando al menos 2.
 */
export function serieMensual(gastos: Gasto[], ingresos: Ingreso[], n = 6, hoy = todayISO()): MesTendencia[] {
  const actual = hoy.slice(0, 7);
  const serie = ultimosMeses(actual, n).map((mes) => ({
    mes,
    gasto: suma(gastos.filter((g) => g.fecha.startsWith(mes) && g.fecha <= hoy)),
    ingresos: ingresos.filter((i) => i.fecha.startsWith(mes) && i.fecha <= hoy).reduce((s, i) => s + i.monto, 0),
    enCurso: mes === actual,
  }));
  const primero = serie.findIndex((m) => m.gasto > 0 || m.ingresos > 0);
  return primero < 0 ? serie.slice(-2) : serie.slice(Math.min(primero, serie.length - 2));
}

export interface Comparacion {
  mes: string;
  anterior: string;
  /** Hasta qué día se compara (el de hoy si el mes va en curso; si no, el mes completo). */
  hastaDia?: number;
  actual: number;
  previo: number;
  diferencia: number;
  /** Variación (−1 a +∞); undefined si el mes anterior fue 0. */
  pct?: number;
}

/** Rango que se compara de un mes: completo o, si va en curso, hasta el día de hoy. */
function rango(mes: string, hastaDia?: number) {
  const fin = ultimoDia(mes);
  if (!hastaDia) return { desde: `${mes}-01`, hasta: fin };
  const d = `${mes}-${String(hastaDia).padStart(2, '0')}`;
  return { desde: `${mes}-01`, hasta: d < fin ? d : fin };
}

const enRango = (gs: Gasto[], r: { desde: string; hasta: string }) => gs.filter((g) => g.fecha >= r.desde && g.fecha <= r.hasta);

export function comparar(gastos: Gasto[], mes: string, hoy = todayISO()): Comparacion {
  const anterior = sumarMes(mes, -1);
  const hastaDia = mes === hoy.slice(0, 7) ? Number(hoy.slice(8, 10)) : undefined;
  const actual = suma(enRango(gastos, rango(mes, hastaDia)));
  const previo = suma(enRango(gastos, rango(anterior, hastaDia)));
  return { mes, anterior, hastaDia, actual, previo, diferencia: actual - previo, pct: previo > 0 ? (actual - previo) / previo : undefined };
}

export interface CategoriaComparada {
  categoriaId: string | null;
  actual: number;
  previo: number;
}

/** Gasto por categoría en el mes y en el anterior (mismo tramo de días si el mes va en curso), de mayor a menor. */
export function porCategoria(gastos: Gasto[], mes: string, hoy = todayISO()): CategoriaComparada[] {
  const c = comparar(gastos, mes, hoy);
  const a = enRango(gastos, rango(mes, c.hastaDia));
  const p = enRango(gastos, rango(c.anterior, c.hastaDia));
  const mapa = new Map<string | null, CategoriaComparada>();
  const sumar = (g: Gasto, k: 'actual' | 'previo') => {
    const id = g.categoriaId ?? null;
    const x = mapa.get(id) ?? { categoriaId: id, actual: 0, previo: 0 };
    x[k] += g.miParte;
    mapa.set(id, x);
  };
  a.forEach((g) => sumar(g, 'actual'));
  p.forEach((g) => sumar(g, 'previo'));
  return [...mapa.values()].filter((x) => x.actual > 0 || x.previo > 0).sort((x, y) => y.actual - x.actual || y.previo - x.previo);
}
