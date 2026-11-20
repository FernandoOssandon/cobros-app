// Impuestos de un emprendedor: IVA, retención de boletas de honorarios y un resumen del mes (orientativo, tipo F29).
// Lógica pura. Es una ayuda para entender los números, no reemplaza la propuesta del SII ni a un contador.
import type { Contribuyente, DocTributario } from '../../db';
import { signoDoc } from './documentos';

/** IVA en Chile: 19 %. */
export const TASA_IVA = 0.19;

export const ivaDeNeto = (neto: number) => Math.round(neto * TASA_IVA);
/** De un total con IVA incluido: neto e IVA (el IVA es la diferencia, así siempre suma el total). */
export function desglosarTotal(total: number): { neto: number; iva: number } {
  const neto = Math.round(total / (1 + TASA_IVA));
  return { neto, iva: total - neto };
}

/**
 * Tasa de retención de las boletas de honorarios según el año de emisión (ley 21.133, con la pausa de 2023).
 * 2026: 15,25 %; sube hasta 17 % en 2028.
 */
export function tasaRetencionBhe(anio: number): number {
  const tabla: Record<number, number> = { 2019: 10, 2020: 10.75, 2021: 11.5, 2022: 12.25, 2023: 13, 2024: 13.75, 2025: 14.5, 2026: 15.25, 2027: 16 };
  if (anio < 2019) return 10;
  return tabla[anio] ?? 17;
}

export interface MontosBhe {
  bruto: number;
  retencion: number;
  liquido: number;
  /** Tasa usada, en %. */
  tasa: number;
}

/** Desde el monto bruto (lo que dice la boleta): la retención y lo que recibes. */
export function bheDesdeBruto(bruto: number, fecha: string): MontosBhe {
  const tasa = tasaRetencionBhe(Number(fecha.slice(0, 4)));
  const retencion = Math.round((bruto * tasa) / 100);
  return { bruto, retencion, liquido: bruto - retencion, tasa };
}

/** Desde lo que quieres recibir (líquido): cuánto poner como bruto en la boleta. */
export function bheDesdeLiquido(liquido: number, fecha: string): MontosBhe {
  const tasa = tasaRetencionBhe(Number(fecha.slice(0, 4)));
  // Se busca el bruto más chico cuyo líquido alcance (el redondeo de la retención puede mover un peso).
  let bruto = Math.round(liquido / (1 - tasa / 100));
  while (bheDesdeBruto(bruto, fecha).liquido < liquido) bruto++;
  while (bruto > 0 && bheDesdeBruto(bruto - 1, fecha).liquido >= liquido) bruto--;
  return bheDesdeBruto(bruto, fecha);
}

// ---------- Resumen del mes ----------

export interface ResumenSii {
  periodo: string;
  /** Ventas: lo emitido con IVA (neto) y exento, y el IVA que cobraste (débito fiscal). */
  ventasNetas: number;
  ventasExentas: number;
  debito: number;
  nVentas: number;
  /** Compras: facturas recibidas (neto) y el IVA que pagaste y puedes descontar (crédito fiscal). */
  comprasNetas: number;
  credito: number;
  nCompras: number;
  /** Débito − crédito. Negativo: queda remanente de crédito para el mes siguiente. */
  ivaDeterminado: number;
  /** Boletas de honorarios que emitiste. */
  honorarios: { n: number; bruto: number; retencion: number; liquido: number; retieneReceptor: number };
  /** Retenciones de boletas de honorarios que recibiste y que te toca enterar (si eres empresa). */
  retencionesPorEnterar: number;
  /** PPM estimado: tasa × ingresos del giro (ventas netas + exentas). */
  ppm: number;
  /** Estimación de lo que se paga en el F29: IVA (si es positivo) + PPM + retenciones por enterar. */
  aPagar: number;
}

const esVenta = (d: DocTributario) => d.sentido === 'emitido' && d.tipo !== 'bhe' && d.tipo !== 'bte' && d.tipo !== 'guia';
// Las boletas recibidas no dan crédito fiscal; las facturas (y sus notas) sí.
const esCompraConCredito = (d: DocTributario) => d.sentido === 'recibido' && ['factura', 'factura_exenta', 'nota_credito', 'nota_debito', 'liquidacion_factura'].includes(d.tipo);

/** Resumen orientativo de un mes para un contribuyente (lo que va al F29). */
export function resumenSii(c: Pick<Contribuyente, 'id' | 'tasaPpm'>, docs: DocTributario[], periodo: string): ResumenSii {
  const del = docs.filter((d) => d.contribuyenteId === c.id && d.periodo === periodo && d.estado === 'vigente');
  const suma = (xs: DocTributario[], f: (d: DocTributario) => number) => xs.reduce((s, d) => s + signoDoc(d.tipo) * f(d), 0);
  const ventas = del.filter(esVenta);
  const compras = del.filter(esCompraConCredito);
  const bhe = del.filter((d) => d.sentido === 'emitido' && d.tipo === 'bhe');
  const bheRecibidas = del.filter((d) => d.sentido === 'recibido' && d.tipo === 'bhe');
  const ventasNetas = suma(ventas, (d) => d.neto);
  const ventasExentas = suma(ventas, (d) => d.exento);
  const debito = suma(ventas, (d) => d.iva);
  const credito = suma(compras, (d) => d.iva);
  const ivaDeterminado = debito - credito;
  const retencionesPorEnterar = bheRecibidas.reduce((s, d) => s + (d.retencion ?? 0), 0);
  const ppm = c.tasaPpm ? Math.round(((ventasNetas + ventasExentas) * c.tasaPpm) / 100) : 0;
  return {
    periodo,
    ventasNetas,
    ventasExentas,
    debito,
    nVentas: ventas.length,
    comprasNetas: suma(compras, (d) => d.neto),
    credito,
    nCompras: compras.length,
    ivaDeterminado,
    honorarios: {
      n: bhe.length,
      bruto: bhe.reduce((s, d) => s + (d.bruto ?? d.total), 0),
      retencion: bhe.reduce((s, d) => s + (d.retencion ?? 0), 0),
      liquido: bhe.reduce((s, d) => s + (d.liquido ?? d.total), 0),
      retieneReceptor: bhe.filter((d) => d.retiene !== 'emisor').reduce((s, d) => s + (d.retencion ?? 0), 0),
    },
    retencionesPorEnterar,
    ppm,
    aPagar: Math.max(0, ivaDeterminado) + ppm + retencionesPorEnterar,
  };
}
