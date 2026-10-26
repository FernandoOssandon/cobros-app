// Componentes de lista del diseño v2: fila de gasto, tarjeta de medio con barra apilada, barra de pestañas.
import type { Gasto, Medio } from '../db';
import type { Datos } from '../hooks';
import { fmt } from '../lib/format';
import type { ResumenMedio } from '../lib/resumen';
import { PESTANAS } from '../nav';
import { NAV, Svg, Icon } from './icons';
import { CatIcon, MedioThumb } from './kit';

/** Fila de gasto (ícono de categoría, descripción, medio + badge, tu parte y el total). */
export function GastoRow({ g, d, onClick }: { g: Gasto; d: Datos; onClick: () => void }) {
  const cat = g.categoriaId ? d.categoria.get(g.categoriaId) : undefined;
  const byOther = g.pagador !== 'yo';
  const shared = !byOther && g.participantes.length > 0;
  const medio = g.medioId ? d.medio.get(g.medioId) : undefined;
  const meta = byOther ? (cat?.nombre ?? 'Sin categoría') : (medio?.nombre ?? cat?.nombre ?? '');
  let badge: { text: string; color: string } | null = null;
  if (!cat) badge = { text: 'sin categoría', color: 'var(--danger)' };
  else if (byOther) badge = { text: 'pagó ' + (d.persona.get(g.pagador)?.first ?? ''), color: 'var(--owe)' };
  else if (shared) badge = { text: `compartido · ${g.participantes.length + (g.yoIncluido ? 1 : 0)}`, color: 'var(--muted)' };
  return (
    <button className="list-row" onClick={onClick}>
      <CatIcon cat={cat} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span className="r-title">{g.descripcion}</span>
        <span className="r-sub">
          <span>{meta}</span>
          {badge && (
            <span className="badge" style={{ color: badge.color }}>
              {badge.text}
            </span>
          )}
        </span>
      </span>
      <span className="r-right">
        <span className="r-amt">{fmt(g.miParte)}</span>
        {(shared || byOther) && <span className="r-total">de {fmt(g.total)}</span>}
      </span>
    </button>
  );
}

export const tipoMedioLabel = (t: Medio['tipo']) => ({ credito: 'Crédito', debito: 'Débito', efectivo: 'Efectivo', transferencia: 'Transferencia' })[t];

/** Tarjeta de medio de pago con barra apilada: tuyo / recuperado / pendiente. */
export function MedioCard({ r, medio, meta, onClick }: { r: ResumenMedio; medio?: Medio; meta: string; onClick: () => void }) {
  const otros = r.total - r.mio;
  const seg = (v: number, bg: string) => <span style={{ display: v > 0 ? 'block' : 'none', flexGrow: v, background: bg }} />;
  return (
    <button className="card" onClick={onClick}>
      <span style={{ display: 'grid', gridTemplateColumns: '38px minmax(0,1fr) auto', gap: 12, alignItems: 'center', width: '100%' }}>
        <MedioThumb medio={medio} />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>{medio?.nombre ?? 'Sin medio de pago'}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{meta}</span>
        </span>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.6 }}>{fmt(r.total)}</span>
      </span>
      <span className="stack">
        {seg(r.mio, 'var(--ink)')}
        {seg(r.otrosCobrado, 'var(--pos)')}
        {seg(r.otrosPendiente, 'var(--owe)')}
      </span>
      {otros > 0 ? (
        <>
          <span className="legend">
            <span>
              <span className="k"><span className="dot" style={{ background: 'var(--ink)' }} />tuyos</span>
              <span className="v">{fmt(r.mio)}</span>
            </span>
            <span>
              <span className="k"><span className="dot" style={{ background: 'var(--pos)' }} />recuperados</span>
              <span className="v">{fmt(r.otrosCobrado)}</span>
            </span>
            <span>
              <span className="k"><span className="dot" style={{ background: 'var(--owe)' }} />pendientes</span>
              <span className="v">{fmt(r.otrosPendiente)}</span>
            </span>
          </span>
          <span className="t-meta">
            {fmt(otros)} fueron de otros: {fmt(r.otrosCobrado)} recuperados, {fmt(r.otrosPendiente)} pendientes
          </span>
        </>
      ) : (
        <span className="t-meta">Todo tuyo, nadie te debe nada de acá.</span>
      )}
    </button>
  );
}

/** Barra inferior de 4 pestañas y botón flotante "Nuevo gasto". */
export function TabBar({ current, onTab, onNuevo }: { current: string; onTab: (path: string) => void; onNuevo: () => void }) {
  return (
    <>
      <button className="fab" onClick={onNuevo}>
        <Icon name="plus" size={20} w={2.8} />
        Nuevo gasto
      </button>
      <nav className="tabbar" aria-label="Secciones">
        {PESTANAS.map((t) => (
          <button key={t.path} aria-current={current === t.path ? 'page' : undefined} onClick={() => onTab(t.path)}>
            <span className="ind">
              <Svg d={NAV[t.key]} size={22} w={2.2} />
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}
