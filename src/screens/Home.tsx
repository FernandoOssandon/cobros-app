import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePeople, type PersonView } from '../hooks';
import { fmt, relativeDays } from '../lib/format';
import { Avatar, IconPlus } from '../ui/kit';

const subLabel = (v: PersonView) => (v.ultimoCobro ? `Cobrado ${relativeDays(v.ultimoCobro.fecha)}` : '');

function OwingCard({ v }: { v: PersonView }) {
  const nav = useNavigate();
  const sub = subLabel(v);
  return (
    <button className="card" onClick={() => nav(`/persona/${v.p.id}`)}>
      <span className="card-row">
        <Avatar color={v.p.color} text={v.ini} />
        <span style={{ minWidth: 0 }}>
          <span className="card-name">{v.p.nombre}</span>
          {sub && <span className="card-sub">{sub}</span>}
        </span>
        <span className="card-amt">{fmt(v.saldo)}</span>
      </span>
      <span className="progress">
        <span className="bar">
          <span style={{ width: v.pct + '%' }} />
        </span>
        <span className="meta">{v.pct ? `pagó ${v.pct}%` : 'sin abonos'}</span>
      </span>
    </button>
  );
}

export function SettledCard({ v }: { v: PersonView }) {
  const nav = useNavigate();
  return (
    <button className="card" onClick={() => nav(`/persona/${v.p.id}`)}>
      <span className="card-row">
        <Avatar color={v.p.color} text={v.ini} />
        <span className="card-name">{v.p.nombre}</span>
        {v.saldo > 0 ? <span className="card-amt">{fmt(v.saldo)}</span> : <span className="chip-lime">a mano</span>}
      </span>
    </button>
  );
}

export default function Home() {
  const nav = useNavigate();
  const all = usePeople();
  const [tab, setTab] = useState<'pend' | 'ok'>('pend');
  if (!all) return <div className="screen" />;

  const people = all.filter((v) => !v.p.archivada);
  const archived = all.length - people.length;
  const owing = people.filter((v) => v.saldo > 0).sort((a, b) => b.saldo - a.saldo);
  const settled = people.filter((v) => v.saldo <= 0);
  const total = owing.reduce((s, v) => s + v.saldo, 0);
  const isEmpty = all.length === 0;

  return (
    <div className="screen">
      <div className="head">
        <h1 className="brand" style={{ margin: 0 }}>me debes.</h1>
        <button className="btn-outline" onClick={() => nav('/ajustes')}>
          Ajustes
        </button>
      </div>

      {isEmpty ? (
        <div className="scroll" style={{ padding: '90px 24px 0' }}>
          <div className="display">
            Cero
            <br />
            deudas.
          </div>
          <p className="muted" style={{ fontSize: 19, fontWeight: 500, marginTop: 16, lineHeight: 1.35, textWrap: 'pretty' }}>
            Nadie te debe ni un peso. Por ahora. Anota el próximo carrete, la cuenta del depto o ese Uber compartido.
          </p>
        </div>
      ) : (
        <>
          <div className="tabs" role="tablist">
            <button className="pill" role="tab" aria-selected={tab === 'pend'} onClick={() => setTab('pend')}>
              Pendientes<span className="count">{owing.length}</span>
            </button>
            <button className="pill" role="tab" aria-selected={tab === 'ok'} onClick={() => setTab('ok')}>
              Al día<span className="count">{settled.length}</span>
            </button>
          </div>
          <div className="scroll" style={{ padding: '0 16px 20px' }}>
            {tab === 'pend' ? (
              <>
                <div style={{ padding: '18px 4px 20px' }}>
                  <div className="hero">{fmt(total)}</div>
                  <div className="muted" style={{ fontSize: 17, fontWeight: 500, marginTop: 6 }}>
                    te deben en total
                  </div>
                </div>
                <div className="cards">
                  {owing.map((v) => (
                    <OwingCard key={v.p.id} v={v} />
                  ))}
                </div>
                {owing.length === 0 && <div className="empty-note" style={{ padding: '10px 4px' }}>Nadie te debe. Disfruta el momento.</div>}
              </>
            ) : (
              <>
                <div className="cards" style={{ paddingTop: 14 }}>
                  {settled.map((v) => (
                    <SettledCard key={v.p.id} v={v} />
                  ))}
                </div>
                {settled.length === 0 && <div className="empty-note" style={{ padding: '20px 4px' }}>Todavía nadie salda sus cuentas.</div>}
                {archived > 0 && (
                  <div style={{ padding: '18px 4px' }}>
                    <button className="btn-text" onClick={() => nav('/archivadas')}>
                      Ver archivadas ({archived})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      <div className="foot">
        <button className="cta big" onClick={() => nav('/cargo/nuevo')}>
          <IconPlus />
          Nuevo cargo
        </button>
      </div>
    </div>
  );
}
