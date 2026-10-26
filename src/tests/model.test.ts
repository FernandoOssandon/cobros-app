import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { borrarTodo, crearPersona, db, guardarGasto, guardarMedio, guardarPago, type Gasto, type Movimiento } from '../db';
import { anotarAtrasados, confirmarPendiente, generarRecurrentes, guardarRecurrente, saltarPendiente } from '../recurrentes';
import { describirFrecuencia, montoMensual, ocurrenciasEntre, proxima } from '../lib/recurrence';
import { periodoFacturacion, resumenMes } from '../lib/resumen';
import { agruparPorDia, filtrarGastos, normalizar } from '../lib/search';
import { estadosCargos, estadosDeudas, saldo } from '../lib/balance';
import { computeSplit } from '../lib/split';

describe('fechas de recurrentes', () => {
  it('mensual el día 31 usa el último día de los meses cortos', () => {
    expect(ocurrenciasEntre({ unidad: 'mes', cada: 1, dia: 31 }, '2026-01-31', undefined, '2026-05-01')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    ]);
  });
  it('respeta "después de", el fin y cada N', () => {
    const f = { unidad: 'mes' as const, cada: 2, dia: 5 };
    expect(ocurrenciasEntre(f, '2026-01-05', '2026-03-05', '2026-12-31', '2026-09-30')).toEqual(['2026-05-05', '2026-07-05', '2026-09-05']);
  });
  it('semanal, diario y anual (29 de febrero)', () => {
    expect(ocurrenciasEntre({ unidad: 'semana', cada: 1 }, '2026-10-01', undefined, '2026-10-20')).toEqual(['2026-10-01', '2026-10-08', '2026-10-15']);
    expect(ocurrenciasEntre({ unidad: 'dia', cada: 3 }, '2026-10-01', '2026-10-01', '2026-10-08')).toEqual(['2026-10-04', '2026-10-07']);
    expect(ocurrenciasEntre({ unidad: 'anio', cada: 1 }, '2024-02-29', undefined, '2026-03-01')).toEqual(['2024-02-29', '2025-02-28', '2026-02-28']);
  });
  it('próxima, descripción y equivalente mensual', () => {
    expect(proxima({ unidad: 'mes', cada: 1, dia: 5 }, '2026-01-05', '2026-10-25')).toBe('2026-11-05');
    expect(proxima({ unidad: 'mes', cada: 1 }, '2026-01-05', '2026-10-25', '2026-10-31')).toBeUndefined();
    expect(describirFrecuencia({ unidad: 'mes', cada: 1, dia: 5 }, '2026-01-05')).toBe('Cada mes, el día 5');
    expect(describirFrecuencia({ unidad: 'semana', cada: 1 }, '2026-10-26')).toBe('Todos los lunes');
    expect(describirFrecuencia({ unidad: 'semana', cada: 2 }, '2026-10-26')).toBe('Cada 2 semanas');
    expect(montoMensual(120000, { unidad: 'anio', cada: 1 })).toBe(10000);
  });
});

