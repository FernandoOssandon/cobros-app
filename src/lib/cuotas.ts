// Compras en cuotas: una compra de $300.000 en 3 cuotas cuenta $100.000 en cada mes (y en cada período de
// facturación de la tarjeta), partiendo por el mes de la compra. Lógica pura.
import type { Gasto } from '../db';
import { sumarMes } from './format';

export interface InfoCuota {
  /** Número de esta cuota (1…de). */
  n: number;
  de: number;
  /** Id del gasto original (la compra). */
  origenId: string;
  /** Total de la compra. */
  totalCompra: number;
  /** Fecha de la compra. */
  fechaCompra: string;
}

/** Un gasto tal como cuenta en un período: la compra completa o una de sus cuotas. */
export type GastoImputado = Gasto & { cuota?: InfoCuota };

/** Mismo día, `n` meses después (si ese mes es más corto, el último día). */
export function fechaMasMeses(fecha: string, n: number): string {
  const mes = sumarMes(fecha.slice(0, 7), n);
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return `${mes}-${String(Math.min(Number(fecha.slice(8, 10)), ultimo)).padStart(2, '0')}`;
}

/** Parte `i` (0…n−1) de un monto repartido en `n`: partes iguales y el resto en la primera. */
export function parteCuota(monto: number, n: number, i: number): number {
  const base = Math.floor(monto / n);
  return i === 0 ? monto - base * (n - 1) : base;
}

export const esEnCuotas = (g: Gasto) => !!g.cuotas && g.cuotas > 1 && g.pagador === 'yo';

/** Cuotas de una compra (o la compra misma si no es en cuotas). */
export function cuotasDe(g: Gasto): GastoImputado[] {
  if (!esEnCuotas(g)) return [g];
  const n = g.cuotas!;
  return Array.from({ length: n }, (_, i) => ({
    ...g,
    id: `${g.id}#${i + 1}`,
    fecha: fechaMasMeses(g.fecha, i),
    total: parteCuota(g.total, n, i),
    miParte: parteCuota(g.miParte, n, i),
    montos: g.montos && Object.fromEntries(Object.entries(g.montos).map(([k, v]) => [k, parteCuota(v, n, i)])),
    cuota: { n: i + 1, de: n, origenId: g.id, totalCompra: g.total, fechaCompra: g.fecha },
  }));
}

/** Todos los gastos tal como cuentan en el tiempo: las compras en cuotas se reparten en sus meses. */
export const imputar = (gastos: Gasto[]): GastoImputado[] => gastos.flatMap(cuotasDe);

/** Id del gasto real (para abrir el detalle desde una cuota). */
export const idOrigen = (g: GastoImputado) => g.cuota?.origenId ?? g.id;
