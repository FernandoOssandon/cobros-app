// Lector de los listados que se descargan del SII (CSV o Excel): el Registro de Compras y Ventas
// y los informes de boletas de honorarios. Reconoce las columnas por su nombre, no por su posición,
// así sigue funcionando si el SII agrega o reordena columnas. Lógica pura.
import { fecha as leerFecha, numero, plano } from '../bancos';
import { normalizarRut } from '../rut';
import type { Celda, Hoja } from '../xlsx';
import { tipoDesdeCodigo, type DocLeido } from './documentos';

export class ErrorTablaSii extends Error {}

/** Bytes → texto: UTF-8 si es válido; si no, Windows-1252 (los CSV del SII a veces vienen así). */
export function textoTabla(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** CSV → filas. Detecta el separador (; , o tabulación) y respeta las comillas. */
export function leerCsv(texto: string): Hoja {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/);
  const primera = lineas.find((l) => l.trim()) ?? '';
  const sep = [';', '\t', ','].map((s) => ({ s, n: primera.split(s).length })).sort((a, b) => b.n - a.n)[0].s;
  const filas: Celda[][] = [];
  let fila: Celda[] = [];
  let campo = '';
  let comillas = false;
  const t = lineas.join('\n');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) {
      fila.push(campo.trim());
      campo = '';
    } else if (ch === '\n') {
      fila.push(campo.trim());
      filas.push(fila.every((c) => c === '') ? [] : fila);
      fila = [];
      campo = '';
    } else campo += ch;
  }
  if (campo || fila.length) {
    fila.push(campo.trim());
    filas.push(fila);
  }
  return { nombre: 'csv', filas };
}

// ---------- Columnas ----------

type Campo = 'tipo' | 'folio' | 'fecha' | 'rutProveedor' | 'rutCliente' | 'rutEmisor' | 'rutReceptor' | 'rut' | 'nombre' | 'exento' | 'neto' | 'iva' | 'total' | 'bruto' | 'retencion' | 'liquido' | 'estado';

/** Nombres con que aparece cada columna (en minúsculas, sin tildes). El primero que calce gana. */
const ALIAS: Record<Campo, string[]> = {
  tipo: ['tipo doc', 'tipo documento', 'tipo dte', 'tipo de documento'],
  folio: ['folio', 'n° boleta', 'nro boleta', 'numero boleta', 'n boleta', 'nro. boleta', 'boleta n°', 'n° documento', 'nro documento'],
  fecha: ['fecha docto', 'fecha documento', 'fecha emision', 'fecha de emision', 'fecha boleta', 'fecha'],
  rutProveedor: ['rut proveedor'],
  rutCliente: ['rut cliente'],
  rutEmisor: ['rut emisor', 'rut del emisor'],
  rutReceptor: ['rut receptor', 'rut del receptor'],
  rut: ['rut'],
  nombre: ['razon social', 'nombre o razon social', 'nombre', 'nombre emisor', 'nombre receptor'],
  exento: ['monto exento'],
  neto: ['monto neto'],
  iva: ['monto iva recuperable', 'monto iva', 'iva'],
  total: ['monto total', 'total'],
  bruto: ['brutos', 'bruto', 'honorario bruto', 'honorarios brutos', 'monto bruto', 'honorarios'],
  retencion: ['retenido', 'retencion', 'monto retenido', 'retencion receptor'],
  liquido: ['pagado', 'liquido', 'monto liquido', 'liquido a pagar'],
  estado: ['estado'],
};

function columnas(cabecera: Celda[]): Partial<Record<Campo, number>> {
  const nombres = cabecera.map((c) => plano(String(c ?? '')).replace(/[.:]$/, ''));
  const out: Partial<Record<Campo, number>> = {};
  const usadas = new Set<number>();
  for (const campo of Object.keys(ALIAS) as Campo[]) {
    for (const a of ALIAS[campo]) {
      const i = nombres.findIndex((n, j) => n === a && !usadas.has(j));
      if (i >= 0) {
        out[campo] = i;
        usadas.add(i);
        break;
      }
    }
  }
  return out;
}

export type FormatoSii = 'rcv-compras' | 'rcv-ventas' | 'bhe';

