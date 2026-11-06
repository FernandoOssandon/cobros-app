// Importar una cartola (lógica pura): cruza los movimientos del banco con lo que ya está en la app.
//
// Cada movimiento del banco queda en uno de estos grupos:
// - importado: ya se vio en una importación anterior (la app guarda una huella de cada uno);
// - anterior: es de antes de que la cuenta o tarjeta partiera en la app (ya está en su saldo inicial);
// - coincide: ya está anotado (mismo monto, fecha cercana); se liga sin cambiar nada;
// - parecido: hay algo anotado que se le parece pero con otro monto; tú eliges cuál queda;
// - nuevo: no está en la app; se propone cómo anotarlo (gasto, pago de alguien, ingreso, traspaso…).
// Lo que está en la app en esas fechas y no aparece en el banco queda como "solo en la app".
import type { Aprendido, Categoria, Cuenta, Gasto, Importado, Ingreso, Medio, MovAhorro, Movimiento, PagoTarjeta, Persona, RefApp, Recurrente } from '../db';
import { claveDetalle, descripcionDe, plano, type Cartola, type LineaCartola } from './bancos';
import { byDate } from './balance';
import { reconocerPersona, sugerirCategoria } from './correo';
import { daysBetween } from './format';
import { sumarDias } from './recurrence';

export type Destino = { tipo: 'cuenta'; cuenta: Cuenta } | { tipo: 'tarjeta'; medio: Medio };
export const idDestino = (d: Destino) => (d.tipo === 'cuenta' ? d.cuenta.id : d.medio.id);
export const nombreDestino = (d: Destino) => (d.tipo === 'cuenta' ? d.cuenta.nombre : d.medio.nombre);

/** Lo que la app necesita mirar (un subconjunto de los datos en vivo). */
export interface DatosImportar {
  gastos: Gasto[];
  movimientos: Movimiento[];
  ingresos: Ingreso[];
  /** Solo lo guardado (sin los movimientos calculados de gastos y pagos). */
  movAhorro: MovAhorro[];
  pagosTarjeta: PagoTarjeta[];
  medios: Medio[];
  cuentas: Cuenta[];
  personas: Persona[];
  /** Saldo neto con cada persona (positivo: te debe). */
  saldoPersona: Map<string, number>;
  categorias: Categoria[];
  recurrentes: Recurrente[];
  importados: Importado[];
}

/** Algo anotado en la app que mueve la cuenta o la tarjeta, con el mismo signo que las líneas del banco. */
export interface RegistroApp {
  ref: RefApp;
  fecha: string;
  monto: number;
  creado: string;
  /** "Javier te pagó", "Uber". */
  label: string;
  personaId?: string;
  /** Pago o ingreso sin cuenta: al ligarlo pasa a entrar (o salir) por esta cuenta. */
  sinCuenta?: boolean;
  aprendido?: Aprendido;
}

export type Propuesta =
  | { tipo: 'gasto'; descripcion: string; categoriaId?: string; medioId?: string; cuotas?: number }
  /** La persona te pagó. `resto`: lo que pasa de lo que te debía, se anota como ingreso suelto. */
  | { tipo: 'pago'; personaId: string; resto?: number }
  | { tipo: 'abono'; personaId: string }
  | { tipo: 'ingreso'; descripcion: string; tipoIngreso: 'sueldo' | 'otro'; recurrenteId?: string }
  /** Entre tus cuentas. `cuentaId`: la otra cuenta (sin ella: una cuenta tuya que la app no lleva). */
  | { tipo: 'traspaso'; cuentaId?: string }
  | { tipo: 'pagoTarjeta'; medioId?: string }
  | { tipo: 'ignorar' };

export type Grupo = 'importado' | 'anterior' | 'coincide' | 'parecido' | 'nuevo';

export interface ItemCartola {
  huella: string;
  linea: LineaCartola;
  grupo: Grupo;
  /** Coincide o parecido: lo que ya estaba en la app (uno o varios gastos que suman lo mismo). */
  app?: RegistroApp[];
  /** Nuevo, o parecido que resulta ser otra cosa. */
  propuesta: Propuesta;
  /** Por qué se propone eso: "como la vez anterior", "te debía $64.783"… */
  motivo?: string;
}

export interface Revision {
  cartola: Cartola;
  destino: Destino;
  items: ItemCartola[];
  /** En la app entre las fechas del archivo, pero no en el banco. */
  soloApp: RegistroApp[];
  /** Desde cuándo la cuenta o tarjeta tiene registros en la app (lo anterior ya está en su saldo inicial). */
  inicio?: string;
  /** La cuenta no tiene registros: parte con el saldo del banco antes del primer movimiento del archivo. */
  saldoInicial?: { fecha: string; monto: number };
}

// ---------- Huellas ----------

/** Huella de cada línea: misma cuenta, fecha, monto y detalle; si se repite en el día, el número de repetición. */
export function huellas(destinoId: string, lineas: LineaCartola[]): string[] {
  const vistos = new Map<string, number>();
  return lineas.map((l) => {
    const base = `${destinoId}|${l.fecha}|${l.monto}|${plano(l.detalle)}`;
    const n = vistos.get(base) ?? 0;
    vistos.set(base, n + 1);
    return `${base}|${n}`;
  });
}

const refKey = (r: RefApp) => `${r.tipo}:${r.id}`;

