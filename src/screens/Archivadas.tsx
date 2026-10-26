import { useDatos } from '../hooks';
import { fmt } from '../lib/format';
import { useNav } from '../nav';
import { Avatar, BackButton } from '../ui/kit';

export default function Archivadas() {
  const d = useDatos();
  const { push, back, backLabel } = useNav();
  const lista = d?.personas.filter((v) => v.p.archivada) ?? [];
  return (
    <div className="scroll" style={{ padding: '4px 16px var(--safe-bottom)' }}>
      <BackButton onClick={() => back('/personas')} label={backLabel} />
      <h1 className="t-screen" style={{ margin: '18px 4px 6px' }}>archivadas.</h1>
      <p className="t-meta" style={{ fontSize: 15, margin: '0 4px 16px' }}>
        Siguen con todo su historial. Para traer a alguien de vuelta, ábrela, toca Editar y desactiva "Archivar".
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lista.map((v) => (
          <button key={v.p.id} className="card" style={{ display: 'grid', gridTemplateColumns: '42px minmax(0,1fr) auto', gap: 12, alignItems: 'center' }} onClick={() => push(`/persona/${v.p.id}`)}>
            <Avatar color={v.color} text={v.ini} />
            <span style={{ fontSize: 19, fontWeight: 700 }}>{v.p.nombre}</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: v.saldo > 0 ? 'var(--pos)' : v.saldo < 0 ? 'var(--owe)' : 'var(--muted)' }}>{v.saldo ? fmt(Math.abs(v.saldo)) : 'a mano'}</span>
          </button>
        ))}
      </div>
      {lista.length === 0 && <div className="t-note" style={{ padding: '10px 4px' }}>No hay nadie archivado.</div>}
    </div>
  );
}
