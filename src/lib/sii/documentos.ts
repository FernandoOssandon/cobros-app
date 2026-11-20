// Documentos tributarios del SII: códigos, nombres, identificador estable y cómo suman. Lógica pura.
import type { DocTributario, TipoDocSii } from '../../db';

/** Códigos de los documentos tributarios electrónicos (DTE) más comunes. */
export const CODIGOS_DTE: Record<number, TipoDocSii> = {
  33: 'factura',
  34: 'factura_exenta',
  39: 'boleta',
  41: 'boleta_exenta',
  43: 'liquidacion_factura',
  46: 'factura_compra',
  52: 'guia',
  56: 'nota_debito',
  61: 'nota_credito',
  110: 'factura_exportacion',
};

export const NOMBRE_TIPO: Record<TipoDocSii, string> = {
  factura: 'Factura',
  factura_exenta: 'Factura exenta',
  boleta: 'Boleta',
  boleta_exenta: 'Boleta exenta',
  liquidacion_factura: 'Liquidación factura',
  factura_compra: 'Factura de compra',
  guia: 'Guía de despacho',
  nota_debito: 'Nota de débito',
  nota_credito: 'Nota de crédito',
  factura_exportacion: 'Factura de exportación',
  bhe: 'Boleta de honorarios',
  bte: 'Boleta de servicios de terceros',
  resumen_boletas: 'Resumen de boletas',
  otro: 'Documento',
};

export const tipoDesdeCodigo = (codigo: number): TipoDocSii => CODIGOS_DTE[codigo] ?? 'otro';

/** Código SII de un tipo (si es electrónico). */
export const codigoDeTipo = (tipo: TipoDocSii): number | undefined => {
  const e = Object.entries(CODIGOS_DTE).find(([, t]) => t === tipo);
  return e ? Number(e[0]) : undefined;
};

/** Una nota de crédito resta; una guía no suma (solo acompaña la mercadería). El resto suma. */
export const signoDoc = (tipo: TipoDocSii): 1 | -1 | 0 => (tipo === 'nota_credito' ? -1 : tipo === 'guia' ? 0 : 1);

/**
 * Identificador estable: el mismo documento leído desde un archivo, desde un correo o escrito a mano da el mismo id.
 * Un documento lo identifican quien lo emite, su tipo y su folio.
 */
export function idDocumento(d: Pick<DocTributario, 'contribuyenteId' | 'sentido' | 'tipo' | 'folio'> & { rutEmisor: string }): string {
  return `${d.contribuyenteId}:${d.sentido}:${d.rutEmisor}:${d.tipo}:${d.folio}`;
}

/** Período tributario de una fecha (YYYY-MM). */
export const periodoDe = (fecha: string) => fecha.slice(0, 7);

/** Un documento leído de un archivo o un correo, antes de guardarlo (todavía sin contribuyente ni id). */
export interface DocLeido {
  sentido?: 'emitido' | 'recibido';
  tipo: TipoDocSii;
  codigo?: number;
  folio: number;
  fecha: string;
  rutEmisor?: string;
  nombreEmisor?: string;
  rutReceptor?: string;
  nombreReceptor?: string;
  neto: number;
  exento: number;
  iva: number;
  total: number;
  bruto?: number;
  retencion?: number;
  liquido?: number;
  estado: 'vigente' | 'anulado';
  detalle?: string;
  referencia?: { codigo?: number; folio: number };
}

/**
 * Lo leído → el documento de un contribuyente. El sentido sale de los RUT: si el contribuyente es el emisor, es emitido.
 * Devuelve undefined si el documento no es de este contribuyente (ni lo emitió ni lo recibió).
 */
export function aDocumento(l: DocLeido, c: { id: string; rut: string }, origen: DocTributario['origen'], creado: string): DocTributario | undefined {
  const sentido = l.sentido ?? (l.rutEmisor === c.rut ? 'emitido' : l.rutReceptor === c.rut ? 'recibido' : undefined);
  if (!sentido) return undefined;
  const rutEmisor = sentido === 'emitido' ? c.rut : (l.rutEmisor ?? '?');
  const otro = sentido === 'emitido' ? { rut: l.rutReceptor, nombre: l.nombreReceptor } : { rut: l.rutEmisor, nombre: l.nombreEmisor };
  const doc: DocTributario = {
    id: idDocumento({ contribuyenteId: c.id, sentido, tipo: l.tipo, folio: l.folio, rutEmisor }),
    contribuyenteId: c.id,
    sentido,
    tipo: l.tipo,
    codigo: l.codigo,
    folio: l.folio,
    fecha: l.fecha,
    periodo: periodoDe(l.fecha),
    rutContraparte: otro.rut,
    nombreContraparte: otro.nombre,
    neto: l.neto,
    exento: l.exento,
    iva: l.iva,
    total: l.total,
    estado: l.estado,
    origen,
    creado,
  };
  if (l.bruto !== undefined) Object.assign(doc, { bruto: l.bruto, retencion: l.retencion ?? 0, liquido: l.liquido ?? l.bruto - (l.retencion ?? 0) });
  if (l.detalle) doc.detalle = l.detalle;
  if (l.referencia) doc.referencia = l.referencia;
  return doc;
}

export interface Fusion {
  nuevos: DocTributario[];
  /** Los que ya estaban y cambiaron (por ejemplo, una boleta que se anuló): se actualizan sin perder lo ligado. */
  actualizados: DocTributario[];
  repetidos: number;
}

/**
 * Junta lo leído con lo guardado: los nuevos se agregan; los que ya estaban se actualizan si cambió su estado o sus montos,
 * conservando lo que la app les agregó (ingreso o gasto ligado, fecha de creación).
 */
export function fusionar(leidos: DocTributario[], guardados: DocTributario[]): Fusion {
  const porId = new Map(guardados.map((d) => [d.id, d]));
  const vistos = new Set<string>();
  const out: Fusion = { nuevos: [], actualizados: [], repetidos: 0 };
  for (const d of leidos) {
    if (vistos.has(d.id)) continue;
    vistos.add(d.id);
    const g = porId.get(d.id);
    if (!g) {
      out.nuevos.push(d);
      continue;
    }
    const cambio = g.estado !== d.estado || g.total !== d.total || g.neto !== d.neto || g.iva !== d.iva || g.exento !== d.exento || g.retencion !== d.retencion;
    if (cambio) out.actualizados.push({ ...g, ...d, ingresoId: g.ingresoId, gastoId: g.gastoId, creado: g.creado, origen: g.origen });
    else out.repetidos++;
  }
  return out;
}
