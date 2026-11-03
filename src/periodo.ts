// Período elegido para mirar los gastos (el mes o el de una tarjeta). Es el mismo en Resumen y en Gastos:
// se guarda en memoria mientras la app está abierta y al volver a abrirla parte en el mes en curso.
import { useCallback, useSyncExternalStore } from 'react';
import type { Medio } from './db';
import { todayISO } from './lib/format';
import { clavePeriodo, esPeriodoActual, leerClavePeriodo, moverPeriodo, periodoEn, periodoMes, type Periodo } from './lib/periodos';

let clave: string | null = null;
const subs = new Set<() => void>();
const avisar = () => subs.forEach((f) => f());
const suscribir = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export function elegirClavePeriodo(c: string | null) {
  clave = c;
  avisar();
}

/** El período actual de una tarjeta (o el mes en curso con `null`). */
export const elegirTarjeta = (m: Medio | null) => elegirClavePeriodo(m ? clavePeriodo(periodoEn(todayISO(), m)) : null);

export function usePeriodo(medios: Medio[]) {
  const c = useSyncExternalStore(suscribir, () => clave);
  const hoy = todayISO();
  const periodo: Periodo = leerClavePeriodo(c, medios, hoy);
  const actual = esPeriodoActual(periodo, hoy);
  const mover = useCallback(
    (n: number) => {
      const p = leerClavePeriodo(clave, medios, todayISO());
      if (n > 0 && esPeriodoActual(p)) return;
      const q = moverPeriodo(p, n, medios);
      elegirClavePeriodo(q.tipo === 'mes' && q.mes === todayISO().slice(0, 7) ? null : clavePeriodo(q));
    },
    [medios],
  );
  return { periodo, actual, mover, elegir: elegirClavePeriodo, mesActual: periodoMes(hoy.slice(0, 7)) };
}