/** Ids de todo lo que existe en la app, por tipo (para saber si una ligazón sigue viva). */
function existentes(d: DatosImportar): Set<string> {
  const s = new Set<string>();
  for (const g of d.gastos) s.add(`gasto:${g.id}`);
  for (const m of d.movimientos) s.add(`movimiento:${m.id}`);
  for (const i of d.ingresos) s.add(`ingreso:${i.id}`);
  for (const p of d.pagosTarjeta) s.add(`pagoTarjeta:${p.id}`);
  for (const m of d.movAhorro) s.add(`movAhorro:${m.id}`);
  return s;
}

/** Importados que siguen valiendo: ignorados, o ligados/creados cuyo registro todavía existe. */
export function importadosVigentes(d: DatosImportar): Map<string, Importado> {
  const hay = existentes(d);
  return new Map(d.importados.filter((i) => i.estado === 'ignorado' || (i.refs ?? []).some((r) => hay.has(refKey(r)))).map((i) => [i.id, i]));
}

// ---------- Lo que ya está en la app ----------

const primerNombre = (p?: Persona) => p?.nombre.trim().split(/\s+/)[0] ?? 'Alguien';

export function registrosApp(dest: Destino, d: DatosImportar): RegistroApp[] {
  const medio = new Map(d.medios.map((m) => [m.id, m]));
  const persona = new Map(d.personas.map((p) => [p.id, p]));
  const out: RegistroApp[] = [];
  const gastoReg = (g: Gasto, signo: 1 | -1): RegistroApp => ({
    ref: { tipo: 'gasto', id: g.id },
    fecha: g.fecha,
    monto: signo * g.total,
    creado: g.creado,
    label: g.descripcion,
    aprendido: { tipo: 'gasto', descripcion: g.descripcion, categoriaId: g.categoriaId, medioId: g.medioId },
  });
  if (dest.tipo === 'tarjeta') {
    const id = dest.medio.id;
    for (const g of d.gastos) if (g.pagador === 'yo' && g.medioId === id) out.push(gastoReg(g, 1));
    for (const p of d.pagosTarjeta)
      if (p.medioId === id) out.push({ ref: { tipo: 'pagoTarjeta', id: p.id }, fecha: p.fecha, monto: -p.monto, creado: p.creado, label: 'Pago de la tarjeta', aprendido: { tipo: 'pagoTarjeta', medioId: id } });
    return out;
  }
  const c = dest.cuenta.id;
  for (const g of d.gastos) {
    const m = g.medioId ? medio.get(g.medioId) : undefined;
    if (g.pagador === 'yo' && m && m.tipo !== 'credito' && m.cuentaId === c) out.push(gastoReg(g, -1));
  }
  for (const m of d.movimientos) {
    if (m.tipo !== 'pago' && m.tipo !== 'abono') continue;
    // Un pago sin cuenta puede ligarse (pasa a entrar por esta cuenta). En efectivo, no.
    const sinCuenta = !m.cuentaId && !/efectivo/i.test(m.detalle);
    if (m.cuentaId !== c && !sinCuenta) continue;
    const quien = primerNombre(persona.get(m.personaId));
    out.push({
      ref: { tipo: 'movimiento', id: m.id },
      fecha: m.fecha,
      monto: m.tipo === 'pago' ? m.monto : -m.monto,
      creado: m.creado,
      label: m.tipo === 'pago' ? `${quien} te pagó` : `Le pagaste a ${quien}`,
      personaId: m.personaId,
      sinCuenta: sinCuenta || undefined,
      aprendido: { tipo: m.tipo, personaId: m.personaId },
    });
  }
  for (const i of d.ingresos) {
    if (i.cuentaId !== c && i.cuentaId) continue;
    out.push({
      ref: { tipo: 'ingreso', id: i.id },
      fecha: i.fecha,
      monto: i.monto,
      creado: i.creado,
      label: i.descripcion,
      sinCuenta: !i.cuentaId || undefined,
      aprendido: { tipo: 'ingreso', descripcion: i.recurrenteId ? undefined : i.descripcion, tipoIngreso: i.tipo },
    });
  }
  for (const p of d.pagosTarjeta)
    if (p.cuentaId === c)
      out.push({ ref: { tipo: 'pagoTarjeta', id: p.id }, fecha: p.fecha, monto: -p.monto, creado: p.creado, label: `Pago ${medio.get(p.medioId)?.nombre ?? 'tarjeta'}`, aprendido: { tipo: 'pagoTarjeta', medioId: p.medioId } });
  for (const m of d.movAhorro) {
    if (m.cuentaId !== c || m.ingresoId || m.tipo === 'cuadre') continue;
    const otra = m.traspasoId ? d.movAhorro.find((x) => x.traspasoId === m.traspasoId && x.id !== m.id)?.cuentaId : undefined;
    const traspaso = !!m.traspasoId || /^(traspaso|desde|retiro a|dep[oó]sito desde)/i.test(m.nota ?? '');
    out.push({
      ref: { tipo: 'movAhorro', id: m.id },
      fecha: m.fecha,
      monto: m.tipo === 'deposito' ? m.monto : -m.monto,
      creado: m.creado,
      label: m.nota || (m.tipo === 'deposito' ? 'Depósito' : 'Retiro'),
      aprendido: traspaso ? { tipo: 'traspaso', cuentaId: otra } : undefined,
    });
  }
  return out;
}

