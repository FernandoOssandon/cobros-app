import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { borrarTodo, db, guardarAjustes, guardarGasto, type Cuenta, type Gasto, type Ingreso, type Medio, type Meta, type Presupuesto } from '../db';
import { construirRespaldo, importarRespaldo, validarRespaldo } from '../backup';
import { guardarCuenta } from '../ahorros';
import { aportarMeta, borrarMeta, guardarMeta, quitarAporte } from '../metas';
import { generarRecurrentes, guardarRecurrente } from '../recurrentes';
import { cuotasDe, fechaMasMeses, imputar, parteCuota } from '../lib/cuotas';
import { gastosCsv, ingresosCsv, presupuestosCsv } from '../lib/csv';
import { avanceMeta } from '../lib/metas';
import { aPesos, fmtMoneda, leerDecimal, leerMindicador, mostrarDecimal, teclaDecimal } from '../lib/monedas';
import { gastosDelPeriodo, periodoMes, periodoTarjeta, resumenTarjeta } from '../lib/periodos';
import { avancePresupuesto } from '../lib/presupuestos';
import { resumenMes } from '../lib/resumen';
import { comparar, porCategoria, serieMensual } from '../lib/tendencias';

const g = (x: Partial<Gasto>): Gasto =>
  ({ id: Math.random().toString(36).slice(2), descripcion: 'g', total: 1000, miParte: 1000, fecha: '2026-11-20', pagador: 'yo', modo: 'solo', yoIncluido: true, misPartes: 1, participantes: [], exactos: {}, partes: {}, creado: '', ...x }) as Gasto;
const cmr = { id: 'cmr', nombre: 'CMR Falabella', tipo: 'credito', diaFacturacion: 13, archivado: false, orden: 1 } as Medio;

describe('compras en cuotas', () => {
  it('reparte el monto en partes iguales (el resto en la primera) y cada cuota cae en su mes', () => {
    expect([0, 1, 2].map((i) => parteCuota(100_000, 3, i))).toEqual([33_334, 33_333, 33_333]);
    expect(fechaMasMeses('2026-01-31', 1)).toBe('2026-02-28');
    const c = cuotasDe(g({ id: 'tv', total: 300_000, miParte: 300_000, cuotas: 3, medioId: 'cmr', fecha: '2026-11-20' }));
    expect(c.map((x) => [x.id, x.fecha, x.total, x.cuota?.n])).toEqual([
      ['tv#1', '2026-11-20', 100_000, 1],
      ['tv#2', '2026-12-20', 100_000, 2],
      ['tv#3', '2027-01-20', 100_000, 3],
    ]);
    // Si pagó otra persona no hay cuotas mías
    expect(cuotasDe(g({ cuotas: 3, pagador: 'p1' }))).toHaveLength(1);
  });

  it('el gasto real del mes, el período de la tarjeta y los presupuestos cuentan solo la cuota', () => {
    const tv = g({ id: 'tv', total: 300_000, miParte: 300_000, cuotas: 3, medioId: 'cmr', fecha: '2026-11-20', categoriaId: 'cat-casa' });
    const imp = imputar([tv, g({ fecha: '2026-12-02', miParte: 5_000, total: 5_000 })]);
    expect(resumenMes('2026-11', imp, []).gastoReal).toBe(100_000);
    expect(resumenMes('2026-12', imp, []).gastoReal).toBe(105_000);
    // Período 14 nov – 13 dic: la primera cuota; 14 dic – 13 ene: la segunda
    expect(resumenTarjeta(periodoTarjeta(cmr, '2026-12'), imp, [], '2026-11-25').facturado).toBe(100_000);
    expect(gastosDelPeriodo(periodoTarjeta(cmr, '2027-01'), imp).map((x) => x.id)).toEqual(['tv#2']);
    expect(gastosDelPeriodo(periodoMes('2027-01'), imp).map((x) => x.id)).toEqual(['tv#3']);
    const p: Presupuesto = { id: 'p', nombre: 'Casa', periodo: 'mes', monto: 150_000, categoriaId: 'cat-casa', archivado: false, orden: 1, creado: '' };
    expect(avancePresupuesto(p, imp, '2026-11-25').gastado).toBe(100_000);
  });

  it('lo que otros deben de una compra en cuotas se reparte en cada cuota', async () => {
    await borrarTodo();
    const pid = 'p1';
    await db.personas.add({ id: pid, nombre: 'Javi', telefono: '', archivada: false, color: 1, creado: '' } as never);
    const id = await guardarGasto(
      { descripcion: 'Sillón', fecha: '2026-11-20', modo: 'equal', yoIncluido: true, misPartes: 1, exactos: {}, partes: {}, pagador: 'yo', medioId: 'cmr', cuotas: 2 },
      { amount: 200_000, rows: [{ id: pid, v: 100_000 }], mine: 100_000, remaining: 0, ok: true } as never,
    );
    const gasto = (await db.gastos.get(id))!;
    expect(gasto.cuotas).toBe(2);
    const r = resumenTarjeta(periodoTarjeta(cmr, '2026-12'), imputar([gasto]), await db.movimientos.toArray(), '2026-11-25');
    expect(r).toMatchObject({ facturado: 100_000, tuyo: 50_000, deOtros: 50_000, pendiente: 50_000 });
  });
});

