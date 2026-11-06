// 3.0: presupuestos con varias categorías, recurrentes sugeridos, cuentas en dólares y respaldo en Google Drive.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { cambiarMonedaCuenta, guardarCuenta, registrarMovAhorro } from '../ahorros';
import { construirRespaldo, importarRespaldo, validarRespaldo } from '../backup';
import { borrarTodo, cambiosDatos, db, guardarAjustes, type Categoria, type Cuenta, type Gasto, type MovAhorro, type Presupuesto, type Recurrente } from '../db';
import { patrimonio, resumenCuenta, saldoCuenta } from '../lib/ahorro';
import { CONSERVAR, ErrorDrive, listarRespaldos, nombreRespaldo, paraBorrar, subirRespaldo, type ArchivoDrive } from '../lib/drive';
import { flujosCuentas } from '../lib/flujos';
import { avancePresupuesto, categoriasDe } from '../lib/presupuestos';
import { sugerirRecurrentes } from '../lib/sugerencias';
import { categoriasPresupuesto, nombrePresupuesto } from '../ui/presupuesto';

const g = (p: Partial<Gasto>): Gasto => ({
  id: Math.random().toString(36).slice(2), descripcion: 'x', total: 1000, fecha: '2026-11-10', pagador: 'yo', modo: 'solo', yoIncluido: true,
  miParte: p.total ?? 1000, misPartes: 1, participantes: [], exactos: {}, partes: {}, creado: '2026-11-10T12:00:00Z', ...p,
});
const pres = (p: Partial<Presupuesto>): Presupuesto => ({ id: 'p', nombre: '', periodo: 'semana', monto: 100_000, archivado: false, orden: 1, creado: '', ...p });
const cat = (id: string, nombre: string, orden: number): Categoria => ({ id, nombre, icono: 'comida', color: '#fff', orden, archivada: false });

describe('presupuestos con varias categorías', () => {
  const gastos = [
    g({ categoriaId: 'cat-salidas', miParte: 30_000, fecha: '2026-11-10' }),
    g({ categoriaId: 'cat-comida', miParte: 20_000, fecha: '2026-11-11' }),
    g({ categoriaId: 'cat-casa', miParte: 600_000, fecha: '2026-11-11' }),
    g({ miParte: 5_000, fecha: '2026-11-12' }),
  ];
  it('cuenta solo las categorías elegidas (la transferencia de la casa no rompe el semanal de salidas y comida)', () => {
    const a = avancePresupuesto(pres({ categoriaIds: ['cat-salidas', 'cat-comida'] }), gastos, '2026-11-12');
    expect(a.gastado).toBe(50_000);
    expect(avancePresupuesto(pres({}), gastos, '2026-11-12').gastado).toBe(655_000);
  });
  it('lee los presupuestos de antes (una sola categoría)', () => {
    expect(categoriasDe({ categoriaId: 'cat-casa' })).toEqual(['cat-casa']);
    expect(avancePresupuesto(pres({ categoriaId: 'cat-casa', periodo: 'mes' }), gastos, '2026-11-12').gastado).toBe(600_000);
  });
  it('nombre: propio, armado con las categorías o el total', () => {
    const cats = [cat('cat-comida', 'Comida', 1), cat('cat-salidas', 'Salidas', 5)];
    const p = pres({ categoriaIds: ['cat-salidas', 'cat-comida'] });
    expect(nombrePresupuesto(p, categoriasPresupuesto(p, cats))).toBe('Comida y Salidas');
    expect(nombrePresupuesto({ ...p, nombre: 'Día a día' }, categoriasPresupuesto(p, cats))).toBe('Día a día');
    expect(nombrePresupuesto(pres({ periodo: 'mes' }), [])).toBe('Total mensual');
    // De la 2.7: manda el nombre actual de la categoría.
    expect(nombrePresupuesto(pres({ nombre: 'Comida vieja', categoriaId: 'cat-comida' }), [cats[0]])).toBe('Comida');
  });
  it('un respaldo de antes trae el presupuesto convertido', async () => {
    await borrarTodo();
    const r = await construirRespaldo();
    r.presupuestos = [pres({ id: 'viejo', nombre: 'Salidas', categoriaId: 'cat-salidas', periodo: 'mes' })];
    await importarRespaldo(validarRespaldo(JSON.parse(JSON.stringify({ ...r, version: 7 }))));
    expect(await db.presupuestos.get('viejo')).toMatchObject({ categoriaIds: ['cat-salidas'], nombre: '' });
    expect((await db.presupuestos.get('viejo'))?.categoriaId).toBeUndefined();
  });
});

