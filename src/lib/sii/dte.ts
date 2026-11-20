// Lector de documentos tributarios electrónicos (DTE) en XML: facturas, boletas y notas que llegan por correo
// (el XML adjunto) o que se descargan del SII. Lee un EnvioDTE / EnvioBOLETA con uno o varios documentos, o un DTE suelto.
// Sin dependencias (funciona igual en el teléfono y en las pruebas). Lógica pura.
import { normalizarRut } from '../rut';
import { tipoDesdeCodigo, type DocLeido } from './documentos';

export class ErrorDte extends Error {}

/** Bytes del archivo → texto, respetando la codificación declarada (los DTE suelen venir en ISO-8859-1). */
export function textoXml(bytes: Uint8Array): string {
  const cabecera = new TextDecoder('ascii').decode(bytes.subarray(0, 200));
  const enc = /encoding=["']([\w-]+)["']/i.exec(cabecera)?.[1]?.toLowerCase();
  return new TextDecoder(enc && /8859-1|latin|1252/.test(enc) ? 'windows-1252' : 'utf-8').decode(bytes);
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const desescapar = (s: string) =>
  s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTIDADES[e] ?? m),
  );

/** Contenido del primer <tag> (con o sin prefijo de espacio de nombres) dentro de `xml`. */
function tag(xml: string, nombre: string): string | undefined {
  const m = new RegExp(`<(?:\\w+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nombre}>`).exec(xml);
  return m ? desescapar(m[1].trim()) : undefined;
}
/** Todos los bloques <tag>…</tag>. */
function bloques(xml: string, nombre: string): string[] {
  return [...xml.matchAll(new RegExp(`<(?:\\w+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nombre}>`, 'g'))].map((m) => m[1]);
}
const entero = (s: string | undefined) => (s ? Math.round(Number(s.replace(',', '.'))) || 0 : 0);

/** Un <Documento> (o <Exportaciones>) → lo leído. */
function documento(xml: string): DocLeido {
  const enc = tag(xml, 'Encabezado') ?? '';
  const id = tag(enc, 'IdDoc') ?? '';
  const emisor = tag(enc, 'Emisor') ?? '';
  const receptor = tag(enc, 'Receptor') ?? '';
  const tot = tag(enc, 'Totales') ?? '';
  const codigo = entero(tag(id, 'TipoDTE'));
  const folio = entero(tag(id, 'Folio'));
  const fecha = tag(id, 'FchEmis');
  if (!codigo || !folio || !fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new ErrorDte('El XML no trae tipo, folio o fecha del documento.');
  const neto = entero(tag(tot, 'MntNeto'));
  const exento = entero(tag(tot, 'MntExe'));
  const iva = entero(tag(tot, 'IVA'));
  const total = entero(tag(tot, 'MntTotal')) || neto + exento + iva;
  const ref = bloques(xml, 'Referencia')
    .map((r) => ({ codigo: entero(tag(r, 'TpoDocRef')) || undefined, folio: entero(tag(r, 'FolioRef')) }))
    .find((r) => r.folio > 0 && r.codigo !== undefined && r.codigo < 1000);
  const primerItem = tag(bloques(xml, 'Detalle')[0] ?? '', 'NmbItem');
  const l: DocLeido = {
    tipo: tipoDesdeCodigo(codigo),
    codigo,
    folio,
    fecha,
    rutEmisor: normalizarRut(tag(emisor, 'RUTEmisor')),
    nombreEmisor: tag(emisor, 'RznSoc') ?? tag(emisor, 'RznSocEmisor'),
    rutReceptor: normalizarRut(tag(receptor, 'RUTRecep')),
    nombreReceptor: tag(receptor, 'RznSocRecep'),
    neto,
    exento,
    iva,
    total,
    estado: 'vigente',
  };
  if (primerItem) l.detalle = primerItem;
  if (ref && (l.tipo === 'nota_credito' || l.tipo === 'nota_debito')) l.referencia = ref;
  return l;
}

/** Lee todos los documentos de un XML (EnvioDTE, EnvioBOLETA o un DTE suelto). */
export function leerDte(xml: string): DocLeido[] {
  const docs = [...bloques(xml, 'Documento'), ...bloques(xml, 'Exportaciones')];
  if (!docs.length) throw new ErrorDte('El archivo no es un documento tributario electrónico (DTE).');
  return docs.map(documento);
}