describe('UF y dólares', () => {
  it('lee montos con coma, el teclado con decimales y convierte a pesos', () => {
    expect(leerDecimal('12,5')).toBe(12.5);
    expect(leerDecimal('1.250,75')).toBe(1250.75);
    expect(leerDecimal('19.99')).toBe(19.99);
    expect(leerDecimal('abc')).toBe(0);
    let v = '';
    for (const k of ['1', '2', ',', '3', '5', '9']) v = teclaDecimal(v, k);
    expect(v).toBe('12,35');
    expect(teclaDecimal(',', ',')).toBe(',');
    expect(teclaDecimal('', ',')).toBe('0,');
    expect(mostrarDecimal('1250,5')).toBe('1.250,5');
    expect(fmtMoneda('UF', 12.5)).toBe('12,5 UF');
    expect(fmtMoneda('USD', 19.99)).toBe('US$ 19,99');
    expect(aPesos(12, 41_268.88)).toBe(495_227);
  });

  it('interpreta la respuesta de mindicador.cl', () => {
    const r = leerMindicador({
      uf: { codigo: 'uf', valor: 41268.88, fecha: '2026-11-04T03:00:00.000Z' },
      dolar: { codigo: 'dolar', valor: 980.59, fecha: '2026-11-04T03:00:00.000Z' },
      euro: { valor: 'x' },
    });
    expect(r.UF).toEqual({ valor: 41268.88, fecha: '2026-11-04' });
    expect(r.USD?.valor).toBe(980.59);
    expect(r.EUR).toBeUndefined();
  });

  it('un recurrente en UF se anota en pesos con el valor del día; sin valor, queda por confirmar', async () => {
    await borrarTodo();
    await guardarAjustes({ indicadores: { UF: { valor: 40_000, fecha: '2026-11-05' }, actualizado: new Date().toISOString() } });
    await guardarRecurrente({ nombre: 'Arriendo', tipo: 'mio', montoTipo: 'fijo', monto: 480_000, moneda: 'UF', montoMoneda: 12.5, frecuencia: { unidad: 'mes', cada: 1, dia: 5 }, inicio: '2026-11-05' });
    await generarRecurrentes('2026-11-05');
    const gasto = (await db.gastos.toArray())[0];
    expect(gasto.total).toBe(500_000);
    expect(gasto.moneda).toEqual({ codigo: 'UF', monto: 12.5, valor: 40_000, fecha: '2026-11-05' });

    await borrarTodo();
    await guardarAjustes({ indicadores: { actualizado: new Date().toISOString() } });
    await guardarRecurrente({ nombre: 'Seguro', tipo: 'mio', montoTipo: 'fijo', monto: 0, moneda: 'USD', montoMoneda: 20, frecuencia: { unidad: 'mes', cada: 1, dia: 5 }, inicio: '2026-11-05' });
    await generarRecurrentes('2026-11-05');
    expect(await db.gastos.count()).toBe(0);
    expect((await db.pendientes.toArray()).map((p) => p.tipo)).toEqual(['confirmar']);
  });
});

