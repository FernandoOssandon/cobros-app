// Recurrentes sugeridos (lógica pura): gastos que se repiten todos los meses y todavía no son recurrentes.
// Ej. "Seguro BICE Vida (PAC)" el 9 de octubre y el 5 de noviembre → "¿lo anotamos solo cada mes?".
import type { Gasto, Recurrente } from '../db';
import { claveDetalle } from './bancos';
import { sumarMes, todayISO } from './format';
import { sumarDias } from './recurrence';

export interface SugerenciaRecurrente {
  /** Descripción sin números: identifica la sugerencia (y si la descartaste). */
  clave: string;
  nombre: string;
  /** El último monto. */
  monto: number;
  /** Los montos cambian más de un 5 %: se propone como variable (se confirma cada mes). */
  variable: boolean;
  /** Día del mes. */
  dia: number;
  medioId?: string;
  categoriaId?: string;
  /** Fechas en que se repitió (de la más antigua a la más nueva). */
  fechas: string[];
  /** Primera fecha que anotaría el recurrente (el mes siguiente al último). */
  inicio: string;
}

const diaDe = (f: string) => Number(f.slice(8, 10));
const diasDelMes = (mes: string) => Number(sumarDias(`${sumarMes(mes, 1)}-01`, -1).slice(8, 10));
const parecido = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * tol);

/** ¿Algún recurrente activo ya cubre este gasto? (mismo nombre, o mismo monto y categoría cerca del mismo día). */
function cubierto(s: Pick<SugerenciaRecurrente, 'clave' | 'monto' | 'dia' | 'categoriaId'>, recurrentes: Recurrente[]) {
  return recurrentes.some((r) => {
    if (!r.activo || (r.tipo !== 'mio' && r.tipo !== 'compartido')) return false;
    const k = claveDetalle(r.nombre);
    if (k && (k === s.clave || k.startsWith(s.clave) || s.clave.startsWith(k))) return true;
    const dia = r.frecuencia.unidad === 'mes' ? r.frecuencia.dia : undefined;
    return parecido(r.monto, s.monto) && r.categoriaId === s.categoriaId && dia !== undefined && Math.abs(dia - s.dia) <= 3;
  });
}

/**
 * Gastos tuyos (solo tú, sin recurrente) que aparecen una vez al mes, al menos los dos últimos meses seguidos,
 * cerca del mismo día, y el último hace menos de 45 días.
 */
export function sugerirRecurrentes(gastos: Gasto[], recurrentes: Recurrente[], descartadas: string[] = [], hoy = todayISO()): SugerenciaRecurrente[] {
  const desde = sumarDias(hoy, -190);
  const grupos = new Map<string, Gasto[]>();
  for (const g of gastos) {
    if (g.pagador !== 'yo' || g.recurrenteId || g.modo !== 'solo' || g.total <= 0 || g.fecha < desde || g.fecha > hoy) continue;
    const k = claveDetalle(g.descripcion);
    if (k.length < 3) continue;
    grupos.set(k, [...(grupos.get(k) ?? []), g]);
  }
  const out: SugerenciaRecurrente[] = [];
  for (const [clave, gs] of grupos) {
    if (gs.length < 2 || descartadas.includes(clave)) continue;
    const orden = gs.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creado.localeCompare(b.creado));
    const porMes = new Map<string, Gasto[]>();
    for (const g of orden) porMes.set(g.fecha.slice(0, 7), [...(porMes.get(g.fecha.slice(0, 7)) ?? []), g]);
    // Dos veces en un mismo mes: no es un gasto mensual (o son dos distintos con el mismo nombre).
    if ([...porMes.values()].some((x) => x.length > 1)) continue;
    // Los meses seguidos hasta el último.
    const meses = [...porMes.keys()].sort();
    const seguidos = [meses[meses.length - 1]];
    for (let i = meses.length - 2; i >= 0 && meses[i] === sumarMes(seguidos[0], -1); i--) seguidos.unshift(meses[i]);
    if (seguidos.length < 2) continue;
    const serie = seguidos.map((m) => porMes.get(m)![0]);
    const ultimo = serie[serie.length - 1];
    if (ultimo.fecha < sumarDias(hoy, -45)) continue;
    // Cerca del mismo día (un pago del 30 y uno del 2 del mes siguiente no cuentan como el mismo día).
    const dias = serie.map((g) => diaDe(g.fecha));
    if (Math.max(...dias) - Math.min(...dias) > 7) continue;
    const variable = serie.some((g) => !parecido(g.total, ultimo.total));
    const dia = diaDe(ultimo.fecha);
    const mesSig = sumarMes(ultimo.fecha.slice(0, 7), 1);
    const inicio = `${mesSig}-${String(Math.min(dia, diasDelMes(mesSig))).padStart(2, '0')}`;
    const s: SugerenciaRecurrente = {
      clave,
      nombre: ultimo.descripcion,
      monto: ultimo.total,
      variable,
      dia,
      medioId: ultimo.medioId,
      categoriaId: ultimo.categoriaId,
      fechas: serie.map((g) => g.fecha),
      inicio,
    };
    if (!cubierto(s, recurrentes)) out.push(s);
  }
  return out.sort((a, b) => b.monto - a.monto);
}
