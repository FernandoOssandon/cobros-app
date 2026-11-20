// SII: contribuyentes (tú o tu negocio) y sus documentos tributarios en la base del teléfono.
// Base para el apartado de emprendedores: por ahora se alimenta con archivos (los listados del SII y los XML
// de los documentos electrónicos). Nada sale del teléfono.
import { db, now, uid, type Contribuyente, type DocTributario } from './db';
import { normalizarRut } from './lib/rut';
import { aDocumento, fusionar, type DocLeido } from './lib/sii/documentos';
import { ErrorDte, leerDte, textoXml } from './lib/sii/dte';
import { leerCsv, leerTablaSii, textoTabla, type FormatoSii } from './lib/sii/tablas';
import { leerXlsx } from './lib/xlsx';

export class ErrorSii extends Error {}

export type BorradorContribuyente = Omit<Contribuyente, 'id' | 'creado' | 'archivado'> & Partial<Pick<Contribuyente, 'id' | 'archivado'>>;

/** Crea o actualiza un contribuyente. El RUT se valida y se guarda normalizado; no puede repetirse. */
export async function guardarContribuyente(c: BorradorContribuyente): Promise<string> {
  const rut = normalizarRut(c.rut);
  if (!rut) throw new ErrorSii('El RUT no es válido.');
  const otro = await db.contribuyentes.where('rut').equals(rut).first();
  if (otro && otro.id !== c.id) throw new ErrorSii(`Ese RUT ya está como ${otro.nombre}.`);
  const prev = c.id ? await db.contribuyentes.get(c.id) : undefined;
  const id = c.id ?? uid();
  await db.contribuyentes.put({ ...prev, ...c, id, rut, nombre: c.nombre.trim(), archivado: c.archivado ?? prev?.archivado ?? false, creado: prev?.creado ?? now() });
  return id;
}

/** Borra un contribuyente y sus documentos (los ingresos y gastos de la app no se tocan). */
export async function borrarContribuyente(id: string) {
  await db.transaction('rw', [db.contribuyentes, db.docsTributarios], async () => {
    await db.docsTributarios.where('contribuyenteId').equals(id).delete();
    await db.contribuyentes.delete(id);
  });
}

export interface ResultadoImportacionSii {
  formato: FormatoSii | 'dte';
  nuevos: number;
  actualizados: number;
  repetidos: number;
  /** Documentos que no son de este contribuyente (ni los emitió ni los recibió). */
  ajenos: number;
  /** Filas que no se pudieron leer. */
  omitidas: number;
}

/** Lee un archivo del SII o un XML de un documento electrónico. */
export async function leerArchivoSii(nombre: string, bytes: Uint8Array, op: { sentido?: 'emitido' | 'recibido' } = {}): Promise<{ formato: FormatoSii | 'dte'; docs: DocLeido[]; omitidas: number }> {
  const ext = nombre.toLowerCase().split('.').pop();
  if (ext === 'xml') {
    try {
      return { formato: 'dte', docs: leerDte(textoXml(bytes)), omitidas: 0 };
    } catch (e) {
      throw new ErrorSii(e instanceof ErrorDte ? e.message : 'No se pudo leer el XML.');
    }
  }
  const hojas = ext === 'xlsx' ? await leerXlsx(bytes) : [leerCsv(textoTabla(bytes))];
  const t = leerTablaSii(hojas, op);
  return { formato: t.formato, docs: t.docs, omitidas: t.omitidas };
}

/** Guarda lo leído para un contribuyente, sin duplicar lo que ya estaba. */
export async function importarDocsSii(contribuyenteId: string, leido: { formato: FormatoSii | 'dte'; docs: DocLeido[]; omitidas: number }, origen: DocTributario['origen'] = 'archivo'): Promise<ResultadoImportacionSii> {
  const c = await db.contribuyentes.get(contribuyenteId);
  if (!c) throw new ErrorSii('No existe ese contribuyente.');
  const creado = now();
  const docs = leido.docs.map((l) => aDocumento(l, c, origen, creado));
  const propios = docs.filter((d): d is DocTributario => !!d);
  return db.transaction('rw', db.docsTributarios, async () => {
    const guardados = await db.docsTributarios.where('id').anyOf(propios.map((d) => d.id)).toArray();
    const f = fusionar(propios, guardados);
    await db.docsTributarios.bulkPut([...f.nuevos, ...f.actualizados]);
    return { formato: leido.formato, nuevos: f.nuevos.length, actualizados: f.actualizados.length, repetidos: f.repetidos, ajenos: docs.length - propios.length, omitidas: leido.omitidas };
  });
}
