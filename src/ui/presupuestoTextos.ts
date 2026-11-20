// Textos de un presupuesto: nombre, a qué categorías aplica y las líneas de su avance (sin componentes).
import type { Categoria, Presupuesto } from '../db';
import { fmt, juntarY, MESES_LARGOS, shortDate } from '../lib/format';
import { categoriasDe, type AvancePresupuesto, type EstadoPresupuesto } from '../lib/presupuestos';

export const ESTADO_COLOR: Record<EstadoPresupuesto, string> = { bien: 'var(--pos)', cerca: 'var(--owe)', excedido: 'var(--danger)' };
export const ESTADO_LABEL: Record<EstadoPresupuesto, string> = { bien: 'vas bien', cerca: 'cerca del límite', excedido: 'te pasaste' };

const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

type PresupuestoNombre = Pick<Presupuesto, 'nombre' | 'periodo' | 'categoriaIds' | 'categoriaId'>;

/** Las categorías del presupuesto, en el orden de la app (las que ya no existen se omiten). */
export function categoriasPresupuesto(p: Pick<Presupuesto, 'categoriaIds' | 'categoriaId'>, categorias: Map<string, Categoria> | Categoria[]): Categoria[] {
  const mapa = categorias instanceof Map ? categorias : new Map(categorias.map((c) => [c.id, c]));
  return categoriasDe(p)
    .map((id) => mapa.get(id))
    .filter((c): c is Categoria => !!c)
    .sort((a, b) => a.orden - b.orden);
}

/** Nombre automático: "Total semanal", "Salidas", "Salidas y Comida". */
export function nombreAuto(p: Pick<Presupuesto, 'periodo'>, cats: Categoria[]) {
  if (!cats.length) return p.periodo === 'semana' ? 'Total semanal' : 'Total mensual';
  return juntarY(cats.map((c) => c.nombre));
}

/** El nombre propio, o el automático si no tiene. */
export function nombrePresupuesto(p: PresupuestoNombre, cats: Categoria[]) {
  // Hasta la 2.7 el nombre de un presupuesto por categoría era el de la categoría: manda el actual.
  if (p.categoriaId && !p.categoriaIds?.length) return cats[0]?.nombre ?? p.nombre;
  return p.nombre.trim() || nombreAuto(p, cats);
}

/** Qué cuenta: "todos tus gastos" o las categorías (si el nombre propio no las dice ya). */
function queCuenta(p: PresupuestoNombre, cats: Categoria[]) {
  if (!categoriasDe(p).length) return 'todos tus gastos';
  const auto = nombreAuto(p, cats);
  return nombrePresupuesto(p, cats) === auto ? '' : auto;
}

/** "lun 23 – dom 29 nov · todos tus gastos" o "Mensual · noviembre · Salidas y Comida". */
export function subPresupuesto(a: AvancePresupuesto, cats: Categoria[]) {
  const p = a.presupuesto;
  const que = queCuenta(p, cats);
  if (p.periodo === 'mes') return [`Mensual · ${MESES_LARGOS[Number(a.desde.slice(5, 7)) - 1]}`, categoriasDe(p).length ? que : ''].filter(Boolean).join(' · ');
  const [d1, m1] = shortDate(a.desde).split(' ');
  const fin = shortDate(a.hasta);
  const inicio = m1 === fin.split(' ')[1] ? d1 : `${d1} ${m1}`;
  return [`lun ${inicio} – dom ${fin}`, que].filter(Boolean).join(' · ');
}

export function lineasPresupuesto(a: AvancePresupuesto) {
  const exc = a.estado === 'excedido';
  const pasa = !exc && a.excesoProyectado > 0;
  const semana = a.presupuesto.periodo === 'semana';
  return {
    color: ESTADO_COLOR[a.estado],
    estado: ESTADO_LABEL[a.estado],
    pct: `${Math.round(a.pct * 100)} %`,
    barra: `${Math.min(100, a.pct * 100).toFixed(1)}%`,
    marca: `${((a.diasTranscurridos / a.diasTotales) * 100).toFixed(1)}%`,
    queda: exc ? `te pasaste por ${fmt(-a.restante)}` : `te quedan ${fmt(a.restante)} · ${fmt(a.porDia)} por día`,
    quedaColor: exc ? 'var(--danger)' : 'var(--ink)',
    ritmo: exc
      ? `y quedan ${dias(a.diasRestantes)} ${semana ? 'de la semana' : 'del mes'}`
      : pasa
        ? `a este ritmo te pasas por ${fmt(a.excesoProyectado)}`
        : `a este ritmo cierras en ${fmt(a.proyeccion)}`,
    ritmoColor: pasa ? 'var(--owe)' : 'var(--muted)',
    riesgo: exc ? `te pasaste por ${fmt(-a.restante)}` : `te quedan ${fmt(a.restante)}${pasa ? ' · a este ritmo te pasas' : ''}`,
  };
}
