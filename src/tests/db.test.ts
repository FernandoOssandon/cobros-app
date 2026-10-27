import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  db, crearPersona, guardarGasto, borrarGasto, restaurar, guardarPago, borrarPersona, borrarTodo,
  registrarCobro, agregarFoto, guardarMedio, CATEGORIAS_DEFAULT, type GastoDraft,
  guardarGrupo, archivarGrupo, borrarGrupo, restaurarGrupo, reemplazarFoto, actualizarCargo,
} from '../db';
import { construirRespaldo, importarRespaldo, validarRespaldo, diasSinRespaldo } from '../backup';
import { computeSplit } from '../lib/split';
import { saldo } from '../lib/balance';

const draft: GastoDraft = { descripcion: 'Sushi', fecha: '2026-10-20', modo: 'equal', yoIncluido: true, misPartes: 1, exactos: {}, partes: {} };
const iguales = (amount: number, ids: string[], me = true) =>
  computeSplit({ amount, ids, me, mode: 'equal', exact: {}, parts: {}, myParts: 1 });

describe('base de datos', () => {
  beforeEach(async () => {
    await borrarTodo();
  });

  it('trae las categorías por defecto (con color) y el efectivo en una base nueva', async () => {
    const cats = await db.categorias.toArray();
    expect(cats).toHaveLength(CATEGORIAS_DEFAULT.length);
    expect(cats.every((c) => /^#/.test(c.color))).toBe(true);
    expect((await db.medios.toArray()).map((m) => m.nombre)).toEqual(['Efectivo']);
  });

  it('guarda la parte de cada participante en el gasto', async () => {
    const a = await crearPersona('A');
    const d = await crearPersona('D');
    const id = await guardarGasto({ ...draft, pagador: d }, iguales(30000, [a, d]));
    expect((await db.gastos.get(id))?.montos).toEqual({ [a]: 10000, [d]: 10000 });
    expect((await db.movimientos.toArray()).map((m) => [m.personaId, m.tipo, m.monto])).toEqual([[d, 'deuda', 10000]]);
  });

  it('un gasto compartido crea un cargo vinculado por persona', async () => {
    const a = await crearPersona('Camila Rojas', '+56 9 1');
    const b = await crearPersona('Javiera Soto');
    const id = await guardarGasto(draft, iguales(36000, [a, b]));
    const movs = await db.movimientos.where('gastoId').equals(id).toArray();
    expect(movs).toHaveLength(2);
    expect(movs.every((m) => m.tipo === 'cargo' && m.monto === 12000 && m.detalle === 'Sushi')).toBe(true);
    const g = await db.gastos.get(id);
    expect(g).toMatchObject({ pagador: 'yo', miParte: 12000, participantes: [a, b] });
  });

  it('gasto solo mío: sin movimientos y mi parte es el total', async () => {
    const id = await guardarGasto({ ...draft, modo: 'solo', descripcion: 'Bencina' }, { amount: 30000, rows: [], mine: 30000, remaining: 0, ok: true });
    expect(await db.movimientos.count()).toBe(0);
    expect(await db.gastos.get(id)).toMatchObject({ miParte: 30000, participantes: [], yoIncluido: true });
  });

  it('pagó otra persona: queda como deuda mía con ella', async () => {
    const d = await crearPersona('Diego');
    await guardarGasto({ ...draft, pagador: d, medioId: 'x' }, iguales(9000, [], true));
    const movs = await db.movimientos.toArray();
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ personaId: d, tipo: 'deuda', monto: 9000 });
    expect(saldo(movs)).toBe(-9000);
    const [g] = await db.gastos.toArray();
    expect(g.medioId).toBeUndefined(); // el medio de pago solo aplica si pagué yo
    await guardarPago(d, 9000, 'Transferencia', '2026-10-21', undefined, 'abono');
    expect(saldo(await db.movimientos.toArray())).toBe(0);
  });

  it('editar un gasto reemplaza los movimientos', async () => {
    const a = await crearPersona('A');
    const b = await crearPersona('B');
    const id = await guardarGasto(draft, iguales(9000, [a, b]));
    await guardarGasto({ ...draft, descripcion: 'Sushi editado' }, iguales(9000, [a], false), id);
    const movs = await db.movimientos.where('gastoId').equals(id).toArray();
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ personaId: a, monto: 9000, detalle: 'Sushi editado' });
  });

  it('borrar un gasto (con foto) se puede deshacer', async () => {
    const a = await crearPersona('A');
    const id = await guardarGasto(draft, iguales(5000, [a], false));
    await agregarFoto(id, new Blob(['img'], { type: 'image/png' }));
    const snap = await borrarGasto(id);
    expect(await db.movimientos.count()).toBe(0);
    expect(await db.fotos.count()).toBe(0);
    await restaurar(snap);
    expect(await db.movimientos.count()).toBe(1);
    expect(await db.fotos.count()).toBe(1);
    expect(await db.gastos.get(id)).toBeTruthy();
  });

  it('pagos bajan el saldo y no se puede borrar a alguien con historial', async () => {
    const a = await crearPersona('A');
    await guardarGasto(draft, iguales(5000, [a], false));
    await guardarPago(a, 2000, 'Efectivo', '2026-10-21');
    expect(saldo(await db.movimientos.where('personaId').equals(a).toArray())).toBe(3000);
    expect(await borrarPersona(a)).toBe(false);
    const b = await crearPersona('B');
    expect(await borrarPersona(b)).toBe(true);
  });

  it('respaldo v3 de ida y vuelta, con fotos y medios', async () => {
    const a = await crearPersona('A');
    const medio = await guardarMedio({ nombre: 'Visa BCI', tipo: 'credito', color: '#9EC9FF' });
    const id = await guardarGasto({ ...draft, medioId: medio }, iguales(5000, [a], false));
    await agregarFoto(id, new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/jpeg' }));
    await registrarCobro({ personaId: a, tono: 'Amable', monto: 5000, mensaje: 'hola' });
    const r = JSON.parse(JSON.stringify(await construirRespaldo()));
    await borrarTodo();
    await importarRespaldo(validarRespaldo(r));
    expect(await db.personas.count()).toBe(1);
    expect(await db.movimientos.count()).toBe(1);
    expect(await db.cobros.count()).toBe(1);
    expect((await db.medios.toArray())[0].nombre).toBe('Visa BCI');
    const [foto] = await db.fotos.toArray();
    expect([...new Uint8Array(await foto.blob.arrayBuffer())]).toEqual([1, 2, 3, 250]);
    expect(foto.blob.type).toBe('image/jpeg');
  });

  it('importa respaldos v2 (primera versión de la app)', async () => {
    const v2 = {
      app: 'me-debes', version: 2, exportado: '2026-10-22T00:00:00Z',
      personas: [{ id: 'p1', nombre: 'Camila', telefono: '', archivada: false, color: 0, creado: '2026-10-01' }],
      cargos: [{ id: 'c1', descripcion: 'Asado', total: 20000, fecha: '2026-10-12', modo: 'equal', yoIncluido: true, miParte: 10000, misPartes: 1, participantes: ['p1'], exactos: {}, partes: {}, creado: '2026-10-12' }],
      movimientos: [
        { id: 'm1', personaId: 'p1', tipo: 'cargo', detalle: 'Asado', monto: 10000, fecha: '2026-10-12', cargoId: 'c1', creado: '2026-10-12' },
        { id: 'm2', personaId: 'p1', tipo: 'pago', detalle: 'Efectivo', monto: 4000, fecha: '2026-10-13', creado: '2026-10-13' },
      ],
      cobros: [],
      ajustes: { id: 'main', miNombre: 'Seba', datosBancarios: 'x', incluirDatos: true, tema: 'sistema' },
    };
    await importarRespaldo(validarRespaldo(v2));
    expect(await db.gastos.get('c1')).toMatchObject({ pagador: 'yo', total: 20000 });
    expect(await db.movimientos.get('m1')).toMatchObject({ gastoId: 'c1' });
    expect((await db.movimientos.get('m1')) as unknown as Record<string, unknown>).not.toHaveProperty('cargoId');
    expect(await db.categorias.count()).toBe(CATEGORIAS_DEFAULT.length); // se conservan las categorías
    expect((await db.ajustes.get('main'))?.recordarRespaldo).toBe(true);
  });

  it('rechaza archivos que no son respaldos', () => {
    expect(() => validarRespaldo({ foo: 1 })).toThrow('no es un respaldo');
    expect(() => validarRespaldo({ app: 'me-debes', version: 3, personas: [] })).toThrow('incompleto');
  });

  it('días sin respaldo: desde el último respaldo o desde el primer registro', () => {
    const hoy = new Date('2026-10-25T12:00:00');
    const base = { id: 'main' as const, miNombre: '', datosBancarios: '', incluirDatos: true, tema: 'sistema' as const, recordarRespaldo: true, onboardingHecho: true };
    expect(diasSinRespaldo(base, undefined, hoy)).toBeNull();
    expect(diasSinRespaldo(base, '2026-10-15T12:00:00', hoy)).toBe(10);
    expect(diasSinRespaldo({ ...base, ultimoRespaldo: '2026-10-22T12:00:00' }, '2026-10-01', hoy)).toBe(3);
  });

  it('borrar un grupo deja los gastos sin grupo y deshacer los devuelve', async () => {
    const gid = await guardarGrupo('Viaje a Pucón');
    const a = await guardarGasto({ ...draft, grupoId: gid }, iguales(10000, []));
    const b = await guardarGasto({ ...draft, grupoId: gid }, iguales(20000, []));
    await archivarGrupo(gid, true);
    expect((await db.grupos.get(gid))?.archivado).toBe(true);
    await guardarGrupo('Pucón 2026', gid);
    expect(await db.grupos.get(gid)).toMatchObject({ nombre: 'Pucón 2026', archivado: true });

    const snap = await borrarGrupo(gid);
    expect(await db.grupos.get(gid)).toBeUndefined();
    expect((await db.gastos.bulkGet([a, b])).map((g) => g?.grupoId)).toEqual([undefined, undefined]);
    expect(await db.gastos.count()).toBe(2);

    await restaurarGrupo(snap!);
    expect((await db.gastos.bulkGet([a, b])).map((g) => g?.grupoId)).toEqual([gid, gid]);
  });

  it('reemplazar la foto deja una sola por gasto', async () => {
    const id = await guardarGasto(draft, iguales(5000, []));
    await agregarFoto(id, new Blob(['a']));
    await reemplazarFoto(id, new Blob(['bb']));
    const fotos = await db.fotos.where('gastoId').equals(id).toArray();
    expect(fotos).toHaveLength(1);
    expect(fotos[0].blob.size).toBe(2);
  });

  it('editar una cuota suelta cambia el saldo', async () => {
    const p = await crearPersona('Seba');
    await db.movimientos.put({ id: 'r1@2026-10-01', personaId: p, tipo: 'cargo', detalle: 'Cuota', monto: 20000, fecha: '2026-10-01', recurrenteId: 'r1', creado: '' });
    await actualizarCargo('r1@2026-10-01', { monto: 15000, fecha: '2026-10-05', detalle: '  ' });
    const m = await db.movimientos.get('r1@2026-10-01');
    expect(m).toMatchObject({ monto: 15000, fecha: '2026-10-05', detalle: 'Cargo', recurrenteId: 'r1' });
    expect(saldo(await db.movimientos.where('personaId').equals(p).toArray())).toBe(15000);
  });
});
