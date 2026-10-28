// Mi plata: saldos estimados de las cuentas de ahorro, depósitos a plazo y patrimonio (lógica pura).
//
// Cómo se estima el saldo de una cuenta remunerada:
//   se parte del último "cuadre" (el saldo real que anotaste), se suman depósitos y se restan retiros,
//   y entre cada evento el saldo crece con interés compuesto diario según la tasa.
//   Es una estimación: cuadrar de vez en cuando con el saldo que muestra la app del banco la corrige.
import type { Cuenta, DatosDap, Gasto, Medio, MovAhorro, Movimiento, Persona } from '../db';
import { byDate, saldo as saldoPersona } from './balance';
import { daysBetween, todayISO } from './format';
import { sumarDias } from './recurrence';
import { periodoFacturacion } from './resumen';

/** Tasa diaria equivalente (compuesta) a partir de la tasa de la cuenta. */
export function tasaDiaria(c: Pick<Cuenta, 'tasa' | 'tasaUnidad'>): number {
  const t = (c.tasa ?? 0) / 100;
  if (t <= 0) return 0;
  return c.tasaUnidad === 'mensual' ? Math.pow(1 + t, 12 / 365) - 1 : Math.pow(1 + t, 1 / 365) - 1;
}

const crecer = (monto: number, r: number, dias: number) => (dias > 0 && r > 0 ? monto * Math.pow(1 + r, dias) : monto);

/** Movimientos de la cuenta en orden (por fecha y, dentro del día, por orden de registro). */
const ordenar = (movs: MovAhorro[]) => [...movs].sort(byDate);

/** Saldo estimado de una cuenta (remunerada, vista o inversión) al final del día `fecha`. Sin redondear. */
function saldoExacto(c: Cuenta, movs: MovAhorro[], fecha: string): number {
  const r = tasaDiaria(c);
  let s = 0;
  let desde: string | undefined;
  for (const m of ordenar(movs)) {
    if (m.fecha > fecha) break;
    if (desde) s = crecer(s, r, daysBetween(desde, m.fecha));
    if (m.tipo === 'cuadre') s = m.monto;
    else if (m.tipo === 'deposito') s += m.monto;
    else s -= m.monto;
    desde = m.fecha;
  }
  if (desde) s = crecer(s, r, daysBetween(desde, fecha));
  return s;
}

/** Plazo del depósito en días. */
export const plazoDap = (d: DatosDap) => Math.max(0, daysBetween(d.inicio, d.vencimiento));

/** Lo que recibes al vencer: el monto final que informó el banco o el cálculo con la tasa a 30 días (interés simple). */
export const alVencerDap = (d: DatosDap) => d.montoFinal ?? Math.round(d.monto * (1 + ((d.tasa30 / 100) * plazoDap(d)) / 30));

/** Valor de un depósito a plazo en una fecha: el monto más el interés devengado hasta ese día (lineal). */
export function valorDap(d: DatosDap, fecha: string): number {
  if (fecha < d.inicio) return 0;
  const plazo = plazoDap(d);
  if (!plazo || fecha >= d.vencimiento) return alVencerDap(d);
  const final = alVencerDap(d);
  return d.monto + ((final - d.monto) * daysBetween(d.inicio, fecha)) / plazo;
}

/** Saldo de cualquier cuenta en una fecha, redondeado al peso. Un DAP ya cobrado vale 0 (la plata se movió). */
export function saldoCuenta(c: Cuenta, movs: MovAhorro[], fecha = todayISO()): number {
  if (c.tipo === 'dap') return c.dap && c.dap.estado === 'vigente' ? Math.round(valorDap(c.dap, fecha)) : 0;
  return Math.round(saldoExacto(c, movs, fecha));
}

/**
 * Rendimiento entre dos fechas: cuánto cambió el saldo sin contar tus depósitos ni retiros.
 * Incluye los ajustes al cuadrar (si el banco pagó más o menos de lo estimado, la diferencia es rendimiento).
 */
