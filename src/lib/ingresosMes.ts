// Ingresos de un mes: los fijos (y si ya llegaron) y los sueltos. Lógica pura.
import type { Ingreso, Pendiente, Recurrente } from '../db';
import { sumarMes, todayISO } from './format';
import { proxima, sumarDias } from './recurrence';

export interface FijoDelMes {
  r: Recurrente;
  /** llegó: ya se anotó este mes · confirmar: es variable y espera el monto · llega: todavía no. */
  estado: 'llego' | 'confirmar' | 'llega' | 'terminado';
  fecha?: string;
  /** Lo que llegó (si llegó). */
  monto?: number;
  pendienteId?: string;
}

export interface IngresosMes {
  /** Fijos ya llegados + sueltos del mes. */
  total: number;
  fijos: FijoDelMes[];
  /** Ingresos sin recurrente (una venta, una pega, un reembolso), del más nuevo al más antiguo. */
  sueltos: Ingreso[];
}

export function ingresosMes(mes: string, ingresos: Ingreso[], recurrentes: Recurrente[], pendientes: Pendiente[], hoy = todayISO()): IngresosMes {
  const desde = `${mes}-01`;
  const hasta = sumarDias(`${sumarMes(mes, 1)}-01`, -1);
  const delMes = ingresos.filter((i) => i.fecha >= desde && i.fecha <= hasta);
  const fijos = recurrentes
    .filter((r) => r.tipo === 'ingreso' && r.activo)
    .sort((a, b) => a.creado.localeCompare(b.creado))
    .map((r): FijoDelMes => {
      const llegados = delMes.filter((i) => i.recurrenteId === r.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
      if (llegados.length) return { r, estado: 'llego', fecha: llegados[0].fecha, monto: llegados.reduce((s, i) => s + i.monto, 0) };
      const p = pendientes.find((x) => x.recurrenteId === r.id && x.fecha >= desde && x.fecha <= hasta);
      if (p) return { r, estado: 'confirmar', fecha: p.fecha, pendienteId: p.id };
      const sig = proxima(r.frecuencia, r.inicio, [r.generadoHasta ?? '', sumarDias(hoy, -1)].sort()[1], r.fin);
      return sig ? { r, estado: 'llega', fecha: sig } : { r, estado: 'terminado' };
    });
  return {
    total: delMes.reduce((s, i) => s + i.monto, 0),
    fijos,
    sueltos: delMes.filter((i) => !i.recurrenteId).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado.localeCompare(a.creado)),
  };
}

/** Día del mes en que llega un ingreso fijo mensual. */
export const diaDeIngreso = (r: Recurrente) => r.frecuencia.dia ?? Number(r.inicio.slice(8, 10));