describe('motor de recurrentes', () => {
  beforeEach(async () => {
    await borrarTodo();
  });

  it('gasto fijo mío: el del mes se anota solo, los de meses anteriores quedan por anotar', async () => {
    await guardarRecurrente({ nombre: 'Arriendo', tipo: 'mio', montoTipo: 'fijo', monto: 350000, frecuencia: { unidad: 'mes', cada: 1, dia: 5 }, inicio: '2026-08-05', categoriaId: 'cat-casa' });
    expect(await generarRecurrentes('2026-10-25')).toEqual({ anotados: 1, porConfirmar: 0, atrasados: 2 });
    expect(await generarRecurrentes('2026-10-25')).toEqual({ anotados: 0, porConfirmar: 0, atrasados: 0 });
    expect((await db.gastos.toArray()).map((g) => g.fecha)).toEqual(['2026-10-05']);
    expect((await db.pendientes.toArray()).map((p) => [p.fecha, p.tipo])).toEqual([['2026-08-05', 'anotar'], ['2026-09-05', 'anotar']]);
    expect(await anotarAtrasados()).toEqual({ n: 2, total: 700000 });
    const gs = await db.gastos.toArray();
    expect(gs.map((g) => g.fecha).sort()).toEqual(['2026-08-05', '2026-09-05', '2026-10-05']);
    expect(gs.every((g) => g.modo === 'solo' && g.miParte === 350000 && g.categoriaId === 'cat-casa' && g.descripcion === 'Arriendo')).toBe(true);
    expect(await db.pendientes.count()).toBe(0);
    expect(await db.movimientos.count()).toBe(0);
  });

  it('compartido: pago el total y cada mes se cobra la parte de cada uno', async () => {
    const a = await crearPersona('Ana');
    const b = await crearPersona('Beto');
    const c = await crearPersona('Caro');
    await guardarRecurrente({
      nombre: 'Netflix', tipo: 'compartido', montoTipo: 'fijo', monto: 13900, frecuencia: { unidad: 'mes', cada: 1, dia: 12 }, inicio: '2026-10-12',
      reparto: { modo: 'equal', yoIncluido: true, misPartes: 1, participantes: [a, b, c], exactos: {}, partes: {} },
    });
    await generarRecurrentes('2026-11-25'); // noviembre se anota solo; octubre queda atrasado
    expect(await db.movimientos.count()).toBe(3);
    await anotarAtrasados();
    const movs = await db.movimientos.toArray();
    expect(movs).toHaveLength(6);
    expect(movs.every((m) => m.tipo === 'cargo' && m.monto === 3475)).toBe(true);
    const gs = await db.gastos.toArray();
    expect(gs.every((g) => g.miParte === 3475 && g.total === 13900)).toBe(true);
  });

  it('cobro a una persona: cargo mensual sin gasto mío', async () => {
    const d = await crearPersona('Diego');
    await guardarRecurrente({ nombre: 'Cuota préstamo', tipo: 'cobro', montoTipo: 'fijo', monto: 20000, frecuencia: { unidad: 'mes', cada: 1, dia: 1 }, inicio: '2026-09-01', fin: '2026-10-01', personaId: d });
    await generarRecurrentes('2026-10-15');
    await anotarAtrasados();
    await generarRecurrentes('2026-12-31');
    expect(await db.gastos.count()).toBe(0);
    expect(saldo(await db.movimientos.toArray())).toBe(40000);
  });

  it('variable: queda por confirmar; confirmar anota el monto real y lo guarda como referencia', async () => {
    const rid = await guardarRecurrente({ nombre: 'Luz', tipo: 'mio', montoTipo: 'variable', monto: 25000, frecuencia: { unidad: 'mes', cada: 1, dia: 20 }, inicio: '2026-09-20' });
    expect(await generarRecurrentes('2026-10-25')).toEqual({ anotados: 0, porConfirmar: 2, atrasados: 0 });
    const [p1, p2] = (await db.pendientes.toArray()).sort((x, y) => x.fecha.localeCompare(y.fecha));
    await confirmarPendiente(p1.id, 27350);
    await saltarPendiente(p2.id);
    expect(await db.pendientes.count()).toBe(0);
    const gs = await db.gastos.toArray();
    expect(gs).toHaveLength(1);
    expect(gs[0]).toMatchObject({ total: 27350, fecha: '2026-09-20', descripcion: 'Luz de septiembre' });
    expect(await db.recurrentes.get(rid)).toMatchObject({ monto: 27350, ultimoConfirmado: '2026-09-20' });
    expect(await generarRecurrentes('2026-10-25')).toEqual({ anotados: 0, porConfirmar: 0, atrasados: 0 });
  });

  it('variable compartido con montos exactos: si cambia el total, se reparte en proporción', async () => {
    const a = await crearPersona('Ana');
    await guardarRecurrente({
      nombre: 'Agua', tipo: 'compartido', montoTipo: 'variable', monto: 20000, frecuencia: { unidad: 'mes', cada: 1 }, inicio: '2026-10-10',
      reparto: { modo: 'exact', yoIncluido: true, misPartes: 1, participantes: [a], exactos: { [a]: 5000 }, partes: {} },
    });
    await generarRecurrentes('2026-10-25');
    const [p] = await db.pendientes.toArray();
    await confirmarPendiente(p.id, 40000); // el doble
    const [g] = await db.gastos.toArray();
    expect(g.miParte).toBe(30000);
    expect((await db.movimientos.toArray())[0].monto).toBe(10000);
    // El mes siguiente mantiene la misma proporción (1/4 para Ana), aunque la referencia ya sea 40.000.
    await generarRecurrentes('2026-11-25');
    const [p2] = await db.pendientes.toArray();
    await confirmarPendiente(p2.id, 20000);
    const nov = (await db.movimientos.toArray()).find((m) => m.fecha === '2026-11-10');
    expect(nov?.monto).toBe(5000);
  });
});

