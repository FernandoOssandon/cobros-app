import { describe, expect, it } from 'vitest';
import type { Categoria, Gasto, Medio, Persona } from '../db';
import { bancoDe, buscarParecido, interpretarCorreo, limpiarTexto, reconocerMedio, reconocerPersona, sugerirCategoria, type CorreoCrudo } from '../lib/correo';

// Correos inventados con frases típicas de bancos chilenos (no son copias de correos reales).
const correo = (de: string, asunto: string, texto: string, fecha = '2026-10-27T18:40:00.000Z'): CorreoCrudo => ({ id: 'x', fecha, de, asunto, texto });

describe('interpretar correos del banco', () => {
  it('compra con tarjeta de crédito: monto, comercio, tarjeta, fecha y hora', () => {
    const l = interpretarCorreo(
      correo(
        'Banco Ejemplo <notificaciones@bancoestado.cl>',
        'Compra con Tarjeta de Crédito',
        'Estimado cliente: Te informamos que se ha realizado una compra por $12.990 en UBER *TRIP con tu Tarjeta de Crédito terminada en 4821 el 27/10/2026 15:32 hrs.',
      ),
    );
    expect(l).toEqual({ tipo: 'compra', monto: 12990, comercio: 'UBER *TRIP', fecha: '2026-10-27', hora: '15:32', banco: 'Banco Estado', ultimos4: '4821' });
  });

  it('formato con rótulos (Comercio: / Monto:) y tarjeta enmascarada', () => {
    const l = interpretarCorreo(
      correo('alertas@bci.cl', 'Aviso de compra', 'Monto: $ 45.300\nComercio: LIDER EXPRESS ÑUÑOA\nTarjeta: ****1234\nFecha: 26-10-2026'),
    );
    expect(l).toMatchObject({ tipo: 'compra', monto: 45300, comercio: 'LIDER EXPRESS ÑUÑOA', ultimos4: '1234', fecha: '2026-10-26', banco: 'BCI' });
  });

  it('cuerpo en HTML', () => {
    const l = interpretarCorreo(
      correo(
        'no-reply@tenpo.cl',
        'Hiciste una compra',
        '<html><body><table><tr><td>Realizaste una compra por</td><td><b>&#36;3.500</b></td></tr><tr><td>en</td><td>Starbucks Costanera</td></tr></table></body></html>',
      ),
    );
    expect(l).toMatchObject({ tipo: 'compra', monto: 3500, comercio: 'Starbucks Costanera', banco: 'Tenpo' });
  });

  it('pago con billetera: "Pagaste $X a COMERCIO"', () => {
    const l = interpretarCorreo(correo('info@mercadopago.cl', 'Pagaste $8.000', 'Pagaste $8.000 a Botillería Don Pepe con tu dinero disponible.'));
    expect(l).toMatchObject({ tipo: 'compra', monto: 8000, comercio: 'Botillería Don Pepe', banco: 'Mercado Pago' });
  });

  it('transferencia enviada y transferencia recibida', () => {
    expect(
      interpretarCorreo(correo('avisos@somosmach.com', 'Transferencia exitosa', 'Transferiste $25.000 a Camila Rojas el 27/10/2026.')),
    ).toMatchObject({ tipo: 'transferencia', monto: 25000, comercio: 'Camila Rojas', banco: 'MACH' });
    expect(
      interpretarCorreo(correo('avisos@somosmach.com', '¡Te llegó plata!', 'Recibiste una transferencia de $10.000 de Diego Fuentes.')),
    ).toMatchObject({ tipo: 'recibido', monto: 10000, comercio: 'Diego Fuentes' });
  });

  it('elige el monto en pesos cercano a la palabra clave, no el cupo ni dólares', () => {
    const l = interpretarCorreo(
      correo('x@santander.cl', 'Compra internacional', 'Compra por US$ 9,99 equivalente a $9.450 en NETFLIX.COM. Cupo disponible: $1.250.000'),
    );
    expect(l).toMatchObject({ monto: 9450, comercio: 'NETFLIX.COM', banco: 'Santander' });
  });

  it('las abreviaturas no cortan el nombre del comercio', () => {
    expect(interpretarCorreo(correo('a@bci.cl', 'Compra', 'Compra por $35.000 en Copec Av. Grecia con tu tarjeta terminada en 4821.'))?.comercio).toBe('Copec Av. Grecia');
    expect(interpretarCorreo(correo('a@bci.cl', 'Compra', 'Compra por $2.000 en Kiosko. Gracias por preferirnos.'))?.comercio).toBe('Kiosko');
  });

  it('si la fecha del texto no calza con el correo, usa la del correo', () => {
    const l = interpretarCorreo(correo('x@itau.cl', 'Compra', 'Compra por $1.000 en Kiosko. Tu tarjeta vence el 01/05/2029.', '2026-10-20T12:00:00-03:00'));
    expect(l?.fecha).toBe('2026-10-20');
  });

  it('ignora lo que no es un movimiento', () => {
    expect(interpretarCorreo(correo('x@bci.cl', 'Tu estado de cuenta está disponible', 'Monto facturado $350.000'))).toBeNull();
    expect(interpretarCorreo(correo('x@bci.cl', 'Código de verificación', 'Tu código de verificación es 123456'))).toBeNull();
    expect(interpretarCorreo(correo('x@bci.cl', 'Hola', 'Te contamos novedades de tu banco'))).toBeNull();
    expect(interpretarCorreo(correo('x@bci.cl', 'Compra', 'Se realizó una compra en el comercio'))).toBeNull(); // sin monto
  });

  it('el pago de la tarjeta queda como "otro" (no es un gasto nuevo)', () => {
    expect(interpretarCorreo(correo('x@bancochile.cl', 'Pago recibido', 'Recibimos el pago de tu tarjeta de crédito por $200.000'))?.tipo).toBe('otro');
  });

  it('limpia HTML y entidades', () => {
    expect(limpiarTexto('<p>Hola&nbsp;Se&ntilde;or</p><p>Total: &#36;1.000</p>')).toBe('Hola Señor\nTotal: $1.000');
  });

  it('reconoce el banco por el remitente', () => {
    expect(bancoDe('"Banco de Chile" <enviodigital@bancochile.cl>')).toBe('Banco de Chile');
    expect(bancoDe('x@gmail.com')).toBeUndefined();
  });
});

