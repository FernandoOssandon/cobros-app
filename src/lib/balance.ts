// Saldos netos con cada persona, % pagado y estado de cada cargo.
import type { Movimiento } from '../db';

export type EstadoCargo = 'pendiente' | 'parcial' | 'pagado';

/** Orden cronológico: por fecha y, si empatan, por momento de registro. */
export const byDate = (a: { fecha: string; creado: string }, b: { fecha: string; creado: string }) =>
  a.fecha.localeCompare(b.fecha) || a.creado.localeCompare(b.creado);

const SIGNO: Record<Movimiento['tipo'], 1 | -1> = { cargo: 1, pago: -1, deuda: -1, abono: 1 };

/** Saldo neto = cargos − pagos − deudas + abonos. Positivo: te debe. Negativo: le debes. */
export const saldo = (movs: Movimiento[]): number => movs.reduce((s, m) => s + SIGNO[m.tipo] * m.monto, 0);

const suma = (movs: Movimiento[], tipo: Movimiento['tipo']) => movs.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.monto, 0);

export const cargado = (movs: Movimiento[]): number => suma(movs, 'cargo');

/** % pagado de lo que me deben = (cargado − saldo) / cargado, limitado a 0–100. */
export const pctPagado = (movs: Movimiento[]): number => {
  const c = cargado(movs);
  if (!c) return 0;
  return Math.max(0, Math.min(100, Math.round(((c - saldo(movs)) / c) * 100)));
};

/**
 * Estado de cada cargo de una persona. Lo que cubre sus cargos es lo que me pagó más lo que yo le
 * debo (se compensa), menos lo que yo le abone. Se aplica del cargo más antiguo al más reciente.
 */
export function estadosCargos(movs: Movimiento[]): Map<string, { estado: EstadoCargo; pendiente: number }> {
  let cubre = Math.max(0, suma(movs, 'pago') + suma(movs, 'deuda') - suma(movs, 'abono'));
  const out = new Map<string, { estado: EstadoCargo; pendiente: number }>();
  for (const m of movs.filter((x) => x.tipo === 'cargo').sort(byDate)) {
    const aplicado = Math.min(cubre, m.monto);
    cubre -= aplicado;
    const pendiente = m.monto - aplicado;
    out.set(m.id, { estado: pendiente === 0 ? 'pagado' : aplicado > 0 ? 'parcial' : 'pendiente', pendiente });
  }
  return out;
}

/**
 * Lo mismo en sentido inverso: estado de lo que yo le debo a una persona (sus "pagó por ti").
 * Lo cubierto = lo que le debo − max(lo que le debo neto, 0), aplicado del más antiguo al más nuevo.
 */
export function estadosDeudas(movs: Movimiento[]): Map<string, { estado: EstadoCargo; pendiente: number }> {
  const debo = suma(movs, 'deuda');
  let cubre = Math.max(0, debo - Math.max(-saldo(movs), 0));
  const out = new Map<string, { estado: EstadoCargo; pendiente: number }>();
  for (const m of movs.filter((x) => x.tipo === 'deuda').sort(byDate)) {
    const aplicado = Math.min(cubre, m.monto);
    cubre -= aplicado;
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
