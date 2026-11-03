// Períodos para mirar los gastos: el mes calendario o el período de facturación de cada tarjeta de crédito
// (ej. Falabella del 14 al 13). Lógica pura.
import type { Gasto, Medio, Movimiento } from '../db';
import { daysBetween, mesLargo, shortDate, sumarMes, todayISO } from './format';
import { sumarDias } from './recurrence';
import { periodoFacturacion, resumenDe, type Resumen } from './resumen';

export interface PeriodoMes {
  tipo: 'mes';
  /** YYYY-MM */
  mes: string;
  desde: string;
  hasta: string;
}

export interface PeriodoTarjeta {
  tipo: 'tarjeta';
  medioId: string;
  /** Mes (YYYY-MM) en que cierra el período. */
  cierreMes: string;
  desde: string;
  hasta: string;
}

export type Periodo = PeriodoMes | PeriodoTarjeta;

const ultimoDia = (mes: string) => sumarDias(`${sumarMes(mes, 1)}-01`, -1);

export function periodoMes(mes: string): PeriodoMes {
  return { tipo: 'mes', mes, desde: `${mes}-01`, hasta: ultimoDia(mes) };
}

/** ¿La tarjeta tiene período propio? Solo las de crédito con día de facturación. */
export const tienePeriodo = (m: Medio) => m.tipo === 'credito' && !!m.diaFacturacion && !m.archivado;

/** Período de la tarjeta que cierra en `cierreMes`. */
export function periodoTarjeta(m: Medio, cierreMes: string): PeriodoTarjeta {
  const { desde, hasta } = periodoFacturacion(cierreMes, m.diaFacturacion ?? 31);
  return { tipo: 'tarjeta', medioId: m.id, cierreMes, desde, hasta };
}

/** Período (de la tarjeta, o el mes) que contiene una fecha. */
export function periodoEn(fecha: string, m?: Medio): Periodo {
  if (!m || !tienePeriodo(m)) return periodoMes(fecha.slice(0, 7));
  const mes = fecha.slice(0, 7);
  const actual = periodoTarjeta(m, mes);
  return fecha <= actual.hasta ? actual : periodoTarjeta(m, sumarMes(mes, 1));
}

/** El período anterior (n = −1) o siguiente (n = 1). */
export function moverPeriodo(p: Periodo, n: number, medios: Medio[]): Periodo {
  if (p.tipo === 'mes') return periodoMes(sumarMes(p.mes, n));
  const m = medios.find((x) => x.id === p.medioId);
  return m ? periodoTarjeta(m, sumarMes(p.cierreMes, n)) : periodoMes(sumarMes(p.cierreMes, n));
}

/** Nombre corto de la tarjeta para la píldora: el que se haya puesto, o el nombre sin "CMR", "Tarjeta"… ("CMR Falabella" → "Falabella"). */
export function nombreCorto(m: Pick<Medio, 'nombre' | 'nombreCorto'>): string {
  if (m.nombreCorto?.trim()) return m.nombreCorto.trim();
  const sin = m.nombre.replace(/^(cmr|tarjeta( de cr[eé]dito)?|tc)\s+/i, '').trim();
  return sin || m.nombre;
}

/** "14 nov – 13 dic" */
export const rangoPeriodo = (p: Periodo, hoy = new Date()) => `${shortDate(p.desde, hoy)} – ${shortDate(p.hasta, hoy)}`;

/** "noviembre 2026" o "Falabella · 14 nov – 13 dic". */
export function etiquetaPeriodo(p: Periodo, medios: Medio[], hoy = new Date()): string {
  if (p.tipo === 'mes') return mesLargo(p.mes);
  const m = medios.find((x) => x.id === p.medioId);
  return `${m ? nombreCorto(m) : 'Tarjeta'} · ${rangoPeriodo(p, hoy)}`;
}

/** ¿Es el período en curso (o uno futuro)? Entonces no se puede avanzar más. */
export const esPeriodoActual = (p: Periodo, hoy = todayISO()) => p.hasta >= hoy;

