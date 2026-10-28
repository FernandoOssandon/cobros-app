// Operaciones de "Mi plata": cuentas de ahorro, depósitos a plazo y sus movimientos.
import { MEDIO_COLORS, db, now, uid, type Cuenta, type DatosDap, type MovAhorro } from './db';
import { alVencerDap } from './lib/ahorro';
import { todayISO } from './lib/format';
import { sumarDias } from './lib/recurrence';

/**
 * Marca de tiempo estrictamente creciente para los movimientos de ahorro: dentro de un mismo día,
 * el orden de registro decide si un cuadre va antes o después de un depósito.
 */
let ultimaMarca = 0;
const marca = () => {
  ultimaMarca = Math.max(Date.now(), ultimaMarca + 1);
  return new Date(ultimaMarca).toISOString();
};

export type CuentaDraft = Omit<Cuenta, 'id' | 'creado' | 'orden' | 'archivada' | 'color'> & Partial<Pick<Cuenta, 'id' | 'archivada' | 'color'>>;

/**
 * Crea o actualiza una cuenta. Al crearla, `saldoInicial` queda como primer cuadre (el punto de partida).
 * Para un DAP el saldo sale de sus datos, así que no lleva cuadre.
 */
export async function guardarCuenta(c: CuentaDraft, saldoInicial?: number, fecha = todayISO()): Promise<string> {
  const prev = c.id ? await db.cuentas.get(c.id) : undefined;
  const id = c.id ?? uid();
  const n = await db.cuentas.count();
  await db.transaction('rw', db.cuentas, db.movAhorro, async () => {
    await db.cuentas.put({
      archivada: false,
      color: MEDIO_COLORS[n % MEDIO_COLORS.length],
      ...prev,
      ...c,
      nombre: c.nombre.trim(),
      id,
      orden: prev?.orden ?? n + 1,
      creado: prev?.creado ?? now(),
    });
    if (!prev && c.tipo !== 'dap' && saldoInicial !== undefined) {
      await db.movAhorro.add({ id: uid(), cuentaId: id, tipo: 'cuadre', monto: saldoInicial, fecha, creado: marca() });
    }
  });
  return id;
}

/** Registra un depósito, un retiro o un cuadre (saldo real). */
export async function registrarMovAhorro(cuentaId: string, tipo: MovAhorro['tipo'], monto: number, fecha = todayISO(), nota?: string) {
  const id = uid();
  await db.movAhorro.add({ id, cuentaId, tipo, monto: Math.max(0, Math.round(monto)), fecha, nota, creado: marca() });
  return id;
}

export const cuadrar = (cuentaId: string, saldoReal: number, fecha = todayISO()) => registrarMovAhorro(cuentaId, 'cuadre', saldoReal, fecha);

export async function borrarMovAhorro(id: string): Promise<MovAhorro | undefined> {
  const m = await db.movAhorro.get(id);
  await db.movAhorro.delete(id);
  return m;
}

/**
 * Depositar o retirar plata de una cuenta, moviéndola desde/hacia otra (cuenta vista o efectivo).
 * Sin `otraId`, la plata viene de (o va a) un lugar que la app no lleva.
 */
export async function moverPlata(cuentaId: string, modo: 'deposito' | 'retiro', monto: number, otraId?: string, fecha = todayISO()) {
  await db.transaction('rw', db.cuentas, db.movAhorro, async () => {
    const [c, o] = await Promise.all([db.cuentas.get(cuentaId), otraId ? db.cuentas.get(otraId) : undefined]);
    if (!c) return;
    if (modo === 'deposito') {
      await registrarMovAhorro(cuentaId, 'deposito', monto, fecha, o ? `Depósito desde ${o.nombre}` : 'Depósito');
      if (o) await registrarMovAhorro(o.id, 'retiro', monto, fecha, `Traspaso a ${c.nombre}`);
    } else {
      await registrarMovAhorro(cuentaId, 'retiro', monto, fecha, o ? `Retiro a ${o.nombre}` : 'Retiro');
      if (o) await registrarMovAhorro(o.id, 'deposito', monto, fecha, `Desde ${c.nombre}`);
    }
  });
}