/** Desde cuándo la cuenta o tarjeta tiene registros en la app. */
export function inicioDestino(dest: Destino, d: DatosImportar): string | undefined {
  if (dest.tipo === 'cuenta') {
    const propios = d.movAhorro.filter((m) => m.cuentaId === dest.cuenta.id).sort(byDate);
    return propios[0]?.fecha;
  }
  const fechas = d.gastos.filter((g) => g.medioId === dest.medio.id).map((g) => g.fecha).sort();
  return fechas[0] ?? dest.medio.usoCuadrado?.fecha;
}

// ---------- Propuestas para lo nuevo ----------

const RE_COMISION = /\bpac\b|seguro|\bvida\b|comision|mantencion|impuesto|servicio administracion|interes(es)? (por|de) (sobregiro|mora)|cargo por/;
const RE_SUELDO = /remuneraci|sueldo|salario|honorario|liquidacion/;
const RE_PAGO_TARJETA = /tarjeta|t\.? ?credito|\btc\b|traspaso internet a t/;

/** ¿El detalle nombra al titular? ("TRANSF. FERNANDO ALONSO OSSAND" con titular "Fernando Alonso Ossandon Vargas"). */
export function esTitular(detalle: string, titular?: string): boolean {
  if (!titular) return false;
  const partes = plano(titular).split(' ').filter((w) => w.length >= 3);
  const palabras = plano(detalle).replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3);
  const calza = (t: string) => palabras.some((w) => w === t || (w.length >= 5 && t.startsWith(w)) || (t.length >= 5 && w.startsWith(t)));
  return partes.length >= 2 && calza(partes[0]) && partes.slice(1).filter(calza).length >= 1;
}

function categoriaComision(cats: Categoria[]): string | undefined {
  return cats.find((c) => !c.archivada && /seguro|comision/.test(plano(c.nombre)))?.id;
}

/** Tarjeta de crédito que se paga con este movimiento ("TRANSF A TARJETA CMR" → CMR Falabella). */
function tarjetaPagada(detalle: string, cuentaId: string, banco: string, medios: Medio[]): string | undefined {
  const credito = medios.filter((m) => m.tipo === 'credito' && !m.archivado);
  const t = plano(detalle);
  const porNombre = credito.filter((m) =>
    plano(`${m.nombre} ${m.nombreCorto ?? ''}`)
      .split(' ')
      .some((w) => w.length >= 3 && !['visa', 'mastercard', 'master', 'credito', 'tarjeta'].includes(w) && t.includes(w)),
  );
  if (porNombre.length === 1) return porNombre[0].id;
  const delBanco = credito.filter((m) => m.cuentaId === cuentaId && plano(m.nombre).includes(plano(banco)));
  if (delBanco.length === 1) return delBanco[0].id;
  const deLaCuenta = credito.filter((m) => m.cuentaId === cuentaId);
  return deLaCuenta.length === 1 ? deLaCuenta[0].id : undefined;
}

/** Medio con que se anota un gasto que sale de una cuenta: transferencia o débito ligado a ella. */
export function medioDeCuenta(detalle: string, cuentaId: string, medios: Medio[]): string | undefined {
  const ligados = medios.filter((m) => !m.archivado && m.tipo !== 'credito' && m.cuentaId === cuentaId);
  const transf = /transf|traspaso/.test(plano(detalle));
  return (ligados.find((m) => m.tipo === (transf ? 'transferencia' : 'debito')) ?? ligados.find((m) => m.tipo !== 'efectivo') ?? ligados[0])?.id;
}

interface Contexto {
  dest: Destino;
  cartola: Cartola;
  d: DatosImportar;
  aprendidos: Map<string, Aprendido>;
  /** Saldo con cada persona a medida que se proponen pagos (dos pagos de la misma persona en el archivo). */
  saldos: Map<string, number>;
}

/** Lo último que se hizo con este mismo detalle (en esta cuenta o tarjeta primero). */
function aprendidos(destinoId: string, importados: Importado[]): Map<string, Aprendido> {
  const out = new Map<string, Aprendido>();
  const orden = [...importados].sort((a, b) => (a.destinoId === destinoId ? 1 : 0) - (b.destinoId === destinoId ? 1 : 0) || a.creado.localeCompare(b.creado));
  for (const i of orden) if (i.aprendido) out.set(i.clave, i.aprendido);
  return out;
}

function propuestaPago(personaId: string, monto: number, cx: Contexto): { propuesta: Propuesta; motivo?: string } {
  const debe = cx.saldos.get(personaId) ?? 0;
  const p = cx.d.personas.find((x) => x.id === personaId);
  const quien = primerNombre(p);
  if (debe <= 0) return { propuesta: { tipo: 'ingreso', descripcion: `Transferencia de ${p?.nombre ?? quien}`, tipoIngreso: 'otro' }, motivo: `${quien} no te debía nada: se propone como ingreso` };
  const resto = monto > debe ? monto - debe : undefined;
  cx.saldos.set(personaId, Math.max(0, debe - monto));
  return { propuesta: { tipo: 'pago', personaId, resto }, motivo: resto ? `Te debía $${debe.toLocaleString('es-CL')}` : undefined };
}

