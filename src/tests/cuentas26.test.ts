import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { borrarTodo, db, guardarPago, type Cuenta, type Gasto, type Medio, type MovAhorro, type PagoTarjeta } from '../db';
import { construirRespaldo, importarRespaldo, validarRespaldo } from '../backup';
import { guardarCuenta } from '../ahorros';
import { pagarTarjeta, cuadrarTarjeta } from '../tarjetas';
import { saldoCuenta, movimientosCuenta } from '../lib/ahorro';
import { imputar } from '../lib/cuotas';
import { flujosCuentas } from '../lib/flujos';
import { porPagar, usoTarjeta } from '../lib/tarjetas';

const g = (x: Partial<Gasto>): Gasto =>
  ({ id: Math.random().toString(36).slice(2), descripcion: 'g', total: 10_000, miParte: 10_000, fecha: '2026-11-03', pagador: 'yo', modo: 'solo', yoIncluido: true, misPartes: 1, participantes: [], exactos: {}, partes: {}, creado: '2026-11-03T15:00:00Z', ...x }) as Gasto;
const cta = { id: 'cc', nombre: 'Cuenta Corriente Santander', tipo: 'vista', color: '#fff', archivada: false, orden: 1, creado: '' } as Cuenta;
const debito = { id: 'deb', nombre: 'Débito Cta. Cte. Santander', tipo: 'debito', cuentaId: 'cc', color: '#fff', archivado: false, orden: 1, creado: '' } as Medio;
const visa = { id: 'visa', nombre: 'Visa Santander', tipo: 'credito', diaFacturacion: 25, cupo: 4_000_000, cuentaId: 'cc', color: '#fff', archivado: false, orden: 2, creado: '' } as Medio;
const cuadre: MovAhorro = { id: 'q', cuentaId: 'cc', tipo: 'cuadre', monto: 500_000, fecha: '2026-11-01', creado: '2026-11-01T12:00:00Z' };

describe('débito y transferencias mueven la cuenta', () => {
  it('un gasto con débito baja el saldo; lo anterior al primer cuadre no cuenta', () => {
    const movs = flujosCuentas({
      cuentas: [cta],
      movAhorro: [cuadre],
      gastos: [g({ medioId: 'deb', total: 42_380, fecha: '2026-11-03' }), g({ medioId: 'deb', total: 99_000, fecha: '2026-10-20' }), g({ medioId: 'visa', total: 5_000 })],
      medios: [debito, visa],
      movimientos: [
        { id: 'p1', personaId: 'x', tipo: 'pago', detalle: 'Transferencia', monto: 12_000, fecha: '2026-11-04', cuentaId: 'cc', creado: '2026-11-04T10:00:00Z' },
        { id: 'p2', personaId: 'x', tipo: 'pago', detalle: 'Efectivo', monto: 7_000, fecha: '2026-11-04', creado: '2026-11-04T10:00:00Z' },
      ],
      pagosTarjeta: [{ id: 't1', medioId: 'visa', cuentaId: 'cc', monto: 100_000, fecha: '2026-11-04', creado: '2026-11-04T11:00:00Z' }],
      personas: [{ id: 'x', nombre: 'Camila Rojas' }],
    });
    expect(saldoCuenta(cta, movs.filter((m) => m.cuentaId === 'cc'), '2026-11-05')).toBe(500_000 - 42_380 + 12_000 - 100_000);
    const filas = movimientosCuenta(cta, movs, '2026-11-05');
    expect(filas.map((f) => [f.label, f.monto, f.origen?.tipo])).toEqual([
      ['Pago Visa Santander', -100_000, 'pagoTarjeta'],
      ['Te pagó Camila', 12_000, 'pago'],
      ['g', -42_380, 'gasto'],
      ['Saldo inicial', 500_000, undefined],
    ]);
    // Las filas que vienen de otra parte no se borran desde la cuenta
    expect(filas.filter((f) => f.origen).every((f) => f.id === undefined)).toBe(true);
  });

  it('el pago de una persona por transferencia guarda la cuenta', async () => {
    await borrarTodo();
    const id = await guardarPago('p', 15_000, 'Transferencia', '2026-11-05', undefined, 'pago', 'cc');
    expect((await db.movimientos.get(id))?.cuentaId).toBe('cc');
  });
});

describe('tarjetas de crédito: cupo, usado y por pagar', () => {
  const pagos: PagoTarjeta[] = [{ id: 't1', medioId: 'visa', cuentaId: 'cc', monto: 100_000, fecha: '2026-11-04', creado: '2026-11-04T11:00:00Z' }];

  it('sin cuadre suma todo lo anotado y resta pagos; con cuadre parte de lo que dice el banco', () => {
    const gs = [g({ medioId: 'visa', total: 300_000, cuotas: 3, fecha: '2026-11-02' }), g({ medioId: 'visa', total: 50_000, fecha: '2026-11-03' })];
    // Una compra en cuotas bloquea todo el cupo
    expect(usoTarjeta(visa, gs, pagos, '2026-11-05')).toMatchObject({ usado: 250_000, disponible: 3_750_000, cuadrado: false });
    const cuadrada = { ...visa, usoCuadrado: { monto: 346_726, fecha: '2026-11-03', creado: '2026-11-03T20:00:00Z' } };
    // Lo del mismo día registrado antes del cuadre ya está incluido; después, se suma
    const despues = g({ medioId: 'visa', total: 8_000, fecha: '2026-11-03', creado: '2026-11-03T21:00:00Z' });
    expect(usoTarjeta(cuadrada, [...gs, despues], pagos, '2026-11-05')).toMatchObject({ usado: 346_726 + 8_000 - 100_000, cuadrado: true, pct: (254_726) / 4_000_000 });
  });

  it('por pagar: lo facturado en el último período cerrado menos lo pagado desde el cierre', () => {
    const gs = imputar([g({ medioId: 'visa', total: 120_000, fecha: '2026-10-10' }), g({ medioId: 'visa', total: 30_000, fecha: '2026-10-28' })]);
    expect(porPagar(visa, gs, [], pagos, '2026-11-05')).toEqual({ facturado: 120_000, pagado: 100_000, queda: 20_000, cierre: '2026-10-25' });
  });

  it('pagos y cuadre se guardan y viajan en el respaldo v7', async () => {
    await borrarTodo();
    await db.medios.put(visa);
    await guardarCuenta({ nombre: 'Cuenta Corriente Santander', tipo: 'vista' }, 400_000, '2026-11-01');
    await pagarTarjeta('visa', 50_000, undefined, '2026-11-04');
    await cuadrarTarjeta('visa', 346_726, '2026-11-05');
    const r = JSON.parse(JSON.stringify(await construirRespaldo()));
    expect(r.version).toBe(7);
    expect(r.pagosTarjeta).toHaveLength(1);
    await borrarTodo();
    await importarRespaldo(validarRespaldo(r));
    expect((await db.medios.get('visa'))?.usoCuadrado?.monto).toBe(346_726);
    expect(await db.pagosTarjeta.count()).toBe(1);
  });
});