describe('metas de ahorro', () => {
  beforeEach(() => borrarTodo());
  const meta = (x: Partial<Meta>): Meta => ({ id: 'm', nombre: 'Vacaciones', monto: 600_000, aportes: [], color: '#FFD36E', archivada: false, orden: 1, creado: '', ...x });

  it('con aportes a mano: lo que llevas, lo que falta y cuánto apartar al mes', () => {
    const a = avanceMeta(meta({ fecha: '2027-03-05', aportes: [{ id: 'a', fecha: '2026-11-01', monto: 150_000 }, { id: 'b', fecha: '2026-11-03', monto: -30_000 }] }), [], [], undefined, '2026-11-05');
    expect(a).toMatchObject({ objetivo: 600_000, llevas: 120_000, falta: 480_000, pct: 0.2, lograda: false, meses: 4, porMes: 120_000 });
    expect(avanceMeta(meta({ aportes: [{ id: 'a', fecha: '2026-11-01', monto: 700_000 }] }), [], [], undefined, '2026-11-05')).toMatchObject({ lograda: true, pct: 1, falta: 0 });
  });

  it('ligada a una cuenta usa su saldo, y en UF se compara con el valor del día', async () => {
    const cid = await guardarCuenta({ nombre: 'Tenpo', tipo: 'remunerada', tasa: 0, tasaUnidad: 'anual' }, 2_000_000, '2026-11-01');
    const cuentas = (await db.cuentas.toArray()) as Cuenta[];
    const a = avanceMeta(meta({ cuentaId: cid, monto: 0, moneda: 'UF', montoMoneda: 100 }), cuentas, await db.movAhorro.toArray(), { UF: { valor: 40_000, fecha: '2026-11-05' } }, '2026-11-05');
    expect(a).toMatchObject({ objetivo: 4_000_000, llevas: 2_000_000, pct: 0.5 });
  });

  it('guardar, aportar, quitar, borrar y viaja en el respaldo v6', async () => {
    const id = await guardarMeta({ nombre: ' Fondo de emergencia ', monto: 1_000_000 });
    const aid = await aportarMeta(id, 50_000, '2026-11-05');
    await aportarMeta(id, 25_000, '2026-11-06');
    await quitarAporte(id, aid!);
    expect((await db.metas.get(id))).toMatchObject({ nombre: 'Fondo de emergencia', aportes: [{ monto: 25_000 }] });
    const r = JSON.parse(JSON.stringify(await construirRespaldo()));
    expect(r.version).toBe(7);
    expect(r.metas).toHaveLength(1);
    await borrarMeta(id);
    expect(await db.metas.count()).toBe(0);
    await importarRespaldo(validarRespaldo(r));
    expect((await db.metas.get(id))?.aportes).toHaveLength(1);
  });
});

describe('tendencias', () => {
  const gs = imputar([
    g({ fecha: '2026-09-10', miParte: 100_000, categoriaId: 'a' }),
    g({ fecha: '2026-10-03', miParte: 40_000, categoriaId: 'a' }),
    g({ fecha: '2026-10-20', miParte: 200_000, categoriaId: 'b' }),
    g({ fecha: '2026-11-02', miParte: 30_000, categoriaId: 'a' }),
    g({ fecha: '2026-11-04', miParte: 25_000, categoriaId: 'c' }),
    g({ fecha: '2026-11-20', miParte: 999_000, categoriaId: 'a' }), // futuro: no cuenta todavía
  ]);
  const ing = [{ id: 'i', descripcion: 'Sueldo', tipo: 'sueldo', monto: 900_000, fecha: '2026-10-20', creado: '' }] as Ingreso[];

  it('serie mensual sin los meses vacíos del principio', () => {
    const s = serieMensual(gs, ing, 6, '2026-11-05');
    expect(s.map((m) => [m.mes, m.gasto, m.ingresos, m.enCurso])).toEqual([
      ['2026-09', 100_000, 0, false],
      ['2026-10', 240_000, 900_000, false],
      ['2026-11', 55_000, 0, true],
    ]);
  });

  it('el mes en curso se compara con el anterior a la misma fecha', () => {
    expect(comparar(gs, '2026-11', '2026-11-05')).toMatchObject({ hastaDia: 5, actual: 55_000, previo: 40_000, diferencia: 15_000, pct: 0.375 });
    expect(comparar(gs, '2026-10', '2026-11-05')).toMatchObject({ hastaDia: undefined, actual: 240_000, previo: 100_000 });
    expect(porCategoria(gs, '2026-11', '2026-11-05')).toEqual([
      { categoriaId: 'a', actual: 30_000, previo: 40_000 },
      { categoriaId: 'c', actual: 25_000, previo: 0 },
    ]);
  });
});

describe('planillas', () => {
  it('gastos con cuotas y moneda, ingresos y presupuestos', () => {
    const gasto = g({ descripcion: 'Notebook', total: 600_000, miParte: 600_000, cuotas: 6, moneda: { codigo: 'USD', monto: 650, valor: 923.08, fecha: '2026-11-05' } });
    expect(gastosCsv([gasto], [], [], []).split('\r\n')[1]).toContain(';6;US$ 650 a $923.08');
    const csvIng = ingresosCsv([{ id: 'i', descripcion: 'Sueldo', tipo: 'sueldo', monto: 1_450_000, fecha: '2026-11-20', cuentaId: 'rut', recurrenteId: 'r', creado: '' }], [{ id: 'rut', nombre: 'Cuenta RUT' } as Cuenta]);
    expect(csvIng.split('\r\n')[1]).toBe('2026-11-20;Sueldo;Fijo;1450000;Cuenta RUT');
    const csvPres = presupuestosCsv([{ id: 'p', nombre: 'x', periodo: 'semana', monto: 50_000, archivado: false, orden: 1, creado: '' }], imputar([g({ fecha: '2026-11-04', miParte: 45_000 })]), [], '2026-11-05');
    expect(csvPres.split('\r\n')[1]).toBe('Total semanal;Semanal;2026-11-02;2026-11-08;50000;45000;5000;90;Cerca del límite');
  });
});