function desdeAprendido(a: Aprendido, l: LineaCartola, cx: Contexto): { propuesta: Propuesta; motivo?: string } | undefined {
  const entra = l.monto > 0;
  const dest = cx.dest;
  const enTarjeta = dest.tipo === 'tarjeta';
  const motivo = 'Como la vez anterior';
  switch (a.tipo) {
    case 'gasto': {
      if (entra !== enTarjeta) return undefined;
      const medioId =
        dest.tipo === 'tarjeta'
          ? dest.medio.id
          : a.medioId && cx.d.medios.some((m) => m.id === a.medioId && m.tipo !== 'credito' && m.cuentaId === dest.cuenta.id)
            ? a.medioId
            : medioDeCuenta(l.detalle, dest.cuenta.id, cx.d.medios);
      return { propuesta: { tipo: 'gasto', descripcion: a.descripcion ?? descripcionDe(l.detalle), categoriaId: a.categoriaId, medioId, cuotas: l.cuotas }, motivo };
    }
    case 'pago':
      if (!entra || enTarjeta || !a.personaId) return undefined;
      return { ...propuestaPago(a.personaId, l.monto, cx), motivo };
    case 'abono':
      if (entra || enTarjeta || !a.personaId) return undefined;
      return { propuesta: { tipo: 'abono', personaId: a.personaId }, motivo };
    case 'ingreso':
      if (!entra || enTarjeta) return undefined;
      return { propuesta: { tipo: 'ingreso', descripcion: a.descripcion ?? descripcionDe(l.detalle), tipoIngreso: a.tipoIngreso ?? 'otro' }, motivo };
    case 'traspaso':
      if (enTarjeta) return undefined;
      return { propuesta: { tipo: 'traspaso', cuentaId: a.cuentaId }, motivo };
    case 'pagoTarjeta':
      if (entra) return undefined;
      return { propuesta: { tipo: 'pagoTarjeta', medioId: enTarjeta ? undefined : a.medioId }, motivo };
    case 'ignorar':
      return { propuesta: { tipo: 'ignorar' }, motivo };
  }
}

export function proponer(l: LineaCartola, cx: Contexto): { propuesta: Propuesta; motivo?: string } {
  const aprendido = cx.aprendidos.get(claveDetalle(l.detalle));
  const previo = aprendido && desdeAprendido(aprendido, l, cx);
  if (previo) return previo;
  const t = plano(l.detalle);
  const { d } = cx;
  const descripcion = descripcionDe(l.detalle);
  const categoria = () => (RE_COMISION.test(t) ? categoriaComision(d.categorias) : undefined) ?? sugerirCategoria(descripcion, d.gastos, d.categorias);
  if (cx.dest.tipo === 'tarjeta') {
    if (l.monto < 0) return { propuesta: { tipo: 'pagoTarjeta' } };
    return { propuesta: { tipo: 'gasto', descripcion, categoriaId: categoria(), medioId: cx.dest.medio.id, cuotas: l.cuotas } };
  }
  const cuentaId = cx.dest.cuenta.id;
  const titular = esTitular(l.detalle, cx.cartola.titular);
  if (l.monto > 0) {
    if (titular) return { propuesta: { tipo: 'traspaso' }, motivo: 'Viene de otra cuenta tuya' };
    if (RE_SUELDO.test(t)) {
      const rec = d.recurrentes.find((r) => r.activo && r.tipo === 'ingreso' && r.cuentaId === cuentaId) ?? d.recurrentes.find((r) => r.activo && r.tipo === 'ingreso');
      return { propuesta: { tipo: 'ingreso', descripcion: rec?.nombre ?? 'Sueldo', tipoIngreso: 'sueldo', recurrenteId: rec?.id } };
    }
    const pid = reconocerPersona(l.detalle, d.personas);
    if (pid) return propuestaPago(pid, l.monto, cx);
    return { propuesta: { tipo: 'ingreso', descripcion, tipoIngreso: 'otro' } };
  }
  if (RE_PAGO_TARJETA.test(t) && !/transf a (?!tarjeta)/.test(t)) return { propuesta: { tipo: 'pagoTarjeta', medioId: tarjetaPagada(l.detalle, cuentaId, cx.cartola.banco, d.medios) } };
  if (titular) return { propuesta: { tipo: 'traspaso' }, motivo: 'Va a otra cuenta tuya' };
  const pid = reconocerPersona(l.detalle, d.personas);
  if (pid && (cx.saldos.get(pid) ?? 0) < 0) return { propuesta: { tipo: 'abono', personaId: pid }, motivo: `Le debías a ${primerNombre(d.personas.find((p) => p.id === pid))}` };
  return { propuesta: { tipo: 'gasto', descripcion, categoriaId: categoria(), medioId: medioDeCuenta(l.detalle, cuentaId, d.medios) } };
}

// ---------- Cruce ----------

/** Ventana de días para considerar que algo es lo mismo (los bancos tardan en procesar; los pagos se anotan tarde). */
function ventana(r: RegistroApp, nombrada: boolean): number {
  if (r.ref.tipo === 'gasto') return 3;
  if (nombrada) return 10;
  if (r.ref.tipo === 'pagoTarjeta') return 6;
  return 5;
}

const palabras = (s: string) => new Set(plano(s).replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length >= 4));
const compartenPalabra = (a: string, b: string) => {
  const pb = palabras(b);
  return [...palabras(a)].some((w) => pb.has(w) || [...pb].some((x) => x.startsWith(w) || w.startsWith(x)));
};

