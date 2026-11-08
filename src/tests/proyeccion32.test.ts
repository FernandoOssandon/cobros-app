// 3.2: ¿cómo termino el mes? Proyección hasta el sueldo y cierre del ciclo.
import { describe, expect, it } from 'vitest';
import type { Cuenta, Gasto, Ingreso, Medio, MovAhorro, PagoTarjeta, Pendiente, Recurrente } from '../db';
import { imputar } from '../lib/cuotas';
import { cicloActual, cicloAnterior, cuentaParaElMes, proyectar, resumenCiclo, tocaCierre, type FuentesProyeccion } from '../lib/proyeccion';

const HOY = '2026-11-06';
const g = (p: Partial<Gasto>): Gasto => ({
  id: Math.random().toString(36).slice(2), descripcion: 'x', total: 1000, fecha: '2026-11-01', pagador: 'yo', modo: 'solo', yoIncluido: true,
  miParte: p.total ?? 1000, misPartes: 1, participantes: [], exactos: {}, partes: {}, creado: '2026-11-01T12:00:00Z', ...p,
});
const cuenta = (id: string, tipo: Cuenta['tipo'], extra: Partial<Cuenta> = {}): Cuenta => ({ id, nombre: id, tipo, color: '#fff', archivada: false, orden: 1, creado: '', ...extra });
const cuadre = (cuentaId: string, monto: number, fecha = '2026-11-01'): MovAhorro => ({ id: `c-${cuentaId}-${fecha}`, cuentaId, tipo: 'cuadre', monto, fecha, creado: `${fecha}T12:00:00Z` });
const rec = (p: Partial<Recurrente>): Recurrente => ({
  id: Math.random().toString(36).slice(2), nombre: 'r', tipo: 'mio', montoTipo: 'fijo', monto: 1000, frecuencia: { unidad: 'mes', cada: 1, dia: 1 }, inicio: '2026-01-01', activo: true, creado: '2026-01-01', ...p,
});

const visa: Medio = { id: 'visa', nombre: 'Visa', tipo: 'credito', color: '#000', diaFacturacion: 25, cuentaId: 'cc', archivado: false, orden: 1, creado: '' };
const debito: Medio = { id: 'deb', nombre: 'Débito', tipo: 'debito', color: '#000', cuentaId: 'cc', archivado: false, orden: 2, creado: '' };
const sueldo = rec({ id: 'sueldo', nombre: 'Sueldo', tipo: 'ingreso', monto: 1_500_000, frecuencia: { unidad: 'mes', cada: 1, dia: 25 }, inicio: '2026-10-25', cuentaId: 'cc', generadoHasta: '2026-10-25' });

