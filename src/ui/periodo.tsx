// Selector de período: ‹ [píldora] › y la hoja "¿qué período?". Se usa en Resumen y en Gastos.
import { useState, type CSSProperties } from 'react';
import type { Medio } from '../db';
import { daysBetween, shortDate, todayISO } from '../lib/format';
import { clavePeriodo, etiquetaPeriodo, opcionesPeriodo, rangoPeriodo, type Periodo } from '../lib/periodos';
import { useNav } from '../nav';
import { usePeriodo } from '../periodo';
import { Icon } from './icons';
import { Sheet } from './kit';

export function PeriodoBar({ medios, style }: { medios: Medio[]; style?: CSSProperties }) {
  const { periodo, actual, mover, elegir } = usePeriodo(medios);
  const [abierta, setAbierta] = useState(false);
  const tarjeta = periodo.tipo === 'tarjeta';
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...style }}>
        <button className="btn-round" style={{ flex: 'none' }} onClick={() => mover(-1)} aria-label="Período anterior">
          <Icon name="back" size={16} w={3} />
        </button>
        <button
          onClick={() => setAbierta(true)}
          aria-label={`Período: ${etiquetaPeriodo(periodo, medios)}`}
          aria-haspopup="dialog"
          style={{
            flex: 1, minWidth: 0, height: 36, padding: '0 12px 0 14px', borderRadius: 18, border: '2px solid var(--ink)',
            background: tarjeta ? 'var(--ink)' : 'transparent', color: tarjeta ? 'var(--bg)' : 'var(--ink)',
            fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <span className="ellipsis">{etiquetaPeriodo(periodo, medios)}</span>
          <span style={{ flex: 'none', display: 'flex' }}>
            <Icon name="down" size={14} w={3} />
          </span>
        </button>
        <button className="btn-round" style={{ flex: 'none', opacity: actual ? 0.3 : 1 }} disabled={actual} onClick={() => mover(1)} aria-label="Período siguiente">
          <Icon name="next" size={16} w={3} />
        </button>
      </div>
      {abierta && (
        <PeriodoSheet
          medios={medios}
          actual={periodo}
          onClose={() => setAbierta(false)}
          onPick={(p) => {
            setAbierta(false);
            elegir(p.tipo === 'mes' ? null : clavePeriodo(p));
          }}
        />
      )}
    </>
  );
}

function PeriodoSheet({ medios, actual, onPick, onClose }: { medios: Medio[]; actual: Periodo; onPick: (p: Periodo) => void; onClose: () => void }) {
  const { push } = useNav();
  const hoy = todayISO();
  const ops = opcionesPeriodo(medios, hoy);
  return (
    <Sheet onClose={onClose} label="¿qué período?">
      <div className="sheet-title" style={{ padding: '16px 4px 4px' }}>¿qué período?</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted)', padding: '0 4px 8px', lineHeight: 1.35, textWrap: 'pretty' }}>
        El mes completo, o lo que llegará en el estado de cuenta de cada tarjeta.
      </div>
      {ops.map((p) => {
        const m = p.tipo === 'tarjeta' ? medios.find((x) => x.id === p.medioId) : undefined;
        const elegido = p.tipo === 'mes' ? actual.tipo === 'mes' : actual.tipo === 'tarjeta' && actual.medioId === p.medioId;
        const n = daysBetween(hoy, p.hasta);
        const sub =
          p.tipo === 'mes'
            ? `1 – ${shortDate(p.hasta)} · todo lo que gastas en el mes`
            : `${rangoPeriodo(p)} · ${n > 0 ? `cierra en ${n} ${n === 1 ? 'día' : 'días'}` : 'cierra hoy'}`;
        return (
          <button
            key={clavePeriodo(p)}
            onClick={() => onPick(p)}
            style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--line)', background: 'transparent', padding: '14px 4px', display: 'grid', gridTemplateColumns: '38px minmax(0,1fr) 22px', gap: 12, alignItems: 'center', textAlign: 'left' }}
          >
            <span style={{ width: 38, height: 26, borderRadius: 6, boxSizing: 'border-box', background: m ? m.color : 'transparent', border: `2px solid ${m ? '#0E1A12' : 'var(--ink)'}` }} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{m ? m.nombre : 'Mes calendario'}</span>
              <span className="t-meta">{sub}</span>
            </span>
            <span className="radio" role="radio" aria-checked={elegido}>
              <span />
            </span>
          </button>
        );
      })}
      <button
        onClick={() => {
          onClose();
          push('/medios');
        }}
        style={{ width: '100%', marginTop: 10, border: 'none', background: 'transparent', padding: '6px 4px', textAlign: 'left', fontSize: 14, fontWeight: 700, color: 'var(--muted)', lineHeight: 1.35 }}
      >
        ¿Falta una tarjeta? Ponle día de facturación en Medios de pago.
      </button>
    </Sheet>
  );
}
