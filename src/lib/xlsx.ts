// Lector mínimo de planillas .xlsx (sin dependencias): un .xlsx es un zip con XML adentro.
// Alcanza para las cartolas de los bancos: texto, números y fechas (como número de serie de Excel).
// Todo pasa en el teléfono: el archivo no sale a ninguna parte.

export type Celda = string | number | null;

export interface Hoja {
  nombre: string;
  /** Filas con sus celdas por columna (A = 0). Las filas vacías quedan como []. */
  filas: Celda[][];
}

export class ErrorArchivo extends Error {}

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

interface EntradaZip {
  nombre: string;
  metodo: number;
  tamano: number;
  offset: number;
}

/** Índice del zip (directorio central). */
function leerIndice(b: Uint8Array): Map<string, EntradaZip> {
  // Fin del directorio central: firma PK\x05\x06, en los últimos 64 KB.
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (u32(b, i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new ErrorArchivo('No es un archivo .xlsx');
  const n = u16(b, fin + 10);
  let p = u32(b, fin + 16);
  const out = new Map<string, EntradaZip>();
  const dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (u32(b, p) !== 0x02014b50) throw new ErrorArchivo('El archivo .xlsx está dañado');
    const metodo = u16(b, p + 10);
    const tamano = u32(b, p + 20);
    const largoNombre = u16(b, p + 28);
    const largoExtra = u16(b, p + 30);
    const largoComentario = u16(b, p + 32);
    const offset = u32(b, p + 42);
    const nombre = dec.decode(b.subarray(p + 46, p + 46 + largoNombre));
    out.set(nombre, { nombre, metodo, tamano, offset });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return out;
}

async function inflar(datos: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([datos as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function extraer(b: Uint8Array, e: EntradaZip): Promise<string> {
  const p = e.offset;
  if (u32(b, p) !== 0x04034b50) throw new ErrorArchivo('El archivo .xlsx está dañado');
  const inicio = p + 30 + u16(b, p + 26) + u16(b, p + 28);
  const datos = b.subarray(inicio, inicio + e.tamano);
  const crudo = e.metodo === 0 ? datos : e.metodo === 8 ? await inflar(datos) : null;
  if (!crudo) throw new ErrorArchivo('El archivo .xlsx usa una compresión que no conocemos');
  return new TextDecoder().decode(crudo);
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decodificar = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTIDADES[e.toLowerCase()],
  );

/** Texto de un nodo con texto enriquecido: junta todos los <t>. */
const textos = (xml: string) => decodificar([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

const atributo = (attrs: string, nombre: string) => new RegExp(`(?:^|\\s)${nombre}="([^"]*)"`).exec(attrs)?.[1];

/** "AB12" → 27 (A = 0). */
export function columna(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function leerHojaXml(xml: string, compartidos: string[]): Celda[][] {
  const filas: Celda[][] = [];
  for (const fila of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(atributo(fila[1], 'r')) || filas.length + 1;
    const celdas: Celda[] = [];
    for (const c of (fila[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = atributo(c[1], 'r');
      const col = ref ? columna(ref) : celdas.length;
      const t = atributo(c[1], 't');
      const cuerpo = c[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
      let valor: Celda = null;
      if (t === 's') valor = v !== undefined ? (compartidos[Number(v)] ?? null) : null;
      else if (t === 'inlineStr') valor = textos(cuerpo);
      else if (t === 'str' || t === 'e') valor = v !== undefined ? decodificar(v) : null;
      else if (t === 'b') valor = v === '1' ? 'VERDADERO' : 'FALSO';
      else if (v !== undefined && v !== '') valor = Number(v);
      celdas[col] = valor;
    }
    for (let i = 0; i < celdas.length; i++) if (celdas[i] === undefined) celdas[i] = null;
    filas[r - 1] = celdas;
  }
  for (let i = 0; i < filas.length; i++) if (!filas[i]) filas[i] = [];
  return filas;
}

/** Lee todas las hojas de un .xlsx. */
export async function leerXlsx(datos: ArrayBuffer | Uint8Array): Promise<Hoja[]> {
  const b = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  if (b.length > 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0)
    throw new ErrorArchivo('Es un Excel antiguo (.xls). Descárgalo como .xlsx o ábrelo y guárdalo como .xlsx.');
  if (u32(b, 0) !== 0x04034b50) throw new ErrorArchivo('No es un archivo .xlsx');
  const indice = leerIndice(b);
  const leer = async (nombre: string) => {
    const e = indice.get(nombre);
    return e ? extraer(b, e) : undefined;
  };
  const libro = await leer('xl/workbook.xml');
  if (!libro) throw new ErrorArchivo('No es un archivo .xlsx');
  const rels = (await leer('xl/_rels/workbook.xml.rels')) ?? '';
  const destinos = new Map([...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => [atributo(m[1], 'Id') ?? '', atributo(m[1], 'Target') ?? '']));
  const ss = (await leer('xl/sharedStrings.xml')) ?? '';
  const compartidos = [...ss.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textos(m[1]));
  const hojas: Hoja[] = [];
  for (const h of libro.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const nombre = decodificar(atributo(h[1], 'name') ?? `Hoja ${hojas.length + 1}`);
    const rid = atributo(h[1], 'r:id');
    let destino = (rid && destinos.get(rid)) || `worksheets/sheet${hojas.length + 1}.xml`;
    destino = destino.startsWith('/') ? destino.slice(1) : `xl/${destino.replace(/^\.\//, '')}`;
    const xml = await leer(destino);
    if (xml) hojas.push({ nombre, filas: leerHojaXml(xml, compartidos) });
  }
  return hojas;
}

/** Número de serie de Excel → "YYYY-MM-DD" (Excel cuenta días desde el 30-12-1899). */
export function fechaExcel(serie: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serie) * 86_400_000);
  return d.toISOString().slice(0, 10);
}
