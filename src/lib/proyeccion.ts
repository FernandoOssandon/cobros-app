// ¿Cómo termino el mes? Proyección de tu plata hasta el próximo sueldo (lógica pura).
//
// - El "ciclo" va de un sueldo al siguiente (si no hay sueldo fijo, el mes calendario).
// - Lo que tienes: el saldo estimado de las cuentas que cuentan para el mes (las eliges; por defecto corrientes, vista y efectivo).
// - Las compras con tarjeta de crédito cuentan como ya gastadas: lo facturado sin pagar y lo del período abierto
//   se restan hoy, aunque se paguen después. Las cuotas futuras cuentan solo en su mes.
// - Lo que viene antes del sueldo: recurrentes (gastos e ingresos), cuotas y lo que está por confirmar.
// - Te quedan = lo que tienes + lo que entra − tarjetas − lo que viene. Dividido por los días que faltan: cuánto por día.
import type { Cuenta, Gasto, Ingreso, Medio, MovAhorro, Movimiento, PagoTarjeta, Pendiente, Recurrente } from '../db';
import { resumenCuenta } from './ahorro';
import type { GastoImputado } from './cuotas';
import { daysBetween, sumarMes, todayISO } from './format';
import { periodoEn, periodoTarjeta, tienePeriodo } from './periodos';
import { ocurrenciasEntre, proxima, sumarDias } from './recurrence';
import { resumenDe } from './resumen';

// ---------- El ciclo: de sueldo a sueldo ----------

export interface Ciclo {
  /** Primer día del ciclo (el día del último sueldo, o el 1 del mes). */
  inicio: string;
  /** Día del próximo sueldo (o el 1 del mes siguiente): el ciclo termina el día anterior. */
  hasta: string;
  /** El sueldo que marca el ciclo (si hay). */
  sueldo?: Recurrente;
  /** Días que quedan, contando hoy. */
  dias: number;
  /** Días que ya pasaron, contando hoy. */
  transcurridos: number;
}

/** El sueldo: el ingreso fijo mensual activo más grande. */
export function sueldoPrincipal(recurrentes: Recurrente[]): Recurrente | undefined {
  return recurrentes
    .filter((r) => r.tipo === 'ingreso' && r.activo && r.frecuencia.unidad === 'mes')
    .sort((a, b) => b.monto - a.monto || a.creado.localeCompare(b.creado))[0];
}

const ciclo = (inicio: string, hasta: string, hoy: string, sueldo?: Recurrente): Ciclo => ({
  inicio,
  hasta,
  sueldo,
  dias: Math.max(1, daysBetween(hoy, hasta)),
  transcurridos: Math.max(1, daysBetween(inicio, hoy) + 1),
});

/** El ciclo en curso: desde el último sueldo hasta el próximo. */
export function cicloActual(recurrentes: Recurrente[], hoy = todayISO()): Ciclo {
  const s = sueldoPrincipal(recurrentes);
  // El próximo sueldo que todavía no llega (si el de hoy ya se anotó, el del mes siguiente).
  const hasta = s ? proxima(s.frecuencia, s.inicio, [s.generadoHasta ?? '', sumarDias(hoy, -1)].sort()[1], s.fin) : undefined;
  if (!s || !hasta) {
    const mes = hoy.slice(0, 7);
    return ciclo(`${mes}-01`, `${sumarMes(mes, 1)}-01`, hoy);
  }
  return ciclo(anteriorA(s, hasta), hasta, hoy, s);
}

/** La ocurrencia del sueldo anterior a `fecha` (un mes antes si no hay registro). */
function anteriorA(s: Recurrente, fecha: string): string {
  const antes = ocurrenciasEntre(s.frecuencia, s.inicio, sumarDias(fecha, -100), sumarDias(fecha, -1));
  return antes[antes.length - 1] ?? `${sumarMes(fecha.slice(0, 7), -1)}-${fecha.slice(8, 10)}`;
}

/** El ciclo anterior al que contiene `hoy` (el que se cierra). */
export function cicloAnterior(recurrentes: Recurrente[], hoy = todayISO()): Ciclo {
  const actual = cicloActual(recurrentes, hoy);
  const fin = sumarDias(actual.inicio, -1);
  if (!actual.sueldo) {
    const mes = fin.slice(0, 7);
    return ciclo(`${mes}-01`, actual.inicio, fin);
  }
  return ciclo(anteriorA(actual.sueldo, actual.inicio), actual.inicio, fin, actual.sueldo);
}

