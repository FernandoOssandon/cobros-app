// Resumen del mes: gasto real, lo que salió de cada medio de pago y cuánto de eso es de otros.
import type { Gasto, Medio, Movimiento } from '../db';
import { estadosCargos, saldo } from './balance';
import { sumarDias } from './recurrence';

export interface ResumenMedio {
  medioId: string | null; // null = gastos sin medio asignado
  total: number; // lo que pagué con ese medio
  mio: number; // mi parte
  otrosCobrado: number; // parte de otros que ya me devolvieron
  otrosPendiente: number; // parte de otros que aún me deben
}

export interface Resumen {
  mes: string; // YYYY-MM
  /** Suma de mis partes (incluye lo que otros pagaron por mí). */
  gastoReal: number;
  /** Lo que pagué yo en total. */
  salio: number;
  /** Lo que adelanté por otros (salio − mi parte de lo que pagué yo). */
  adelantado: number;
  porMedio: ResumenMedio[];
  porCategoria: { categoriaId: string | null; monto: number }[];
  /** Saldos con personas a la fecha (no solo del mes). */
  teDeben: number;
  debes: number;
}

export const mesDe = (fecha: string) => fecha.slice(0, 7);

/** Período de facturación que cierra el `dia` del mes `mes` (YYYY-MM). Ambos extremos inclusive. */
export function periodoFacturacion(mes: string, dia: number): { desde: string; hasta: string } {
  const [y, m] = mes.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const cierre = (mesIndex: number) => {
    const base = new Date(y, mesIndex, 1);
    const Y = base.getFullYear();
    const M = base.getMonth();
    return `${Y}-${pad(M + 1)}-${pad(Math.min(dia, new Date(Y, M + 1, 0).getDate()))}`;
  };
  return { desde: sumarDias(cierre(m - 2), 1), hasta: cierre(m - 1) };
}

export function resumenMes(mes: string, gastos: Gasto[], movimientos: Movimiento[], medios: Medio[] = []): Resumen {
  const delMes = gastos.filter((g) => mesDe(g.fecha) === mes);

  // Estado de cada cargo (FIFO por persona), para separar lo cobrado de lo pendiente.
  const porPersona = new Map<string, Movimiento[]>();
  for (const m of movimientos) porPersona.set(m.personaId, [...(porPersona.get(m.personaId) ?? []), m]);
  const pendienteCargo = new Map<string, number>();
  for (const movs of porPersona.values()) for (const [id, e] of estadosCargos(movs)) pendienteCargo.set(id, e.pendiente);
  const cargosDeGasto = new Map<string, Movimiento[]>();
  for (const m of movimientos) if (m.gastoId && m.tipo === 'cargo') cargosDeGasto.set(m.gastoId, [...(cargosDeGasto.get(m.gastoId) ?? []), m]);

  const medioMap = new Map<string | null, ResumenMedio>();
  const categoriaMap = new Map<string | null, number>();
  let gastoReal = 0;
  let salio = 0;
  let miParteDeLoQuePague = 0;

  for (const g of delMes) {
    gastoReal += g.miParte;
    categoriaMap.set(g.categoriaId ?? null, (categoriaMap.get(g.categoriaId ?? null) ?? 0) + g.miParte);
    if (g.pagador !== 'yo') continue;
    salio += g.total;
    miParteDeLoQuePague += g.miParte;
    const key = g.medioId ?? null;
    const r = medioMap.get(key) ?? { medioId: key, total: 0, mio: 0, otrosCobrado: 0, otrosPendiente: 0 };
    r.total += g.total;
    r.mio += g.miParte;
    for (const c of cargosDeGasto.get(g.id) ?? []) {
      const pend = pendienteCargo.get(c.id) ?? c.monto;
      r.otrosPendiente += pend;
      r.otrosCobrado += c.monto - pend;
    }
    medioMap.set(key, r);
  }

  const orden = new Map(medios.map((m) => [m.id, m.orden]));
  const porMedio = [...medioMap.values()].sort((a, b) => (orden.get(a.medioId ?? '') ?? 999) - (orden.get(b.medioId ?? '') ?? 999));
  const porCategoria = [...categoriaMap.entries()].map(([categoriaId, monto]) => ({ categoriaId, monto })).sort((a, b) => b.monto - a.monto);

  let teDeben = 0;
  let debes = 0;
  for (const movs of porPersona.values()) {
    const s = saldo(movs);
    if (s > 0) teDeben += s;
    else debes -= s;
  }

  return { mes, gastoReal, salio, adelantado: salio - miParteDeLoQuePague, porMedio, porCategoria, teDeben, debes };
}