export function rendimiento(c: Cuenta, movs: MovAhorro[], desde: string, hasta: string): number {
  if (c.tipo === 'dap') {
    if (!c.dap) return 0;
    return Math.round(valorDap(c.dap, hasta) - valorDap(c.dap, desde > c.dap.inicio ? desde : c.dap.inicio));
  }
  // El primer cuadre es el punto de partida (no es rendimiento): se cuenta desde ahí.
  const ord = ordenar(movs);
  const inicio = ord[0]?.fecha;
  if (!inicio || hasta < inicio) return 0;
  const base = desde < inicio ? inicio : desde;
  const enRango = ord.filter((m) => m.fecha > base && m.fecha <= hasta);
  const aportes = enRango.reduce((s, m) => s + (m.tipo === 'deposito' ? m.monto : m.tipo === 'retiro' ? -m.monto : 0), 0);
  return Math.round(saldoExacto(c, ord, hasta) - saldoExacto(c, ord, base) - aportes);
}

/** Último día del mes anterior a `fecha`. */
const finMesAnterior = (fecha: string) => sumarDias(`${fecha.slice(0, 7)}-01`, -1);

export interface ResumenCuenta {
  cuenta: Cuenta;
  saldo: number;
  /** Rendimiento estimado desde el 1 del mes. */
  ganadoMes: number;
  /** Rendimiento desde el primer registro (o desde el inicio del DAP). */
  ganadoTotal: number;
  /** Último cuadre con el saldo real. */
  ultimoCuadre?: MovAhorro;
  diasDesdeCuadre?: number;
  /** Solo DAP. */
  alVencer?: number;
  diasParaVencer?: number;
}

export function resumenCuenta(c: Cuenta, todos: MovAhorro[], hoy = todayISO()): ResumenCuenta {
  const movs = todos.filter((m) => m.cuentaId === c.id);
  const cuadres = ordenar(movs).filter((m) => m.tipo === 'cuadre' && m.fecha <= hoy);
  const ultimoCuadre = cuadres[cuadres.length - 1];
  const primera = c.tipo === 'dap' ? c.dap?.inicio : ordenar(movs)[0]?.fecha;
  const r: ResumenCuenta = {
    cuenta: c,
    saldo: saldoCuenta(c, movs, hoy),
    ganadoMes: rendimiento(c, movs, finMesAnterior(hoy), hoy),
    ganadoTotal: primera ? rendimiento(c, movs, primera, hoy) : 0,
    ultimoCuadre,
    diasDesdeCuadre: ultimoCuadre ? daysBetween(ultimoCuadre.fecha, hoy) : undefined,
  };
  if (c.tipo === 'dap' && c.dap) {
    r.alVencer = alVencerDap(c.dap);
    r.diasParaVencer = daysBetween(hoy, c.dap.vencimiento);
  }
  return r;
}

/** Saldo día a día (o cada `paso` días) para el gráfico del detalle de una cuenta. */
export function serieSaldo(c: Cuenta, todos: MovAhorro[], desde: string, hasta: string, paso = 1): { fecha: string; saldo: number }[] {
  const movs = todos.filter((m) => m.cuentaId === c.id);
  const out: { fecha: string; saldo: number }[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, paso)) out.push({ fecha: f, saldo: saldoCuenta(c, movs, f) });
  if (out[out.length - 1]?.fecha !== hasta) out.push({ fecha: hasta, saldo: saldoCuenta(c, movs, hasta) });
  return out;
}

/** Período de facturación abierto de una tarjeta de crédito en una fecha. */
export function periodoAbierto(diaFacturacion: number, hoy: string) {
  const mes = hoy.slice(0, 7);
  const p = periodoFacturacion(mes, diaFacturacion);
  if (hoy <= p.hasta) return p;
  const [y, m] = mes.split('-').map(Number);
  const sig = `${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, '0')}`;
  return periodoFacturacion(sig, diaFacturacion);
}

