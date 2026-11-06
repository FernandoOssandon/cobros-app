// Alguien con la 2.7 (base v9) recibe la 3.0: sus presupuestos de una categoría pasan a la lista de categorías.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';

describe('migración de la base v9 → v10', () => {
  it('convierte el presupuesto de una categoría sin perder nada', async () => {
    const viejo = new Dexie('me-debes');
    viejo.version(9).stores({ presupuestos: 'id', ajustes: 'id' });
    await viejo.open();
    await viejo.table('presupuestos').bulkAdd([
      { id: 'casa', nombre: 'Casa', periodo: 'mes', monto: 150_000, categoriaId: 'cat-casa', archivado: false, orden: 1, creado: '2026-10-01T00:00:00Z' },
      { id: 'total', nombre: 'Total semanal', periodo: 'semana', monto: 200_000, archivado: false, orden: 2, creado: '2026-10-01T00:00:00Z' },
    ]);
    viejo.close();

    const { db } = await import('../db');
    await db.open();
    expect(db.verno).toBe(10);
    const casa = await db.presupuestos.get('casa');
    expect(casa).toMatchObject({ categoriaIds: ['cat-casa'], nombre: '', monto: 150_000, periodo: 'mes' });
    expect(casa).not.toHaveProperty('categoriaId');
    expect(await db.presupuestos.get('total')).toMatchObject({ nombre: 'Total semanal', periodo: 'semana' });
    expect((await db.presupuestos.get('total'))?.categoriaIds).toBeUndefined();
  });
});
