// Recordatorio de respaldo en Inicio: aparece si pasan 7 días o más sin respaldar.
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { diasSinRespaldo } from '../backup';
import { db } from '../db';
import { useAjustes } from '../hooks';
import { useRespaldar } from '../useRespaldo';

export const DIAS_RECORDATORIO = 7;

export default function BackupBanner() {
  const aj = useAjustes();
  const respaldar = useRespaldar();
  const [oculto, setOculto] = useState(false);
  const primer = useLiveQuery(async () => {
    const ps = await db.personas.toArray();
    return ps.length ? ps.map((p) => p.creado).sort()[0] : '';
  });
  if (oculto || !aj.recordarRespaldo || !primer) return null;
  const dias = diasSinRespaldo(aj, primer);
  if (dias === null || dias < DIAS_RECORDATORIO) return null;

  return (
    <div className="notice" role="status">
      <div style={{ minWidth: 0 }}>
        <div className="notice-title">{aj.ultimoRespaldo ? `Hace ${dias} días que no respaldas` : 'Todavía no respaldas tus datos'}</div>
        <div className="notice-body">Todo vive solo en este teléfono.</div>
      </div>
      <button className="notice-go" onClick={respaldar}>
        Respaldar
      </button>
      <button className="notice-x" onClick={() => setOculto(true)} aria-label="Ocultar por ahora">
        ×
      </button>
    </div>
  );
}