// ---------- Cuentas que cuentan ----------

/** Cuentas que pueden contar para el mes: en pesos, sin depósitos a plazo ni archivadas. */
export const puedeContar = (c: Cuenta) => !c.archivada && !c.moneda && c.tipo !== 'dap';

/** ¿La cuenta cuenta para el mes? Lo eliges tú; por defecto, las corrientes, vista y efectivo. */
export const cuentaParaElMes = (c: Cuenta) => puedeContar(c) && (c.paraElMes ?? (c.tipo === 'vista' || c.tipo === 'efectivo'));

// ---------- La proyección ----------

export interface FuentesProyeccion {
  cuentas: Cuenta[];
  /** Movimientos de las cuentas, con los que vienen de otras partes (`movCuentas`). */
  movCuentas: MovAhorro[];
  gastos: Gasto[];
  imputados: GastoImputado[];
  movimientos: Movimiento[];
  medios: Medio[];
  recurrentes: Recurrente[];
  pendientes: Pendiente[];
  pagosTarjeta: PagoTarjeta[];
  ingresos: Ingreso[];
}

export interface CuentaProyeccion {
  cuenta: Cuenta;
  saldo: number;
}

export interface TarjetaProyeccion {
  medio: Medio;
  /** Lo facturado en el último período cerrado que falta pagar. */
  porPagar: number;
  /** Fecha de ese cierre (si la tarjeta tiene período). */
  cierre?: string;
  /** Lo cargado en el período abierto hasta hoy. */
  abierto: number;
  /** Desde cuándo va el período abierto. */
  desde: string;
  total: number;
}

export interface LoQueViene {
  /** Para la lista: recurrente, cuota, por confirmar o ingreso. */
  tipo: 'recurrente' | 'cuota' | 'confirmar' | 'ingreso';
  fecha: string;
  label: string;
  /** Negativo: sale · positivo: entra. */
  monto: number;
  medioId?: string;
  cuentaId?: string;
  /** Monto estimado (variable o por confirmar). */
  estimado?: boolean;
  recurrenteId?: string;
}

export interface AvisoCuenta {
  cuenta: Cuenta;
  /** Lo que tendría la cuenta al llegar el sueldo (negativo). */
  saldoFinal: number;
  /** Lo que le falta. */
  falta: number;
  /** Qué la deja corta (ej. "pagar la CMR Falabella"). */
  motivo: string;
}

export interface Proyeccion {
  ciclo: Ciclo;
  cuentas: CuentaProyeccion[];
  /** Suma de los saldos de las cuentas que cuentan. */
  tienes: number;
  tarjetas: TarjetaProyeccion[];
  enTarjetas: number;
  /** Lo que viene antes del sueldo, por fecha. */
  viene: LoQueViene[];
  entra: number;
  sale: number;
  /** Lo que te queda para gastar hasta el sueldo. */
  libre: number;
  /** Por día (0 si no queda nada). */
  porDia: number;
  /** Lo que llevas gastando por día en el ciclo (sin recurrentes, cuotas de compras anteriores ni gastos grandes). */
  ritmo: number;
  /** Gastos grandes del ciclo que no cuentan en el ritmo (una transferencia de arriendo, un préstamo…). */
  grandes: GastoImputado[];
  /** Con lo que llevas por día, con cuánto llegas al sueldo (negativo: te falta). */
  aEsteRitmo: number;
  avisos: AvisoCuenta[];
  /** No hay ninguna cuenta que cuente (no hay de dónde proyectar). */
  sinCuentas: boolean;
  /** Cuentas que podrían contar pero no cuentan (tus ahorros), con su saldo. */
  fuera: CuentaProyeccion[];
  /** Suma de esos saldos. */
  enAhorros: number;
}

/** Un gasto es "grande" (no cuenta en el ritmo) desde $100.000 y si es al menos el 15 % de lo gastado en el ciclo. */
export const GRANDE_MIN = 100_000;
const GRANDE_PCT = 0.15;

