// Tendencias: gasto real mes a mes, comparación con el mes anterior y por categoría.
import { useState } from 'react';
import { useDatos } from '../hooks';
import { fmt, MESES_LARGOS, todayISO } from '../lib/format';
import { comparar, porCategoria, serieMensual, type MesTendencia } from '../lib/tendencias';
import { useNav } from '../nav';
import { BackButton, CatIcon } from '../ui/kit';

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const nombreMes = (mes: string) => MESES_LARGOS[Number(mes.slice(5, 7)) - 1];
const pctLbl = (p: number) => `${Math.round(Math.abs(p) * 100)} %`;

export default function Tendencias() {
  const d = useDatos();
  const { back, backLabel, push } = useNav();
  const hoy = todayISO();
  const [elegido, setElegido] = useState(hoy.slice(0, 7));
  if (!d) return <div className="scroll" />;

  const serie = serieMensual(d.imputados, d.ingresos, 6, hoy);
  const mes = serie.some((m) => m.mes === elegido) ? elegido : serie[serie.length - 1].mes;
  const c = comparar(d.imputados, mes, hoy);
  const cats = porCategoria(d.imputados, mes, hoy);
  const maxCat = Math.max(1, ...cats.map((x) => Math.max(x.actual, x.previo)));
  const cerrados = serie.filter((m) => !m.enCurso && m.gasto > 0);
  const promedio = cerrados.length ? Math.round(cerrados.reduce((s, m) => s + m.gasto, 0) / cerrados.length) : 0;
  const conIngresos = serie.filter((m) => m.ingresos > 0);
  const hayDatos = serie.some((m) => m.gasto > 0);

  const sube = c.diferencia > 0;
  const comparacion =
    c.previo === 0
      ? `En ${nombreMes(c.anterior)} no anotaste gastos${c.hastaDia ? ' a esta altura' : ''}.`
      : c.diferencia === 0
        ? `Igual que ${c.hastaDia ? `a esta altura de ${nombreMes(c.anterior)}` : nombreMes(c.anterior)}.`
        : `${fmt(Math.abs(c.diferencia))} ${sube ? 'más' : 'menos'} que ${c.hastaDia ? `a esta altura de ${nombreMes(c.anterior)}` : nombreMes(c.anterior)}${c.pct !== undefined ? ` (${sube ? '+' : '−'}${pctLbl(c.pct)})` : ''}.`;

  return (
    <div className="scroll" style={{ padding: '4px 16px var(--safe-bottom)' }}>
      <BackButton onClick={() => back('/')} label={backLabel} />
      <h1 className="t-screen" style={{ margin: '18px 4px 8px' }}>tendencias.</h1>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.4, padding: '0 4px', textWrap: 'pretty' }}>
        Tu gasto real, mes a mes. Las compras en cuotas cuentan en el mes de cada cuota.
      </div>

      {!hayDatos ? (
        <div style={{ padding: '40px 4px 0' }}>
          <div className="t-display">
            Sin
            <br />
            historia.
          </div>
          <p className="t-body-muted">Cuando lleves un par de meses anotando, acá vas a ver si gastas más o menos que antes y en qué.</p>
        </div>
      ) : (
        <>
          <div style={{ padding: '22px 4px 0' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)' }}>
              {c.hastaDia ? `Al ${c.hastaDia} de ${nombreMes(mes)}` : `Gasto real de ${nombreMes(mes)}`}
            </div>
            <div className="t-hero" style={{ marginTop: 6 }}>{fmt(c.actual)}</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10, lineHeight: 1.35, color: c.previo === 0 || c.diferencia === 0 ? 'var(--muted)' : sube ? 'var(--owe)' : 'var(--pos)' }}>
              {comparacion}
            </div>
          </div>

          <Barras serie={serie} elegido={mes} onElegir={setElegido} />
          {promedio > 0 && (
            <div className="t-meta" style={{ padding: '10px 4px 0' }}>
              Promedio de {cerrados.length === 1 ? 'el mes cerrado' : `los ${cerrados.length} meses cerrados`}: {fmt(promedio)}
            </div>
          )}

          {cats.length > 0 && (
            <>
              <h2 className="t-section">por categoría.</h2>
              <div className="t-meta" style={{ padding: '0 4px 10px', marginTop: -4 }}>
                {nombreMes(mes)} contra {nombreMes(c.anterior)}
                {c.hastaDia ? `, ambos hasta el día ${c.hastaDia}` : ''}. La marca es {nombreMes(c.anterior)}.
              </div>
              <div className="list">
                <div className="inner">
                  {cats.map((x) => {
                    const cat = x.categoriaId ? d.categoria.get(x.categoriaId) : undefined;
                    const dif = x.actual - x.previo;
                    return (
                      <button
                        key={x.categoriaId ?? 'none'}
                        className="list-row c36"
                        onClick={() => push(`/categorias${mes === hoy.slice(0, 7) ? '' : '?mes=' + mes}`)}
                        aria-label={`${cat?.nombre ?? 'Sin categoría'}: ${fmt(x.actual)}, ${nombreMes(c.anterior)} ${fmt(x.previo)}`}
                      >
                        <CatIcon cat={cat} size={36} />
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                          <span className="r-title">{cat?.nombre ?? 'Sin categoría'}</span>
                          <span style={{ display: 'block', position: 'relative', height: 8, borderRadius: 4, background: 'var(--track)' }}>
                            <span style={{ display: 'block', width: `${((x.actual / maxCat) * 100).toFixed(1)}%`, height: 8, borderRadius: 4, background: 'var(--ink)' }} />
                            {x.previo > 0 && (
                              <span style={{ position: 'absolute', left: `${((x.previo / maxCat) * 100).toFixed(1)}%`, top: -4, width: 3, height: 16, marginLeft: -1.5, borderRadius: 2, background: 'var(--muted)' }} />
                            )}
                          </span>
                        </span>
                        <span className="r-right">
                          <span className="r-amt">{fmt(x.actual)}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', color: dif > 0 ? 'var(--owe)' : dif < 0 ? 'var(--pos)' : 'var(--muted)' }}>
                            {x.previo === 0 ? 'nuevo' : dif === 0 ? 'igual' : `${dif > 0 ? '▲' : '▼'} ${fmt(Math.abs(dif))}`}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {conIngresos.length > 0 && (
            <>
              <h2 className="t-section">lo que te quedó.</h2>
              <div className="list">
                <div className="inner">
                  {[...serie].reverse().filter((m) => m.ingresos > 0 || m.gasto > 0).map((m) => {
                    const q = m.ingresos - m.gasto;
                    return (
                      <div key={m.mes} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '12px 14px', borderTop: '1px solid var(--line)' }}>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 16, fontWeight: 700 }}>
                            {nombreMes(m.mes)}
                            {m.enCurso ? ' (va en curso)' : ''}
                          </span>
                          <span className="t-meta">
                            entró {fmt(m.ingresos)} · gastaste {fmt(m.gasto)}
                          </span>
                        </span>
                        <span style={{ fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap', color: q >= 0 ? 'var(--pos)' : 'var(--danger)' }}>
                          {q >= 0 ? '+' : '−'}
                          {fmt(Math.abs(q))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Barras del gasto mensual. Tocar una elige el mes (y muestra su monto). El mes en curso va rayado: no ha terminado. */
function Barras({ serie, elegido, onElegir }: { serie: MesTendencia[]; elegido: string; onElegir: (m: string) => void }) {
  const max = Math.max(1, ...serie.map((m) => m.gasto));
  const ALTO = 150;
  return (
    <div role="group" aria-label="Gasto real por mes" style={{ marginTop: 22, padding: '0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, borderBottom: '2px solid var(--ink)' }}>
        {serie.map((m) => {
          const sel = m.mes === elegido;
          const h = m.gasto > 0 ? Math.max(4, Math.round((m.gasto / max) * ALTO)) : 0;
          return (
            <button
              key={m.mes}
              onClick={() => onElegir(m.mes)}
              aria-pressed={sel}
              aria-label={`${nombreMes(m.mes)}: ${fmt(m.gasto)}${m.enCurso ? ' (va en curso)' : ''}`}
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: ALTO + 26, gap: 6 }}
            >
              <span style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', visibility: sel ? 'visible' : 'hidden', letterSpacing: -0.2 }}>{fmt(m.gasto)}</span>
              <span
                style={{
                  width: '100%',
                  maxWidth: 44,
                  height: h,
                  borderRadius: '4px 4px 0 0',
                  background: sel ? 'var(--ink)' : 'var(--track)',
                  backgroundImage: m.enCurso ? 'repeating-linear-gradient(135deg, transparent 0 5px, rgba(127,127,127,.35) 5px 7px)' : undefined,
                }}
              />
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, paddingTop: 6 }} aria-hidden="true">
        {serie.map((m) => (
          <span key={m.mes} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: m.mes === elegido ? 800 : 600, color: m.mes === elegido ? 'var(--ink)' : 'var(--muted)' }}>
            {MES_CORTO[Number(m.mes.slice(5, 7)) - 1]}
          </span>
        ))}
      </div>
    </div>
  );
}
