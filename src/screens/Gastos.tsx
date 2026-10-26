import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDatos } from '../hooks';
import { diaLabel, fmt } from '../lib/format';
import { agruparPorDia, filtrarGastos, type FiltroGastos } from '../lib/search';
import { useNav } from '../nav';
import { Icon } from '../ui/icons';
import { EmptyState, PickerSheet } from '../ui/kit';
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
  if (!d) return <div className="scroll" />;

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
  let lista = filtrarGastos(d.gastos, filtro, d.personas.map((v) => v.p));
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
      <div style={{ flex: 'none', display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 16px 4px' }}>
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
                  <GastoRow key={g.id} g={g} d={d} onClick={() => push(`/gasto/${g.id}`)} />
                ))}
              </div>
            </div>
          </div>
        ))}
        {d.gastos.length > 0 && lista.length === 0 && (
          <div className="t-note" style={{ padding: '30px 4px' }}>
            Nada por aquí. Prueba con otra palabra o quita un filtro.
          </div>
        )}
        {d.gastos.length === 0 && (
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