const deTarjeta = (g: Gasto, m: Medio) => g.medioId === m.id && g.pagador === 'yo';

function tarjeta(m: Medio, f: FuentesProyeccion, hoy: string): TarjetaProyeccion {
  const suma = (desde: string, hasta: string) => f.imputados.filter((g) => deTarjeta(g, m) && g.fecha >= desde && g.fecha <= hasta).reduce((s, g) => s + g.total, 0);
  if (!tienePeriodo(m)) {
    const desde = `${hoy.slice(0, 7)}-01`;
    const abierto = suma(desde, hoy);
    return { medio: m, porPagar: 0, abierto, desde, total: abierto };
  }
  const actual = periodoEn(hoy, m);
  const cierreMes = actual.tipo === 'tarjeta' ? actual.cierreMes : hoy.slice(0, 7);
  const cerrado = periodoTarjeta(m, sumarMes(cierreMes, -1));
  const facturado = suma(cerrado.desde, cerrado.hasta);
  // Los pagos desde el cierre son de esa cuenta. Si se pagó más (la cuenta traía cargos de antes de usar la app),
  // el resto no se descuenta del período abierto: así la proyección peca de prudente.
  const pagado = f.pagosTarjeta.filter((p) => p.medioId === m.id && p.fecha > cerrado.hasta && p.fecha <= hoy).reduce((s, p) => s + p.monto, 0);
  const porPagar = Math.max(0, facturado - pagado);
  const abierto = suma(actual.desde, hoy);
  return { medio: m, porPagar, cierre: cerrado.hasta, abierto, desde: actual.desde, total: porPagar + abierto };
}

/** Desde cuándo proyectar un recurrente: lo ya generado (anotado o por confirmar) no se vuelve a contar. */
const desdeRecurrente = (r: Recurrente, hoy: string) => [r.generadoHasta ?? '', sumarDias(hoy, -1)].sort()[1];