describe('vincular con lo anotado', () => {
  const medios = [
    { id: 'visa', nombre: 'Visa BancoEstado', tipo: 'credito', ultimos4: '4821', archivado: false },
    { id: 'rut', nombre: 'Cuenta RUT BancoEstado', tipo: 'debito', archivado: false },
    { id: 'mp', nombre: 'Mercado Pago', tipo: 'debito', archivado: false },
    { id: 'ef', nombre: 'Efectivo', tipo: 'efectivo', archivado: false },
  ] as Medio[];

  it('medio por últimos 4 dígitos o, si es único, por el banco', () => {
    expect(reconocerMedio({ ultimos4: '4821', banco: 'BancoEstado' }, medios)).toBe('visa');
    expect(reconocerMedio({ banco: 'Mercado Pago' }, medios)).toBe('mp');
    // Dos medios de BancoEstado sin dígitos que calcen: no adivina
    expect(reconocerMedio({ ultimos4: '0000', banco: 'BancoEstado' }, medios)).toBeUndefined();
  });

  it('marca un probable duplicado: mismo monto y medio, hasta 1 día de diferencia', () => {
    const gastos = [
      { id: 'g1', pagador: 'yo', total: 12990, fecha: '2026-10-26', medioId: 'visa' },
      { id: 'g2', pagador: 'p1', total: 5000, fecha: '2026-10-27' },
      { id: 'g3', pagador: 'yo', total: 7000, fecha: '2026-10-27' },
    ] as Gasto[];
    expect(buscarParecido({ monto: 12990, fecha: '2026-10-27', medioId: 'visa' }, gastos)).toBe('g1');
    expect(buscarParecido({ monto: 12990, fecha: '2026-10-27' }, gastos)).toBe('g1');
    expect(buscarParecido({ monto: 12990, fecha: '2026-10-27', medioId: 'otra' }, gastos)).toBeUndefined();
    expect(buscarParecido({ monto: 12990, fecha: '2026-10-28' }, gastos)).toBeUndefined();
    expect(buscarParecido({ monto: 5000, fecha: '2026-10-27' }, gastos)).toBeUndefined(); // lo pagó otra persona
    expect(buscarParecido({ monto: 7000, fecha: '2026-10-27', medioId: 'visa' }, gastos)).toBe('g3'); // el gasto no tiene medio
    expect(buscarParecido({ monto: 12990, fecha: '2026-10-27' }, gastos, new Set(['g1']))).toBeUndefined();
  });

  it('sugiere la categoría por el último gasto en el comercio o por palabras clave', () => {
    const cats = ['cat-comida', 'cat-transporte', 'cat-suscripciones', 'cat-salud', 'cat-casa'].map((id) => ({ id, archivada: false })) as Categoria[];
    const gastos = [
      { descripcion: 'Jumbo', categoriaId: 'cat-casa', fecha: '2026-10-01' },
      { descripcion: 'Jumbo', categoriaId: 'cat-comida', fecha: '2026-10-20' },
    ] as Gasto[];
    expect(sugerirCategoria('Jumbo Bilbao', gastos, cats)).toBe('cat-comida');
    expect(sugerirCategoria('UBER *TRIP', [], cats)).toBe('cat-transporte');
    expect(sugerirCategoria('Copec Av. Grecia', [], cats)).toBe('cat-transporte');
    expect(sugerirCategoria('SPOTIFY P1234', [], cats)).toBe('cat-suscripciones');
    expect(sugerirCategoria('Farmacias Cruz Verde', [], cats)).toBe('cat-salud');
    expect(sugerirCategoria('Ferretería El Clavo', [], cats)).toBeUndefined();
    // Categoría archivada: no se sugiere
    expect(sugerirCategoria('Uber', [], [{ id: 'cat-transporte', archivada: true } as Categoria])).toBeUndefined();
  });

  it('reconoce a la persona de una transferencia por su nombre', () => {
    const ps = [
      { id: 'p1', nombre: 'Camila Rojas', archivada: false },
      { id: 'p2', nombre: 'Diego Fuentes', archivada: false },
      { id: 'p3', nombre: 'Diego', archivada: false },
    ] as Persona[];
    expect(reconocerPersona('CAMILA ANDREA ROJAS PÉREZ', ps)).toBe('p1');
    expect(reconocerPersona('Camila Rojas', ps)).toBe('p1');
    expect(reconocerPersona('Diego Fuentes', ps)).toBe('p2');
    expect(reconocerPersona('Javiera Soto', ps)).toBeUndefined();
  });
});

