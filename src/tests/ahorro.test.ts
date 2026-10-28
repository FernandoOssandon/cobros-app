import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { borrarTodo, db, type Cuenta, type Gasto, type Medio, type MovAhorro, type Movimiento, type Persona } from '../db';
import { alVencerDap, anualDesde30, historialCuenta, movimientosCuenta, patrimonio, periodoAbierto, rendimiento, resumenCuenta, saldoCuenta, serieSaldo, tasaDiaria, valorDap } from '../lib/ahorro';
import { asegurarEfectivo, cobrarDap, guardarCuenta, ID_EFECTIVO, moverPlata, quitarCuenta, renovarDap, renovarVencidos, traspasar, cuadrar, registrarMovAhorro } from '../ahorros';

const cuenta = (x: Partial<Cuenta> = {}): Cuenta => ({ id: 'c1', nombre: 'Mercado Pago', tipo: 'remunerada', color: '#9EC9FF', tasa: 5, tasaUnidad: 'anual', archivada: false, orden: 1, creado: '', ...x });
let n = 0;
const mov = (tipo: MovAhorro['tipo'], monto: number, fecha: string, cuentaId = 'c1'): MovAhorro => ({ id: `m${++n}`, cuentaId, tipo, monto, fecha, creado: String(n).padStart(4, '0') });
const dap = { monto: 1_000_000, tasa30: 0.45, inicio: '2026-10-01', vencimiento: '2026-10-31', estado: 'vigente' as const };

