import { describe, expect, it } from 'vitest';
import { computeSplit, type SplitInput } from '../lib/split';
import { fmt, pressKey, shortDate, relativeDays, initials } from '../lib/format';
import { saldo, pctPagado, estadosCargos, cargosPendientes } from '../lib/balance';
import { telefonoWa, conDatos, mensajesCobro } from '../lib/messages';
import { movimientosCsv } from '../lib/csv';
import type { Movimiento } from '../db';

const base: SplitInput = { amount: 0, ids: [], me: true, mode: 'equal', exact: {}, parts: {}, myParts: 1 };
const sum = (r: ReturnType<typeof computeSplit>) => r.rows.reduce((s, x) => s + x.v, 0) + r.mine;

describe('formato', () => {
  it('formatea CLP con separador de miles y menos tipográfico', () => {
    expect(fmt(79500)).toBe('$79.500');
    expect(fmt(-1000)).toBe('−$1.000');
    expect(fmt(0)).toBe('$0');
  });
  it('teclado: sin ceros a la izquierda, máx 9 dígitos, borrar', () => {
    expect(pressKey('', '0')).toBe('');
    expect(pressKey('', '00')).toBe('');
    expect(pressKey('5', '00')).toBe('500');
    expect(pressKey('123456789', '1')).toBe('123456789');
    expect(pressKey('12', '⌫')).toBe('1');
  });
  it('fechas cortas y relativas', () => {
    const now = new Date(2026, 9, 22);
    expect(shortDate('2026-10-03', now)).toBe('3 oct');
    expect(shortDate('2025-12-31', now)).toBe('31 dic 2025');
    expect(relativeDays('2026-10-22T10:00:00', now)).toBe('hoy');
    expect(relativeDays('2026-10-21', now)).toBe('ayer');
    expect(relativeDays('2026-10-10', now)).toBe('hace 12 días');
  });
  it('iniciales', () => {
    expect(initials('Camila Rojas')).toBe('CR');
    expect(initials('  javi ')).toBe('J');
  });
});

describe('reparto', () => {
  it('iguales con yo incluido: el resto queda en mi parte', () => {
    const r = computeSplit({ ...base, amount: 10000, ids: ['a', 'b'] });
    expect(r.rows.map((x) => x.v)).toEqual([3333, 3333]);
    expect(r.mine).toBe(3334);
    expect(sum(r)).toBe(10000);
    expect(r.ok).toBe(true);
  });
  it('iguales sin mí: el resto se reparte de a $1 entre los primeros', () => {
    const r = computeSplit({ ...base, amount: 10001, ids: ['a', 'b', 'c'], me: false });
    expect(r.rows.map((x) => x.v)).toEqual([3334, 3334, 3333]);
    expect(r.mine).toBe(0);
    expect(sum(r)).toBe(10001);
  });
  it('exactos: valida según si estoy incluido', () => {
    const over = computeSplit({ ...base, mode: 'exact', amount: 10000, ids: ['a', 'b'], exact: { a: 6000, b: 5000 } });
    expect(over.remaining).toBe(-1000);
    expect(over.ok).toBe(false);
    const meRest = computeSplit({ ...base, mode: 'exact', amount: 10000, ids: ['a'], exact: { a: 4000 } });
    expect(meRest.ok).toBe(true);
    expect(meRest.mine).toBe(6000);
    const notMe = computeSplit({ ...base, me: false, mode: 'exact', amount: 10000, ids: ['a'], exact: { a: 4000 } });
    expect(notMe.ok).toBe(false);
    const exact = computeSplit({ ...base, me: false, mode: 'exact', amount: 10000, ids: ['a', 'b'], exact: { a: 4000, b: 6000 } });
    expect(exact.ok).toBe(true);
  });
  it('partes: 2 partes paga el doble y la suma siempre cuadra', () => {
    const r = computeSplit({ ...base, mode: 'shares', amount: 36000, ids: ['a', 'b'], parts: { a: 2 } });
    expect(r.rows.map((x) => x.v)).toEqual([18000, 9000]);
    expect(r.mine).toBe(9000);
    const odd = computeSplit({ ...base, me: false, mode: 'shares', amount: 10000, ids: ['a', 'b', 'c'] });
    expect(sum(odd)).toBe(10000);
    expect(odd.mine).toBe(0);
  });
  it('partes con monto ínfimo no deja mi parte negativa', () => {
    const r = computeSplit({ ...base, mode: 'shares', amount: 5, ids: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] });
    expect(r.ok).toBe(false);
  });
  it('sin monto o sin personas no es válido', () => {
    expect(computeSplit({ ...base, amount: 0, ids: ['a'] }).ok).toBe(false);
    expect(computeSplit({ ...base, amount: 100, ids: [] }).ok).toBe(false);
  });
});

const mv = (id: string, tipo: 'cargo' | 'pago', monto: number, fecha: string, detalle = 'x'): Movimiento => ({
  id, personaId: 'p', tipo, monto, fecha, detalle, creado: fecha,
});

describe('saldos', () => {
  const movs = [mv('1', 'cargo', 7200, '2026-10-03', 'Uber'), mv('2', 'cargo', 18500, '2026-10-12', 'Asado'), mv('3', 'pago', 10000, '2026-10-15')];
  it('saldo y % pagado', () => {
    expect(saldo(movs)).toBe(15700);
    expect(pctPagado(movs)).toBe(39);
  });
  it('los pagos cubren primero los cargos más antiguos', () => {
    const e = estadosCargos(movs);
    expect(e.get('1')).toEqual({ estado: 'pagado', pendiente: 0 });
    expect(e.get('2')).toEqual({ estado: 'parcial', pendiente: 15700 });
    expect(cargosPendientes(movs)).toEqual(['asado']);
  });
});

describe('cobro por WhatsApp', () => {
  it('normaliza teléfonos chilenos', () => {
    expect(telefonoWa('+56 9 8123 4567')).toBe('56981234567');
    expect(telefonoWa('9 8123 4567')).toBe('56981234567');
    expect(telefonoWa('')).toBe('');
  });
  it('agrega datos bancarios y firma', () => {
    expect(conDatos('Hola', 'Banco X', 'Seba', true)).toBe('Hola\n\nBanco X\nSeba');
    expect(conDatos('Hola', 'Banco X', 'Seba', false)).toBe('Hola');
    expect(mensajesCobro('Cami', '$1.000', ['uber'])[1]).toBe('Hola Cami, te recuerdo que me debes $1.000 por uber. ¿Me lo transfieres hoy?');
  });
});

describe('csv', () => {
  it('usa ; y escapa comillas', () => {
    const csv = movimientosCsv(
      [{ id: 'p', nombre: 'Ana', telefono: '', archivada: false, color: 0, creado: '' }],
      [mv('1', 'cargo', 500, '2026-10-01', 'Pan "rico"; y café')],
      [],
    );
    expect(csv.startsWith('﻿Fecha;Persona')).toBe(true);
    expect(csv).toContain('"Pan ""rico""; y café"');
  });
});
