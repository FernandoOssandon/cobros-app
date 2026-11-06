// Ingresos: el sueldo y otra plata que entra. Si el ingreso tiene cuenta, se deposita en ella (Mi plata),
// así el saldo estimado de la Cuenta RUT sube solo cuando llega el sueldo.
import { ID_EFECTIVO, marca } from './ahorros';
import { db, now, uid, type Cuenta, type Ingreso, type MovAhorro } from './db';

export type IngresoDraft = Omit<Ingreso, 'id' | 'creado'> & Partial<Pick<Ingreso, 'id'>>;

/** Crea o actualiza un ingreso y su depósito en la cuenta (si la tiene). Devuelve el id. */
export async function guardarIngreso(d: IngresoDraft): Promise<string> {
  const id = d.id ?? uid();
  await db.transaction('rw', db.ingresos, db.movAhorro, async () => {
    const prev = await db.ingresos.get(id);
    const ingreso: Ingreso = { ...d, descripcion: d.descripcion.trim() || (d.tipo === 'sueldo' ? 'Sueldo' : 'Ingreso'), monto: Math.max(0, Math.round(d.monto)), id, creado: prev?.creado ?? now() };
    await db.ingresos.put(ingreso);
    // El depósito se rehace siempre (si cambió el monto, la fecha o la cuenta).
    const previos = (await db.movAhorro.toArray()).filter((m) => m.ingresoId === id);
    await db.movAhorro.bulkDelete(previos.map((m) => m.id));
    if (ingreso.cuentaId && ingreso.monto > 0) {
      await db.movAhorro.add({
        id: previos[0]?.id ?? uid(),
        cuentaId: ingreso.cuentaId,
        tipo: 'deposito',
        monto: ingreso.monto,
        fecha: ingreso.fecha,
        nota: ingreso.descripcion,
        ingresoId: id,
        creado: previos[0]?.creado ?? marca(),
      });
    }
  });
  return id;
}

export interface IngresoBorrado {
  ingreso: Ingreso;
  movs: MovAhorro[];
}

/** Borra el ingreso y su depósito. Devuelve una copia para deshacer. */
export async function borrarIngreso(id: string): Promise<IngresoBorrado | undefined> {
  return db.transaction('rw', db.ingresos, db.movAhorro, async () => {
    const ingreso = await db.ingresos.get(id);
    if (!ingreso) return undefined;
    const movs = (await db.movAhorro.toArray()).filter((m) => m.ingresoId === id);
    await db.movAhorro.bulkDelete(movs.map((m) => m.id));
    await db.ingresos.delete(id);
    return { ingreso, movs };
  });
}

export async function restaurarIngreso(s: IngresoBorrado) {
  await db.transaction('rw', db.ingresos, db.movAhorro, async () => {
    await db.ingresos.put(s.ingreso);
    await db.movAhorro.bulkPut(s.movs);
  });
}

/** El sueldo se reconoce por el nombre ("Sueldo", "Remuneración", "Salario", "Honorarios"). */
export const tipoPorNombre = (nombre: string): Ingreso['tipo'] => (/sueldo|remuneraci|salario|honorario|liquidaci/i.test(nombre) ? 'sueldo' : 'otro');

/** Cuentas donde puede llegar la plata: cuentas vista y remuneradas, más el efectivo. */
export function cuentasDestino(cuentas: Cuenta[]): { id: string; nombre: string }[] {
  const lista = cuentas.filter((c) => !c.archivada && !c.moneda && (c.tipo === 'vista' || c.tipo === 'remunerada'));
  const orden = (c: Cuenta) => (c.tipo === 'vista' ? 0 : 1);
  return [...lista.sort((a, b) => orden(a) - orden(b) || a.orden - b.orden), { id: ID_EFECTIVO, nombre: 'Efectivo' } as Cuenta].map((c) => ({ id: c.id, nombre: c.nombre }));
}
