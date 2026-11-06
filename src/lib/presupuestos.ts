// Cálculo de presupuestos y del balance del mes (lógica pura).
import type { Gasto, Ingreso, Presupuesto, Recurrente } from '../db';
import { daysBetween, sumarMes, todayISO } from './format';
import { ocurrenciasEntre, sumarDias } from './recurrence';

/** Categorías que cuenta un presupuesto (vacío: todas). Lee también el formato de hasta la 2.7 (una sola). */
export const categoriasDe = (p: Pick<Presupuesto, 'categoriaIds' | 'categoriaId'>): string[] =>
  p.categoriaIds?.length ? p.categoriaIds : p.categoriaId ? [p.categoriaId] : [];

/** Lunes de la semana de `fecha` (la semana va de lunes a domingo). */
export function lunesDe(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dia = new Date(y, m - 1, d).getDay(); // 0 = domingo
  return sumarDias(fecha, -((dia + 6) % 7));
}

/** Rango del período del presupuesto que contiene `hoy`. */
export function rangoPresupuesto(periodo: Presupuesto['periodo'], hoy = todayISO()): { desde: string; hasta: string } {
  if (periodo === 'semana') {
    const desde = lunesDe(hoy);
    return { desde, hasta: sumarDias(desde, 6) };
  }
  const mes = hoy.slice(0, 7);
  return { desde: `${mes}-01`, hasta: sumarDias(`${sumarMes(mes, 1)}-01`, -1) };
}

export type EstadoPresupuesto = 'bien' | 'cerca' | 'excedido';

export interface AvancePresupuesto {
  presupuesto: Presupuesto;
  desde: string;
  hasta: string;
  /** Tu gasto real en el período (tu parte de cada gasto, también lo que otro pagó por ti). */
  gastado: number;
  /** Lo que queda (negativo si te pasaste). */
  restante: number;
  /** 0 a 1+ */
  pct: number;
  /** Días del período, incluido hoy: transcurridos y los que quedan. */
  diasTotales: number;
  diasTranscurridos: number;
  diasRestantes: number;
  /** Lo que puedes gastar por día lo que queda del período (0 si ya no queda). */
  porDia: number;
  /** A este ritmo, cuánto gastarías en todo el período. */
  proyeccion: number;
  /** Cuánto te pasarías a este ritmo (0 si no). */
  excesoProyectado: number;
  /**
   * - excedido: ya gastaste más que el límite.
   * - cerca: llevas el 80 % o más.
   * - bien: lo demás (aunque a este ritmo te pases: eso lo dice `excesoProyectado`).
   */
  estado: EstadoPresupuesto;
}

export function avancePresupuesto(p: Presupuesto, gastos: Gasto[], hoy = todayISO()): AvancePresupuesto {
  const { desde, hasta } = rangoPresupuesto(p.periodo, hoy);
  const cats = categoriasDe(p);
  const gastado = gastos
    .filter((g) => g.fecha >= desde && g.fecha <= hasta && (!cats.length || (!!g.categoriaId && cats.includes(g.categoriaId))))
    .reduce((s, g) => s + g.miParte, 0);
  const diasTotales = daysBetween(desde, hasta) + 1;
  const diasTranscurridos = Math.min(diasTotales, Math.max(1, daysBetween(desde, hoy) + 1));
  const diasRestantes = diasTotales - diasTranscurridos + 1;
  const restante = p.monto - gastado;
  const proyeccion = Math.round((gastado / diasTranscurridos) * diasTotales);
  const pct = p.monto > 0 ? gastado / p.monto : gastado > 0 ? Infinity : 0;
  const excesoProyectado = Math.max(0, proyeccion - p.monto);
  const estado: EstadoPresupuesto = gastado > p.monto ? 'excedido' : pct >= 0.8 ? 'cerca' : 'bien';
  return {
    presupuesto: p,
    desde,
    hasta,
    gastado,
    restante,
    pct,
    diasTotales,
    diasTranscurridos,
    diasRestantes,
    porDia: restante > 0 ? Math.floor(restante / diasRestantes) : 0,
    proyeccion,
    excesoProyectado,
    estado,
  };
}

/** Todos los presupuestos activos con su avance; los en riesgo primero. */
export function avances(presupuestos: Presupuesto[], gastos: Gasto[], hoy = todayISO()): AvancePresupuesto[] {
  const orden: Record<EstadoPresupuesto, number> = { excedido: 0, cerca: 1, bien: 2 };
  return presupuestos
    .filter((p) => !p.archivado)
    .map((p) => avancePresupuesto(p, gastos, hoy))
    .sort((a, b) => orden[a.estado] - orden[b.estado] || a.presupuesto.orden - b.presupuesto.orden);
}

// ---------- Balance del mes: ingresos, gasto y lo que queda ----------

export interface BalanceMes {
  ingresos: number;
  /** Tu gasto real del mes. */
  gastado: number;
  /** ingresos − gastado */
  teQuedan: number;
  /** Lo que falta por pagar este mes en recurrentes fijos (tu parte), desde mañana. */
  porPagar: number;
  /** Ingresos recurrentes fijos que aún no llegan este mes. */
  porLlegar: number;
  /** Lo que te quedaría a fin de mes: teQuedan − porPagar + porLlegar. */
  alFinDeMes: number;
}

/**
 * `miParte(r, monto)` calcula tu parte de un recurrente compartido (se pasa desde fuera para no
 * mezclar esta lógica con el reparto).
 */
export function balanceMes(
  mes: string,
  ingresos: Ingreso[],
  gastos: Gasto[],
  recurrentes: Recurrente[],
  miParte: (r: Recurrente, monto: number) => number,
  hoy = todayISO(),
): BalanceMes {
  const desde = `${mes}-01`;
  const hasta = sumarDias(`${sumarMes(mes, 1)}-01`, -1);
  const enMes = (f: string) => f >= desde && f <= hasta;
  const totalIngresos = ingresos.filter((i) => enMes(i.fecha)).reduce((s, i) => s + i.monto, 0);
  const gastado = gastos.filter((g) => enMes(g.fecha)).reduce((s, g) => s + g.miParte, 0);
  let porPagar = 0;
  let porLlegar = 0;
  // Solo para el mes en curso: lo que viene desde mañana hasta fin de mes.
  if (hoy >= desde && hoy <= hasta) {
    for (const r of recurrentes) {
      if (!r.activo || r.montoTipo !== 'fijo') continue;
      const n = ocurrenciasEntre(r.frecuencia, r.inicio, hoy, hasta, r.fin).length;
      if (!n) continue;
      if (r.tipo === 'ingreso') porLlegar += n * r.monto;
      else if (r.tipo === 'mio') porPagar += n * r.monto;
      else if (r.tipo === 'compartido') porPagar += n * miParte(r, r.monto);
    }
  }
  const teQuedan = totalIngresos - gastado;
  return { ingresos: totalIngresos, gastado, teQuedan, porPagar, porLlegar, alFinDeMes: teQuedan - porPagar + porLlegar };
}