// ---------- Importación (base de datos + script falso) ----------
import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';
import { borrarTodo, db, guardarGasto, guardarMedio } from '../db';
import { anotarDetectado, anotarPagoDetectado, conectarCorreo, desconectarCorreo, descartarDetectado, leerCorreo, restaurarDetectado, vincularDetectado } from '../correo';
import { crearPersona } from '../db';
import { saldo } from '../lib/balance';

const scriptFalso = (mensajes: CorreoCrudo[], ok = true) => {
  const pedidos: { url: string; body: unknown; headers: unknown }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    pedidos.push({ url, body: JSON.parse(String(init.body)), headers: init.headers });
    return new Response(JSON.stringify(ok ? { ok: true, cuenta: 'yo@gmail.com', mensajes } : { ok: false, error: 'clave' }));
  }) as unknown as typeof fetch;
  return { f, pedidos };
};

describe('leer el correo e importar', () => {
  beforeEach(() => borrarTodo());

  const compra = (id: string, monto: string, comercio: string): CorreoCrudo => ({
    id, fecha: new Date().toISOString(), de: 'avisos@bancoestado.cl', asunto: 'Compra', texto: `Compra por $${monto} en ${comercio} con tarjeta terminada en 4821.`,
  });

  it('sin conexión configurada no hace nada', async () => {
    expect(await leerCorreo(scriptFalso([]).f)).toBeNull();
  });

  it('guarda los movimientos nuevos, ignora el resto y no repite correos', async () => {
    const visa = await guardarMedio({ nombre: 'Visa', tipo: 'credito', color: '#9EC9FF', ultimos4: '4821' });
    await conectarCorreo(' https://script.google.com/macros/s/abc/exec ', ' clave larga ');
    const msgs = [compra('a', '12.990', 'UBER'), compra('b', '3.500', 'Starbucks'), { ...compra('c', '1', 'x'), asunto: 'Tu estado de cuenta' }];
    const s = scriptFalso(msgs);
    expect(await leerCorreo(s.f)).toEqual({ nuevos: 2, ignorados: 1 });
    expect(s.pedidos[0]).toMatchObject({ url: 'https://script.google.com/macros/s/abc/exec', body: { clave: 'clave larga' } });
    const a = await db.detectados.get('a');
    expect(a).toMatchObject({ monto: 12990, comercio: 'UBER', medioId: visa, estado: 'pendiente', banco: 'Banco Estado' });
    // Segunda lectura: pide desde la última (con margen) y no duplica
    const s2 = scriptFalso(msgs);
    expect(await leerCorreo(s2.f)).toEqual({ nuevos: 0, ignorados: 1 });
    expect(await db.detectados.count()).toBe(2);
    expect((await db.ajustes.get('main'))?.correo).toMatchObject({ email: 'yo@gmail.com' });
    expect((await db.ajustes.get('main'))?.correo?.ultimaLectura).toBeTruthy();
  });

  it('clave incorrecta: error legible', async () => {
    await conectarCorreo('https://x', 'mala');
    await expect(leerCorreo(scriptFalso([], false).f)).rejects.toThrow('La clave no coincide');
  });

  it('anotar crea un gasto propio; vincular usa el que ya estaba; descartar se puede deshacer', async () => {
    await conectarCorreo('https://x', 'k');
    const hoy = new Date().toISOString().slice(0, 10);
    const ya = await guardarGasto(
      { descripcion: 'Starbucks', fecha: hoy, modo: 'solo', yoIncluido: true, misPartes: 1, exactos: {}, partes: {} },
      { amount: 3500, rows: [], mine: 3500, remaining: 0, ok: true },
    );
    await leerCorreo(scriptFalso([compra('a', '12.990', 'UBER'), compra('b', '3.500', 'Starbucks'), compra('c', '990', 'Kiosko')]).f);
    expect((await db.detectados.get('b'))?.parecidoA).toBe(ya);

    const gid = await anotarDetectado('a', { categoriaId: 'cat-transporte' });
    expect(await db.gastos.get(gid!)).toMatchObject({ descripcion: 'UBER', total: 12990, miParte: 12990, categoriaId: 'cat-transporte', modo: 'solo' });
    expect((await db.detectados.get('a'))?.estado).toBe('anotado');
    expect(await anotarDetectado('a')).toBeUndefined(); // no se anota dos veces

    await vincularDetectado('b', ya);
    expect(await db.detectados.get('b')).toMatchObject({ estado: 'anotado', gastoId: ya });
    expect(await db.gastos.count()).toBe(2);

    const antes = await descartarDetectado('c');
    expect((await db.detectados.get('c'))?.estado).toBe('descartado');
    await restaurarDetectado(antes!);
    expect((await db.detectados.get('c'))?.estado).toBe('pendiente');
  });

  it('transferencias: reconoce a la persona y se anotan como pago; el pago de tarjeta se ignora', async () => {
    const cami = await crearPersona('Camila Rojas');
    const diego = await crearPersona('Diego Fuentes');
    await conectarCorreo('https://x', 'k');
    const ahora = new Date().toISOString();
    const r = await leerCorreo(
      scriptFalso([
        { id: 't1', fecha: ahora, de: 'a@somosmach.com', asunto: 'Te llegó plata', texto: 'Recibiste una transferencia de $12.000 de Camila Rojas.' },
        { id: 't2', fecha: ahora, de: 'a@somosmach.com', asunto: 'Transferencia exitosa', texto: 'Transferiste $8.000 a Diego Fuentes.' },
        { id: 't3', fecha: ahora, de: 'a@bci.cl', asunto: 'Pago recibido', texto: 'Recibimos el pago de tu tarjeta de crédito por $200.000' },
      ]).f,
    );
    expect(r).toEqual({ nuevos: 2, ignorados: 1 });
    expect(await db.detectados.get('t1')).toMatchObject({ tipo: 'recibido', personaId: cami, categoriaId: undefined });
    expect(await db.detectados.get('t2')).toMatchObject({ tipo: 'transferencia', personaId: diego });
    await anotarPagoDetectado('t1');
    await anotarPagoDetectado('t2');
    expect(saldo(await db.movimientos.where('personaId').equals(cami).toArray())).toBe(-12000);
    expect(saldo(await db.movimientos.where('personaId').equals(diego).toArray())).toBe(8000);
    expect((await db.detectados.get('t1'))?.estado).toBe('anotado');
  });

  it('desconectar borra los pendientes y la conexión, pero deja lo anotado', async () => {
    await conectarCorreo('https://x', 'k');
    await leerCorreo(scriptFalso([compra('a', '12.990', 'UBER'), compra('b', '3.500', 'Starbucks')]).f);
    await anotarDetectado('a');
    await desconectarCorreo();
    expect((await db.detectados.toArray()).map((d) => d.id)).toEqual(['a']);
    expect((await db.ajustes.get('main'))?.correo).toBeUndefined();
  });
});