function fuentes(saldoCC: number): FuentesProyeccion {
  const gastos = [
    g({ descripcion: 'Compra cerrada', total: 300_000, fecha: '2026-10-20', medioId: 'visa' }),
    g({ descripcion: 'Zapatillas', total: 60_000, fecha: '2026-10-10', medioId: 'visa', cuotas: 3 }),
    g({ descripcion: 'Super', total: 50_000, fecha: '2026-11-02', medioId: 'visa' }),
    g({ descripcion: 'Notebook', total: 90_000, fecha: '2026-11-03', medioId: 'visa', cuotas: 3 }),
    g({ descripcion: 'Transferencia a mamá', total: 600_000, fecha: '2026-11-04', medioId: 'deb' }),
  ];
  const recurrentes = [
    sueldo,
    rec({ nombre: 'Netflix', monto: 10_000, frecuencia: { unidad: 'mes', cada: 1, dia: 15 }, medioId: 'visa', generadoHasta: '2026-10-15' }),
    rec({ id: 'luz', nombre: 'Luz', montoTipo: 'variable', monto: 30_000, frecuencia: { unidad: 'mes', cada: 1, dia: 2 }, generadoHasta: '2026-11-02' }),
    rec({ nombre: 'Arriendo', monto: 400_000, frecuencia: { unidad: 'mes', cada: 1, dia: 20 }, medioId: 'deb', generadoHasta: '2026-10-20' }),
    rec({ nombre: 'Le cobro a Ana', tipo: 'cobro', monto: 5_000, frecuencia: { unidad: 'mes', cada: 1, dia: 10 }, generadoHasta: '2026-10-10' }),
    rec({ nombre: 'Arriendo pieza', tipo: 'ingreso', monto: 100_000, frecuencia: { unidad: 'mes', cada: 1, dia: 15 }, cuentaId: 'cc', generadoHasta: '2026-10-15' }),
  ];
  const pendientes: Pendiente[] = [{ id: 'luz@2026-11-02', recurrenteId: 'luz', fecha: '2026-11-02', tipo: 'confirmar', creado: '' }];
  const pagosTarjeta: PagoTarjeta[] = [{ id: 'p1', medioId: 'visa', cuentaId: 'cc', monto: 100_000, fecha: '2026-10-28', creado: '2026-10-28T12:00:00Z' }];
  const ingresos: Ingreso[] = [{ id: 'i1', descripcion: 'Sueldo', tipo: 'sueldo', monto: 1_500_000, fecha: '2026-10-25', cuentaId: 'cc', recurrenteId: 'sueldo', creado: '' }];
  const cuentas = [cuenta('cc', 'vista'), cuenta('ahorro', 'remunerada'), cuenta('dolares', 'vista', { moneda: 'USD' })];
  return {
    cuentas,
    movCuentas: [cuadre('cc', saldoCC), cuadre('ahorro', 1_000_000), cuadre('dolares', 50)],
    gastos,
    imputados: imputar(gastos),
    movimientos: [],
    medios: [visa, debito],
    recurrentes,
    pendientes,
    pagosTarjeta,
    ingresos,
  };
}

describe('el ciclo de sueldo a sueldo', () => {
  it('va del último sueldo al próximo; si el de hoy ya llegó, hasta el del mes siguiente', () => {
    expect(cicloActual([sueldo], HOY)).toMatchObject({ inicio: '2026-10-25', hasta: '2026-11-25', dias: 19, transcurridos: 13 });
    expect(cicloActual([{ ...sueldo, generadoHasta: '2026-11-25' }], '2026-11-25')).toMatchObject({ inicio: '2026-11-25', hasta: '2026-12-25', dias: 30 });
    expect(cicloAnterior([sueldo], HOY)).toMatchObject({ inicio: '2026-09-25', hasta: '2026-10-25' });
  });
  it('sin sueldo fijo, el mes calendario', () => {
    expect(cicloActual([], HOY)).toMatchObject({ inicio: '2026-11-01', hasta: '2026-12-01', dias: 25 });
    expect(cicloAnterior([], HOY)).toMatchObject({ inicio: '2026-10-01', hasta: '2026-11-01' });
  });
  it('cuentan las corrientes, vista y efectivo; las demás si las eliges; nunca los depósitos ni otras monedas', () => {
    expect(cuentaParaElMes(cuenta('a', 'vista'))).toBe(true);
    expect(cuentaParaElMes(cuenta('a', 'efectivo'))).toBe(true);
    expect(cuentaParaElMes(cuenta('a', 'remunerada'))).toBe(false);
    expect(cuentaParaElMes(cuenta('a', 'remunerada', { paraElMes: true }))).toBe(true);
    expect(cuentaParaElMes(cuenta('a', 'vista', { paraElMes: false }))).toBe(false);
    expect(cuentaParaElMes(cuenta('a', 'dap', { paraElMes: true }))).toBe(false);
    expect(cuentaParaElMes(cuenta('a', 'vista', { moneda: 'USD' }))).toBe(false);
  });
});

