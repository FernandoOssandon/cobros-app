// Cómo se muestra un presupuesto: textos, colores, la barra con la marca del ritmo y las tarjetas.
import type { Categoria, Presupuesto } from '../db';
import { fmt, MESES_LARGOS, shortDate } from '../lib/format';
import type { AvancePresupuesto, EstadoPresupuesto } from '../lib/presupuestos';
import { Svg } from './icons';
import { CatIcon } from './kit';

export const IC_CAL = 'M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4';
export const ESTADO_COLOR: Record<EstadoPresupuesto, string> = { bien: 'var(--pos)', cerca: 'var(--owe)', excedido: 'var(--danger)' };
export const ESTADO_LABEL: Record<EstadoPresupuesto, string> = { bien: 'vas bien', cerca: 'cerca del límite', excedido: 'te pasaste' };

const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

export function nombrePresupuesto(p: Pick<Presupuesto, 'nombre' | 'periodo' | 'categoriaId'>, cat?: Categoria) {
  if (p.categoriaId) return cat?.nombre ?? p.nombre;
  return p.periodo === 'semana' ? 'Total semanal' : 'Total mensual';
}

/** "lun 23 – dom 29 nov · todos tus gastos" o "Mensual · noviembre". */
export function subPresupuesto(a: AvancePresupuesto, cat?: Categoria) {
  const p = a.presupuesto;
  if (p.periodo === 'mes') return `Mensual · ${MESES_LARGOS[Number(a.desde.slice(5, 7)) - 1]}`;
  const [d1, m1] = shortDate(a.desde).split(' ');
  const fin = shortDate(a.hasta);
  const inicio = m1 === fin.split(' ')[1] ? d1 : `${d1} ${m1}`;
  return `lun ${inicio} – dom ${fin} · ${p.categoriaId ? cat?.nombre ?? p.nombre : 'todos tus gastos'}`;
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

/** Ícono: calendario para los totales, la categoría para los demás. */
export function IconoPresupuesto({ p, cat, size = 40 }: { p: Pick<Presupuesto, 'categoriaId'>; cat?: Categoria; size?: number }) {
  if (p.categoriaId) return <CatIcon cat={cat} size={size} />;
  return (
    <span className="cat-ic" style={{ width: size, height: size, background: 'var(--soft)', color: 'var(--ink)' }} aria-hidden="true">
      <Svg d={IC_CAL} size={Math.round(size / 2)} w={2} />
    </span>
  );
}

/** Barra con relleno en el color del estado y la marca del ritmo parejo. */
export function BarraPresupuesto({ a, alto = 14 }: { a: AvancePresupuesto; alto?: 10 | 14 }) {
  const l = lineasPresupuesto(a);
  const grande = alto === 14;
  return (
    <span
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(a.pct * 100)}
      aria-label={`${Math.round(a.pct * 100)} % del límite`}
      style={{ display: 'block', position: 'relative', width: '100%', height: alto, borderRadius: alto / 2, background: 'var(--track)' }}
    >
      <span style={{ display: 'block', width: l.barra, height: alto, borderRadius: alto / 2, background: l.color }} />
      <span
        style={{
          position: 'absolute', left: l.marca, top: grande ? -5 : -4, width: grande ? 4 : 3, height: grande ? 20 : 18,
          marginLeft: grande ? -4 : -1.5, borderRadius: grande ? 3 : 2, background: 'var(--ink)', boxSizing: 'content-box',
          border: grande ? '2px solid var(--surface)' : 'none',
        }}
      />
    </span>
  );
}

export const ChipEstado = ({ a }: { a: AvancePresupuesto }) => (
  <span style={{ height: 26, padding: '0 10px', borderRadius: 13, border: `1.5px solid ${ESTADO_COLOR[a.estado]}`, color: ESTADO_COLOR[a.estado], fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', flex: 'none' }}>
    {ESTADO_LABEL[a.estado]}
  </span>
);

/** Las dos líneas de abajo: lo que queda y el ritmo. */
export function LineasPresupuesto({ a }: { a: AvancePresupuesto }) {
  const l = lineasPresupuesto(a);
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 15, fontWeight: 800, color: l.quedaColor }}>{l.queda}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: l.ritmoColor }}>{l.ritmo}</span>
    </span>
  );
}
