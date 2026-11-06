/// <reference types="node" />
// 2.7: importar cartolas (Santander cuenta y CMR), traspasos entre cuentas y respaldo v8.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { borrarMovAhorro, guardarCuenta, moverPlata } from '../ahorros';
import { construirRespaldo, importarRespaldo, validarRespaldo } from '../backup';
import { db } from '../db';
import { aplicarImportacion } from '../importar';
import { saldoCuenta } from '../lib/ahorro';
import { saldo } from '../lib/balance';
import { claveDetalle, descripcionDe, reconocerCartola, type Cartola } from '../lib/bancos';
import { flujosCuentas } from '../lib/flujos';
import {
  alineacion, compararCompras, compararSaldos, decisionesIniciales, efectos, efectosComoMovs, esTitular, huellas, personasNombradas, registrosApp, revisar,
  type DatosImportar, type Destino, type Revision,
} from '../lib/importar';
import { leerXlsx } from '../lib/xlsx';

const FIX = path.join(__dirname, '../../e2e/fixtures');
const archivo = async (n: string) => reconocerCartola(await leerXlsx(readFileSync(path.join(FIX, n))));

async function datos(): Promise<DatosImportar> {
  const [gastos, movimientos, ingresos, movAhorro, pagosTarjeta, medios, cuentas, personas, categorias, recurrentes, importados] = await Promise.all([
    db.gastos.toArray(), db.movimientos.toArray(), db.ingresos.toArray(), db.movAhorro.toArray(), db.pagosTarjeta.toArray(), db.medios.toArray(),
    db.cuentas.toArray(), db.personas.toArray(), db.categorias.toArray(), db.recurrentes.toArray(), db.importados.toArray(),
  ]);
  const saldoPersona = new Map(personas.map((p) => [p.id, saldo(movimientos.filter((m) => m.personaId === p.id))]));
  return { gastos, movimientos, ingresos, movAhorro, pagosTarjeta, medios, cuentas, personas, categorias, recurrentes, importados, saldoPersona };
}

const grupos = (r: Revision) => {
  const g: Record<string, number> = {};
  for (const x of r.items) g[x.grupo] = (g[x.grupo] ?? 0) + 1;
  return g;
};

/** Saldo al último día del archivo según el banco y según la app (con decisiones simuladas o ya aplicadas). */
async function comparar(r: Revision, conDecisiones = true) {
  const d = await datos();
  const c = d.cuentas.find((x) => x.id === 'rut')!;
  const dec = conDecisiones ? decisionesIniciales(r) : undefined;
  const ef = [...(dec ? efectos(r, dec, d.medios) : []), ...alineacion(r, dec, d)];
  const movs = [...flujosCuentas(d).filter((m) => m.cuentaId === c.id), ...efectosComoMovs(c.id, ef, r)];
  return compararSaldos(r.cartola, r.inicio, (f) => saldoCuenta(c, movs, f));
}