describe('recurrentes sugeridos', () => {
  const pac = (fecha: string, total = 82_591) => g({ descripcion: 'Seguro BICE Vida (PAC)', total, fecha, medioId: 'deb', categoriaId: 'cat-seguros' });
  it('propone lo que se repite cada mes cerca del mismo día', () => {
    const s = sugerirRecurrentes([pac('2026-10-09', 82_262), pac('2026-11-05')], [], [], '2026-11-06');
    expect(s).toEqual([
      expect.objectContaining({ nombre: 'Seguro BICE Vida (PAC)', monto: 82_591, variable: false, dia: 5, medioId: 'deb', categoriaId: 'cat-seguros', fechas: ['2026-10-09', '2026-11-05'], inicio: '2026-12-05' }),
    ]);
  });
  it('si el monto cambia más de un 5 % se propone como variable', () => {
    expect(sugerirRecurrentes([pac('2026-10-05', 40_000), pac('2026-11-05')], [], [], '2026-11-06')[0].variable).toBe(true);
  });
  it('no propone lo que pasa dos veces en el mes, lo antiguo, lo que ya es recurrente ni lo descartado', () => {
    expect(sugerirRecurrentes([pac('2026-10-05'), pac('2026-11-05'), pac('2026-11-20')], [], [], '2026-11-21')).toEqual([]);
    expect(sugerirRecurrentes([pac('2026-06-05'), pac('2026-07-05')], [], [], '2026-11-06')).toEqual([]);
    expect(sugerirRecurrentes([pac('2026-09-05'), pac('2026-11-05')], [], [], '2026-11-06')).toEqual([]);
    const rec = { id: 'r', nombre: 'Seguro BICE Vida', tipo: 'mio', montoTipo: 'fijo', monto: 82_591, frecuencia: { unidad: 'mes', cada: 1, dia: 5 }, inicio: '2026-12-05', activo: true, creado: '' } as Recurrente;
    expect(sugerirRecurrentes([pac('2026-10-05'), pac('2026-11-05')], [rec], [], '2026-11-06')).toEqual([]);
    expect(sugerirRecurrentes([pac('2026-10-05'), pac('2026-11-05')], [], ['seguro bice vida (pac)'], '2026-11-06')).toEqual([]);
  });
});

describe('cuentas en dólares', () => {
  const meli: Cuenta = { id: 'meli', nombre: 'Meli Dólar', tipo: 'inversion', moneda: 'USD', color: '#fff', archivada: false, orden: 1, creado: '' };
  const movs: MovAhorro[] = [
    { id: '1', cuentaId: 'meli', tipo: 'cuadre', monto: 9.36, fecha: '2026-11-05', creado: '2026-11-05T12:00:00Z' },
    { id: '2', cuentaId: 'meli', tipo: 'deposito', monto: 10.5, fecha: '2026-11-06', creado: '2026-11-06T12:00:00Z' },
  ];
  it('el saldo va con centavos y en el patrimonio suma en pesos con el dólar del día', () => {
    expect(saldoCuenta(meli, movs, '2026-11-06')).toBe(19.86);
    const r = resumenCuenta(meli, movs, '2026-11-06', { USD: { valor: 980, fecha: '2026-11-06' } });
    expect(r).toMatchObject({ saldo: 19.86, saldoPesos: 19_463, valorMoneda: 980 });
    const p = patrimonio({ cuentas: [meli], movAhorro: movs, personas: [], movimientos: [], gastos: [], medios: [], indicadores: { USD: { valor: 980, fecha: '2026-11-06' } } }, '2026-11-06');
    expect(p.ahorros).toBe(19_463);
    // Sin el valor del día no suma (no se inventa un tipo de cambio).
    expect(patrimonio({ cuentas: [meli], movAhorro: movs, personas: [], movimientos: [], gastos: [], medios: [] }, '2026-11-06').ahorros).toBe(0);
  });
  it('los gastos y pagos en pesos no mueven una cuenta en dólares', () => {
    const out = flujosCuentas({
      cuentas: [meli], movAhorro: movs, medios: [{ id: 'd', nombre: 'Débito', tipo: 'debito', color: '', cuentaId: 'meli', archivado: false, orden: 1, creado: '' }],
      gastos: [g({ medioId: 'd', fecha: '2026-11-06', total: 5000 })], movimientos: [], pagosTarjeta: [],
    });
    expect(out).toHaveLength(2);
  });
  it('pasar una cuenta de pesos a dólares convierte su saldo con el valor de hoy', async () => {
    await borrarTodo();
    const id = await guardarCuenta({ nombre: 'Meli Dólar', tipo: 'inversion' }, 9167, '2026-11-05');
    await registrarMovAhorro(id, 'deposito', 980, '2026-11-06');
    await cambiarMonedaCuenta(id, 'USD', 980);
    const c = (await db.cuentas.get(id))!;
    expect(c.moneda).toBe('USD');
    expect((await db.movAhorro.where('cuentaId').equals(id).toArray()).map((m) => m.monto).sort()).toEqual([1, 9.35]);
    expect(saldoCuenta(c, await db.movAhorro.toArray(), '2026-11-06')).toBe(10.35);
  });
});

