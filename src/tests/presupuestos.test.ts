import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { borrarTodo, db, type Gasto, type Medio, type Presupuesto, type Recurrente } from '../db';
import { guardarCuenta } from '../ahorros';
import { anotarIngresoDetectado } from '../correo';
import { borrarIngreso, guardarIngreso, restaurarIngreso, tipoPorNombre } from '../ingresos';
import { borrarPresupuesto, guardarPresupuesto } from '../presupuestos';
import { generarRecurrentes, guardarRecurrente, confirmarPendiente } from '../recurrentes';
import { saldoCuenta } from '../lib/ahorro';
import { clavePeriodo, etiquetaPeriodo, gastosDelPeriodo, leerClavePeriodo, moverPeriodo, opcionesPeriodo, periodoEn, periodoMes, periodoTarjeta, resumenTarjeta } from '../lib/periodos';
import { avancePresupuesto, avances, balanceMes, lunesDe, rangoPresupuesto } from '../lib/presupuestos';

const falabella = { id: 'fal', nombre: 'Falabella', tipo: 'credito', diaFacturacion: 13, archivado: false, orden: 2 } as Medio;
const visa = { id: 'visa', nombre: 'Visa BCI', tipo: 'credito', diaFacturacion: 25, archivado: false, orden: 1 } as Medio;
const deb = { id: 'deb', nombre: 'Débito', tipo: 'debito', archivado: false, orden: 3 } as Medio;
const g = (x: Partial<Gasto>): Gasto => ({ id: Math.random().toString(36), descripcion: 'g', total: 1000, miParte: 1000, fecha: '2026-11-20', pagador: 'yo', modo: 'solo', yoIncluido: true, misPartes: 1, participantes: [], exactos: {}, partes: {}, creado: '', ...x }) as Gasto;
const pres = (x: Partial<Presupuesto>): Presupuesto => ({ id: 'p', nombre: 'Semana', periodo: 'semana', monto: 50_000, archivado: false, orden: 1, creado: '', ...x });

describe('períodos', () => {
  it('mes calendario y período de una tarjeta (Falabella del 14 al 13)', () => {
    expect(periodoMes('2026-11')).toMatchObject({ desde: '2026-11-01', hasta: '2026-11-30' });
    expect(periodoTarjeta(falabella, '2026-12')).toMatchObject({ desde: '2026-11-14', hasta: '2026-12-13' });
    expect(periodoEn('2026-11-13', falabella)).toMatchObject({ desde: '2026-10-14', hasta: '2026-11-13', cierreMes: '2026-11' });
    expect(periodoEn('2026-11-14', falabella)).toMatchObject({ desde: '2026-11-14', hasta: '2026-12-13', cierreMes: '2026-12' });
    expect(periodoEn('2026-11-14', deb)).toMatchObject({ tipo: 'mes', mes: '2026-11' }); // sin período propio
  });

  it('moverse entre períodos, etiqueta y clave', () => {
    const p = periodoEn('2026-12-20', falabella);
    expect(moverPeriodo(p, 1, [falabella])).toMatchObject({ desde: '2027-01-14', hasta: '2027-02-13' });
    expect(moverPeriodo(periodoMes('2026-12'), 1, [])).toMatchObject({ mes: '2027-01' });
    expect(etiquetaPeriodo(periodoTarjeta(falabella, '2026-12'), [falabella], new Date(2026, 10, 25))).toBe('Falabella · 14 nov – 13 dic');
    expect(etiquetaPeriodo(periodoMes('2026-11'), [])).toBe('noviembre 2026');
    expect(leerClavePeriodo(clavePeriodo(periodoTarjeta(falabella, '2026-12')), [falabella])).toMatchObject({ desde: '2026-11-14' });
    expect(leerClavePeriodo('tarjeta:fal', [falabella], '2026-11-20')).toMatchObject({ cierreMes: '2026-12' });
    expect(leerClavePeriodo('basura', [], '2026-11-20')).toMatchObject({ tipo: 'mes', mes: '2026-11' });
    expect(opcionesPeriodo([deb, falabella, visa], '2026-11-20').map((x) => clavePeriodo(x))).toEqual(['mes:2026-11', 'tarjeta:visa:2026-11', 'tarjeta:fal:2026-12']);
  });

  it('en el período de una tarjeta solo cuentan los gastos pagados con ella', () => {
    const gastos = [
      g({ medioId: 'fal', fecha: '2026-11-14', total: 30_000, miParte: 10_000, participantes: ['a'] }),
      g({ medioId: 'fal', fecha: '2026-11-13', total: 5_000, miParte: 5_000 }), // período anterior
      g({ medioId: 'visa', fecha: '2026-11-20' }),
      g({ fecha: '2026-11-20', pagador: 'x' }), // lo pagó otra persona
    ];
    const p = periodoTarjeta(falabella, '2026-12');
    expect(gastosDelPeriodo(p, gastos)).toHaveLength(1);
    expect(gastosDelPeriodo(periodoMes('2026-11'), gastos)).toHaveLength(4);
    const r = resumenTarjeta(p, gastos, [], '2026-12-10');
    expect(r).toMatchObject({ facturado: 30_000, tuyo: 10_000, deOtros: 0, nGastos: 1, diasAlCierre: 3, cerrado: false });
    expect(resumenTarjeta(p, gastos, [], '2026-12-14').cerrado).toBe(true);
  });
});