export function proyectar(f: FuentesProyeccion, hoy = todayISO()): Proyeccion {
  const c = cicloActual(f.recurrentes, hoy);
  const ultimo = sumarDias(c.hasta, -1);
  const conSaldo = (cuenta: Cuenta) => ({ cuenta, saldo: resumenCuenta(cuenta, f.movCuentas, hoy).saldo });
  const ordenadas = f.cuentas.filter(puedeContar).sort((a, b) => a.orden - b.orden);
  const cuentas = ordenadas.filter(cuentaParaElMes).map(conSaldo);
  const fuera = ordenadas.filter((x) => !cuentaParaElMes(x)).map(conSaldo);
  const cuentaId = new Set(cuentas.map((x) => x.cuenta.id));
  const tienes = cuentas.reduce((s, x) => s + x.saldo, 0);

  const tarjetas = f.medios
    .filter((m) => m.tipo === 'credito' && !m.archivado)
    .sort((a, b) => a.orden - b.orden)
    .map((m) => tarjeta(m, f, hoy))
    .filter((t) => t.total > 0);
  const enTarjetas = tarjetas.reduce((s, t) => s + t.total, 0);

  const viene: LoQueViene[] = [];
  const recurrente = new Map(f.recurrentes.map((r) => [r.id, r]));
  // Recurrentes que faltan antes del sueldo.
  for (const r of f.recurrentes) {
    if (!r.activo || r.tipo === 'cobro' || r.id === c.sueldo?.id) continue;
    for (const fecha of ocurrenciasEntre(r.frecuencia, r.inicio, desdeRecurrente(r, hoy), ultimo, r.fin)) {
      if (r.tipo === 'ingreso') {
        // Solo si llega a una cuenta que cuenta para el mes (o no se sabe a cuál).
        if (r.cuentaId && !cuentaId.has(r.cuentaId)) continue;
        viene.push({ tipo: 'ingreso', fecha, label: r.nombre, monto: r.monto, cuentaId: r.cuentaId, estimado: r.montoTipo === 'variable', recurrenteId: r.id });
      } else {
        viene.push({ tipo: 'recurrente', fecha, label: r.nombre, monto: -r.monto, medioId: r.medioId, estimado: r.montoTipo === 'variable' || !!r.moneda, recurrenteId: r.id });
      }
    }
  }
  // Lo que está por confirmar (ya tocaba, pero falta el monto real).
  for (const p of f.pendientes) {
    const r = recurrente.get(p.recurrenteId);
    if (!r || r.tipo === 'cobro') continue;
    if (r.tipo === 'ingreso') {
      if (r.cuentaId && !cuentaId.has(r.cuentaId)) continue;
      viene.push({ tipo: 'confirmar', fecha: p.fecha, label: r.nombre, monto: r.monto, cuentaId: r.cuentaId, estimado: true, recurrenteId: r.id });
    } else viene.push({ tipo: 'confirmar', fecha: p.fecha, label: r.nombre, monto: -r.monto, medioId: r.medioId, estimado: true, recurrenteId: r.id });
  }
  // Cuotas (y cargos con fecha futura) de las tarjetas antes del sueldo.
  const credito = new Set(f.medios.filter((m) => m.tipo === 'credito' && !m.archivado).map((m) => m.id));
  for (const g of f.imputados) {
    if (g.pagador !== 'yo' || !g.medioId || !credito.has(g.medioId) || g.fecha <= hoy || g.fecha > ultimo) continue;
    viene.push({
      tipo: 'cuota',
      fecha: g.fecha,
      label: g.cuota ? `${g.descripcion} · cuota ${g.cuota.n}/${g.cuota.de}` : g.descripcion,
      monto: -g.total,
      medioId: g.medioId,
    });
  }
  viene.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.monto - b.monto);
  const entra = viene.filter((v) => v.monto > 0).reduce((s, v) => s + v.monto, 0);
  const sale = -viene.filter((v) => v.monto < 0).reduce((s, v) => s + v.monto, 0);
  const libre = tienes + entra - enTarjetas - sale;
  const porDia = libre > 0 ? Math.floor(libre / c.dias) : 0;

  // Ritmo: lo que pagaste en el ciclo, sin recurrentes, cuotas de compras de antes ni gastos grandes.
  const delCiclo = f.imputados.filter((g) => g.pagador === 'yo' && !g.recurrenteId && g.fecha >= c.inicio && g.fecha <= hoy && (!g.cuota || g.cuota.n === 1));
  const totalCiclo = delCiclo.reduce((s, g) => s + g.total, 0);
  const esGrande = (g: GastoImputado) => g.total >= GRANDE_MIN && g.total >= totalCiclo * GRANDE_PCT;
  const grandes = delCiclo.filter(esGrande).sort((a, b) => b.total - a.total);
  const variable = totalCiclo - grandes.reduce((s, g) => s + g.total, 0);
  const ritmo = Math.round(variable / c.transcurridos);
  // Hoy ya está en lo gastado: a este ritmo se gastan los días que quedan después de hoy.
  const aEsteRitmo = libre - ritmo * Math.max(0, c.dias - 1);

  return {
    ciclo: c,
    cuentas,
    tienes,
    tarjetas,
    enTarjetas,
    viene,
    entra,
    sale,
    libre,
    porDia,
    ritmo,
    grandes,
    aEsteRitmo,
    avisos: avisosCuentas(f, cuentas, tarjetas, viene),
    sinCuentas: cuentas.length === 0,
    fuera,
    enAhorros: fuera.reduce((s, x) => s + Math.max(0, x.saldo), 0),
  };
}

/**
 * Cuentas que no alcanzan antes del sueldo: su saldo, más lo que llega a ella, menos lo que se paga desde ella
 * (recurrentes con un medio ligado a la cuenta y lo facturado de las tarjetas que se pagan desde ahí).
 */
