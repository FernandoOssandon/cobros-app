// Metas de ahorro: cuánto llevas, cuánto falta y cuánto apartar al mes para llegar a la fecha. Lógica pura.
import type { Cuenta, Meta, MovAhorro } from '../db';
import { daysBetween, todayISO } from './format';
import { saldoCuenta } from './ahorro';
import { aPesos, type Indicadores } from './monedas';

export interface AvanceMeta {
  meta: Meta;
  /** Objetivo en pesos (si es en UF o dólares, con el valor de hoy). */
  objetivo: number;
  /** Lo que llevas: el saldo de la cuenta ligada o la suma de los aportes. */
  llevas: number;
  falta: number;
  /** 0 a 1 (tope 1). */
  pct: number;
  lograda: boolean;
  /** Meses que quedan hasta la fecha (redondeado hacia arriba; 0 si ya pasó o no tiene fecha). */
  meses: number;
  /** Cuánto apartar al mes para llegar a la fecha. */
  porMes: number;
  /** Días para la fecha (negativo si ya pasó). */
  dias?: number;
  cuenta?: Cuenta;
}

export function objetivoMeta(m: Meta, ind?: Indicadores): number {
  const v = m.moneda ? ind?.[m.moneda]?.valor : undefined;
  return m.moneda && m.montoMoneda && v ? aPesos(m.montoMoneda, v) : m.monto;
}

export function avanceMeta(m: Meta, cuentas: Cuenta[], movAhorro: MovAhorro[], ind?: Indicadores, hoy = todayISO()): AvanceMeta {
  const objetivo = objetivoMeta(m, ind);
  const cuenta = m.cuentaId ? cuentas.find((c) => c.id === m.cuentaId) : undefined;
  const llevas = cuenta
    ? Math.max(0, saldoCuenta(cuenta, movAhorro.filter((x) => x.cuentaId === cuenta.id), hoy))
    : Math.max(0, m.aportes.reduce((s, a) => s + a.monto, 0));
  const falta = Math.max(0, objetivo - llevas);
  const dias = m.fecha ? daysBetween(hoy, m.fecha) : undefined;
  const meses = dias !== undefined && dias > 0 ? Math.max(1, Math.ceil(dias / 30.44)) : 0;
  return {
    meta: m,
    objetivo,
    llevas,
    falta,
    pct: objetivo > 0 ? Math.min(1, llevas / objetivo) : 0,
    lograda: objetivo > 0 && llevas >= objetivo,
    meses,
    porMes: meses ? Math.ceil(falta / meses) : 0,
    dias,
    cuenta,
  };
}
