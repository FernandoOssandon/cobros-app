// Pagos de tarjetas de crédito.
import { marca } from './ahorros';
import { db, uid, type PagoTarjeta } from './db';
import { todayISO } from './lib/format';

export async function pagarTarjeta(medioId: string, monto: number, cuentaId?: string, fecha = todayISO()): Promise<string> {
  const id = uid();
  await db.pagosTarjeta.add({ id, medioId, cuentaId, monto: Math.round(monto), fecha, creado: marca() });
  return id;
}

export async function borrarPagoTarjeta(id: string): Promise<PagoTarjeta | undefined> {
  const p = await db.pagosTarjeta.get(id);
  await db.pagosTarjeta.delete(id);
  return p;
}

/** Fija lo usado según el banco hoy (cuadre de la tarjeta). */
export const cuadrarTarjeta = (medioId: string, monto: number, fecha = todayISO()) =>
  db.medios.update(medioId, { usoCuadrado: { monto: Math.max(0, Math.round(monto)), fecha, creado: marca() } });