describe('la proyección hasta el sueldo', () => {
  it('lo que tienes + lo que entra − tarjetas − lo que viene, dividido por los días', () => {
    const p = proyectar(fuentes(800_000), HOY);
    expect(p.tienes).toBe(800_000);
    expect(p.enAhorros).toBe(1_000_000);
    // Visa: facturado al 25 oct = 300.000 + cuota 1 de 20.000; pagado 100.000 → 220.000. Abierto: 50.000 + cuota 1 de 30.000.
    expect(p.tarjetas).toMatchObject([{ porPagar: 220_000, abierto: 80_000, total: 300_000, cierre: '2026-10-25', desde: '2026-10-26' }]);
    expect(p.viene.map((v) => [v.tipo, v.label, v.fecha, v.monto])).toEqual([
      ['confirmar', 'Luz', '2026-11-02', -30_000],
      ['cuota', 'Zapatillas · cuota 2/3', '2026-11-10', -20_000],
      ['recurrente', 'Netflix', '2026-11-15', -10_000],
      ['ingreso', 'Arriendo pieza', '2026-11-15', 100_000],
      ['recurrente', 'Arriendo', '2026-11-20', -400_000],
    ]);
    expect(p.entra).toBe(100_000);
    expect(p.sale).toBe(460_000);
    expect(p.libre).toBe(140_000);
    expect(p.porDia).toBe(Math.floor(140_000 / 19));
    expect(p.avisos).toEqual([]);
  });

  it('el ritmo no cuenta recurrentes, cuotas de compras de antes ni gastos grandes', () => {
    const p = proyectar(fuentes(800_000), HOY);
    expect(p.grandes.map((x) => x.descripcion)).toEqual(['Transferencia a mamá']);
    expect(p.ritmo).toBe(Math.round(80_000 / 13));
    expect(p.aEsteRitmo).toBe(140_000 - p.ritmo * 18);
  });

  it('avisa si la cuenta que paga la tarjeta y el arriendo no alcanza', () => {
    const p = proyectar(fuentes(300_000), HOY);
    expect(p.libre).toBe(-360_000);
    expect(p.porDia).toBe(0);
    expect(p.avisos).toHaveLength(1);
    expect(p.avisos[0]).toMatchObject({ falta: 220_000, motivo: 'pagar la Visa y Arriendo' });
  });

  it('una cuenta de ahorro que eliges pasa a contar', () => {
    const f = fuentes(300_000);
    f.cuentas = f.cuentas.map((c) => (c.id === 'ahorro' ? { ...c, paraElMes: true } : c));
    const p = proyectar(f, HOY);
    expect(p.tienes).toBe(1_300_000);
    expect(p.enAhorros).toBe(0);
    expect(p.libre).toBe(640_000);
  });

  it('sin cuentas que cuenten, lo dice', () => {
    const f = fuentes(0);
    f.cuentas = [cuenta('ahorro', 'remunerada')];
    expect(proyectar(f, HOY).sinCuentas).toBe(true);
  });
});

describe('el cierre del ciclo', () => {
  const f = fuentes(800_000);
  it('se ofrece los primeros días después del sueldo, si no lo cerraste', () => {
    const recs = f.recurrentes.map((r) => (r.id === 'sueldo' ? { ...r, generadoHasta: '2026-11-25' } : r));
    expect(tocaCierre(recs, f.gastos, undefined, '2026-11-27')).toMatchObject({ inicio: '2026-10-25', hasta: '2026-11-25' });
    expect(tocaCierre(recs, f.gastos, '2026-10-25', '2026-11-27')).toBeUndefined();
    expect(tocaCierre(recs, f.gastos, undefined, '2026-12-10')).toBeUndefined();
    // Si empezaste a anotar a mitad del ciclo, no se ofrece (todavía no hay un ciclo completo).
    expect(tocaCierre(recs, [{ fecha: '2026-11-15' }], undefined, '2026-11-27')).toBeUndefined();
  });
  it('cómo te fue: ingresos, gasto real y lo que quedó', () => {
    const recs = f.recurrentes.map((r) => (r.id === 'sueldo' ? { ...r, generadoHasta: '2026-11-25' } : r));
    const r = resumenCiclo(cicloAnterior(recs, '2026-11-27'), { ...f, recurrentes: recs });
    expect(r).toMatchObject({ ingresos: 1_500_000, gastoReal: 700_000, quedo: 800_000, nGastos: 3, sinCategoria: 3 });
    expect(r.incompletoDesde).toBeUndefined();
    const antes = resumenCiclo(cicloAnterior([sueldo], HOY), f);
    expect(antes.incompletoDesde).toBe('2026-10-10');
  });
});