describe('resumen del mes', () => {
  beforeEach(async () => {
    await borrarTodo();
  });

  it('separa lo mío, lo cobrado y lo pendiente por medio de pago', async () => {
    const visa = await guardarMedio({ nombre: 'Visa BCI', tipo: 'credito', color: '#9EC9FF' });
    const debito = await guardarMedio({ nombre: 'Débito', tipo: 'debito', color: '#FFD36E' });
    const cami = await crearPersona('Camila');
    const diego = await crearPersona('Diego');
    const base = { fecha: '2026-10-05', yoIncluido: true, misPartes: 1, exactos: {}, partes: {} };
    const sp = (amount: number, ids: string[]) => computeSplit({ amount, ids, me: true, mode: 'equal', exact: {}, parts: {}, myParts: 1 });
    // Asado con la Visa: 30.000 entre 3 → 10.000 míos, 20.000 de otros.
    await guardarGasto({ ...base, descripcion: 'Asado', modo: 'equal', medioId: visa, categoriaId: 'cat-salidas' }, sp(30000, [cami, diego]));
    // Bencina con débito, solo mía.
    await guardarGasto({ ...base, descripcion: 'Bencina', modo: 'solo', medioId: debito, categoriaId: 'cat-transporte' }, { amount: 25000, rows: [], mine: 25000, remaining: 0, ok: true });
    // Diego pagó una pizza por mí: 8.000 de mi parte (gasto real, pero no salió de mis medios).
    await guardarGasto({ ...base, descripcion: 'Pizza', modo: 'equal', pagador: diego }, sp(8000, []));
    // Gasto de otro mes (no cuenta).
    await guardarGasto({ ...base, fecha: '2026-09-30', descripcion: 'Viejo', modo: 'solo', medioId: visa }, { amount: 99999, rows: [], mine: 99999, remaining: 0, ok: true });
    // Camila pagó su parte.
    await guardarPago(cami, 10000, 'Transferencia', '2026-10-07');

    const [gastos, movs, medios] = await Promise.all([db.gastos.toArray(), db.movimientos.toArray(), db.medios.toArray()]);
    const r = resumenMes('2026-10', gastos, movs, medios);
    expect(r.gastoReal).toBe(10000 + 25000 + 8000);
    expect(r.salio).toBe(55000);
    expect(r.adelantado).toBe(20000);
    expect(r.porMedio).toEqual([
      // Camila pagó 10.000 y lo de Diego se compensa con los 8.000 que le debo → quedan 2.000.
      { medioId: visa, total: 30000, mio: 10000, otrosCobrado: 18000, otrosPendiente: 2000 },
      { medioId: debito, total: 25000, mio: 25000, otrosCobrado: 0, otrosPendiente: 0 },
    ]);
    expect(r.porCategoria[0]).toEqual({ categoriaId: 'cat-transporte', monto: 25000 });
    // Diego: me debe 10.000 del asado y yo le debo 8.000 de la pizza → neto 2.000 a mi favor.
    expect(r.teDeben).toBe(2000);
    expect(r.debes).toBe(0);
  });

  it('período de facturación (cierre el 25)', () => {
    expect(periodoFacturacion('2026-11', 25)).toEqual({ desde: '2026-10-26', hasta: '2026-11-25' });
    expect(periodoFacturacion('2026-03', 31)).toEqual({ desde: '2026-03-01', hasta: '2026-03-31' });
    expect(periodoFacturacion('2026-01', 10)).toEqual({ desde: '2025-12-11', hasta: '2026-01-10' });
  });
});