export interface Patrimonio {
  /** Cuentas remuneradas, inversiones y depósitos a plazo vigentes (por su capital). */
  ahorros: number;
  /** Cuentas vista, corrientes o RUT. */
  vista: number;
  efectivo: number;
  /** Lo que te deben las personas (saldos positivos). */
  teDeben: number;
  /** Lo que les debes (saldos negativos, en positivo). */
  debes: number;
  /**
   * Lo que pagaste con tarjeta de crédito en el período actual de cada tarjeta (o en el mes, si no tiene día de facturación).
   * Es una estimación: la app no sabe si ya pagaste la tarjeta.
   */
  tarjetas: number;
  /** Lo que tienes (ahorros + vista + efectivo + te deben). */
  activos: number;
  /** Lo que debes (debes + tarjetas). */
  pasivos: number;
  total: number;
  /** Personas que te deben y a las que les debes. */
  nTeDeben: number;
  nDebes: number;
  /** Tarjetas de crédito consideradas. */
  tarjetasCredito: Medio[];
  cuentas: ResumenCuenta[];
}

export function patrimonio(
  d: { cuentas: Cuenta[]; movAhorro: MovAhorro[]; personas: Persona[]; movimientos: Movimiento[]; gastos: Gasto[]; medios: Medio[] },
  hoy = todayISO(),
): Patrimonio {
  const cuentas = d.cuentas.filter((c) => !c.archivada).map((c) => resumenCuenta(c, d.movAhorro, hoy));
  const suma = (...ts: Cuenta['tipo'][]) => cuentas.filter((r) => ts.includes(r.cuenta.tipo)).reduce((s, r) => s + r.saldo, 0);
  // Los depósitos a plazo suman su capital; los intereses se ven en "al vencer recibes".
  const daps = cuentas.filter((r) => r.cuenta.tipo === 'dap' && r.cuenta.dap?.estado === 'vigente').reduce((s, r) => s + (r.cuenta.dap?.monto ?? 0), 0);
  let teDeben = 0;
  let debes = 0;
  let nTeDeben = 0;
  let nDebes = 0;
  for (const p of d.personas) {
    const s = saldoPersona(d.movimientos.filter((m) => m.personaId === p.id));
    if (s > 0) [teDeben, nTeDeben] = [teDeben + s, nTeDeben + 1];
    else if (s < 0) [debes, nDebes] = [debes - s, nDebes + 1];
  }
  const tarjetasCredito = d.medios.filter((m) => m.tipo === 'credito' && !m.archivado);
  let tarjetas = 0;
  for (const m of tarjetasCredito) {
    const desde = m.diaFacturacion ? periodoAbierto(m.diaFacturacion, hoy).desde : `${hoy.slice(0, 7)}-01`;
    tarjetas += d.gastos.filter((g) => g.medioId === m.id && g.pagador === 'yo' && g.fecha >= desde && g.fecha <= hoy).reduce((s, g) => s + g.total, 0);
  }
  const ahorros = suma('remunerada', 'inversion') + daps;
  const vista = suma('vista');
  const efectivo = suma('efectivo');
  const activos = ahorros + vista + efectivo + teDeben;
  const pasivos = debes + tarjetas;
  return { ahorros, vista, efectivo, teDeben, debes, tarjetas, activos, pasivos, total: activos - pasivos, nTeDeben, nDebes, tarjetasCredito, cuentas };
}

// ---------- Detalle de una cuenta ----------

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export interface FilaMovimiento {
  /** Id del movimiento guardado (no lo tienen los intereses estimados). */
  id?: string;
  fecha: string;
  label: string;
  /** Con signo: + entra, − sale. */
  monto: number;
  tipo: 'inicial' | 'deposito' | 'retiro' | 'ajuste' | 'interes';
}

/**
 * Movimientos para mostrar en el detalle (del más nuevo al más antiguo):
 * - el saldo inicial (primer cuadre),
 * - depósitos y retiros,
 * - el ajuste de cada cuadre (diferencia con lo estimado),
 * - los intereses estimados de cada mes cerrado ("Intereses de octubre", el día 1 del mes siguiente).
 */
