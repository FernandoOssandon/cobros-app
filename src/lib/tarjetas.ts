// Tarjetas de crédito: cupo, lo usado y lo disponible (lógica pura).
// Lo usado parte del último "cuadre" (lo que dice el banco como cupo utilizado en una fecha),
// suma las compras con la tarjeta desde ahí (completas: una compra en cuotas bloquea todo el cupo)
// y resta los pagos de la tarjeta. Sin cuadre, parte de cero con todo lo anotado.
import type { Gasto, Medio, PagoTarjeta } from '../db';
import { todayISO } from './format';
import { periodoEn, periodoTarjeta, resumenTarjeta, tienePeriodo } from './periodos';
import { sumarMes } from './format';
import type { GastoImputado } from './cuotas';
import type { Movimiento } from '../db';

export interface UsoTarjeta {
  usado: number;
  cupo?: number;
  disponible?: number;
  /** 0 a 1 (sin cupo: undefined). */
  pct?: number;
  /** ¿Parte de un cuadre con el banco? */
  cuadrado: boolean;
  /** Pagos desde el cuadre (o desde siempre). */
  pagado: number;
}

const despues = (fecha: string, creado: string, base?: { fecha: string; creado: string }) =>
  !base || fecha > base.fecha || (fecha === base.fecha && creado > base.creado);

export function usoTarjeta(m: Medio, gastos: Gasto[], pagos: PagoTarjeta[], hoy = todayISO()): UsoTarjeta {
  const base = m.usoCuadrado;
  const compras = gastos
    .filter((g) => g.medioId === m.id && g.pagador === 'yo' && g.fecha <= hoy && despues(g.fecha, g.creado, base))
    .reduce((s, g) => s + g.total, 0);
  const pagado = pagos.filter((p) => p.medioId === m.id && p.fecha <= hoy && despues(p.fecha, p.creado, base)).reduce((s, p) => s + p.monto, 0);
  const usado = Math.max(0, (base?.monto ?? 0) + compras - pagado);
  const cupo = m.cupo && m.cupo > 0 ? m.cupo : undefined;
  return { usado, cupo, disponible: cupo !== undefined ? cupo - usado : undefined, pct: cupo ? Math.min(1, usado / cupo) : undefined, cuadrado: !!base, pagado };
}

/**
 * Lo facturado en el último período cerrado (lo que toca pagar ahora), menos lo ya pagado desde el cierre.
 * Sin día de facturación: undefined.
 */
export function porPagar(m: Medio, imputados: GastoImputado[], movimientos: Movimiento[], pagos: PagoTarjeta[], hoy = todayISO()): { facturado: number; pagado: number; queda: number; cierre: string } | undefined {
  if (!tienePeriodo(m)) return undefined;
  const actual = periodoEn(hoy, m);
  const cerrado = actual.tipo === 'tarjeta' ? periodoTarjeta(m, sumarMes(actual.cierreMes, -1)) : undefined;
  if (!cerrado) return undefined;
  const facturado = resumenTarjeta(cerrado, imputados, movimientos, hoy).facturado;
  const pagado = pagos.filter((p) => p.medioId === m.id && p.fecha > cerrado.hasta && p.fecha <= hoy).reduce((s, p) => s + p.monto, 0);
  return { facturado, pagado, queda: Math.max(0, facturado - pagado), cierre: cerrado.hasta };
}
