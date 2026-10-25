// Exportación a CSV pensada para Excel en español (separador ";" y BOM UTF-8).
import type { Cargo, Movimiento, Persona } from '../db';
import { byDate } from './balance';

const cell = (v: string | number) => {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function movimientosCsv(personas: Persona[], movimientos: Movimiento[], cargos: Cargo[]): string {
  const pName = new Map(personas.map((p) => [p.id, p.nombre]));
  const cMap = new Map(cargos.map((c) => [c.id, c]));
  const header = ['Fecha', 'Persona', 'Tipo', 'Detalle', 'Monto', 'Total del gasto', 'Compartido con'];
  const rows = [...movimientos].sort(byDate).map((m) => {
    const c = m.cargoId ? cMap.get(m.cargoId) : undefined;
    const otros = c ? c.participantes.filter((id) => id !== m.personaId).map((id) => pName.get(id) ?? '?') : [];
    if (c?.yoIncluido) otros.push('Yo');
    return [
      m.fecha,
      pName.get(m.personaId) ?? '?',
      m.tipo === 'cargo' ? 'Cargo' : 'Pago',
      m.detalle,
      m.tipo === 'cargo' ? m.monto : -m.monto,
      c ? c.total : '',
      otros.join(', '),
    ];
  });
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
}
