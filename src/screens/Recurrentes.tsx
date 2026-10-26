import { useState } from 'react';
import type { Recurrente } from '../db';
import { useDatos } from '../hooks';
import { fmt, juntarY, shortDate, todayISO } from '../lib/format';
import { describirFrecuencia, montoMensual, proxima } from '../lib/recurrence';
import { useNav } from '../nav';
import { anotarAtrasados, mesNombre, repartoRecurrente } from '../recurrentes';
import { Icon } from '../ui/icons';
import { Avatar, CatIcon, EmptyState } from '../ui/kit';
import { PorConfirmarSheet } from '../ui/sheets';
import { useToast } from '../ui/toast';

const SECCIONES: [Recurrente['tipo'], string][] = [
  ['mio', 'gastos fijos tuyos.'],
  ['compartido', 'compartidos.'],
  ['cobro', 'cobros a personas.'],
];

export default function Recurrentes() {
  const d = useDatos();
  const { push } = useNav();
  const toast = useToast();
  const [confirmando, setConfirmando] = useState<string | null>(null);
  if (!d) return <div className="scroll" />;

  const hoy = todayISO();
  const recs = d.recurrentes.filter((r) => r.activo).sort((a, b) => a.creado.localeCompare(b.creado));
  const fijosSalen = recs.filter((r) => r.tipo !== 'cobro' && r.montoTipo === 'fijo').reduce((s, r) => s + montoMensual(r.monto, r.frecuencia), 0);
  const variables = recs.filter((r) => r.tipo !== 'cobro' && r.montoTipo === 'variable').map((r) => r.nombre);
  const entran = recs.filter((r) => r.tipo === 'cobro' && r.montoTipo === 'fijo').reduce((s, r) => s + montoMensual(r.monto, r.frecuencia), 0);
  const sub = [
    variables.length ? `más ${juntarY(variables)}, que ${variables.length === 1 ? 'es variable' : 'son variables'}` : '',
    entran ? `te entran ${fmt(entran)} en cobros` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const atrasados = d.pendientes.filter((p) => p.tipo === 'anotar');
  const recAtr = [...new Set(atrasados.map((p) => p.recurrenteId))];
  const unRec = recAtr.length === 1 ? d.recurrentes.find((r) => r.id === recAtr[0]) : undefined;
  const mesesAtr = atrasados.map((p) => mesNombre(p.fecha));
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const confirmP = confirmando ? d.pendientes.find((p) => p.id === confirmando) : undefined;
  const confirmR = confirmP ? d.recurrentes.find((r) => r.id === confirmP.recurrenteId) : undefined;

  return (
    <>
      <div className="row-between" style={{ flex: 'none', padding: '6px 20px 4px' }}>
        <h1 className="t-tab">recurrentes.</h1>
        <button className="btn-o add" onClick={() => push('/recurrente/nuevo')}>
          <Icon name="plus" size={16} w={3} />
          Nuevo
        </button>
      </div>
      <div className="scroll" style={{ padding: '0 16px 96px' }}>
        {recs.length > 0 ? (
          <>
            <div style={{ padding: '18px 4px 0' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)' }}>Comprometido al mes</div>
              <div className="t-hero" style={{ marginTop: 6 }}>{fmt(fijosSalen)}</div>
              {sub && <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted)', marginTop: 10, lineHeight: 1.35 }}>{sub}</div>}
            </div>

            {atrasados.length > 0 && (
              <div className="banner-line" style={{ marginTop: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.15 }}>
                  {unRec ? `Tienes ${atrasados.length} ${atrasados.length === 1 ? 'mes' : 'meses'} de ${unRec.nombre} por anotar` : `Tienes ${atrasados.length} recurrentes por anotar`}
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>
                  {unRec ? `${cap(juntarY(mesesAtr))}, ${fmt(unRec.monto)} cada uno.` : 'Son fijos de meses en que no abriste la app.'}
                </div>
                <div>
                  <button
                    className="pill"
                    style={{ background: 'var(--ink)', color: 'var(--bg)', border: 'none', fontWeight: 800 }}
                    onClick={async () => {
                      const { n, total } = await anotarAtrasados();
                      toast(`Anotamos ${n} ${n === 1 ? 'recurrente' : 'recurrentes'} · ${fmt(total)}`);
                    }}
                  >
                    Anotar los {atrasados.length}
                  </button>
                </div>
              </div>
            )}

            {SECCIONES.map(([tipo, titulo]) => {
              const items = recs.filter((r) => r.tipo === tipo);
              if (!items.length) return null;
              return (
                <div key={tipo}>
                  <h2 className="t-section" style={{ paddingTop: 26 }}>{titulo}</h2>
                  <div className="list">
                    <div className="inner">
                      {items.map((r) => {
                        const cat = r.categoriaId ? d.categoria.get(r.categoriaId) : undefined;
                        const per = r.personaId ? d.persona.get(r.personaId) : undefined;
                        const freq = describirFrecuencia(r.frecuencia, r.inicio);
                        const medio = r.medioId ? d.medio.get(r.medioId)?.nombre : undefined;
                        const subR =
                          tipo === 'compartido'
                            ? `Con ${juntarY((r.reparto?.participantes ?? []).map((id) => d.persona.get(id)?.first ?? ''))}${r.montoTipo === 'fijo' ? ` · tu parte ${fmt(repartoRecurrente(r, r.monto).mine)}` : ''}`
                            : tipo === 'cobro'
                              ? `${freq} · te paga ${per?.first ?? ''}`
                              : `${freq}${medio ? ' · ' + medio : ''}`;
                        const nAtr = atrasados.filter((p) => p.recurrenteId === r.id).length;
                        const conf = d.pendientes.find((p) => p.recurrenteId === r.id && p.tipo === 'confirmar');
                        const sig = proxima(r.frecuencia, r.inicio, [r.generadoHasta ?? '', hoy].sort()[1], r.fin);
                        const [next, nextColor] = nAtr
                          ? [`${nAtr} por anotar`, 'var(--danger)']
                          : conf
                            ? ['por confirmar', 'var(--owe)']
                            : sig
                              ? [`próx. ${shortDate(sig)}`, 'var(--muted)']
                              : ['terminado', 'var(--muted)'];
                        return (
                          <button key={r.id} className="list-row" onClick={() => (conf ? setConfirmando(conf.id) : push(`/recurrente/${r.id}`))}>
                            {tipo === 'cobro' && per ? <Avatar color={per.color} text={per.ini} size={40} fs={14} /> : <CatIcon cat={cat} />}
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                              <span style={{ fontSize: 16, fontWeight: 700 }}>{r.nombre}</span>
                              <span className="t-meta" style={{ lineHeight: 1.3 }}>{subR}</span>
                            </span>
                            <span className="r-right">
                              {r.montoTipo === 'variable' ? (
                                <span className="badge" style={{ height: 22, padding: '0 9px', borderRadius: 11, fontSize: 12, color: 'var(--ink)' }}>
                                  variable
                                </span>
                              ) : (
                                <span className="r-amt" style={{ color: tipo === 'cobro' ? 'var(--pos)' : 'var(--ink)' }}>
                                  {tipo === 'cobro' ? '+' : ''}
                                  {fmt(r.monto)}
                                </span>
                              )}
                              <span style={{ fontSize: 12, fontWeight: 700, color: nextColor, whiteSpace: 'nowrap' }}>{next}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <EmptyState
            title={<>Nada<br />fijo.</>}
            body="Anota el arriendo, las suscripciones o esa cuota que te pagan. Los fijos se anotan solos; los variables te los pregunto."
          />
        )}
      </div>
      {confirmP && confirmR && <PorConfirmarSheet p={confirmP} r={confirmR} onClose={() => setConfirmando(null)} />}
    </>
  );
}