export interface TablaSii {
  formato: FormatoSii;
  /** Emitidos o recibidos (si el archivo lo dice). */
  sentido?: 'emitido' | 'recibido';
  docs: DocLeido[];
  /** Filas que no se pudieron leer (sin folio o sin fecha). */
  omitidas: number;
}

/** Busca la fila de títulos: la primera de las 20 primeras con al menos tres columnas conocidas. */
function buscarCabecera(h: Hoja): { fila: number; cols: Partial<Record<Campo, number>> } | undefined {
  for (let i = 0; i < Math.min(20, h.filas.length); i++) {
    const cols = columnas(h.filas[i] ?? []);
    if (Object.keys(cols).length >= 3 && cols.folio !== undefined && cols.fecha !== undefined) return { fila: i, cols };
  }
  return undefined;
}

/**
 * Reconoce y lee un listado del SII. `sentido` se usa si el archivo no lo dice (por ejemplo, un informe de boletas
 * de honorarios sin la columna "RUT receptor" o "RUT emisor").
 */
export function leerTablaSii(hojas: Hoja[], op: { sentido?: 'emitido' | 'recibido' } = {}): TablaSii {
  for (const h of hojas) {
    const c = buscarCabecera(h);
    if (!c) continue;
    const { cols } = c;
    const esRcv = cols.tipo !== undefined && cols.neto !== undefined;
    const esBhe = !esRcv && cols.bruto !== undefined;
    if (!esRcv && !esBhe) continue;
    const sentido: TablaSii['sentido'] =
      cols.rutProveedor !== undefined ? 'recibido' : cols.rutCliente !== undefined ? 'emitido' : cols.rutReceptor !== undefined ? 'emitido' : cols.rutEmisor !== undefined ? 'recibido' : op.sentido;
    const formato: FormatoSii = esBhe ? 'bhe' : sentido === 'recibido' ? 'rcv-compras' : 'rcv-ventas';
    const docs: DocLeido[] = [];
    let omitidas = 0;
    const celda = (f: Celda[], k: Campo) => (cols[k] === undefined ? undefined : f[cols[k]!]);
    for (const f of h.filas.slice(c.fila + 1)) {
      if (!f.length) continue;
      const folio = numero(celda(f, 'folio'));
      const fecha = leerFecha(celda(f, 'fecha'));
      if (!folio || !fecha) {
        if (f.some((x) => x !== null && String(x).trim() !== '')) omitidas++;
        continue;
      }
      const rut = normalizarRut(String(celda(f, 'rutProveedor') ?? celda(f, 'rutCliente') ?? celda(f, 'rutEmisor') ?? celda(f, 'rutReceptor') ?? celda(f, 'rut') ?? ''));
      const nombre = String(celda(f, 'nombre') ?? '').trim() || undefined;
      const anulado = /nul/i.test(String(celda(f, 'estado') ?? ''));
      // Del lado contrario: en lo emitido el otro es el receptor; en lo recibido, el emisor.
      const otro = sentido === 'recibido' ? { rutEmisor: rut, nombreEmisor: nombre } : { rutReceptor: rut, nombreReceptor: nombre };
      if (esBhe) {
        const bruto = numero(celda(f, 'bruto'));
        const retencion = numero(celda(f, 'retencion'));
        const liquido = cols.liquido !== undefined ? numero(celda(f, 'liquido')) : bruto - retencion;
        docs.push({ sentido, tipo: 'bhe', folio, fecha, ...otro, neto: 0, exento: bruto, iva: 0, total: bruto, bruto, retencion, liquido, estado: anulado ? 'anulado' : 'vigente' });
      } else {
        const codigo = numero(celda(f, 'tipo'));
        const neto = numero(celda(f, 'neto'));
        const exento = numero(celda(f, 'exento'));
        const iva = numero(celda(f, 'iva'));
        const total = numero(celda(f, 'total')) || neto + exento + iva;
        docs.push({ sentido, tipo: tipoDesdeCodigo(codigo), codigo: codigo || undefined, folio, fecha, ...otro, neto, exento, iva, total, estado: anulado ? 'anulado' : 'vigente' });
      }
    }
    return { formato, sentido, docs, omitidas };
  }
  throw new ErrorTablaSii('No reconocemos este archivo. Sirven el detalle del Registro de Compras y Ventas y los informes de boletas de honorarios del SII.');
}
