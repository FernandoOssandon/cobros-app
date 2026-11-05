import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDatos } from '../hooks';
import { diaLabel, fmt, shortDate } from '../lib/format';
import type { Medio } from '../db';
import { idOrigen, type GastoImputado } from '../lib/cuotas';
import { estadoCierre, gastosDelPeriodo, resumenTarjeta } from '../lib/periodos';
import { agruparPorDia, filtrarGastos, type FiltroGastos } from '../lib/search';
import { useNav } from '../nav';
import { usePeriodo } from '../periodo';
import { Icon } from '../ui/icons';
import { EmptyState, PickerSheet } from '../ui/kit';
import { PeriodoBar } from '../ui/periodo';
import { GastoRow } from '../ui/rows';

type Clave = 'cat' | 'medio' | 'persona' | 'grupo';
const CAMPO: Record<Clave, keyof FiltroGastos> = { cat: 'categoriaId', medio: 'medioId', persona: 'personaId', grupo: 'grupoId' };
const TITULO: Record<Clave, string> = { cat: 'Categoría', medio: 'Medio de pago', persona: 'Persona', grupo: 'Grupo' };
const ETIQUETA: Record<Clave, string> = { cat: 'Categoría', medio: 'Medio', persona: 'Persona', grupo: 'Grupo' };

export default function Gastos() {
  const d = useDatos();
  const { push } = useNav();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [picker, setPicker] = useState<Clave | null>(null);
  const { periodo } = usePeriodo(d?.medios ?? SIN_MEDIOS);
  if (!d) return <div className="scroll" />;
  const tarjeta = periodo.tipo === 'tarjeta' ? periodo : null;
  const rt = tarjeta ? resumenTarjeta(tarjeta, d.imputados, d.movimientos) : null;
  const medioTarjeta = tarjeta ? d.medio.get(tarjeta.medioId) : undefined;
  // La búsqueda mira todos los períodos (para encontrar algo de hace meses); sin texto, solo el período elegido.
  const buscando = q.trim().length > 0;
  const base: GastoImputado[] = buscando ? d.gastos : gastosDelPeriodo(periodo, d.imputados);

  const val = (k: Clave) => params.get(k);
  const setVal = (k: Clave, v: string | null) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };
  const sinCat = val('cat') === 'none';
  const filtro: FiltroGastos = { texto: q };
  (Object.keys(CAMPO) as Clave[]).forEach((k) => {
    const v = val(k);
    if (v && !(k === 'cat' && v === 'none')) (filtro as Record<string, string>)[CAMPO[k]] = v;
  });
  let lista = filtrarGastos(base, filtro, d.personas.map((v) => v.p));
  if (sinCat) lista = lista.filter((g) => !g.categoriaId);
  const dias = agruparPorDia(lista);

  const opciones: Record<Clave, { value: string | null; label: string }[]> = {
    cat: [{ value: 'none', label: 'Sin categoría' }, ...d.categorias.map((c) => ({ value: c.id, label: c.nombre }))],
    medio: d.medios.filter((m) => !m.archivado).map((m) => ({ value: m.id, label: m.nombre })),
    persona: d.personas.map((v) => ({ value: v.p.id, label: v.p.nombre })),
    grupo: d.grupos.map((g) => ({ value: g.id, label: g.nombre })),
  };
  const nombreDe = (k: Clave, v: string) => opciones[k].find((o) => o.value === v)?.label ?? ETIQUETA[k];
  const nombreCorto = (k: Clave, v: string) => (k === 'persona' ? d.persona.get(v)?.first ?? '' : nombreDe(k, v));

  return (
    <>
      <div className="row-between" style={{ flex: 'none', padding: '6px 20px 12px' }}>
        <h1 className="t-tab">gastos.</h1>
        <button className="btn-o" onClick={() => push('/grupos')}>
          Grupos
        </button>
      </div>
      <div style={{ flex: 'none', padding: '0 16px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, height: 48, padding: '0 16px', borderRadius: 24, border: '2px solid var(--ink)' }}>
          <Icon name="search" size={18} w={2.6} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar gasto o persona"
            aria-label="Buscar gasto o persona"
            style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontSize: 16, fontWeight: 600, padding: 0 }}
          />
        </label>
      </div>
      <PeriodoBar medios={d.medios} style={{ flex: 'none', padding: '10px 16px' }} />
      {tarjeta && rt && (
        <div style={{ flex: 'none', margin: '0 16px 10px', borderRadius: 22, background: 'var(--surface)', padding: '12px 16px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="t-meta">{rt.cerrado ? 'Llegó en tu estado de cuenta' : 'Llegará en tu estado de cuenta'}</span>
            <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
              tuyo {fmt(rt.tuyo)} · de otros {fmt(rt.deOtros)} · {estadoCierre(tarjeta).toLowerCase()}
            </span>
          </span>
          <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.6, whiteSpace: 'nowrap' }}>{fmt(rt.facturado)}</span>
        </div>
      )}
      <div style={{ flex: 'none', display: 'flex', gap: 8, overflowX: 'auto', padding: '0 16px 4px' }}>
        {(Object.keys(CAMPO) as Clave[]).map((k) => {
          const v = val(k);
          return (
            <button key={k} className="pill h36" style={{ padding: '0 12px 0 14px', gap: 6 }} aria-pressed={!!v} onClick={() => setPicker(k)}>
              {v ? nombreCorto(k, v) : ETIQUETA[k]}
              <Icon name="down" size={14} w={3} />
            </button>
          );
        })}
      </div>
      <div className="scroll" style={{ padding: '0 16px 96px' }}>
        {dias.map((dia) => (
          <div key={dia.fecha}>
            <div className="day-head">
              <span>{diaLabel(dia.fecha)}</span>
              <span>{fmt(dia.miTotal)}</span>
            </div>
            <div className="list">
              <div className="inner">
                {dia.gastos.map((g) => (
                  <GastoRow key={g.id} g={g} d={d} onClick={() => push(`/gasto/${idOrigen(g)}`)} />
                ))}
              </div>
            </div>
          </div>
        ))}
        {buscando && lista.length > 0 && <div className="t-meta" style={{ padding: '14px 4px 0' }}>Buscando en todos los meses.</div>}
        {d.gastos.length > 0 && base.length > 0 && lista.length === 0 && (
          <div className="t-note" style={{ padding: '30px 4px' }}>
            Nada por aquí. Prueba con otra palabra o quita un filtro.
          </div>
        )}
        {tarjeta && base.length === 0 && (
          <div style={{ padding: '40px 4px 0' }}>
            <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: -2, lineHeight: 0.95 }}>
              Nada en este
              <br />
              período.
            </div>
            <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--muted)', marginTop: 14, lineHeight: 1.35, textWrap: 'pretty' }}>
              No anotaste compras con {medioTarjeta?.nombre ?? 'esta tarjeta'} entre el {shortDate(tarjeta.desde)} y el {shortDate(tarjeta.hasta)}.
            </div>
          </div>
        )}
        {!tarjeta && base.length === 0 && (
          <EmptyState
            title={<>Ni un<br />peso.</>}
            body="O eres muy ordenado o se te olvidó anotar. Toca Nuevo gasto y partimos con el café de hoy."
          />
        )}
      </div>
      {picker && (
        <PickerSheet
          title={TITULO[picker]}
          value={val(picker)}
          options={[{ value: null, label: 'Todos' }, ...opciones[picker]]}
          onClose={() => setPicker(null)}
          onPick={(v) => {
            setVal(picker, v);
            setPicker(null);
          }}
        />
      )}
    </>
  );
}

const SIN_MEDIOS: Medio[] = [];
