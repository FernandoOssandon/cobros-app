// 3.3: base para el SII. RUT, impuestos, lectura de XML (DTE) y de los listados del SII, y guardado sin duplicar.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { construirRespaldo, importarRespaldo, validarRespaldo } from '../backup';
import { db, type Contribuyente, type DocTributario } from '../db';
import { dvRut, formatearRut, normalizarRut, validarRut } from '../lib/rut';
import { aDocumento, fusionar, idDocumento, signoDoc } from '../lib/sii/documentos';
import { leerDte, textoXml } from '../lib/sii/dte';
import { bheDesdeBruto, bheDesdeLiquido, desglosarTotal, resumenSii, tasaRetencionBhe } from '../lib/sii/impuestos';
import { leerCsv, leerTablaSii, textoTabla } from '../lib/sii/tablas';
import { guardarContribuyente, importarDocsSii, leerArchivoSii } from '../sii';

const rut = (n: number) => `${n}-${dvRut(n)}`;
const YO = rut(76543210);
const PROVEEDOR = rut(77111222);
const CLIENTE = rut(15333444);

describe('RUT', () => {
  it('valida el dígito verificador y da formato', () => {
    expect(dvRut(11111111)).toBe('1');
    expect(dvRut(12345678)).toBe('5');
    expect(validarRut('12.345.678-5')).toBe(true);
    expect(validarRut('12345678-4')).toBe(false);
    expect(validarRut(`${10000013}-${dvRut(10000013)}`.toLowerCase())).toBe(true);
    expect(normalizarRut(' 12.345.678-5 ')).toBe('12345678-5');
    expect(normalizarRut('abc')).toBeUndefined();
    expect(formatearRut('123456785')).toBe('12.345.678-5');
  });
});

describe('impuestos', () => {
  it('IVA: del total al neto, sin perder pesos', () => {
    expect(desglosarTotal(11_900)).toEqual({ neto: 10_000, iva: 1_900 });
    expect(desglosarTotal(9_990)).toEqual({ neto: 8_395, iva: 1_595 });
  });
  it('retención de boletas de honorarios por año (15,25 % en 2026, 17 % desde 2028)', () => {
    expect(tasaRetencionBhe(2025)).toBe(14.5);
    expect(tasaRetencionBhe(2026)).toBe(15.25);
    expect(tasaRetencionBhe(2027)).toBe(16);
    expect(tasaRetencionBhe(2030)).toBe(17);
    expect(bheDesdeBruto(100_000, '2026-11-08')).toEqual({ bruto: 100_000, retencion: 15_250, liquido: 84_750, tasa: 15.25 });
    // Para recibir $500.000 líquidos en 2026, la boleta va por el bruto justo.
    const b = bheDesdeLiquido(500_000, '2026-11-08');
    expect(b.liquido).toBeGreaterThanOrEqual(500_000);
    expect(bheDesdeBruto(b.bruto - 1, '2026-11-08').liquido).toBeLessThan(500_000);
  });
});