describe('saldo neto y estados', () => {
  const mv = (id: string, tipo: Movimiento['tipo'], monto: number, fecha: string): Movimiento => ({ id, personaId: 'p', tipo, monto, fecha, detalle: 'x', creado: fecha });
  it('lo que le debo compensa sus cargos', () => {
    const movs = [mv('1', 'cargo', 10000, '2026-10-01'), mv('2', 'deuda', 4000, '2026-10-02')];
    expect(saldo(movs)).toBe(6000);
    expect(estadosCargos(movs).get('1')).toEqual({ estado: 'parcial', pendiente: 6000 });
  });
  it('estado de lo que yo debo (FIFO) y compensación', () => {
    const movs = [mv('1', 'deuda', 8000, '2026-10-01'), mv('2', 'deuda', 5000, '2026-10-05'), mv('3', 'abono', 10000, '2026-10-06')];
    expect(saldo(movs)).toBe(-3000);
    expect(estadosDeudas(movs).get('1')).toEqual({ estado: 'pagado', pendiente: 0 });
    expect(estadosDeudas(movs).get('2')).toEqual({ estado: 'parcial', pendiente: 3000 });
  });
  it('si le abono, vuelve a quedar pendiente', () => {
    const movs = [mv('1', 'cargo', 10000, '2026-10-01'), mv('2', 'deuda', 4000, '2026-10-02'), mv('3', 'abono', 4000, '2026-10-03')];
    expect(saldo(movs)).toBe(10000);
    expect(estadosCargos(movs).get('1')?.estado).toBe('pendiente');
  });
});

describe('búsqueda', () => {
  const g = (id: string, descripcion: string, fecha: string, extra: Partial<Gasto> = {}): Gasto => ({
    id, descripcion, fecha, total: 1000, pagador: 'yo', modo: 'solo', yoIncluido: true, miParte: 1000, misPartes: 1,
    participantes: [], exactos: {}, partes: {}, creado: fecha, ...extra,
  });
  const gastos = [
    g('1', 'Café en Ñuñoa', '2026-10-01', { categoriaId: 'cat-comida' }),
    g('2', 'Uber', '2026-10-03', { participantes: ['p1'], total: 7200 }),
    g('3', 'Supermercado', '2026-10-03', { medioId: 'visa' }),
  ];
  const personas = [{ id: 'p1', nombre: 'Matías Pérez', telefono: '', archivada: false, color: 0, creado: '' }];
  it('sin tildes, por persona, por monto y por filtros', () => {
    expect(normalizar('  Ñuñoa ')).toBe('nunoa');
    expect(filtrarGastos(gastos, { texto: 'nunoa' }).map((x) => x.id)).toEqual(['1']);
    expect(filtrarGastos(gastos, { texto: 'matias' }, personas).map((x) => x.id)).toEqual(['2']);
    expect(filtrarGastos(gastos, { texto: '7.200' }).map((x) => x.id)).toEqual(['2']);
    expect(filtrarGastos(gastos, { medioId: 'visa' }).map((x) => x.id)).toEqual(['3']);
    expect(filtrarGastos(gastos, { desde: '2026-10-02' }).map((x) => x.id).sort()).toEqual(['2', '3']);
  });
  it('agrupa por día', () => {
    const dias = agruparPorDia(gastos);
    expect(dias.map((d) => [d.fecha, d.gastos.length, d.miTotal])).toEqual([['2026-10-03', 2, 2000], ['2026-10-01', 1, 1000]]);
  });
});
