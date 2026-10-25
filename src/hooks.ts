// Consultas en vivo a la base de datos (se actualizan solas cuando cambian los datos).
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { AJUSTES_DEFAULT, db, type Ajustes, type Cobro, type Movimiento, type Persona } from './db';
import { byDate, cargado, pctPagado, saldo } from './lib/balance';
import { firstName, initials } from './lib/format';

export interface PersonView {
  p: Persona;
  first: string;
  ini: string;
  movs: Movimiento[];
  cobros: Cobro[];
  saldo: number;
  cargado: number;
  pct: number;
  ultimoCobro?: Cobro;
}

export function buildViews(personas: Persona[], movs: Movimiento[], cobros: Cobro[]): PersonView[] {
  return personas
    .slice()
    .sort((a, b) => a.creado.localeCompare(b.creado))
    .map((p) => {
      const m = movs.filter((x) => x.personaId === p.id).sort(byDate);
      const c = cobros.filter((x) => x.personaId === p.id).sort((a, b) => a.fecha.localeCompare(b.fecha));
      return {
        p,
        first: firstName(p.nombre),
        ini: initials(p.nombre),
        movs: m,
        cobros: c,
        saldo: saldo(m),
        cargado: cargado(m),
        pct: pctPagado(m),
        ultimoCobro: c[c.length - 1],
      };
    });
}

/** Todas las personas con sus movimientos y cobros. `undefined` mientras carga. */
export function usePeople(): PersonView[] | undefined {
  return useLiveQuery(async () => {
    const [ps, ms, cs] = await Promise.all([db.personas.toArray(), db.movimientos.toArray(), db.cobros.toArray()]);
    return buildViews(ps, ms, cs);
  });
}

export function useAjustes(): Ajustes {
  const a = useLiveQuery(() => db.ajustes.get('main'));
  return { ...AJUSTES_DEFAULT, ...a };
}

/** Aplica el tema (claro / oscuro / sistema) al documento. */
export function useThemeSync(tema: Ajustes['tema']) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = tema === 'oscuro' || (tema === 'sistema' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0B110D' : '#F3F0E6'));
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [tema]);
}

export const isDark = () => document.documentElement.dataset.theme === 'dark';
