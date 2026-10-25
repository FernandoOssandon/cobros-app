import { useNavigate } from 'react-router-dom';
import { usePeople } from '../hooks';
import { SettledCard } from './Home';
import { BackButton } from '../ui/kit';

export default function Archived() {
  const nav = useNavigate();
  const people = usePeople()?.filter((v) => v.p.archivada) ?? [];
  return (
    <div className="screen">
      <div className="scroll" style={{ padding: '2px 16px var(--safe-bottom)' }}>
        <BackButton onClick={() => nav('/')} />
        <h1 className="title-40" style={{ margin: '18px 4px 6px' }}>archivadas.</h1>
        <p className="muted" style={{ fontSize: 16, fontWeight: 500, margin: '0 4px 16px' }}>
          Siguen con todo su historial. Para traer a alguien de vuelta, ábrela y desactiva "Archivar".
        </p>
        <div className="cards">
          {people.map((v) => (
            <SettledCard key={v.p.id} v={v} />
          ))}
        </div>
        {people.length === 0 && <div className="empty-note" style={{ padding: '10px 4px' }}>No hay nadie archivado.</div>}
      </div>
    </div>
  );
}
