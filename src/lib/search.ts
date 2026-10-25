// Búsqueda y filtros del registro de gastos.
import type { Gasto, Persona } from '../db';

export interface FiltroGastos {
  texto?: string;
  categoriaId?: string;
  medioId?: string;
  personaId?: string;
  grupoId?: string;
  desde?: string; // YYYY-MM-DD inclusive
  hasta?: string; // YYYY-MM-DD inclusive
}

/** Minúsculas y sin tildes, para que "matias" encuentre "Matías". */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function filtrarGastos(gastos: Gasto[], f: FiltroGastos, personas: Persona[] = []): Gasto[] {
  const q = f.texto ? normalizar(f.texto) : '';
  const nombres = new Map(personas.map((p) => [p.id, normalizar(p.nombre)]));
  return gastos
    .filter((g) => {
      if (f.categoriaId && g.categoriaId !== f.categoriaId) return false;
      if (f.medioId && g.medioId !== f.medioId) return false;
      if (f.grupoId && g.grupoId !== f.grupoId) return false;
      if (f.personaId && !g.participantes.includes(f.personaId) && g.pagador !== f.personaId) return false;
      if (f.desde && g.fecha < f.desde) return false;
      if (f.hasta && g.fecha > f.hasta) return false;
      if (q) {
        const enTexto = normalizar(g.descripcion).includes(q) || normalizar(g.nota ?? '').includes(q);
        const enPersona = [...g.participantes, g.pagador].some((id) => nombres.get(id)?.includes(q));
        const enMonto = /^\d[\d.]*$/.test(q) && String(g.total).includes(q.replace(/\./g, ''));
        if (!enTexto && !enPersona && !enMonto) return false;
      }
      return true;
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado.localeCompare(a.creado));
}

/** Agrupa por día para la lista del registro diario (más reciente primero). */
export function agruparPorDia(gastos: Gasto[]): { fecha: string; gastos: Gasto[]; miTotal: number }[] {
  const map = new Map<string, Gasto[]>();
  for (const g of gastos) map.set(g.fecha, [...(map.get(g.fecha) ?? []), g]);
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([fecha, gs]) => ({ fecha, gastos: gs, miTotal: gs.reduce((s, g) => s + g.miParte, 0) }));
}