describe('Google Drive', () => {
  /** fetch de mentira que anota lo que se pidió. */
  const fakeFetch = (respuesta: (url: string, init?: RequestInit) => unknown, status = 200) => {
    const llamadas: { url: string; init?: RequestInit }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      llamadas.push({ url, init });
      return new Response(JSON.stringify(respuesta(url, init)), { status });
    }) as typeof fetch;
    return { f, llamadas };
  };

  it('el primer respaldo del día se crea en la carpeta; los siguientes reemplazan el mismo archivo', async () => {
    const { f, llamadas } = fakeFetch(() => ({ id: 'nuevo', name: 'x', modifiedTime: '2026-11-06T12:00:00Z' }));
    await subirRespaldo('tok', 'carpeta', nombreRespaldo('2026-11-06'), '{"app":"me-debes"}', undefined, f);
    expect(llamadas[0].url).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect(llamadas[0].init?.method).toBe('POST');
    expect((llamadas[0].init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const cuerpo = String(llamadas[0].init?.body);
    expect(cuerpo).toContain('"name":"a-mano-respaldo-2026-11-06.json"');
    expect(cuerpo).toContain('"parents":["carpeta"]');
    expect(cuerpo).toContain('{"app":"me-debes"}');
    await subirRespaldo('tok', 'carpeta', nombreRespaldo('2026-11-06'), '{}', 'hoy', f);
    expect(llamadas[1].url).toContain('/upload/drive/v3/files/hoy?uploadType=media');
    expect(llamadas[1].init?.method).toBe('PATCH');
  });

  it('lista solo los respaldos de la carpeta y avisa si el permiso venció', async () => {
    const { f, llamadas } = fakeFetch(() => ({ files: [] }));
    await listarRespaldos('tok', 'carpeta', f);
    expect(decodeURIComponent(llamadas[0].url)).toContain("'carpeta' in parents and trashed = false");
    const vencido = fakeFetch(() => ({}), 401);
    const e = await listarRespaldos('tok', 'carpeta', vencido.f).catch((x) => x);
    expect(e).toBeInstanceOf(ErrorDrive);
    expect(e.sinPermiso).toBe(true);
  });

  it('se guardan los últimos 30 días', () => {
    const archivos: ArchivoDrive[] = Array.from({ length: 33 }, (_, i) => {
      const f = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
      return { id: f, name: nombreRespaldo(f), modifiedTime: `${f}T12:00:00Z` };
    });
    expect(paraBorrar(archivos).map((a) => a.id)).toEqual(['2026-10-03', '2026-10-02', '2026-10-01']);
    expect(CONSERVAR).toBe(30);
  });

  it('avisa los cambios de datos (no los de ajustes) para respaldar', async () => {
    let n = 0;
    const contar = () => n++;
    cambiosDatos.addEventListener('cambio', contar);
    await db.gastos.add(g({ id: 'aviso' }));
    expect(n).toBe(1);
    await guardarAjustes({ miNombre: 'Otro' });
    expect(n).toBe(1);
    await db.gastos.delete('aviso');
    expect(n).toBe(2);
    cambiosDatos.removeEventListener('cambio', contar);
  });

  it('la conexión con Drive es de este teléfono: no viaja en el respaldo ni se pisa al restaurar', async () => {
    await borrarTodo();
    await guardarAjustes({ drive: { email: 'yo@gmail.com', carpetaId: 'c1' } });
    const r = await construirRespaldo();
    expect(r.ajustes).not.toHaveProperty('drive');
    await importarRespaldo(validarRespaldo(JSON.parse(JSON.stringify(r))));
    expect((await db.ajustes.get('main'))?.drive).toEqual({ email: 'yo@gmail.com', carpetaId: 'c1' });
  });
});
