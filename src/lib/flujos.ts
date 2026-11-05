// Lo que mueve el saldo de tus cuentas sin que lo anotes en Mi plata (lógica pura):
// - un gasto pagado con un medio ligado a una cuenta (débito, transferencia, efectivo) sale de esa cuenta;
// - un pago de una persona por transferencia entra (o sale, si le pagaste tú) por la cuenta elegida;
// - el pago de una tarjeta de crédito sale de la cuenta desde la que pagaste.
// Se agregan como movimientos "virtuales" a los de Mi plata, así el saldo estimado los descuenta.
// Solo cuentan desde el primer registro de la cuenta (su primer cuadre): lo anterior ya está en ese saldo.
import type { Cuenta, Gasto, Medio, MovAhorro, Movimiento, PagoTarjeta } from '../db';
import { byDate } from './balance';

export interface FuentesFlujo {
  cuentas: Cuenta[];
  movAhorro: MovAhorro[];
  /** Gastos originales (no imputados: una compra en cuotas con débito sale entera ese día). */
  gastos: Gasto[];
  medios: Medio[];
  movimientos: Movimiento[];
  pagosTarjeta: PagoTarjeta[];
  /** Para escribir "Te pagó Camila". */
  personas?: { id: string; nombre: string }[];
}

export function flujosCuentas(f: FuentesFlujo): MovAhorro[] {
  // Primer registro de cada cuenta (fecha y hora de registro).
  const inicio = new Map<string, MovAhorro>();
  for (const m of f.movAhorro) {
    const prev = inicio.get(m.cuentaId);
    if (!prev || byDate(m, prev) < 0) inicio.set(m.cuentaId, m);
  }
  const validas = new Set(f.cuentas.filter((c) => c.tipo !== 'dap').map((c) => c.id));
  const cuentaDeMedio = new Map(f.medios.filter((m) => m.cuentaId && m.tipo !== 'credito').map((m) => [m.id, m.cuentaId!]));
  const nombreMedio = new Map(f.medios.map((m) => [m.id, m.nombre]));
  const persona = new Map((f.personas ?? []).map((p) => [p.id, p.nombre.split(' ')[0]]));
  const out: MovAhorro[] = [...f.movAhorro];
  const agregar = (x: MovAhorro) => {
    const desde = inicio.get(x.cuentaId);
    // Sin registros en la cuenta todavía no hay de dónde partir: el primer cuadre ya incluirá esto.
    if (!validas.has(x.cuentaId) || !desde || byDate(x, desde) < 0 || x.monto <= 0) return;
    out.push(x);
  };
  for (const g of f.gastos) {
    if (g.pagador !== 'yo' || !g.medioId) continue;
    const cuentaId = cuentaDeMedio.get(g.medioId);
    if (cuentaId) agregar({ id: `g:${g.id}`, cuentaId, tipo: 'retiro', monto: g.total, fecha: g.fecha, nota: g.descripcion, creado: g.creado, origen: { tipo: 'gasto', id: g.id } });
  }
  for (const m of f.movimientos) {
    if (!m.cuentaId || (m.tipo !== 'pago' && m.tipo !== 'abono')) continue;
    agregar({
      id: `m:${m.id}`,
      cuentaId: m.cuentaId,
      tipo: m.tipo === 'pago' ? 'deposito' : 'retiro',
      monto: m.monto,
      fecha: m.fecha,
      nota: m.tipo === 'pago' ? `Te pagó ${persona.get(m.personaId) ?? 'alguien'}` : `Le pagaste a ${persona.get(m.personaId) ?? 'alguien'}`,
      creado: m.creado,
      origen: { tipo: 'pago', id: m.id, personaId: m.personaId },
    });
  }
  for (const p of f.pagosTarjeta) {
    if (!p.cuentaId) continue;
    agregar({ id: `t:${p.id}`, cuentaId: p.cuentaId, tipo: 'retiro', monto: p.monto, fecha: p.fecha, nota: `Pago ${nombreMedio.get(p.medioId) ?? 'tarjeta'}`, creado: p.creado, origen: { tipo: 'pagoTarjeta', id: p.id } });
  }
  return out;
}