/**
 * Personas que el detalle nombra, con un criterio más suelto que al proponer: "Edward" calza con "EDWARDS",
 * "Eli" con "ELIANA". Sirve para no ligar el pago de una persona con la transferencia de otra.
 */
export function personasNombradas(detalle: string, personas: Persona[]): Set<string> {
  const ws = plano(detalle).replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3);
  const out = new Set<string>();
  const exacta = reconocerPersona(detalle, personas);
  if (exacta) out.add(exacta);
  for (const p of personas) {
    const t = plano(p.nombre).split(' ')[0] ?? '';
    if (t.length >= 3 && ws.some((w) => w.startsWith(t) || (t.length >= 4 && w.length >= 4 && t.startsWith(w)))) out.add(p.id);
  }
  return out;
}

function combinaciones<T>(xs: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (xs.length < k) return [];
  const [x, ...rest] = xs;
  return [...combinaciones(rest, k - 1).map((c) => [x, ...c]), ...combinaciones(rest, k)];
}

export interface OpcionesRevision {
  /** Procesar también los movimientos anteriores al inicio de la cuenta o tarjeta. */
  incluirAnteriores?: boolean;
}

export function revisar(cartola: Cartola, dest: Destino, d: DatosImportar, op: OpcionesRevision = {}): Revision {
  const destinoId = idDestino(dest);
  const hs = huellas(destinoId, cartola.lineas);
  const vigentes = importadosVigentes(d);
  // Lo que ya está ligado a otro movimiento de esta cuenta o tarjeta no se vuelve a usar. (El pago de una tarjeta
  // aparece en la cartola de la cuenta y en la de la tarjeta: es el mismo registro, ligado una vez en cada una.)
  const tomados = new Set([...vigentes.values()].filter((i) => i.destinoId === destinoId).flatMap((i) => (i.refs ?? []).map(refKey)));
  const todos = registrosApp(dest, d);
  const libres = todos.filter((r) => !tomados.has(refKey(r.ref)));
  const usados = new Set<string>();
  const inicio = inicioDestino(dest, d);
  let saldoInicial: Revision['saldoInicial'];
  if (!inicio && dest.tipo === 'cuenta' && cartola.lineas[0]?.saldo !== undefined) {
    const p = cartola.lineas[0];
    saldoInicial = { fecha: sumarDias(p.fecha, -1), monto: p.saldo! - p.monto };
  }
  const cx: Contexto = { dest, cartola, d, aprendidos: aprendidos(destinoId, d.importados), saldos: new Map(d.saldoPersona) };

  const items: ItemCartola[] = cartola.lineas.map((linea, i) => {
    const huella = hs[i];
    if (vigentes.has(huella)) return { huella, linea, grupo: 'importado', propuesta: { tipo: 'ignorar' } };
    const anterior = !op.incluirAnteriores && inicio && (dest.tipo === 'cuenta' ? linea.fecha <= inicio : linea.fecha < inicio);
    if (anterior) return { huella, linea, grupo: 'anterior', propuesta: { tipo: 'ignorar' } };
    return { huella, linea, grupo: 'nuevo', propuesta: { tipo: 'ignorar' } };
  });
  const nombradas = new Map(items.map((x) => [x.huella, personasNombradas(x.linea.detalle, d.personas)]));
  const porCruzar = () => items.filter((x) => x.grupo === 'nuevo');
  const nombrado = (x: ItemCartola, r: RegistroApp) => !!r.personaId && nombradas.get(x.huella)!.has(r.personaId);
  /** Si el detalle nombra a alguien, no se liga con pagos de otra persona. */
  const candidatos = (x: ItemCartola) => {
    const n = nombradas.get(x.huella)!;
    return libres.filter(
      (r) =>
        !usados.has(refKey(r.ref)) &&
        Math.sign(r.monto) === Math.sign(x.linea.monto) &&
        !(r.personaId && n.size && !n.has(r.personaId)) &&
        Math.abs(daysBetween(r.fecha, x.linea.fecha)) <= ventana(r, nombrado(x, r)),
    );
  };
  // Primero la persona nombrada en el detalle, después el mismo comercio, después la fecha más cercana.
  const cercania = (x: ItemCartola) => {
    const desc = descripcionDe(x.linea.detalle);
    const f = x.linea.fecha;
    return (a: RegistroApp, b: RegistroApp) =>
      Number(nombrado(x, b)) - Number(nombrado(x, a)) ||
      Number(compartenPalabra(desc, b.label)) - Number(compartenPalabra(desc, a.label)) ||
      Math.abs(daysBetween(a.fecha, f)) - Math.abs(daysBetween(b.fecha, f)) ||
      a.creado.localeCompare(b.creado);
  };
  const tomar = (x: ItemCartola, grupo: 'coincide' | 'parecido', rs: RegistroApp[]) => {
    x.grupo = grupo;
    x.app = rs;
    for (const r of rs) usados.add(refKey(r.ref));
  };

  // 1) Mismo monto (primero los que nombran a alguien, que son más seguros).
  const primeroNombrados = () => porCruzar().sort((a, b) => nombradas.get(b.huella)!.size - nombradas.get(a.huella)!.size || a.linea.orden - b.linea.orden);
  for (const x of primeroNombrados()) {
    const c = candidatos(x).filter((r) => r.monto === x.linea.monto).sort(cercania(x));
    if (c[0]) tomar(x, 'coincide', [c[0]]);
  }
  // 2) Varios registros que suman lo mismo: una compra anotada en partes, o una transferencia que pagó dos deudas.
  for (const x of porCruzar()) {
    const n = nombradas.get(x.huella)!;
    const c = candidatos(x)
      .filter((r) => (r.ref.tipo === 'gasto' || (r.personaId && n.has(r.personaId))) && Math.abs(r.monto) < Math.abs(x.linea.monto))
      .sort(cercania(x))
      .slice(0, 10);
    let elegido: RegistroApp[] | undefined;
    let exacto = false;
    for (const k of [2, 3]) {
      for (const combo of combinaciones(c, k)) {
        // Todos del mismo tipo (gastos con gastos; pagos de la misma persona).
        if (new Set(combo.map((r) => r.personaId ?? r.ref.tipo)).size > 1) continue;
        const suma = combo.reduce((s, r) => s + r.monto, 0);
        if (suma === x.linea.monto) {
          elegido = combo;
          exacto = true;
          break;
        }
        if (!elegido && Math.abs(suma - x.linea.monto) <= Math.abs(x.linea.monto) * 0.02) elegido = combo;
      }
      if (exacto) break;
    }
    if (elegido) tomar(x, exacto ? 'coincide' : 'parecido', elegido);
  }
  // 3) Parecidos: otro monto, pero la misma persona o el mismo comercio en fechas cercanas.
  for (const x of primeroNombrados()) {
    const l = x.linea;
    const ap = cx.aprendidos.get(claveDetalle(l.detalle));
    const c = candidatos(x)
      .filter((r) => {
        const dif = Math.abs(r.monto - l.monto);
        const rel = dif / Math.abs(l.monto);
        // La persona nombrada (o la de la vez anterior) puede haber pagado bastante distinto; si no, solo pesos sueltos.
        if (r.personaId && (nombrado(x, r) || ap?.personaId === r.personaId)) return rel <= 0.6;
        if (r.ref.tipo === 'gasto') return Math.abs(daysBetween(r.fecha, l.fecha)) <= 1 && rel <= 0.15 && (rel <= 0.05 || compartenPalabra(descripcionDe(l.detalle), r.label));
        return rel <= 0.15 || dif <= 150;
      })
      .sort((a, b) => Number(nombrado(x, b)) - Number(nombrado(x, a)) || Math.abs(a.monto - l.monto) - Math.abs(b.monto - l.monto) || cercania(x)(a, b));
    if (c[0]) tomar(x, 'parecido', [c[0]]);
  }
  // 4) Lo que queda es nuevo: se propone cómo anotarlo.
  for (const x of items) {
    if (x.grupo === 'nuevo') {
      const p = proponer(x.linea, cx);
      x.propuesta = p.propuesta;
      x.motivo = p.motivo;
    } else if (x.grupo === 'parecido' || x.grupo === 'coincide') {
      // Si al final no es lo mismo ("son distintos"), esto es lo que se anotaría.
      x.propuesta = proponer(x.linea, { ...cx, saldos: new Map(d.saldoPersona) }).propuesta;
    }
  }

  // "Solo en la app": dentro de las fechas que cubre el archivo. El primer y el último día quedan fuera
  // (el banco corta a mitad de día o por fecha de facturación: eso puede estar en el archivo anterior o el siguiente).
  const { desde, hasta } = cartola.cobertura;
  const soloApp = libres
    .filter((r) => !usados.has(refKey(r.ref)) && !r.sinCuenta && r.fecha > desde && r.fecha < hasta && (!inicio || (dest.tipo === 'cuenta' ? r.fecha > inicio : r.fecha >= inicio)))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { cartola, destino: dest, items, soloApp, inicio, saldoInicial };
}