/** "Cierra en 18 días · 13 dic", "Cierra hoy" o "Facturado el 13 nov". */
export function estadoCierre(p: Periodo, hoy = todayISO()): string {
  const n = daysBetween(hoy, p.hasta);
  const ahora = new Date(`${hoy}T12:00:00`);
  if (n > 0) return `Cierra en ${n} ${n === 1 ? 'día' : 'días'} · ${shortDate(p.hasta, ahora)}`;
  if (n === 0) return 'Cierra hoy';
  return `Facturado el ${shortDate(p.hasta, ahora)}`;
}

/** Clave estable para guardar el período elegido (ej. en la URL): "mes:2026-11" o "tarjeta:<id>:2026-12". */
export const clavePeriodo = (p: Periodo) => (p.tipo === 'mes' ? `mes:${p.mes}` : `tarjeta:${p.medioId}:${p.cierreMes}`);

export function leerClavePeriodo(clave: string | null, medios: Medio[], hoy = todayISO()): Periodo {
  const [tipo, a, b] = (clave ?? '').split(':');
  if (tipo === 'mes' && /^\d{4}-\d{2}$/.test(a)) return periodoMes(a);
  if (tipo === 'tarjeta') {
    const m = medios.find((x) => x.id === a);
    if (m && tienePeriodo(m)) return /^\d{4}-\d{2}$/.test(b ?? '') ? periodoTarjeta(m, b) : periodoEn(hoy, m);
  }
  return periodoMes(hoy.slice(0, 7));
}

/**
 * Gastos del período. En el mes: todos los gastos del mes.
 * En el período de una tarjeta: solo los pagados con esa tarjeta (lo que llegará en su estado de cuenta).
 */
export function gastosDelPeriodo(p: Periodo, gastos: Gasto[]): Gasto[] {
  return gastos.filter((g) => g.fecha >= p.desde && g.fecha <= p.hasta && (p.tipo === 'mes' || (g.medioId === p.medioId && g.pagador === 'yo')));
}

export interface ResumenTarjeta {
  /** Lo que llegará en el estado de cuenta (total pagado con la tarjeta en el período). */
  facturado: number;
  /** Tu parte de eso. */
  tuyo: number;
  /** La parte de otros, separada en lo que ya te devolvieron y lo que falta. */
  deOtros: number;
  recuperado: number;
  pendiente: number;
  nGastos: number;
  /** Días que faltan para el cierre (0 = cierra hoy; negativo = ya cerró). */
  diasAlCierre: number;
  cerrado: boolean;
}

export function resumenPeriodo(p: Periodo, gastos: Gasto[], movimientos: Movimiento[], medios: Medio[] = []): Resumen {
  return resumenDe(clavePeriodo(p), gastosDelPeriodo(p, gastos), movimientos, medios);
}

export function resumenTarjeta(p: PeriodoTarjeta, gastos: Gasto[], movimientos: Movimiento[], hoy = todayISO()): ResumenTarjeta {
  const del = gastosDelPeriodo(p, gastos);
  const r = resumenDe(clavePeriodo(p), del, movimientos);
  const m = r.porMedio.find((x) => x.medioId === p.medioId);
  const diasAlCierre = daysBetween(hoy, p.hasta);
  return {
    facturado: m?.total ?? 0,
    tuyo: m?.mio ?? 0,
    deOtros: (m?.otrosCobrado ?? 0) + (m?.otrosPendiente ?? 0),
    recuperado: m?.otrosCobrado ?? 0,
    pendiente: m?.otrosPendiente ?? 0,
    nGastos: del.length,
    diasAlCierre,
    cerrado: diasAlCierre < 0,
  };
}

/** Opciones del selector: el mes en curso y el período abierto de cada tarjeta con día de facturación. */
export function opcionesPeriodo(medios: Medio[], hoy = todayISO()): Periodo[] {
  return [periodoMes(hoy.slice(0, 7)), ...medios.filter(tienePeriodo).sort((a, b) => a.orden - b.orden).map((m) => periodoEn(hoy, m))];
}