// Un EnvioDTE como el que llega adjunto a un correo: una factura y una nota de crédito que la corrige, en ISO-8859-1.
const XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<EnvioDTE xmlns="http://www.sii.cl/SiiDte" version="1.0"><SetDTE ID="SetDoc">
<Caratula version="1.0"><RutEmisor>${PROVEEDOR}</RutEmisor><RutReceptor>${YO}</RutReceptor></Caratula>
<DTE version="1.0"><Documento ID="F33T120"><Encabezado>
<IdDoc><TipoDTE>33</TipoDTE><Folio>120</Folio><FchEmis>2026-11-03</FchEmis></IdDoc>
<Emisor><RUTEmisor>${PROVEEDOR}</RUTEmisor><RznSoc>Imprenta Ñuñoa &amp; Cía</RznSoc><GiroEmis>Imprenta</GiroEmis></Emisor>
<Receptor><RUTRecep>${YO}</RUTRecep><RznSocRecep>Mi Emprendimiento SpA</RznSocRecep></Receptor>
<Totales><MntNeto>100000</MntNeto><TasaIVA>19</TasaIVA><IVA>19000</IVA><MntTotal>119000</MntTotal></Totales>
</Encabezado><Detalle><NroLinDet>1</NroLinDet><NmbItem>Tarjetas de presentación</NmbItem></Detalle></Documento></DTE>
<DTE version="1.0"><Documento ID="F61T15"><Encabezado>
<IdDoc><TipoDTE>61</TipoDTE><Folio>15</Folio><FchEmis>2026-11-05</FchEmis></IdDoc>
<Emisor><RUTEmisor>${PROVEEDOR}</RUTEmisor><RznSoc>Imprenta Ñuñoa &amp; Cía</RznSoc></Emisor>
<Receptor><RUTRecep>${YO}</RUTRecep><RznSocRecep>Mi Emprendimiento SpA</RznSocRecep></Receptor>
<Totales><MntNeto>10000</MntNeto><IVA>1900</IVA><MntTotal>11900</MntTotal></Totales>
</Encabezado><Referencia><NroLinRef>1</NroLinRef><TpoDocRef>33</TpoDocRef><FolioRef>120</FolioRef></Referencia></Documento></DTE>
</SetDTE></EnvioDTE>`;

describe('XML de documentos electrónicos', () => {
  it('lee una factura y una nota de crédito (con tildes en ISO-8859-1)', () => {
    const docs = leerDte(textoXml(new Uint8Array(Buffer.from(XML, 'latin1'))));
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({ tipo: 'factura', codigo: 33, folio: 120, fecha: '2026-11-03', rutEmisor: PROVEEDOR, nombreEmisor: 'Imprenta Ñuñoa & Cía', rutReceptor: YO, neto: 100_000, iva: 19_000, total: 119_000, detalle: 'Tarjetas de presentación' });
    expect(docs[1]).toMatchObject({ tipo: 'nota_credito', folio: 15, total: 11_900, referencia: { codigo: 33, folio: 120 } });
    expect(signoDoc(docs[1].tipo)).toBe(-1);
  });
  it('un archivo que no es DTE da un error claro', () => {
    expect(() => leerDte('<html></html>')).toThrow(/no es un documento tributario/);
  });
});

// Detalle del Registro de Compras y Ventas (CSV con punto y coma, como lo descarga el SII).
const RCV_COMPRAS = `Nro;Tipo Doc;Tipo Compra;RUT Proveedor;Razon Social;Folio;Fecha Docto;Fecha Recepcion;Fecha Acuse;Monto Exento;Monto Neto;Monto IVA Recuperable;Monto Iva No Recuperable;Codigo IVA No Rec.;Monto Total
1;33;Del Giro;${PROVEEDOR};Imprenta Ñuñoa;120;03/11/2026;03/11/2026 10:20:00;;0;100000;19000;0;;119000
2;61;Del Giro;${PROVEEDOR};Imprenta Ñuñoa;15;05/11/2026;05/11/2026 09:00:00;;0;10000;1900;0;;11900
3;34;Del Giro;${rut(78999000)};Asesorías Exentas;7;06/11/2026;06/11/2026 09:00:00;;50000;0;0;0;;50000
`;
const RCV_VENTAS = `Nro;Tipo Doc;Tipo Venta;Rut cliente;Razon Social;Folio;Fecha Docto;Fecha Recepcion;Fecha Acuse Recibo;Fecha Reclamo;Monto Exento;Monto Neto;Monto IVA;Monto total
1;33;Del Giro;${CLIENTE};Cliente Uno;501;04/11/2026;04/11/2026;;;0;300000;57000;357000
2;39;Del Giro;66666666-6;;1;07/11/2026;07/11/2026;;;0;8403;1597;10000
`;
// Informe de boletas de honorarios emitidas.
const BHE = `N° Boleta;Fecha;Estado;Rut Receptor;Nombre o Razón Social;Brutos;Retenido;Pagado
31;02/11/2026;VIGENTE;${CLIENTE};Cliente Uno;200000;30500;169500
32;06/11/2026;NULA;${CLIENTE};Cliente Uno;50000;7625;42375
`;

describe('listados del SII', () => {
  it('Registro de Compras: facturas recibidas con su crédito', () => {
    const t = leerTablaSii([leerCsv(RCV_COMPRAS)]);
    expect(t.formato).toBe('rcv-compras');
    expect(t.sentido).toBe('recibido');
    expect(t.docs.map((d) => [d.tipo, d.folio, d.fecha, d.neto, d.iva, d.total])).toEqual([
      ['factura', 120, '2026-11-03', 100_000, 19_000, 119_000],
      ['nota_credito', 15, '2026-11-05', 10_000, 1_900, 11_900],
      ['factura_exenta', 7, '2026-11-06', 0, 0, 50_000],
    ]);
    expect(t.docs[0]).toMatchObject({ rutEmisor: PROVEEDOR, nombreEmisor: 'Imprenta Ñuñoa' });
  });
  it('Registro de Ventas y boletas de honorarios (con una anulada)', () => {
    const v = leerTablaSii([leerCsv(RCV_VENTAS)]);
    expect(v).toMatchObject({ formato: 'rcv-ventas', sentido: 'emitido' });
    expect(v.docs[1]).toMatchObject({ tipo: 'boleta', total: 10_000 });
    const b = leerTablaSii([leerCsv(BHE)]);
    expect(b).toMatchObject({ formato: 'bhe', sentido: 'emitido' });
    expect(b.docs[0]).toMatchObject({ tipo: 'bhe', folio: 31, bruto: 200_000, retencion: 30_500, liquido: 169_500, estado: 'vigente', rutReceptor: CLIENTE });
    expect(b.docs[1].estado).toBe('anulado');
  });
  it('lee un CSV en Windows-1252 y con comillas', () => {
    const csv = 'Folio;Fecha;Brutos;Retenido;"Nombre o Razón Social"\n9;"01/11/2026";"100.000";15250;"Pérez; Hnos"\n';
    const t = leerTablaSii([leerCsv(textoTabla(new Uint8Array(Buffer.from(csv, 'latin1'))))], { sentido: 'recibido' });
    expect(t.docs[0]).toMatchObject({ folio: 9, bruto: 100_000, retencion: 15_250, liquido: 84_750, nombreEmisor: 'Pérez; Hnos' });
  });
  it('un archivo que no es del SII da un error claro', () => {
    expect(() => leerTablaSii([leerCsv('Fecha;Descripción;Cargo\n01/11/2026;Algo;1000\n')])).toThrow(/No reconocemos/);
  });
});

describe('resumen del mes (tipo F29)', () => {
  it('débito, crédito (la nota de crédito resta), honorarios y PPM', () => {
    const c: Contribuyente = { id: 'c', rut: YO, nombre: 'Mi Emprendimiento SpA', tipo: 'empresa', tasaPpm: 0.25, archivado: false, creado: '' };
    const docs = [
      ...leerTablaSii([leerCsv(RCV_COMPRAS)]).docs,
      ...leerTablaSii([leerCsv(RCV_VENTAS)]).docs,
      ...leerTablaSii([leerCsv(BHE)]).docs,
    ].map((l) => aDocumento(l, c, 'archivo', '')!);
    const r = resumenSii(c, docs, '2026-11');
    expect(r).toMatchObject({ ventasNetas: 308_403, debito: 58_597, nVentas: 2, comprasNetas: 90_000, credito: 17_100, nCompras: 3, ivaDeterminado: 41_497 });
    expect(r.honorarios).toMatchObject({ n: 1, bruto: 200_000, retencion: 30_500 });
    expect(r.ppm).toBe(Math.round(308_403 * 0.0025));
    expect(r.aPagar).toBe(41_497 + r.ppm);
  });
});

describe('guardar sin duplicar', () => {
  beforeEach(async () => {
    await db.contribuyentes.clear();
    await db.docsTributarios.clear();
  });

  it('el mismo documento por archivo y por correo queda una vez; si se anula, se actualiza sin perder lo ligado', async () => {
    const id = await guardarContribuyente({ rut: formatearRut(YO), nombre: ' Mi Emprendimiento SpA ', tipo: 'empresa', regimen: 'pro_pyme_transparente' });
    expect((await db.contribuyentes.get(id))?.rut).toBe(YO);
    await expect(guardarContribuyente({ rut: YO, nombre: 'Otro', tipo: 'empresa' })).rejects.toThrow(/ya está/);
    await expect(guardarContribuyente({ rut: '1-2', nombre: 'Malo', tipo: 'persona' })).rejects.toThrow(/no es válido/);

    const xml = await leerArchivoSii('envio.xml', new Uint8Array(Buffer.from(XML, 'latin1')));
    expect(await importarDocsSii(id, xml, 'correo')).toMatchObject({ formato: 'dte', nuevos: 2, repetidos: 0, ajenos: 0 });
    const csv = await leerArchivoSii('compras.csv', new TextEncoder().encode(RCV_COMPRAS));
    expect(await importarDocsSii(id, csv)).toMatchObject({ formato: 'rcv-compras', nuevos: 1, repetidos: 2 });
    expect(await db.docsTributarios.count()).toBe(3);
    const factura = await db.docsTributarios.get(idDocumento({ contribuyenteId: id, sentido: 'recibido', tipo: 'factura', folio: 120, rutEmisor: PROVEEDOR }));
    expect(factura).toMatchObject({ origen: 'correo', nombreContraparte: 'Imprenta Ñuñoa & Cía' });

    // Una boleta de honorarios ligada a su ingreso, que después aparece anulada.
    const bhe = await leerArchivoSii('bhe.csv', new TextEncoder().encode(BHE));
    expect(await importarDocsSii(id, bhe)).toMatchObject({ nuevos: 2 });
    const id31 = idDocumento({ contribuyenteId: id, sentido: 'emitido', tipo: 'bhe', folio: 31, rutEmisor: YO });
    await db.docsTributarios.update(id31, { ingresoId: 'ing-1' });
    const anulada = { ...bhe, docs: bhe.docs.map((d) => (d.folio === 31 ? { ...d, estado: 'anulado' as const } : d)) };
    expect(await importarDocsSii(id, anulada)).toMatchObject({ nuevos: 0, actualizados: 1, repetidos: 1 });
    expect(await db.docsTributarios.get(id31)).toMatchObject({ estado: 'anulado', ingresoId: 'ing-1' });
  });

  it('un documento entre otros dos RUT no se guarda', async () => {
    const id = await guardarContribuyente({ rut: CLIENTE, nombre: 'Cliente', tipo: 'persona' });
    const r = await importarDocsSii(id, { formato: 'dte', docs: leerDte(XML), omitidas: 0 });
    expect(r).toMatchObject({ nuevos: 0, ajenos: 2 });
  });

  it('fusionar: lo repetido dentro del mismo archivo cuenta una vez', () => {
    const d = { id: 'x', estado: 'vigente', total: 1, neto: 1, iva: 0, exento: 0 } as DocTributario;
    expect(fusionar([d, d], [])).toMatchObject({ nuevos: [d], repetidos: 0 });
  });

  it('viajan en el respaldo (v9) y los respaldos v8 se siguen leyendo', async () => {
    const id = await guardarContribuyente({ rut: YO, nombre: 'Mi Emprendimiento SpA', tipo: 'empresa' });
    await importarDocsSii(id, { formato: 'dte', docs: leerDte(XML), omitidas: 0 });
    const r = await construirRespaldo();
    expect(r.version).toBe(9);
    expect(r.contribuyentes).toHaveLength(1);
    expect(r.docsTributarios).toHaveLength(2);
    await db.docsTributarios.clear();
    await db.contribuyentes.clear();
    await importarRespaldo(validarRespaldo(JSON.parse(JSON.stringify(r))));
    expect(await db.docsTributarios.count()).toBe(2);
    const { contribuyentes: _c, docsTributarios: _d, ...v8 } = { ...r, version: 8 };
    expect(validarRespaldo(v8)).toMatchObject({ version: 9, contribuyentes: [], docsTributarios: [] });
  });
});