// ---------- Decisiones y su efecto en el saldo ----------

/**
 * - ligar: coincide, queda tal cual;
 * - banco: parecido, manda el monto del banco (se corrige lo de la app);
 * - app: parecido, queda el monto de la app;
 * - nuevo: se anota la propuesta (también si un parecido resulta ser otra cosa).
 */
export type Accion = 'ligar' | 'banco' | 'app' | 'nuevo';

export interface Decision {
  accion: Accion;
  propuesta: Propuesta;
}

export interface Decisiones {
  items: Record<string, Decision>;
  /** Solo en la app: los que se borran (clave del registro). */
  borrar: Set<string>;
}

/** Diferencia de pesos sueltos: por defecto queda lo de la app. Si es más, manda el banco. */
export const diferenciaChica = (banco: number, app: number) => Math.abs(banco - app) <= Math.max(100, Math.abs(banco) * 0.01);

export const sumaApp = (x: ItemCartola) => (x.app ?? []).reduce((s, a) => s + a.monto, 0);

export function decisionesIniciales(r: Revision): Decisiones {
  const items: Record<string, Decision> = {};
  for (const x of r.items) {
    if (x.grupo === 'coincide') items[x.huella] = { accion: 'ligar', propuesta: x.propuesta };
    else if (x.grupo === 'parecido') items[x.huella] = { accion: diferenciaChica(x.linea.monto, sumaApp(x)) ? 'app' : 'banco', propuesta: x.propuesta };
    else if (x.grupo === 'nuevo') items[x.huella] = { accion: 'nuevo', propuesta: x.propuesta };
  }
  return { items, borrar: new Set() };
}

