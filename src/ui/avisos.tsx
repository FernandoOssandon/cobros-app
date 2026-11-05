// Avisos de presupuesto: al cruzar el 80 % y al pasar el 100 %, una vez por período (si el presupuesto lo tiene encendido).
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db';
import { imputar } from '../lib/cuotas';
import { fmt, todayISO } from '../lib/format';
import { avancePresupuesto } from '../lib/presupuestos';
import { nombrePresupuesto } from './presupuesto';
import { useToast } from './toast';

export function AvisosPresupuesto() {
  const toast = useToast();
  const nav = useNavigate();
  const datos = useLiveQuery(async () => ({ ps: await db.presupuestos.toArray(), gs: imputar(await db.gastos.toArray()), cats: await db.categorias.toArray() }));
  useEffect(() => {
    if (!datos?.ps.length) return;
    // Un respiro para no pisar el toast de "Gasto guardado" ni los de al abrir la app.
    const t = window.setTimeout(async () => {
      const hoy = todayISO();
      for (const p of datos.ps) {
        if (p.archivado || p.avisar === false || p.monto <= 0) continue;
        const a = avancePresupuesto(p, datos.gs, hoy);
        const nivel = a.estado === 'excedido' ? 100 : a.pct >= 0.8 ? 80 : 0;
        if (!nivel) continue;
        const [desde, previo] = (p.avisado ?? '').split(':');
        if (desde === a.desde && Number(previo) >= nivel) continue;
        await db.presupuestos.update(p.id, { avisado: `${a.desde}:${nivel}` });
        const nombre = nombrePresupuesto(p, datos.cats.find((c) => c.id === p.categoriaId));
        toast(nivel === 100 ? `Te pasaste en ${nombre} · ${fmt(-a.restante)} de más` : `${nombre} va en el ${Math.round(a.pct * 100)} % · te quedan ${fmt(a.restante)}`, {
          label: 'Ver',
          run: () => nav('/presupuestos', { state: { from: 'Volver' } }),
        });
        return; // uno a la vez; el siguiente sale cuando cambie la base
      }
    }, 2600);
    return () => window.clearTimeout(t);
  }, [datos, toast, nav]);
  return null;
}