describe('leer cartolas', () => {
  it('Santander: titular, cuenta, orden cronológico y saldo final', async () => {
    const c = await archivo('cartola-santander.xlsx');
    expect(c).toMatchObject({ formato: 'santander-cuenta', tipo: 'cuenta', clave: 'santander:0-000-12-34567-8', titular: 'Sebastian Andres Rojas Perez', desde: '2026-10-30', hasta: '2026-11-24', saldoFinal: 1894605 });
    expect(c.lineas).toHaveLength(10);
    expect(c.lineas[0]).toMatchObject({ fecha: '2026-10-30', monto: -4500, orden: 0 });
    expect(c.lineas[9]).toMatchObject({ fecha: '2026-11-24', monto: -42380, saldo: 1894605 });
  });

  it('CMR: compras en cuotas, pagos con signo negativo y fechas que cubre', async () => {
    const c = await archivo('cmr-ultimos.xlsx');
    expect(c).toMatchObject({ formato: 'cmr', tipo: 'tarjeta', clave: 'cmr', titulo: 'CMR Falabella · por facturar' });
    expect(c.lineas[0]).toMatchObject({ fecha: '2026-10-20', monto: 300000, cuotas: 3, valorCuota: 100000 });
    expect(c.lineas.find((l) => l.detalle === 'PAGO TARJETA CMR')?.monto).toBe(-150000);
    // La compra antigua en cuotas no estira las fechas del archivo.
    expect(c.cobertura).toEqual({ desde: '2026-11-08', hasta: '2026-11-24' });
  });

  it('un archivo que no es cartola explica cuáles sirven', async () => {
    await expect(leerXlsx(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).rejects.toThrow('No es un archivo .xlsx');
    expect(() => reconocerCartola([{ nombre: 'Hoja1', filas: [['hola', 'chao']] }])).toThrow(/Santander.*CMR/);
  });
});

describe('textos del banco', () => {
  it('descripción, clave y titular', () => {
    expect(descripcionDe('0189555040 TRANSF A DANIELA IGNACIA OSSANDON')).toBe('Transferencia a Daniela Ignacia Ossandon');
    expect(descripcionDe('019892802K TRANSF. JOAQUIN ANDRES MENESES')).toBe('Transferencia de Joaquin Andres Meneses');
    expect(descripcionDe('COMPRA MERPAGO*JASNITAPASTEL*')).toBe('Jasnitapastel');
    expect(claveDetalle('PAC C.N.S. VIDA 0000035080662')).toBe(claveDetalle('PAC C.N.S. VIDA 0000035080666'));
    expect(claveDetalle('019892802K TRANSF. JOAQUIN')).toBe('transf joaquin');
    expect(esTitular('0202382649 TRANSF. FERNANDO ALONSO OSSAND', 'Fernando Alonso Ossandon Vargas')).toBe(true);
    expect(esTitular('0189555040 TRANSF A DANIELA IGNACIA OSSANDON', 'Fernando Alonso Ossandon Vargas')).toBe(false);
  });

  it('personas nombradas con nombre parcial ("Edward" en "EDWARDS")', () => {
    const ps = [{ id: 'e', nombre: 'Edward', telefono: '', archivada: false, color: 0, creado: '' }, { id: 'b', nombre: 'Bruno', telefono: '', archivada: false, color: 0, creado: '' }];
    expect([...personasNombradas('0199015133 TRANSF. EDWARDS ALEXANDER CABED', ps)]).toEqual(['e']);
    expect([...personasNombradas('0200447972 TRANSF DE BRUNO IGNACIO MENDE', ps)]).toEqual(['b']);
  });

  it('huella: el mismo movimiento repetido en el día es otro', () => {
    const l = { fecha: '2026-10-13', detalle: 'TRANSF A KHIPU', monto: -1400, orden: 0 };
    const [a, b] = huellas('cc', [l, { ...l, orden: 1 }]);
    expect(a).not.toBe(b);
    expect(huellas('cc', [l])[0]).toBe(a);
  });
});

describe('importar la cartola de la cuenta y la de la tarjeta', () => {
  let cc: Cartola;
  let cmr: Cartola;
  let cuenta: Destino;
  beforeEach(async () => {
    await importarRespaldo(validarRespaldo(JSON.parse(readFileSync(path.join(FIX, 'respaldo-2-7.json'), 'utf8'))));
    cc = await archivo('cartola-santander.xlsx');
    cmr = await archivo('cmr-ultimos.xlsx');
    cuenta = { tipo: 'cuenta', cuenta: (await db.cuentas.get('rut'))! };
  });

  it('cruza: lo que coincide, lo parecido, lo nuevo y lo que está solo en la app', async () => {
    const r = revisar(cc, cuenta, await datos());
    expect(grupos(r)).toEqual({ anterior: 2, coincide: 3, parecido: 1, nuevo: 4 });
    const por = (txt: string) => r.items.find((x) => x.linea.detalle.includes(txt))!;
    expect(por('INMOBILIARIA').app?.[0].label).toBe('Arriendo');
    expect(por('REMUNERACION').app?.[0].ref).toEqual({ tipo: 'ingreso', id: 'r-sueldo@2026-11-20' });
    expect(por('JUMBO').app?.[0].label).toBe('Jumbo');
    expect(por('CRUZ VERDE')).toMatchObject({ grupo: 'parecido', app: [{ label: 'Farmacia Cruz Verde', monto: -12990 }] });
    expect(por('SEBASTIAN').propuesta).toEqual({ tipo: 'traspaso' });
    expect(por('TARJETA CMR').propuesta).toEqual({ tipo: 'pagoTarjeta', medioId: 'cmr' });
    expect(por('PAC SEGURO').propuesta).toMatchObject({ tipo: 'gasto', descripcion: 'PAC Seguro Auto', medioId: 'deb' });
    // Camila te debía $20.475 y transfirió $30.475: el resto va como ingreso.
    expect(por('CAMILA').propuesta).toEqual({ tipo: 'pago', personaId: 'p1', resto: 10000 });
    expect(r.soloApp.map((a) => a.label)).toEqual(['Bencina Copec']);
    // Diferencia de $500 en la farmacia: manda el banco.
    expect(decisionesIniciales(r).items[por('CRUZ VERDE').huella].accion).toBe('banco');
  });

  it('la comparación dice que no cuadra por lo que está solo en la app, y cuadra al borrarlo', async () => {
    const r = revisar(cc, cuenta, await datos());
    const dias = await comparar(r);
    expect(dias[dias.length - 1]).toMatchObject({ fecha: '2026-11-24', banco: 1894605, dif: 25000 });
    const d = await datos();
    const dec = decisionesIniciales(r);
    dec.borrar.add('gasto:g-bencina');
    const c = d.cuentas.find((x) => x.id === 'rut')!;
    const movs = [...flujosCuentas(d).filter((m) => m.cuentaId === c.id), ...efectosComoMovs(c.id, [...efectos(r, dec, d.medios), ...alineacion(r, dec, d)], r)];
    expect(compararSaldos(r.cartola, r.inicio, (f) => saldoCuenta(c, movs, f)).every((x) => x.dif === 0)).toBe(true);
  });

  it('aplica todo junto y al importar de nuevo ya no repite nada', async () => {
    let d = await datos();
    let r = revisar(cc, cuenta, d);
    const dec = decisionesIniciales(r);
    dec.borrar.add('gasto:g-bencina');
    const res = await aplicarImportacion(r, dec, d.saldoPersona);
    expect(res).toEqual({ ligados: 4, creados: 4, corregidos: 1, borrados: 1, ignorados: 0 });

    expect((await db.gastos.toArray()).find((g) => g.descripcion === 'Farmacia Cruz Verde')).toMatchObject({ total: 13490, miParte: 13490 });
    expect(await db.gastos.get('g-bencina')).toBeUndefined();
    const pac = (await db.gastos.toArray()).find((g) => g.descripcion === 'PAC Seguro Auto');
    expect(pac).toMatchObject({ total: 30000, medioId: 'deb', fecha: '2026-11-15' });
    const pagoCami = (await db.movimientos.toArray()).find((m) => m.personaId === 'p1' && m.fecha === '2026-11-21');
    expect(pagoCami).toMatchObject({ tipo: 'pago', monto: 20475, cuentaId: 'rut' });
    expect((await db.ingresos.toArray()).find((i) => i.monto === 10000)).toMatchObject({ cuentaId: 'rut', descripcion: 'Transferencia de Camila (lo que sobró de su pago)' });
    expect(await db.pagosTarjeta.toArray()).toMatchObject([{ medioId: 'cmr', cuentaId: 'rut', monto: 150000, fecha: '2026-11-18' }]);
    expect((await db.movAhorro.toArray()).find((m) => m.nota === 'Traspaso desde otra cuenta tuya')).toMatchObject({ cuentaId: 'rut', tipo: 'deposito', monto: 200000 });
    expect(await db.importados.count()).toBe(8);

    d = await datos();
    r = revisar(cc, cuenta, d);
    expect(grupos(r)).toEqual({ anterior: 2, importado: 8 });
    expect(r.soloApp).toEqual([]);
    // Ya aplicado: el saldo de la app y el del banco calzan todos los días.
    expect((await comparar(r, false)).filter((x) => x.dif)).toEqual([]);

    // La tarjeta: el pago ya está (vino de la cuenta) y no se duplica.
    const tarjeta: Destino = { tipo: 'tarjeta', medio: (await db.medios.get('cmr'))! };
    const rt = revisar(cmr, tarjeta, d);
    expect(grupos(rt)).toEqual({ anterior: 2, coincide: 4, nuevo: 2 });
    expect(rt.items.filter((x) => x.grupo === 'nuevo').map((x) => x.propuesta)).toMatchObject([
      { tipo: 'gasto', descripcion: 'Pasteleria Jasna', medioId: 'cmr' },
      { tipo: 'gasto', descripcion: 'Uber', medioId: 'cmr', categoriaId: 'cat-transporte' },
    ]);
    const decT = decisionesIniciales(rt);
    expect(compararCompras(rt, registrosApp(tarjeta, d), [...efectos(rt, decT, d.medios), ...alineacion(rt, decT, d)])).toMatchObject({ desde: '2026-11-09', hasta: '2026-11-23', banco: 106070, app: 106070, dif: 0 });
    await aplicarImportacion(rt, decT, d.saldoPersona);
    expect(await db.pagosTarjeta.count()).toBe(1);
    expect((await db.gastos.toArray()).filter((g) => g.medioId === 'cmr')).toHaveLength(5);
  });

  it('recuerda lo que hiciste con el mismo detalle para la próxima vez', async () => {
    const d = await datos();
    const r = revisar(cc, cuenta, d);
    const dec = decisionesIniciales(r);
    const pac = r.items.find((x) => x.linea.detalle.includes('PAC SEGURO'))!;
    dec.items[pac.huella] = { accion: 'nuevo', propuesta: { tipo: 'gasto', descripcion: 'Seguro del auto', categoriaId: 'cat-transporte', medioId: 'deb' } };
    await aplicarImportacion(r, dec, d.saldoPersona);
    const diciembre: Cartola = { ...cc, lineas: [{ fecha: '2026-12-15', detalle: 'PAC SEGURO AUTO 0000123999', monto: -30000, saldo: 1, orden: 0 }], desde: '2026-12-15', hasta: '2026-12-15', cobertura: { desde: '2026-12-15', hasta: '2026-12-15' } };
    const r2 = revisar(diciembre, cuenta, await datos());
    expect(r2.items[0]).toMatchObject({ grupo: 'nuevo', motivo: 'Como la vez anterior', propuesta: { tipo: 'gasto', descripcion: 'Seguro del auto', categoriaId: 'cat-transporte', medioId: 'deb' } });
  });

  it('el pago anotado tarde (días después de la transferencia) igual se reconoce', async () => {
    // Camila pagó el 21 en el banco, pero lo anotaste el 28: misma persona nombrada, 7 días después.
    await db.movimientos.add({ id: 'tarde', personaId: 'p1', tipo: 'pago', detalle: 'Transferencia', monto: 30475, fecha: '2026-11-28', cuentaId: 'rut', creado: '2026-11-28T10:00:00.000Z' });
    const r = revisar(cc, cuenta, await datos());
    const x = r.items.find((i) => i.linea.detalle.includes('CAMILA'))!;
    expect(x).toMatchObject({ grupo: 'coincide', app: [{ ref: { tipo: 'movimiento', id: 'tarde' } }] });
  });
});

describe('traspasos y respaldo', () => {
  it('un traspaso entre tus cuentas queda unido y se borra de las dos', async () => {
    await importarRespaldo(validarRespaldo(JSON.parse(readFileSync(path.join(FIX, 'respaldo-2-7.json'), 'utf8'))));
    const otra = await guardarCuenta({ nombre: 'Mercado Pago', tipo: 'remunerada' }, 100000, '2026-11-01');
    await moverPlata(otra, 'deposito', 50000, 'rut', '2026-11-02');
    const patas = (await db.movAhorro.toArray()).filter((m) => m.traspasoId);
    expect(patas).toHaveLength(2);
    expect(new Set(patas.map((m) => m.traspasoId)).size).toBe(1);
    const borradas = await borrarMovAhorro(patas[0].id);
    expect(borradas).toHaveLength(2);
    expect((await db.movAhorro.toArray()).filter((m) => m.traspasoId)).toHaveLength(0);
  });

  it('el respaldo v8 lleva lo importado', async () => {
    await importarRespaldo(validarRespaldo(JSON.parse(readFileSync(path.join(FIX, 'respaldo-2-7.json'), 'utf8'))));
    const d = await datos();
    const r = revisar(await archivo('cartola-santander.xlsx'), { tipo: 'cuenta', cuenta: d.cuentas.find((c) => c.id === 'rut')! }, d);
    await aplicarImportacion(r, decisionesIniciales(r), d.saldoPersona);
    const resp = await construirRespaldo();
    expect(resp.version).toBe(8);
    expect(resp.importados).toHaveLength(8);
    await importarRespaldo(validarRespaldo(JSON.parse(JSON.stringify(resp))));
    expect(await db.importados.count()).toBe(8);
  });
});