export const claveRef = refKey;

/**
 * Pagos, ingresos, traspasos y pagos de tarjeta quedan con la fecha del banco (el día que se movió la plata).
 * Los gastos conservan la suya. El pago de una tarjeta toma la fecha de la cuenta de donde salió, no la de la tarjeta.
 */
export const tomaFechaBanco = (r: RegistroApp, dest: Destino) => r.ref.tipo !== 'gasto' && !(r.ref.tipo === 'pagoTarjeta' && dest.tipo === 'tarjeta');

/** Cómo queda un registro ligado. */
export interface Cambio {
  reg: RegistroApp;
  monto: number;
  fecha: string;
}

/** Monto y fecha con que queda cada registro ligado a la línea, según la decisión. */
export function cambiosLigados(x: ItemCartola, accion: Accion, dest: Destino): Cambio[] {
  const app = x.app ?? [];
  if (accion === 'nuevo' || !app.length) return [];
  const cambios = app.map((reg) => ({ reg, monto: reg.monto, fecha: tomaFechaBanco(reg, dest) ? x.linea.fecha : reg.fecha }));
  if (accion === 'banco') {
    // La diferencia va al registro más grande (una compra anotada en partes).
    const dif = x.linea.monto - sumaApp(x);
    const mayor = cambios.reduce((a, b) => (Math.abs(b.monto) > Math.abs(a.monto) ? b : a));
    mayor.monto += dif;
  }
  return cambios;
}

/**
 * Parecido de un pago con "manda el banco": si te pagaron más de lo que te debían, el pago salda la deuda
 * y el resto se anota como ingreso suelto (como con Boba).
 */
export function restoPago(x: ItemCartola, accion: Accion, saldoPersona: Map<string, number>): number | undefined {
  const reg = x.app?.[0];
  if (accion !== 'banco' || x.app?.length !== 1 || !reg || reg.ref.tipo !== 'movimiento' || !reg.personaId || reg.monto <= 0) return undefined;
  const debia = (saldoPersona.get(reg.personaId) ?? 0) + reg.monto;
  return debia > 0 && x.linea.monto > debia ? x.linea.monto - debia : undefined;
}

/** ¿Lo propuesto mueve esta cuenta o tarjeta? (un gasto con otro medio, o "ignorar", no). */
function propuestaMueve(p: Propuesta, dest: Destino, medios: Medio[]): boolean {
  if (p.tipo === 'ignorar') return false;
  if (dest.tipo === 'tarjeta') return p.tipo === 'gasto' || p.tipo === 'pagoTarjeta';
  if (p.tipo === 'gasto') {
    if (!p.medioId) return true; // se anota con el débito o la transferencia de la cuenta (se crea si falta)
    const m = medios.find((x) => x.id === p.medioId);
    return !!m && m.tipo !== 'credito' && m.cuentaId === dest.cuenta.id;
  }
  return true;
}

/** Cambio en el saldo de la cuenta (o en las compras de la tarjeta) que dejarían las decisiones. */
export interface Efecto {
  fecha: string;
  monto: number;
  creado: string;
  /** Tarjeta: es una compra (no un pago). */
  compra?: boolean;
}

/** Marca de registro para lo que se anota al importar: el mediodía de ese día, en el orden del archivo. */
export const creadoImportado = (fecha: string, orden: number) => new Date(new Date(`${fecha}T12:00:00-03:00`).getTime() + orden).toISOString();

export function efectos(r: Revision, dec: Decisiones, medios: Medio[]): Efecto[] {
  const out: Efecto[] = [];
  for (const x of r.items) {
    const dcs = dec.items[x.huella];
    if (!dcs) continue;
    if (dcs.accion === 'nuevo') {
      if (propuestaMueve(dcs.propuesta, r.destino, medios))
        out.push({ fecha: x.linea.fecha, monto: x.linea.monto, creado: creadoImportado(x.linea.fecha, x.linea.orden), compra: dcs.propuesta.tipo === 'gasto' });
      continue;
    }
    for (const c of cambiosLigados(x, dcs.accion, r.destino)) {
      const compra = c.reg.ref.tipo === 'gasto';
      if (!c.reg.sinCuenta) {
        if (c.monto === c.reg.monto && c.fecha === c.reg.fecha) continue;
        out.push({ fecha: c.reg.fecha, monto: -c.reg.monto, creado: c.reg.creado, compra });
      }
      out.push({ fecha: c.fecha, monto: c.monto, creado: c.reg.creado, compra });
    }
  }
  for (const a of r.soloApp) if (dec.borrar.has(refKey(a.ref))) out.push({ fecha: a.fecha, monto: -a.monto, creado: a.creado, compra: a.ref.tipo === 'gasto' });
  return out.filter((e) => e.monto !== 0);
}

/** Los efectos como movimientos de la cuenta, para sumarlos a `movCuentas` y estimar el saldo. */
export function efectosComoMovs(cuentaId: string, ef: Efecto[], r?: Revision): MovAhorro[] {
  const movs: MovAhorro[] = ef.map((e, i) => ({ id: `sim:${i}`, cuentaId, tipo: e.monto > 0 ? 'deposito' : 'retiro', monto: Math.abs(e.monto), fecha: e.fecha, creado: e.creado }));
  if (r?.saldoInicial) movs.push({ id: 'sim:inicial', cuentaId, tipo: 'cuadre', monto: r.saldoInicial.monto, fecha: r.saldoInicial.fecha, creado: `${r.saldoInicial.fecha}T00:00:00.000Z` });
  return movs;
}