/** Traspaso entre dos cuentas (ej. de la cuenta vista a Mercado Pago). */
export const traspasar = (desdeId: string, haciaId: string, monto: number, fecha = todayISO()) => moverPlata(haciaId, 'deposito', monto, desdeId, fecha);

export const ID_EFECTIVO = 'cuenta-efectivo';

/** La cuenta "Efectivo" (la billetera). Se crea la primera vez que se necesita. */
export async function asegurarEfectivo(): Promise<string> {
  const c = await db.cuentas.get(ID_EFECTIVO);
  if (c && !c.archivada) return c.id;
  if (c) await db.cuentas.update(ID_EFECTIVO, { archivada: false });
  else await db.cuentas.put({ id: ID_EFECTIVO, nombre: 'Efectivo', tipo: 'efectivo', color: '#9EC9FF', archivada: false, orden: 0, creado: now() });
  return ID_EFECTIVO;
}

/** Quita una cuenta: si tiene historial se archiva (deja de sumar al patrimonio); si no, se borra. */
export async function quitarCuenta(id: string) {
  const n = await db.movAhorro.where('cuentaId').equals(id).count();
  const c = await db.cuentas.get(id);
  if (n || c?.tipo === 'dap') await db.cuentas.update(id, { archivada: true });
  else await db.cuentas.delete(id);
}

/**
 * Cobra un DAP vencido: queda como 'cobrado' (deja de sumar) y, si se indica, el monto final se deposita en otra cuenta.
 */
export async function cobrarDap(id: string, destinoId?: string, fecha = todayISO()) {
  await db.transaction('rw', db.cuentas, db.movAhorro, async () => {
    const c = await db.cuentas.get(id);
    if (!c?.dap) return;
    await db.cuentas.update(id, { dap: { ...c.dap, estado: 'cobrado' }, archivada: true });
    if (destinoId) await registrarMovAhorro(destinoId, 'deposito', alVencerDap(c.dap), fecha, `Depósito a plazo ${c.nombre}`);
  });
}

/** Renueva un DAP: el anterior queda cobrado y se crea uno nuevo con el monto final como capital. */
export async function renovarDap(id: string, nuevo: Pick<DatosDap, 'tasa30' | 'vencimiento'> & { montoFinal?: number }): Promise<string | undefined> {
  return db.transaction('rw', db.cuentas, db.movAhorro, async () => {
    const c = await db.cuentas.get(id);
    if (!c?.dap) return undefined;
    await db.cuentas.update(id, { dap: { ...c.dap, estado: 'cobrado' }, archivada: true });
    const inicio = c.dap.vencimiento;
    return guardarCuenta({
      nombre: c.nombre,
      tipo: 'dap',
      institucion: c.institucion,
      color: c.color,
      dap: { monto: alVencerDap(c.dap), tasa30: nuevo.tasa30, inicio, vencimiento: nuevo.vencimiento, montoFinal: nuevo.montoFinal, estado: 'vigente', renovar: c.dap.renovar },
    });
  });
}

/**
 * Al abrir la app: los depósitos a plazo vencidos que se renuevan solos se renuevan por el mismo plazo
 * (con capital + intereses), las veces que haga falta. Devuelve cuántas renovaciones hizo.
 */
export async function renovarVencidos(hoy = todayISO()): Promise<number> {
  let n = 0;
  for (let vuelta = 0; vuelta < 50; vuelta++) {
    const vencidos = (await db.cuentas.toArray()).filter((c) => c.tipo === 'dap' && !c.archivada && c.dap?.estado === 'vigente' && c.dap.renovar && c.dap.vencimiento <= hoy);
    if (!vencidos.length) break;
    for (const c of vencidos) {
      const d = c.dap!;
      const plazo = Math.max(1, Math.round((new Date(d.vencimiento).getTime() - new Date(d.inicio).getTime()) / 86_400_000));
      await renovarDap(c.id, { tasa30: d.tasa30, vencimiento: sumarDias(d.vencimiento, plazo) });
      n++;
    }
  }
  return n;
}
