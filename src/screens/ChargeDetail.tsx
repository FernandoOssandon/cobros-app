import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { borrarGasto, db, restaurar } from '../db';
import { usePeople } from '../hooks';
import { estadosCargos } from '../lib/balance';
import { fmt, shortDate } from '../lib/format';
import { Avatar, BackButton } from '../ui/kit';
import { useToast } from '../ui/toast';

const MODO = { equal: 'Partes iguales', exact: 'Montos exactos', shares: 'Por partes', solo: 'Solo tuyo' };

export default function ChargeDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const people = usePeople();
  const cargo = useLiveQuery(() => db.gastos.get(id), [id], null);

  const back = () => (window.history.length > 1 ? nav(-1) : nav('/'));

  if (cargo === null || !people) return <div className="screen" />;
  if (!cargo) {
    return (
      <div className="screen" style={{ padding: 20, gap: 16 }}>
        <div><BackButton onClick={() => nav('/')} /></div>
        <div className="empty-note">Este cargo ya no existe.</div>
      </div>
    );
  }

  const rows = cargo.participantes
    .map((pid) => {
      const v = people.find((x) => x.p.id === pid);
      const m = v?.movs.find((x) => x.gastoId === cargo.id);
      return v && m ? { v, m, e: estadosCargos(v.movs).get(m.id) } : null;
    })
    .filter((r) => r !== null);

  const remove = async () => {
    const snap = await borrarGasto(cargo.id);
    toast('Cargo borrado', { label: 'Deshacer', run: () => restaurar(snap) });
    back();
  };

  return (
    <div className="screen">
      <div style={{ flex: 'none', padding: '4px 16px' }}>
        <BackButton onClick={back} />
      </div>
      <div className="scroll" style={{ padding: '16px 20px 16px' }}>
        <h1 className="title" style={{ margin: 0 }}>{cargo.descripcion}</h1>
        <div className="hero-64" style={{ marginTop: 14 }}>{fmt(cargo.total)}</div>
        <div className="muted" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>
          {shortDate(cargo.fecha)} · {MODO[cargo.modo]}
        </div>

        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(({ v, m, e }) => (
            <button key={v.p.id} className="card" onClick={() => nav(`/persona/${v.p.id}`)} style={{ padding: '12px 16px' }}>
              <span className="card-row">
                <Avatar color={v.p.color} text={v.ini} />
                <span style={{ minWidth: 0 }}>
                  <span className="card-name">{v.p.nombre}</span>
                  <span className="card-sub">
                    {e?.estado === 'pagado' ? 'pagado' : e?.estado === 'parcial' ? `quedan ${fmt(e.pendiente)}` : 'pendiente'}
                  </span>
                </span>
                <span className="card-amt">{fmt(m.monto)}</span>
              </span>
            </button>
          ))}
          {cargo.yoIncluido && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px', fontSize: 16, fontWeight: 600 }} className="muted">
              <span>Tu parte</span>
              <span>{fmt(cargo.miParte)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="foot" style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 8 }}>
        <button className="btn-line" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={remove}>
          Borrar
        </button>
        {cargo.modo !== 'solo' && cargo.pagador === 'yo' && (
          <button className="btn-ink" onClick={() => nav(`/cargo/${cargo.id}/editar`, { replace: true })}>
            Editar cargo
          </button>
        )}
      </div>
    </div>
  );
}