// ---------- Comparación ----------

/**
 * Para comparar con el banco, los gastos ligados cuentan el día que el banco los registró (una compra con débito
 * de la noche aparece al día siguiente en la cartola). No cambia nada en la app: solo evita diferencias de un día.
 */
export function alineacion(r: Revision, dec: Decisiones | undefined, d: Pick<DatosImportar, 'gastos' | 'importados'>): Efecto[] {
  const signo = r.destino.tipo === 'cuenta' ? -1 : 1;
  const destinoId = idDestino(r.destino);
  const gasto = new Map(d.gastos.map((g) => [g.id, g]));
  const out: Efecto[] = [];
  const mover = (id: string, fechaBanco: string) => {
    const g = gasto.get(id);
    if (!g || g.fecha === fechaBanco) return;
    out.push({ fecha: g.fecha, monto: -signo * g.total, creado: g.creado, compra: true });
    out.push({ fecha: fechaBanco, monto: signo * g.total, creado: g.creado, compra: true });
  };
  for (const i of d.importados) if (i.destinoId === destinoId && i.estado !== 'ignorado') for (const ref of i.refs ?? []) if (ref.tipo === 'gasto') mover(ref.id, i.fecha);
  if (dec)
    for (const x of r.items) {
      const a = dec.items[x.huella]?.accion;
      if (a === 'ligar' || a === 'app' || a === 'banco') for (const reg of x.app ?? []) if (reg.ref.tipo === 'gasto') mover(reg.ref.id, x.linea.fecha);
    }
  return out;
}

export interface DiaComparado {
  fecha: string;
  banco: number;
  app: number;
  /** banco − app. */
  dif: number;
  lineas: LineaCartola[];
}

/**
 * Cuenta: saldo al final de cada día según el banco y según la app, desde que la cuenta parte en la app.
 * `saldoApp(fecha)` es el saldo estimado de la app (con las decisiones aplicadas o simuladas).
 */
export function compararSaldos(c: Cartola, desde: string | undefined, saldoApp: (fecha: string) => number): DiaComparado[] {
  const dias = new Map<string, LineaCartola[]>();
  for (const l of c.lineas) if (!desde || l.fecha >= desde) dias.set(l.fecha, [...(dias.get(l.fecha) ?? []), l]);
  const out: DiaComparado[] = [];
  for (const [fecha, lineas] of dias) {
    const ultima = lineas[lineas.length - 1];
    if (ultima.saldo === undefined) continue;
    const app = saldoApp(fecha);
    out.push({ fecha, banco: ultima.saldo, app, dif: ultima.saldo - app, lineas });
  }
  return out;
}

export interface ComprasComparadas {
  desde: string;
  hasta: string;
  banco: number;
  app: number;
  dif: number;
  /** Días en que no calzan (si una compra quedó un día corrida, aparece dos veces con signo contrario). */
  dias: DiaComparado[];
}

/**
 * Tarjeta: compras del banco y de la app entre las fechas que cubre el archivo, sin el primer ni el último día
 * (el corte de facturación los deja a medias). Lo anterior al inicio de la tarjeta en la app no cuenta.
 */
export function compararCompras(r: Revision, registros: RegistroApp[], ef: Efecto[]): ComprasComparadas | undefined {
  const { cobertura } = r.cartola;
  const desde = r.inicio && sumarDias(r.inicio, -1) > cobertura.desde ? sumarDias(r.inicio, -1) : cobertura.desde;
  const dentro = (f: string) => f > desde && f < cobertura.hasta;
  const fechas = new Set<string>();
  const banco = new Map<string, number>();
  const lineas = new Map<string, LineaCartola[]>();
  for (const l of r.cartola.lineas)
    if (l.monto > 0 && dentro(l.fecha) && !l.cuotas) {
      fechas.add(l.fecha);
      banco.set(l.fecha, (banco.get(l.fecha) ?? 0) + l.monto);
      lineas.set(l.fecha, [...(lineas.get(l.fecha) ?? []), l]);
    }
  const app = new Map<string, number>();
  for (const g of registros) if (g.ref.tipo === 'gasto' && dentro(g.fecha)) app.set(g.fecha, (app.get(g.fecha) ?? 0) + g.monto);
  for (const e of ef) if (e.compra && dentro(e.fecha)) app.set(e.fecha, (app.get(e.fecha) ?? 0) + e.monto);
  for (const f of app.keys()) fechas.add(f);
  if (!fechas.size) return undefined;
  const dias = [...fechas].sort().map((fecha) => {
    const b = banco.get(fecha) ?? 0;
    const a = app.get(fecha) ?? 0;
    return { fecha, banco: b, app: a, dif: b - a, lineas: lineas.get(fecha) ?? [] };
  });
  const tb = dias.reduce((s, x) => s + x.banco, 0);
  const ta = dias.reduce((s, x) => s + x.app, 0);
  return { desde: sumarDias(desde, 1), hasta: sumarDias(cobertura.hasta, -1), banco: tb, app: ta, dif: tb - ta, dias: dias.filter((x) => x.dif) };
}