function avisosCuentas(f: FuentesProyeccion, cuentas: CuentaProyeccion[], tarjetas: TarjetaProyeccion[], viene: LoQueViene[]): AvisoCuenta[] {
  const cuentaDeMedio = new Map(f.medios.filter((m) => m.cuentaId && m.tipo !== 'credito').map((m) => [m.id, m.cuentaId!]));
  const out: AvisoCuenta[] = [];
  for (const { cuenta, saldo } of cuentas) {
    const entra = viene.filter((v) => v.monto > 0 && v.cuentaId === cuenta.id).reduce((s, v) => s + v.monto, 0);
    const recurrentes = viene.filter((v) => v.monto < 0 && v.medioId && cuentaDeMedio.get(v.medioId) === cuenta.id);
    const deTarjetas = tarjetas.filter((t) => t.porPagar > 0 && t.medio.cuentaId === cuenta.id);
    const final = saldo + entra + recurrentes.reduce((s, v) => s + v.monto, 0) - deTarjetas.reduce((s, t) => s + t.porPagar, 0);
    if (final >= 0) continue;
    const motivos = [...deTarjetas.map((t) => `pagar la ${t.medio.nombre}`), ...(recurrentes.length ? [recurrentes.length === 1 ? recurrentes[0].label : `${recurrentes.length} recurrentes`] : [])];
    out.push({ cuenta, saldoFinal: final, falta: -final, motivo: motivos.length ? juntar(motivos) : 'lo que tiene anotado' });
  }
  return out;
}

const juntar = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

// ---------- El cierre del ciclo ----------

export interface ResumenCiclo {
  ciclo: Ciclo;
  ingresos: number;
  gastoReal: number;
  /** Ingresos − gasto real. */
  quedo: number;
  nGastos: number;
  /** Gastos del ciclo sin categoría. */
  sinCategoria: number;
  /** El gasto real del ciclo anterior a este (para comparar), si hay datos. */
  gastoAnterior?: number;
  /** Si empezaste a anotar a mitad del ciclo: desde cuándo hay gastos (el ciclo está incompleto). */
  incompletoDesde?: string;
}

export function resumenCiclo(c: Ciclo, d: Pick<FuentesProyeccion, 'imputados' | 'movimientos' | 'ingresos' | 'recurrentes'>): ResumenCiclo {
  const ultimo = sumarDias(c.hasta, -1);
  const del = d.imputados.filter((g) => g.fecha >= c.inicio && g.fecha <= ultimo);
  const r = resumenDe(c.inicio, del, d.movimientos);
  const ingresos = d.ingresos.filter((i) => i.fecha >= c.inicio && i.fecha <= ultimo).reduce((s, i) => s + i.monto, 0);
  // Ciclo anterior: solo si hay gastos desde su inicio (si no, la comparación engaña).
  const ant = c.sueldo ? anteriorA(c.sueldo, c.inicio) : `${sumarMes(c.inicio.slice(0, 7), -1)}-01`;
  const primero = d.imputados.reduce((m, g) => (g.fecha < m ? g.fecha : m), '9999');
  const delAnt = d.imputados.filter((g) => g.fecha >= ant && g.fecha < c.inicio);
  return {
    ciclo: c,
    ingresos,
    gastoReal: r.gastoReal,
    quedo: ingresos - r.gastoReal,
    nGastos: del.filter((g) => !g.cuota || g.cuota.n === 1).length,
    sinCategoria: del.filter((g) => !g.categoriaId && (!g.cuota || g.cuota.n === 1)).length,
    gastoAnterior: primero <= ant && delAnt.length ? resumenDe(ant, delAnt, d.movimientos).gastoReal : undefined,
    incompletoDesde: primero > c.inicio && primero <= ultimo ? primero : undefined,
  };
}

/** Días después del sueldo en que se ofrece cerrar el ciclo anterior. */
export const DIAS_PARA_CERRAR = 10;

/**
 * ¿Toca cerrar el ciclo anterior? Recién llegó el sueldo (hace 10 días o menos), ese ciclo no se ha cerrado
 * y hay gastos desde su comienzo (no es la primera semana usando la app).
 */
export function tocaCierre(recurrentes: Recurrente[], gastos: Pick<Gasto, 'fecha'>[], ultimoCierre: string | undefined, hoy = todayISO()): Ciclo | undefined {
  const actual = cicloActual(recurrentes, hoy);
  if (daysBetween(actual.inicio, hoy) > DIAS_PARA_CERRAR) return undefined;
  const ant = cicloAnterior(recurrentes, hoy);
  if (ultimoCierre && ultimoCierre >= ant.inicio) return undefined;
  const primero = gastos.reduce((m, g) => (g.fecha < m ? g.fecha : m), '9999');
  if (primero > sumarDias(ant.inicio, 7)) return undefined;
  return ant;
}