describe('cálculos de ahorro', () => {
  it('la tasa diaria compone a la tasa anual (o mensual)', () => {
    expect(Math.pow(1 + tasaDiaria({ tasa: 5, tasaUnidad: 'anual' }), 365)).toBeCloseTo(1.05, 10);
    expect(Math.pow(1 + tasaDiaria({ tasa: 0.4, tasaUnidad: 'mensual' }), 365)).toBeCloseTo(Math.pow(1.004, 12), 10);
    expect(tasaDiaria({})).toBe(0);
  });

  it('estima el saldo con interés diario desde el último cuadre, con depósitos y retiros', () => {
    const c = cuenta();
    const ms = [mov('cuadre', 1_000_000, '2026-01-01')];
    expect(saldoCuenta(c, ms, '2026-01-01')).toBe(1_000_000);
    expect(saldoCuenta(c, ms, '2027-01-01')).toBe(1_050_000);
    // Un cuadre manda sobre la estimación
    ms.push(mov('cuadre', 1_020_000, '2026-07-01'));
    expect(saldoCuenta(c, ms, '2026-07-01')).toBe(1_020_000);
    // Depósito y retiro
    ms.push(mov('deposito', 200_000, '2026-07-01'), mov('retiro', 20_000, '2026-07-01'));
    expect(saldoCuenta(c, ms, '2026-07-01')).toBe(1_200_000);
    // Antes del primer registro no hay saldo
    expect(saldoCuenta(c, ms, '2025-12-31')).toBe(0);
  });

  it('el rendimiento no cuenta depósitos, retiros ni el saldo inicial', () => {
    const c = cuenta({ tasa: 0 });
    const ms = [mov('cuadre', 500_000, '2026-10-10'), mov('deposito', 100_000, '2026-10-15'), mov('cuadre', 603_000, '2026-10-31')];
    // Sin tasa: todo lo que creció más allá del depósito (3.000) es rendimiento informado por el banco.
    expect(rendimiento(c, ms, '2026-09-30', '2026-10-31')).toBe(3_000);
    expect(rendimiento(c, ms, '2026-10-15', '2026-10-31')).toBe(3_000);
    expect(rendimiento(c, ms, '2026-09-01', '2026-09-30')).toBe(0);
  });

  it('ganado del mes y días desde el último cuadre', () => {
    const c = cuenta();
    const r = resumenCuenta(c, [mov('cuadre', 1_000_000, '2026-01-01'), mov('cuadre', 5, '2026-01-01', 'otra')], '2027-01-15');
    // Desde el 31 de diciembre (fin del mes anterior) hasta el 15 de enero: 15 días de interés
    expect(r.saldo).toBe(Math.round(1_000_000 * Math.pow(1.05, 379 / 365)));
    expect(r.ganadoMes).toBe(Math.round(1_000_000 * (Math.pow(1.05, 379 / 365) - Math.pow(1.05, 364 / 365))));
    expect(r.ganadoTotal).toBe(r.saldo - 1_000_000);
    expect(r.diasDesdeCuadre).toBe(379);
  });

  it('depósito a plazo: interés simple con la tasa a 30 días', () => {
    expect(alVencerDap(dap)).toBe(1_004_500);
    expect(valorDap(dap, '2026-10-16')).toBe(1_002_250);
    expect(valorDap(dap, '2026-09-30')).toBe(0);
    expect(valorDap(dap, '2026-11-20')).toBe(1_004_500);
    expect(alVencerDap({ ...dap, montoFinal: 1_004_321 })).toBe(1_004_321);
    const c = cuenta({ tipo: 'dap', dap });
    const r = resumenCuenta(c, [], '2026-10-16');
    expect(r).toMatchObject({ saldo: 1_002_250, alVencer: 1_004_500, diasParaVencer: 15, ganadoMes: 2_250 });
    expect(saldoCuenta(cuenta({ tipo: 'dap', dap: { ...dap, estado: 'cobrado' } }), [], '2026-10-16')).toBe(0);
  });

  it('serie de saldo para el gráfico incluye el último día', () => {
    const s = serieSaldo(cuenta({ tasa: 0 }), [mov('cuadre', 10, '2026-10-01'), mov('deposito', 5, '2026-10-03')], '2026-10-01', '2026-10-06', 2);
    expect(s).toEqual([
      { fecha: '2026-10-01', saldo: 10 },
      { fecha: '2026-10-03', saldo: 15 },
      { fecha: '2026-10-05', saldo: 15 },
      { fecha: '2026-10-06', saldo: 15 },
    ]);
  });

  it('período abierto de una tarjeta', () => {
    expect(periodoAbierto(25, '2026-10-20')).toEqual({ desde: '2026-09-26', hasta: '2026-10-25' });
    expect(periodoAbierto(25, '2026-10-26')).toEqual({ desde: '2026-10-26', hasta: '2026-11-25' });
    expect(periodoAbierto(25, '2026-12-28')).toEqual({ desde: '2026-12-26', hasta: '2027-01-25' });
  });

  it('patrimonio: ahorros (DAP por capital) + vista + efectivo + te deben − debes − tarjetas del período', () => {
    const personas = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as Persona[];
    const movimientos = [
      { personaId: 'a', tipo: 'cargo', monto: 30_000 },
      { personaId: 'b', tipo: 'deuda', monto: 8_000 },
    ] as Movimiento[];
    const medios = [
      { id: 'visa', tipo: 'credito', diaFacturacion: 25, archivado: false },
      { id: 'mc', tipo: 'credito', archivado: false }, // sin día de facturación: cuenta el mes
      { id: 'deb', tipo: 'debito', archivado: false },
    ] as Medio[];
    const gastos = [
      { medioId: 'visa', pagador: 'yo', fecha: '2026-10-28', total: 50_000 },
      { medioId: 'visa', pagador: 'yo', fecha: '2026-10-20', total: 99_000 }, // período anterior (ya facturado)
      { medioId: 'mc', pagador: 'yo', fecha: '2026-10-02', total: 1_000 },
      { medioId: 'deb', pagador: 'yo', fecha: '2026-10-28', total: 7_000 },
    ] as Gasto[];
    const cuentas = [
      cuenta({ tasa: 0 }),
      cuenta({ id: 'v', tipo: 'vista', tasa: undefined }),
      cuenta({ id: 'e', tipo: 'efectivo', tasa: undefined }),
      cuenta({ id: 'd', tipo: 'dap', dap }),
      cuenta({ id: 'x', archivada: true }),
    ];
    const movAhorro = [mov('cuadre', 300_000, '2026-10-01'), mov('cuadre', 150_000, '2026-10-01', 'v'), mov('cuadre', 38_000, '2026-10-01', 'e'), mov('cuadre', 999, '2026-10-01', 'x')];
    const p = patrimonio({ cuentas, movAhorro, personas, movimientos, gastos, medios }, '2026-10-31');
    expect(p).toMatchObject({ ahorros: 1_300_000, vista: 150_000, efectivo: 38_000, teDeben: 30_000, debes: 8_000, tarjetas: 51_000, nTeDeben: 1, nDebes: 1 });
    expect(p.activos).toBe(1_518_000);
    expect(p.pasivos).toBe(59_000);
    expect(p.total).toBe(1_518_000 - 59_000);
    expect(p.cuentas).toHaveLength(4);
  });

  it('movimientos del detalle: saldo inicial, depósitos, retiros, ajustes al cuadrar e intereses por mes', () => {
    const c = cuenta({ tasa: 4.8 });
    const ms = [
      { ...mov('cuadre', 1_000_000, '2026-09-10') },
      { ...mov('deposito', 150_000, '2026-10-15'), nota: 'Depósito desde Cuenta RUT' },
      { ...mov('retiro', 20_000, '2026-11-09'), nota: 'Retiro a Efectivo' },
    ];
    const est = saldoCuenta(c, ms, '2026-11-20');
    ms.push(mov('cuadre', est + 6_700, '2026-11-20'));
    const filas = movimientosCuenta(c, ms, '2026-11-25');
    expect(filas.map((f) => [f.fecha, f.label, f.tipo])).toEqual([
      ['2026-11-20', 'Ajuste al cuadrar · intereses', 'ajuste'],
      ['2026-11-09', 'Retiro a Efectivo', 'retiro'],
      ['2026-11-01', 'Intereses de octubre', 'interes'],
      ['2026-10-15', 'Depósito desde Cuenta RUT', 'deposito'],
      ['2026-10-01', 'Intereses de septiembre', 'interes'],
      ['2026-09-10', 'Saldo inicial', 'inicial'],
    ]);
    expect(filas[0].monto).toBe(6_700);
    expect(filas[1].monto).toBe(-20_000);
    // Intereses de septiembre: ~21 días sobre 1.000.000 al 4,8% anual
    expect(filas[4].monto).toBeGreaterThan(2_600);
    expect(filas[4].monto).toBeLessThan(2_800);
  });

  it('historial para el gráfico: cierres de mes desde que existe la cuenta, y hoy', () => {
    const c = cuenta({ tasa: 0 });
    const ms = [mov('cuadre', 100, '2026-08-15'), mov('deposito', 50, '2026-10-02')];
    expect(historialCuenta(c, ms, '2026-11-25')).toEqual([
      { fecha: '2026-08-31', label: 'ago', saldo: 100 },
      { fecha: '2026-09-30', label: 'sep', saldo: 100 },
      { fecha: '2026-10-31', label: 'oct', saldo: 150 },
      { fecha: '2026-11-25', label: 'hoy', saldo: 150 },
    ]);
    // Cuenta nueva: el inicio y hoy
    expect(historialCuenta(c, [mov('cuadre', 7, '2026-11-20')], '2026-11-25').map((p) => p.label)).toEqual(['nov', 'hoy']);
    expect(historialCuenta(c, [], '2026-11-25')).toEqual([]);
  });

  it('equivalente anual de la tasa a 30 días', () => {
    expect(anualDesde30(0.45)).toBeCloseTo(5.475, 6);
  });
});

