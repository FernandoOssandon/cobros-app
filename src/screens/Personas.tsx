import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDatos } from '../hooks';
import { fmt, shortDate } from '../lib/format';
import { useNav } from '../nav';
import { Icon } from '../ui/icons';
import { Avatar, EmptyState } from '../ui/kit';
import { NuevaPersonaSheet } from '../ui/sheets';

type Tab = 'in' | 'out' | 'ok';

export default function Personas() {
  const d = useDatos();
  const { push } = useNav();
  const [params, setParams] = useSearchParams();
  const [nueva, setNueva] = useState(false);
  if (!d) return <div className="scroll" />;

  const activas = d.personas.filter((v) => !v.p.archivada);
  const archivadas = d.personas.length - activas.length;
  const inP = activas.filter((v) => v.saldo > 0).sort((a, b) => b.saldo - a.saldo);
  const outP = activas.filter((v) => v.saldo < 0).sort((a, b) => a.saldo - b.saldo);
  const okP = activas.filter((v) => v.saldo === 0);
  const pedida = params.get('tab') as Tab | null;
  const tab: Tab = pedida ?? (inP.length ? 'in' : outP.length ? 'out' : 'ok');
  const lista = tab === 'in' ? inP : tab === 'out' ? outP : okP;
  const total = (tab === 'in' ? inP : outP).reduce((s, v) => s + Math.abs(v.saldo), 0);
  const tabs: [Tab, string, number][] = [
    ['in', 'Te deben', inP.length],
    ['out', 'Debes', outP.length],
    ['ok', 'Al día', okP.length],
  ];

  return (
    <>
      <div className="row-between" style={{ flex: 'none', padding: '6px 20px 12px' }}>
        <h1 className="t-tab">personas.</h1>
        <button className="btn-o add" onClick={() => setNueva(true)}>
          <Icon name="plus" size={16} w={3} />
          Persona
        </button>
      </div>
      {activas.length > 0 ? (
        <>
          <div role="tablist" style={{ flex: 'none', display: 'flex', gap: 8, padding: '0 16px 4px' }}>
            {tabs.map(([k, l, n]) => (
              <button key={k} role="tab" className="pill" style={{ padding: '0 14px', gap: 7 }} aria-selected={tab === k} onClick={() => setParams({ tab: k }, { replace: true })}>
                {l}
                <span className="n">{n}</span>
              </button>
            ))}
          </div>
          <div className="scroll" style={{ padding: '0 16px 96px' }}>
            {tab !== 'ok' && lista.length > 0 && (
              <div style={{ padding: '18px 4px 18px' }}>
                <div className="t-hero" style={{ color: tab === 'in' ? 'var(--pos)' : 'var(--owe)' }}>{fmt(total)}</div>
                <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--muted)', marginTop: 6 }}>{tab === 'in' ? 'te deben en total' : 'debes en total'}</div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 }}>
              {lista.map((v) => {
                const col = v.saldo > 0 ? 'var(--pos)' : v.saldo < 0 ? 'var(--owe)' : 'var(--muted)';
                const linea = v.saldo > 0 ? 'te debe' : v.saldo < 0 ? 'le debes' : `a mano${v.ultimoMov ? ' · último mov. ' + shortDate(v.ultimoMov) : ''}`;
                return (
                  <button
                    key={v.p.id}
                    className="card"
                    style={{ display: 'grid', gridTemplateColumns: '42px minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}
                    onClick={() => push(`/persona/${v.p.id}`)}
                  >
                    <Avatar color={v.color} text={v.ini} />
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.p.nombre}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: col }}>{linea}</span>
                    </span>
                    <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.6, color: col }}>{fmt(Math.abs(v.saldo))}</span>
                  </button>
                );
              })}
            </div>
            {lista.length === 0 && (
              <div className="t-note" style={{ padding: '24px 4px' }}>
                {{ in: 'Nadie te debe. Disfruta el momento.', out: 'No le debes a nadie. Así da gusto.', ok: 'Todavía nadie está a mano.' }[tab]}
              </div>
            )}
            {archivadas > 0 && (
              <button className="btn-text" style={{ marginTop: 14, textDecoration: 'underline', textUnderlineOffset: 3 }} onClick={() => push('/archivadas')}>
                Ver archivadas ({archivadas})
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="scroll" style={{ padding: '0 20px 96px' }}>
          <EmptyState
            title={<>Sin<br />cuentas.</>}
            body="Agrega a la gente con la que compartes gastos: el depto, la pega, el grupo del asado. Por ahora nadie te debe nada, y tú tampoco."
          />
          {archivadas > 0 && (
            <button className="btn-text" style={{ marginTop: 14, textDecoration: 'underline', textUnderlineOffset: 3 }} onClick={() => push('/archivadas')}>
              Ver archivadas ({archivadas})
            </button>
          )}
        </div>
      )}
      {nueva && <NuevaPersonaSheet onClose={() => setNueva(false)} onCreada={() => setParams({ tab: 'ok' }, { replace: true })} />}
    </>
  );
}
