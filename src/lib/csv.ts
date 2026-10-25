// Exportación a CSV pensada para Excel en español (separador ";" y BOM UTF-8).
import type { Categoria, Gasto, Medio, Movimiento, Persona } from '../db';
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
  const header = ['Fecha', 'Descripción', 'Categoría', 'Medio de pago', 'Pagó', 'Total', 'Mi parte', 'De otros', 'Participantes'];
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
  ]);
  return csv([header, ...rows]);
}
