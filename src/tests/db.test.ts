import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  db, crearPersona, guardarCargo, borrarCargo, restaurar, guardarPago, borrarPersona,
  exportarRespaldo, importarRespaldo, validarRespaldo, borrarTodo, registrarCobro,
} from '../db';
import { computeSplit } from '../lib/split';
import { saldo } from '../lib/balance';

const draft = { descripcion: 'Sushi', fecha: '2026-10-20', modo: 'equal' as const, yoIncluido: true, misPartes: 1, exactos: {}, partes: {} };

describe('base de datos', () => {
  beforeEach(async () => { await borrarTodo(); });

  it('un cargo compartido crea un movimiento vinculado por persona', async () => {
    const a = await crearPersona('Camila Rojas', '+56 9 1');
    const b = await crearPersona('Javiera Soto');
    const sp = computeSplit({ amount: 36000, ids: [a, b], me: true, mode: 'equal', exact: {}, parts: {}, myParts: 1 });
    const id = await guardarCargo(draft, sp);
    const movs = await db.movimientos.where('cargoId').equals(id).toArray();
    expect(movs).toHaveLength(2);
    expect(movs.every((m) => m.monto === 12000 && m.detalle === 'Sushi')).toBe(true);
    const c = await db.cargos.get(id);
    expect(c?.miParte).toBe(12000);
    expect(c?.participantes).toEqual([a, b]);
  });

  it('editar un cargo reemplaza los movimientos', async () => {
    const a = await crearPersona('A');
    const b = await crearPersona('B');
    const sp1 = computeSplit({ amount: 9000, ids: [a, b], me: true, mode: 'equal', exact: {}, parts: {}, myParts: 1 });
    const id = await guardarCargo(draft, sp1);
    const sp2 = computeSplit({ amount: 9000, ids: [a], me: false, mode: 'equal', exact: {}, parts: {}, myParts: 1 });
    await guardarCargo({ ...draft, descripcion: 'Sushi editado' }, sp2, id);
    const movs = await db.movimientos.where('cargoId').equals(id).toArray();
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ personaId: a, monto: 9000, detalle: 'Sushi editado' });
  });

  it('borrar un cargo se puede deshacer', async () => {
    const a = await crearPersona('A');
    const sp = computeSplit({ amount: 5000, ids: [a], me: false, mode: 'equal', exact: {}, parts: {}, myParts: 1 });
    const id = await guardarCargo(draft, sp);
    const snap = await borrarCargo(id);
    expect(await db.movimientos.count()).toBe(0);
    await restaurar(snap);
    expect(await db.movimientos.count()).toBe(1);
    expect(await db.cargos.get(id)).toBeTruthy();
  });

  it('pagos bajan el saldo y no se puede borrar a alguien con historial', async () => {
    const a = await crearPersona('A');
    const sp = computeSplit({ amount: 5000, ids: [a], me: false, mode: 'equal', exact: {}, parts: {}, myParts: 1 });
    await guardarCargo(draft, sp);
    await guardarPago(a, 2000, 'Efectivo', '2026-10-21');
    const movs = await db.movimientos.where('personaId').equals(a).toArray();
    expect(saldo(movs)).toBe(3000);
    expect(await borrarPersona(a)).toBe(false);
    const b = await crearPersona('B');
    expect(await borrarPersona(b)).toBe(true);
  });

  it('respaldo de ida y vuelta', async () => {
    const a = await crearPersona('A');
    const sp = computeSplit({ amount: 5000, ids: [a], me: false, mode: 'equal', exact: {}, parts: {}, myParts: 1 });
    await guardarCargo(draft, sp);
    await registrarCobro({ personaId: a, tono: 'Amable', monto: 5000, mensaje: 'hola' });
    const r = JSON.parse(JSON.stringify(await exportarRespaldo()));
    await borrarTodo();
    await importarRespaldo(validarRespaldo(r));
    expect(await db.personas.count()).toBe(1);
    expect(await db.movimientos.count()).toBe(1);
    expect(await db.cobros.count()).toBe(1);
    expect(() => validarRespaldo({ foo: 1 })).toThrow('no es un respaldo');
  });
});