export function movimientosCuenta(c: Cuenta, todos: MovAhorro[], hoy = todayISO()): FilaMovimiento[] {
  const ord = ordenar(todos.filter((m) => m.cuentaId === c.id && m.fecha <= hoy));
  const filas: FilaMovimiento[] = [];
  ord.forEach((m, i) => {
    if (m.tipo === 'deposito') filas.push({ id: m.id, fecha: m.fecha, label: m.nota || 'Depósito', monto: m.monto, tipo: 'deposito' });
    else if (m.tipo === 'retiro') filas.push({ id: m.id, fecha: m.fecha, label: m.nota || 'Retiro', monto: -m.monto, tipo: 'retiro' });
    else if (i === 0) filas.push({ id: m.id, fecha: m.fecha, label: 'Saldo inicial', monto: m.monto, tipo: 'inicial' });
    else {
      const antes = saldoExacto(c, ord.slice(0, i), m.fecha);
      const dif = Math.round(m.monto - antes);
      if (dif) filas.push({ id: m.id, fecha: m.fecha, label: dif > 0 && c.tipo === 'remunerada' ? 'Ajuste al cuadrar · intereses' : 'Ajuste al cuadrar', monto: dif, tipo: 'ajuste' });
    }
  });
  // Intereses estimados por mes cerrado (solo cuentas con tasa).
  if (tasaDiaria(c) > 0 && ord.length) {
    const r = tasaDiaria(c);
    let mes = ord[0].fecha.slice(0, 7);
    while (true) {
      const [y, m] = mes.split('-').map(Number);
      const siguiente = `${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, '0')}`;
      const primero = `${siguiente}-01`;
      if (primero > hoy) break;
      // Interés del mes: lo que crece el saldo día a día, sin contar depósitos, retiros ni cuadres.
      let interes = 0;
      for (let f = `${mes}-01`; f < primero; f = sumarDias(f, 1)) {
        if (f < ord[0].fecha) continue;
        interes += saldoExacto(c, ord, f) * r;
      }
      if (Math.round(interes)) filas.push({ fecha: primero, label: `Intereses de ${MESES_LARGOS[m - 1]}`, monto: Math.round(interes), tipo: 'interes' });
      mes = siguiente;
    }
  }
  return filas.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export interface PuntoHistorial {
  fecha: string;
  label: string;
  saldo: number;
}

/**
 * Saldo al cierre de los últimos meses y hoy, para el gráfico del detalle ("Saldo, últimos 6 meses").
 * Solo desde que la cuenta tiene registros; si es nueva, dos puntos: el inicio y hoy.
 */
export function historialCuenta(c: Cuenta, todos: MovAhorro[], hoy = todayISO(), meses = 5): PuntoHistorial[] {
  const movs = todos.filter((m) => m.cuentaId === c.id);
  const inicio = c.tipo === 'dap' ? c.dap?.inicio : ordenar(movs)[0]?.fecha;
  if (!inicio) return [];
  const puntos: PuntoHistorial[] = [];
  for (let k = meses; k >= 1; k--) {
    const [y, m] = hoy.slice(0, 7).split('-').map(Number);
    const d = new Date(y, m - 1 - k + 1, 0); // último día de hace k meses
    const fecha = todayISO(d);
    if (fecha >= inicio) puntos.push({ fecha, label: MESES_CORTOS[d.getMonth()], saldo: saldoCuenta(c, movs, fecha) });
  }
  if (!puntos.length) puntos.push({ fecha: inicio, label: MESES_CORTOS[Number(inicio.slice(5, 7)) - 1], saldo: saldoCuenta(c, movs, inicio) });
  puntos.push({ fecha: hoy, label: 'hoy', saldo: saldoCuenta(c, movs, hoy) });
  return puntos;
}

/** Equivalente anual simple de una tasa a 30 días (como lo muestra el diseño: tasa30 × 365 / 30). */
export const anualDesde30 = (tasa30: number) => (tasa30 * 365) / 30;
