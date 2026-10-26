import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Categoria } from '../db';
import { useDatos } from '../hooks';
import { fmt, mesLargo, todayISO } from '../lib/format';
import { mesDe } from '../lib/resumen';
import { useNav } from '../nav';
import { IC, Svg } from '../ui/icons';
import { BackButton, CatIcon } from '../ui/kit';
import { CategoriaSheet } from '../ui/sheets';

export default function Categorias() {
  const d = useDatos();
  const { back, backLabel, navigate } = useNav();
  const [params] = useSearchParams();
  const [editar, setEditar] = useState<Categoria | 'nueva' | null>(null);
  if (!d) return <div className="scroll" />;
  const mes = params.get('mes') ?? todayISO().slice(0, 7);
  const delMes = d.gastos.filter((g) => mesDe(g.fecha) === mes);
  const real = delMes.reduce((s, g) => s + g.miParte, 0);
  const por = new Map<string, number>();
  for (const g of delMes) por.set(g.categoriaId ?? 'none', (por.get(g.categoriaId ?? 'none') ?? 0) + g.miParte);
  const max = Math.max(1, ...por.values());
  const filas = [...por.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  return (
    <div className="scroll" style={{ padding: '4px 16px var(--safe-bottom)' }}>
      <BackButton onClick={() => back('/')} label={backLabel} />
      <h1 className="t-screen" style={{ margin: '18px 4px 2px' }}>categorías.</h1>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)', padding: '0 4px 16px' }}>
        {mesLargo(mes)} · tu gasto real {fmt(real)}
      </div>
      {filas.length > 0 ? (
        <div className="list">
          <div className="inner">
            {filas.map(([k, v]) => {
              const c = k === 'none' ? undefined : d.categoria.get(k);
              return (
                <button key={k} className="list-row c36" onClick={() => navigate(`/gastos?cat=${k}`, { replace: true })}>
                  <CatIcon cat={c} size={36} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{c?.nombre ?? 'Sin categoría'}</span>
                    <span style={{ display: 'block', height: 10, borderRadius: 5, background: 'var(--track)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: 10, borderRadius: 5, background: 'var(--ink)', width: `${((v / max) * 100).toFixed(1)}%` }} />
                    </span>
                  </span>
                  <span className="r-right" style={{ gap: 2, minWidth: 76 }}>
                    <span className="r-amt">{fmt(v)}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{Math.round((v / Math.max(real, 1)) * 100)}%</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ padding: '14px 4px', fontSize: 17, fontWeight: 600, color: 'var(--muted)' }}>Sin gastos este mes. Las barras esperan.</div>
      )}
      <h2 className="t-section">tus categorías.</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {d.categorias
          .filter((c) => !c.archivada)
          .map((c) => (
            <button key={c.id} className="pill cat" onClick={() => setEditar(c)}>
              <span className="cat-ic" style={{ width: 28, height: 28, background: c.color }}>
                <Svg d={IC[c.icono] ?? IC.regalo} size={16} w={2.2} />
              </span>
              {c.nombre}
            </button>
          ))}
        <button className="pill" style={{ borderStyle: 'dashed', borderColor: 'var(--muted)', color: 'var(--muted)' }} onClick={() => setEditar('nueva')}>
          + Nueva
        </button>
      </div>
      {editar && <CategoriaSheet cat={editar === 'nueva' ? undefined : editar} onClose={() => setEditar(null)} />}
    </div>
  );
}
