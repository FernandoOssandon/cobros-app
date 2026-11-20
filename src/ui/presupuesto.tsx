// Cómo se muestra un presupuesto: la barra con la marca del ritmo y las tarjetas (los textos están en presupuestoTextos.ts).
import type { Categoria, Presupuesto } from '../db';
import { categoriasDe, type AvancePresupuesto } from '../lib/presupuestos';
import { ESTADO_COLOR, ESTADO_LABEL, lineasPresupuesto } from './presupuestoTextos';
import { Svg } from './icons';
import { CatIcon } from './kit';

export const IC_CAL = 'M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4';

/** Ícono: calendario para los totales, la categoría para uno de una, dos círculos encimados para varias. */
export function IconoPresupuesto({ p, cats, size = 40 }: { p: Pick<Presupuesto, 'categoriaIds' | 'categoriaId'>; cats: Categoria[]; size?: number }) {
  if (categoriasDe(p).length === 1 || (categoriasDe(p).length && cats.length === 1)) return <CatIcon cat={cats[0]} size={size} />;
  if (categoriasDe(p).length) {
    const chico = Math.round(size * 0.72);
    return (
      <span style={{ position: 'relative', width: size, height: size, display: 'block', flex: 'none' }} aria-hidden="true">
        <span style={{ position: 'absolute', left: 0, top: 0 }}>
          <CatIcon cat={cats[0]} size={chico} />
        </span>
        <span style={{ position: 'absolute', right: 0, bottom: 0, borderRadius: '50%', boxShadow: '0 0 0 2px var(--surface)' }}>
          <CatIcon cat={cats[1]} size={chico} />
        </span>
      </span>
    );
  }
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
