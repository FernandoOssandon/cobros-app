// Simula a alguien que tiene datos de la versión 1.0 en su teléfono y recibe la actualización.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';

describe('migración de la base v1 → v3', () => {
  it('convierte cargos en gastos sin perder nada', async () => {
    // 1) Base con el esquema de la v1.0 y datos reales de ejemplo.
    const viejo = new Dexie('me-debes');
    viejo.version(1).stores({ personas: 'id', cargos: 'id, fecha', movimientos: 'id, personaId, cargoId, fecha', cobros: 'id, personaId, fecha', ajustes: 'id' });
    await viejo.open();
    await viejo.table('personas').bulkAdd([
      { id: 'p1', nombre: 'Camila Rojas', telefono: '+56 9 1', archivada: false, color: 0, creado: '2026-10-01T10:00:00Z' },
      { id: 'p2', nombre: 'Diego', telefono: '', archivada: false, color: 1, creado: '2026-10-02T10:00:00Z' },
    ]);
    await viejo.table('cargos').add({
      id: 'c1', descripcion: 'Asado', total: 30000, fecha: '2026-10-12', modo: 'equal', yoIncluido: true,
      miParte: 10000, misPartes: 1, participantes: ['p1', 'p2'], exactos: {}, partes: {}, creado: '2026-10-12T20:00:00Z',
    });
    await viejo.table('movimientos').bulkAdd([
      { id: 'm1', personaId: 'p1', tipo: 'cargo', detalle: 'Asado', monto: 10000, fecha: '2026-10-12', cargoId: 'c1', creado: '2026-10-12T20:00:00Z' },
      { id: 'm2', personaId: 'p2', tipo: 'cargo', detalle: 'Asado', monto: 10000, fecha: '2026-10-12', cargoId: 'c1', creado: '2026-10-12T20:00:00Z' },
      { id: 'm3', personaId: 'p1', tipo: 'pago', detalle: 'Transferencia', monto: 5000, fecha: '2026-10-15', creado: '2026-10-15T09:00:00Z' },
    ]);
    await viejo.table('cobros').add({ id: 'k1', personaId: 'p2', fecha: '2026-10-20T15:00:00Z', medio: 'WhatsApp', tono: 'Amable', monto: 10000, mensaje: 'hola' });
    await viejo.table('ajustes').put({ id: 'main', miNombre: 'Seba', datosBancarios: 'Banco', incluirDatos: true, tema: 'oscuro', ultimoRespaldo: '2026-10-18T21:04:00Z' });
    viejo.close();

    // 2) Se abre con el código nuevo (corre la migración).
    const { db, CATEGORIAS_DEFAULT } = await import('../db');
    await db.open();
    expect(db.verno).toBe(5);
    expect(db.tables.map((t) => t.name)).not.toContain('cargos');
    // v5: tablas nuevas de Mi plata, vacías
    expect(await db.cuentas.count()).toBe(0);
    expect(await db.movAhorro.count()).toBe(0);
    expect(await db.detectados.count()).toBe(0);

    expect(await db.personas.count()).toBe(2);
    expect(await db.gastos.get('c1')).toMatchObject({ pagador: 'yo', total: 30000, miParte: 10000, participantes: ['p1', 'p2'] });
    const m1 = await db.movimientos.get('m1');
    expect(m1).toMatchObject({ gastoId: 'c1', tipo: 'cargo', monto: 10000 });
    expect(m1 as unknown as Record<string, unknown>).not.toHaveProperty('cargoId');
    expect(await db.movimientos.where('gastoId').equals('c1').count()).toBe(2);
    expect(await db.movimientos.get('m3')).toMatchObject({ tipo: 'pago', monto: 5000 });
    expect(await db.cobros.count()).toBe(1);
    expect(await db.ajustes.get('main')).toMatchObject({ miNombre: 'Seba', tema: 'oscuro', recordarRespaldo: true, ultimoRespaldo: '2026-10-18T21:04:00Z' });
    // v4: colores, efectivo incluido y montos por persona.
    const cats = await db.categorias.toArray();
    expect(cats).toHaveLength(CATEGORIAS_DEFAULT.length); // "Otros" se quitó porque nadie la usaba
    expect(cats.find((c) => c.id === 'cat-suscripciones')).toMatchObject({ icono: 'subs', color: '#D9B8FF' });
    expect((await db.medios.toArray()).map((m) => m.nombre)).toEqual(['Efectivo']);
    expect((await db.gastos.get('c1'))?.montos).toEqual({ p1: 10000, p2: 10000 });
    expect((await db.ajustes.get('main'))?.onboardingHecho).toBe(false);
  });
});