describe('operaciones de ahorro', () => {
  beforeEach(() => borrarTodo());

  it('crear una cuenta deja el saldo inicial como cuadre; traspasar mueve plata entre cuentas', async () => {
    const mp = await guardarCuenta({ nombre: ' Mercado Pago ', tipo: 'remunerada', tasa: 0, tasaUnidad: 'anual' }, 200_000, '2026-10-01');
    const rut = await guardarCuenta({ nombre: 'Cuenta RUT', tipo: 'vista' }, 50_000, '2026-10-01');
    await traspasar(rut, mp, 30_000, '2026-10-05');
    await cuadrar(rut, 18_000, '2026-10-06');
    await registrarMovAhorro(mp, 'retiro', 1_000, '2026-10-07');
    const [cs, ms] = [await db.cuentas.toArray(), await db.movAhorro.toArray()];
    const c = (id: string) => cs.find((x) => x.id === id)!;
    expect(c(mp).nombre).toBe('Mercado Pago');
    expect(saldoCuenta(c(mp), ms.filter((m) => m.cuentaId === mp), '2026-10-31')).toBe(229_000);
    expect(saldoCuenta(c(rut), ms.filter((m) => m.cuentaId === rut), '2026-10-31')).toBe(18_000);
    // Editar no agrega otro cuadre
    await guardarCuenta({ id: mp, nombre: 'MP', tipo: 'remunerada', tasa: 4.5 }, 1);
    expect(await db.movAhorro.where('cuentaId').equals(mp).count()).toBe(3);
    // Quitar: con historial se archiva
    await quitarCuenta(rut);
    expect((await db.cuentas.get(rut))?.archivada).toBe(true);
  });

  it('cobrar un DAP lo deposita en otra cuenta; renovarlo crea uno nuevo con el monto final', async () => {
    const d = await guardarCuenta({ nombre: 'DAP BancoEstado', tipo: 'dap', dap });
    const mp = await guardarCuenta({ nombre: 'MP', tipo: 'remunerada' }, 0, '2026-10-01');
    expect(await db.movAhorro.where('cuentaId').equals(d).count()).toBe(0);
    await cobrarDap(d, mp, '2026-10-31');
    expect((await db.cuentas.get(d))?.dap?.estado).toBe('cobrado');
    expect((await db.movAhorro.where('cuentaId').equals(mp).toArray()).find((m) => m.tipo === 'deposito')?.monto).toBe(1_004_500);

    const d2 = await guardarCuenta({ nombre: 'DAP 2', tipo: 'dap', dap });
    const d3 = await renovarDap(d2, { tasa30: 0.5, vencimiento: '2026-11-30' });
    expect((await db.cuentas.get(d2))?.dap?.estado).toBe('cobrado');
    expect((await db.cuentas.get(d3!))?.dap).toMatchObject({ monto: 1_004_500, inicio: '2026-10-31', vencimiento: '2026-11-30', estado: 'vigente' });
  });

  it('depositar y retirar mueven plata desde/hacia otra cuenta, con notas para el detalle', async () => {
    const mach = await guardarCuenta({ nombre: 'Mach', tipo: 'remunerada', tasa: 0 }, 100_000, '2026-10-01');
    const rut = await guardarCuenta({ nombre: 'Cuenta RUT', tipo: 'vista' }, 50_000, '2026-10-01');
    const ef = await asegurarEfectivo();
    expect(ef).toBe(ID_EFECTIVO);
    expect(await asegurarEfectivo()).toBe(ID_EFECTIVO);
    await moverPlata(mach, 'deposito', 20_000, rut, '2026-10-02');
    await moverPlata(mach, 'retiro', 5_000, ef, '2026-10-03');
    await moverPlata(mach, 'deposito', 1_000, undefined, '2026-10-04');
    const ms = await db.movAhorro.toArray();
    const saldo = async (id: string) => saldoCuenta((await db.cuentas.get(id))!, ms.filter((m) => m.cuentaId === id), '2026-10-31');
    expect(await saldo(mach)).toBe(116_000);
    expect(await saldo(rut)).toBe(30_000);
    expect(await saldo(ef)).toBe(5_000);
    expect(ms.filter((m) => m.cuentaId === mach).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((m) => m.nota).filter(Boolean)).toEqual(['Depósito desde Cuenta RUT', 'Retiro a Efectivo', 'Depósito']);
  });

  it('los depósitos a plazo con "renovar" se renuevan solos al vencer, con capital + intereses', async () => {
    await guardarCuenta({ nombre: 'BCI', tipo: 'dap', dap: { ...dap, renovar: true } });
    await guardarCuenta({ nombre: 'Itaú', tipo: 'dap', dap: { ...dap, renovar: false } });
    expect(await renovarVencidos('2026-10-30')).toBe(0);
    expect(await renovarVencidos('2026-12-05')).toBe(2); // vence el 31 oct y el 30 nov
    const vigentes = (await db.cuentas.toArray()).filter((c) => !c.archivada && c.tipo === 'dap');
    expect(vigentes.map((c) => [c.nombre, c.dap!.inicio, c.dap!.vencimiento, c.dap!.renovar]).sort()).toEqual([
      ['BCI', '2026-11-30', '2026-12-30', true],
      ['Itaú', '2026-10-01', '2026-10-31', false],
    ]);
    expect(vigentes.find((c) => c.nombre === 'BCI')!.dap!.monto).toBe(alVencerDap({ ...dap, monto: 1_004_500, inicio: '2026-10-31', vencimiento: '2026-11-30' }));
  });
});