describe('presupuestos', () => {
  it('la semana va de lunes a domingo', () => {
    expect(lunesDe('2026-11-25')).toBe('2026-11-23'); // miércoles
    expect(lunesDe('2026-11-23')).toBe('2026-11-23'); // lunes
    expect(lunesDe('2026-11-29')).toBe('2026-11-23'); // domingo
    expect(rangoPresupuesto('semana', '2026-11-25')).toEqual({ desde: '2026-11-23', hasta: '2026-11-29' });
    expect(rangoPresupuesto('mes', '2026-02-10')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
  });

  it('semanal de $50.000: gastado, restante, por día y proyección', () => {
    const gastos = [
      g({ fecha: '2026-11-23', miParte: 12_000, total: 24_000 }), // mi parte cuenta
      g({ fecha: '2026-11-24', miParte: 8_000, pagador: 'x' }), // lo que otro pagó por mí también es mi gasto
      g({ fecha: '2026-11-22', miParte: 99_000 }), // semana anterior
    ];
    const a = avancePresupuesto(pres({}), gastos, '2026-11-25');
    expect(a).toMatchObject({ gastado: 20_000, restante: 30_000, diasTotales: 7, diasTranscurridos: 3, diasRestantes: 5, porDia: 6_000, proyeccion: 46_667, excesoProyectado: 0, estado: 'bien' });
    // A este ritmo se pasa, pero lleva el 50 %: sigue "bien" (la línea de ritmo lo avisa)
    const b = avancePresupuesto(pres({}), [...gastos, g({ fecha: '2026-11-25', miParte: 5_000 })], '2026-11-25');
    expect(b).toMatchObject({ gastado: 25_000, proyeccion: 58_333, excesoProyectado: 8_333, estado: 'bien' });
    // Desde el 80 %: cerca
    expect(avancePresupuesto(pres({}), [...gastos, g({ fecha: '2026-11-25', miParte: 20_000 })], '2026-11-25')).toMatchObject({ pct: 0.8, estado: 'cerca' });
    // Excedido
    expect(avancePresupuesto(pres({ monto: 15_000 }), gastos, '2026-11-25')).toMatchObject({ estado: 'excedido', restante: -5_000, porDia: 0 });
  });

  it('mensual por categoría: solo cuenta esa categoría; los en riesgo van primero', () => {
    const gastos = [g({ categoriaId: 'cat-salidas', miParte: 70_000, fecha: '2026-11-10' }), g({ categoriaId: 'cat-comida', miParte: 10_000, fecha: '2026-11-11' })];
    const salidas = pres({ id: 's', nombre: 'Salidas', periodo: 'mes', monto: 80_000, categoriaId: 'cat-salidas', orden: 2 });
    const comida = pres({ id: 'c', nombre: 'Supermercado', periodo: 'mes', monto: 200_000, categoriaId: 'cat-comida', orden: 1 });
    const a = avances([comida, salidas, pres({ id: 'x', archivado: true })], gastos, '2026-11-20');
    expect(a.map((x) => [x.presupuesto.id, x.gastado, x.estado])).toEqual([
      ['s', 70_000, 'cerca'],
      ['c', 10_000, 'bien'],
    ]);
  });
});

describe('balance del mes', () => {
  it('ingresos − gasto, y lo que falta por pagar o por llegar este mes', () => {
    const rec = (x: Partial<Recurrente>): Recurrente =>
      ({ id: Math.random().toString(36), nombre: 'r', tipo: 'mio', montoTipo: 'fijo', monto: 10_000, frecuencia: { unidad: 'mes', cada: 1, dia: 28 }, inicio: '2026-01-28', activo: true, creado: '', ...x }) as Recurrente;
    const b = balanceMes(
      '2026-11',
      [{ id: 'i', descripcion: 'Sueldo', tipo: 'sueldo', monto: 1_200_000, fecha: '2026-11-05', creado: '' }],
      [g({ miParte: 300_000, fecha: '2026-11-10' }), g({ miParte: 1, fecha: '2026-10-31' })],
      [
        rec({ monto: 24_990 }), // gimnasio el 28: por pagar
        rec({ tipo: 'compartido', monto: 13_900 }), // tu parte la calcula la función que se pasa
        rec({ frecuencia: { unidad: 'mes', cada: 1, dia: 5 }, inicio: '2026-01-05' }), // ya pasó
        rec({ tipo: 'ingreso', monto: 50_000, frecuencia: { unidad: 'mes', cada: 1, dia: 30 }, inicio: '2026-01-30' }),
        rec({ montoTipo: 'variable', monto: 999 }),
      ],
      (_r, m) => Math.round(m / 4),
      '2026-11-25',
    );
    expect(b).toEqual({ ingresos: 1_200_000, gastado: 300_000, teQuedan: 900_000, porPagar: 24_990 + 3_475, porLlegar: 50_000, alFinDeMes: 900_000 - 28_465 + 50_000 });
  });
});

describe('ingresos y presupuestos en la base', () => {
  beforeEach(() => borrarTodo());

  it('un ingreso con cuenta se deposita en ella; editarlo o borrarlo ajusta el depósito', async () => {
    const rut = await guardarCuenta({ nombre: 'Cuenta RUT', tipo: 'vista' }, 100_000, '2026-11-01');
    const saldo = async () => saldoCuenta((await db.cuentas.get(rut))!, (await db.movAhorro.toArray()).filter((m) => m.cuentaId === rut), '2026-11-30');
    const id = await guardarIngreso({ descripcion: ' Sueldo ', tipo: 'sueldo', monto: 1_200_000, fecha: '2026-11-05', cuentaId: rut });
    expect(await saldo()).toBe(1_300_000);
    await guardarIngreso({ id, descripcion: 'Sueldo', tipo: 'sueldo', monto: 1_250_000, fecha: '2026-11-05', cuentaId: rut });
    expect(await saldo()).toBe(1_350_000);
    expect((await db.movAhorro.toArray()).filter((m) => m.ingresoId === id)).toHaveLength(1);
    const copia = await borrarIngreso(id);
    expect(await saldo()).toBe(100_000);
    await restaurarIngreso(copia!);
    expect(await saldo()).toBe(1_350_000);
    expect((await db.ingresos.get(id))?.descripcion).toBe('Sueldo');
  });

  it('el sueldo como recurrente: fijo se anota solo y llega a la cuenta; variable queda por confirmar', async () => {
    const rut = await guardarCuenta({ nombre: 'Cuenta RUT', tipo: 'vista' }, 0, '2026-10-01');
    await guardarRecurrente({ nombre: 'Sueldo', tipo: 'ingreso', montoTipo: 'fijo', monto: 1_200_000, frecuencia: { unidad: 'mes', cada: 1, dia: 5 }, inicio: '2026-11-05', cuentaId: rut });
    await guardarRecurrente({ nombre: 'Boletas', tipo: 'ingreso', montoTipo: 'variable', monto: 0, frecuencia: { unidad: 'mes', cada: 1, dia: 10 }, inicio: '2026-11-10' });
    const r = await generarRecurrentes('2026-11-20');
    expect(r).toMatchObject({ anotados: 1, porConfirmar: 1 });
    const ingresos = await db.ingresos.toArray();
    expect(ingresos).toHaveLength(1);
    expect(ingresos[0]).toMatchObject({ descripcion: 'Sueldo', tipo: 'sueldo', monto: 1_200_000, fecha: '2026-11-05', cuentaId: rut });
    const p = (await db.pendientes.toArray())[0];
    await confirmarPendiente(p.id, 350_000);
    expect((await db.ingresos.toArray()).map((i) => [i.descripcion, i.monto, i.tipo]).sort()).toEqual([
      ['Boletas de noviembre', 350_000, 'otro'],
      ['Sueldo', 1_200_000, 'sueldo'],
    ]);
    // Generar de nuevo no duplica
    await generarRecurrentes('2026-11-20');
    expect(await db.ingresos.count()).toBe(2);
  });

  it('una transferencia recibida detectada se anota como ingreso', async () => {
    await db.detectados.add({ id: 'd1', tipo: 'recibido', monto: 1_200_000, comercio: 'Empresa SpA', fecha: '2026-11-05', remitente: 'x', asunto: 'Abono de remuneraciones', estado: 'pendiente', creado: '' });
    const id = await anotarIngresoDetectado('d1', { descripcion: 'Sueldo de noviembre' });
    expect(await db.ingresos.get(id!)).toMatchObject({ tipo: 'sueldo', monto: 1_200_000, detectadoId: 'd1' });
    expect(await db.detectados.get('d1')).toMatchObject({ estado: 'anotado', ingresoId: id });
    expect(await anotarIngresoDetectado('d1')).toBeUndefined();
  });

  it('presupuestos: guardar, editar y borrar', async () => {
    const id = await guardarPresupuesto({ nombre: ' Semana ', periodo: 'semana', monto: 50_000 });
    await guardarPresupuesto({ id, nombre: 'Semana', periodo: 'semana', monto: 60_000.4 });
    expect(await db.presupuestos.get(id)).toMatchObject({ nombre: 'Semana', monto: 60_000, orden: 1, archivado: false });
    const copia = await borrarPresupuesto(id);
    expect(await db.presupuestos.count()).toBe(0);
    expect(copia?.monto).toBe(60_000);
  });

  it('reconoce el sueldo por el nombre', () => {
    expect(tipoPorNombre('Sueldo')).toBe('sueldo');
    expect(tipoPorNombre('Abono de remuneraciones')).toBe('sueldo');
    expect(tipoPorNombre('Venta de bicicleta')).toBe('otro');
  });
});
