// Saldos, % pagado y estado de cada cargo (los pagos se aplican a los cargos más antiguos primero).
import type { Movimiento } from '../db';

export type EstadoCargo = 'pendiente' | 'parcial' | 'pagado';

/** Orden cronológico: por fecha del gasto y, si empatan, por momento de registro. */
export const byDate = (a: { fecha: string; creado: string }, b: { fecha: string; creado: string }) =>
  a.fecha.localeCompare(b.fecha) || a.creado.localeCompare(b.creado);

/** Saldo = Σ cargos − Σ pagos. */
export const saldo = (movs: Movimiento[]): number =>
  movs.reduce((s, m) => s + (m.tipo === 'cargo' ? m.monto : -m.monto), 0);

export const cargado = (movs: Movimiento[]): number =>
  movs.filter((m) => m.tipo === 'cargo').reduce((s, m) => s + m.monto, 0);

/** % pagado = (cargado − saldo) / cargado, limitado a 0–100. */
export const pctPagado = (movs: Movimiento[]): number => {
  const c = cargado(movs);
  if (!c) return 0;
  return Math.max(0, Math.min(100, Math.round(((c - saldo(movs)) / c) * 100)));
};

/**
 * Estado de cada cargo de una persona. El total pagado se reparte entre los cargos
 * del más antiguo al más reciente (FIFO).
 */
export function estadosCargos(movs: Movimiento[]): Map<string, { estado: EstadoCargo; pendiente: number }> {
  let pagado = movs.filter((m) => m.tipo === 'pago').reduce((s, m) => s + m.monto, 0);
  const out = new Map<string, { estado: EstadoCargo; pendiente: number }>();
  for (const m of movs.filter((x) => x.tipo === 'cargo').sort(byDate)) {
    const aplicado = Math.min(pagado, m.monto);
    pagado -= aplicado;
    const pendiente = m.monto - aplicado;
    out.set(m.id, { estado: pendiente === 0 ? 'pagado' : aplicado > 0 ? 'parcial' : 'pendiente', pendiente });
  }
  return out;
}

/** Descripciones de los cargos que siguen pendientes (los más recientes primero, máx. n). */
export function cargosPendientes(movs: Movimiento[], n = 3): string[] {
  const est = estadosCargos(movs);
  return movs
    .filter((m) => m.tipo === 'cargo' && est.get(m.id)?.estado !== 'pagado')
    .sort(byDate)
    .slice(-n)
    .map((m) => m.detalle.toLowerCase());
}
