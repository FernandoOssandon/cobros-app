// Exportación a CSV pensada para Excel en español (separador ";" y BOM UTF-8).
import type { Categoria, Cuenta, Gasto, Ingreso, Medio, Movimiento, Persona, Presupuesto } from '../db';
import { avancePresupuesto, categoriasDe } from './presupuestos';
import { juntarY } from './format';
import { fmtMoneda } from './monedas';
import { byDate } from './balance';

const cell = (v: string | number) => {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number)[][]) => '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');

const TIPO = { cargo: 'Me debe', pago: 'Me pagó', deuda: 'Le debo', abono: 'Le pagué' } as const;
const SIGNO = { cargo: 1, pago: -1, deuda: -1, abono: 1 } as const;

/** Movimientos con personas (lo que me deben y lo que debo). */
export function movimientosCsv(personas: Persona[], movimientos: Movimiento[], gastos: Gasto[]): string {
  const pName = new Map(personas.map((p) => [p.id, p.nombre]));
  const gMap = new Map(gastos.map((g) => [g.id, g]));
  const header = ['Fecha', 'Persona', 'Tipo', 'Detalle', 'Monto (+ te debe / − le debes)', 'Total del gasto', 'Compartido con'];
  const rows = [...movimientos].sort(byDate).map((m) => {
    const g = m.gastoId ? gMap.get(m.gastoId) : undefined;
    const otros = g ? g.participantes.filter((id) => id !== m.personaId).map((id) => pName.get(id) ?? '?') : [];
    if (g?.yoIncluido && g.pagador === 'yo') otros.push('Yo');
    return [m.fecha, pName.get(m.personaId) ?? '?', TIPO[m.tipo], m.detalle, SIGNO[m.tipo] * m.monto, g ? g.total : '', otros.join(', ')];
  });
  return csv([header, ...rows]);
}

/** Registro de gastos (mi parte, medio de pago, categoría). */
export function gastosCsv(gastos: Gasto[], personas: Persona[], medios: Medio[], categorias: Categoria[]): string {
  const pName = new Map(personas.map((p) => [p.id, p.nombre]));
  const mName = new Map(medios.map((m) => [m.id, m.nombre]));
  const cName = new Map(categorias.map((c) => [c.id, c.nombre]));
  const header = ['Fecha', 'Descripción', 'Categoría', 'Medio de pago', 'Pagó', 'Total', 'Mi parte', 'De otros', 'Participantes', 'Cuotas', 'Moneda original'];
  const rows = [...gastos].sort(byDate).map((g) => [
    g.fecha,
    g.descripcion,
    cName.get(g.categoriaId ?? '') ?? '',
    mName.get(g.medioId ?? '') ?? '',
    g.pagador === 'yo' ? 'Yo' : pName.get(g.pagador) ?? '?',
    g.total,
    g.miParte,
    g.pagador === 'yo' ? g.total - g.miParte : 0,
    g.participantes.map((id) => pName.get(id) ?? '?').join(', '),
    g.cuotas && g.cuotas > 1 ? g.cuotas : '',
    g.moneda ? `${fmtMoneda(g.moneda.codigo, g.moneda.monto)} a $${g.moneda.valor}` : '',
  ]);
  return csv([header, ...rows]);
}

/** Ingresos: el sueldo (fijo) y los sueltos, con la cuenta donde llegaron. */
export function ingresosCsv(ingresos: Ingreso[], cuentas: Cuenta[]): string {
  const cName = new Map(cuentas.map((c) => [c.id, c.nombre]));
  const header = ['Fecha', 'Descripción', 'Tipo', 'Monto', 'Llegó a'];
  const rows = [...ingresos]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((i) => [i.fecha, i.descripcion, i.recurrenteId ? 'Fijo' : 'Suelto', i.monto, cName.get(i.cuentaId ?? '') ?? '']);
  return csv([header, ...rows]);
}

/** Presupuestos con su avance de hoy. `gastos` van imputados (las cuotas en su mes). */
export function presupuestosCsv(presupuestos: Presupuesto[], gastos: Gasto[], categorias: Categoria[], hoy: string): string {
  const cName = new Map(categorias.map((c) => [c.id, c.nombre]));
  const ESTADO = { bien: 'Vas bien', cerca: 'Cerca del límite', excedido: 'Te pasaste' } as const;
  const header = ['Presupuesto', 'Período', 'Desde', 'Hasta', 'Límite', 'Gastado', 'Te queda', '%', 'Estado'];
  const rows = presupuestos
    .filter((p) => !p.archivado)
    .map((p) => {
      const a = avancePresupuesto(p, gastos, hoy);
      const cats = categoriasDe(p).map((id) => cName.get(id)).filter((n): n is string => !!n);
      const auto = cats.length ? juntarY(cats) : p.periodo === 'semana' ? 'Total semanal' : 'Total mensual';
      const nombre = p.categoriaId && !p.categoriaIds?.length ? cats[0] ?? p.nombre : p.nombre.trim() || auto;
      return [nombre, p.periodo === 'semana' ? 'Semanal' : 'Mensual', a.desde, a.hasta, p.monto, a.gastado, a.restante, Math.round(a.pct * 100), ESTADO[a.estado]];
    });
  return csv([header, ...rows]);
}
