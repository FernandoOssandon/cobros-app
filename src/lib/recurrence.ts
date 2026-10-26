// Fechas de un recurrente (lógica pura, sin base de datos).
import type { Frecuencia } from '../db';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parts = (s: string) => s.slice(0, 10).split('-').map(Number) as [number, number, number];
const diasDelMes = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

export const sumarDias = (s: string, n: number) => {
  const [y, m, d] = parts(s);
  const x = new Date(y, m - 1, d + n);
  return iso(x.getFullYear(), x.getMonth(), x.getDate());
};

/** n-ésima ocurrencia (0 = la primera, que es `inicio`). */
export function ocurrencia(f: Frecuencia, inicio: string, n: number): string {
  const [y, m, d] = parts(inicio);
  const cada = Math.max(1, f.cada || 1);
  switch (f.unidad) {
    case 'dia':
      return sumarDias(inicio, n * cada);
    case 'semana':
      return sumarDias(inicio, n * cada * 7);
    case 'mes': {
      const total = m - 1 + n * cada;
      const yy = y + Math.floor(total / 12);
      const mm = total % 12;
      const dia = Math.min(f.dia ?? d, diasDelMes(yy, mm));
      return iso(yy, mm, dia);
    }
    case 'anio': {
      const yy = y + n * cada;
      return iso(yy, m - 1, Math.min(d, diasDelMes(yy, m - 1)));
    }
  }
}

/**
 * Fechas de ocurrencia en el rango (despues, hasta], respetando `fin`.
 * `limite` evita bucles enormes si alguien abre la app tras años (máx. 400 ocurrencias).
 */
export function ocurrenciasEntre(f: Frecuencia, inicio: string, despues: string | undefined, hasta: string, fin?: string, limite = 400): string[] {
  const tope = fin && fin < hasta ? fin : hasta;
  const out: string[] = [];
  for (let n = 0; out.length < limite; n++) {
    const fecha = ocurrencia(f, inicio, n);
    if (fecha > tope) break;
    if (!despues || fecha > despues) out.push(fecha);
    if (n > 20000) break;
  }
  return out;
}

/** Próxima ocurrencia después de `despues` (o la primera), o undefined si ya terminó. */
export function proxima(f: Frecuencia, inicio: string, despues?: string, fin?: string): string | undefined {
  for (let n = 0; n < 20000; n++) {
    const fecha = ocurrencia(f, inicio, n);
    if (fin && fecha > fin) return undefined;
    if (!despues || fecha > despues) return fecha;
  }
  return undefined;
}

const DIAS_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
const UNIDAD = { dia: ['día', 'días'], semana: ['semana', 'semanas'], mes: ['mes', 'meses'], anio: ['año', 'años'] } as const;

/** Texto legible: "Cada mes, el día 5", "Todos los lunes", "Cada 2 semanas"… */
export function describirFrecuencia(f: Frecuencia, inicio: string): string {
  const cada = Math.max(1, f.cada || 1);
  const [y, m, d] = parts(inicio);
  if (f.unidad === 'mes') return `${cada === 1 ? 'Cada mes' : `Cada ${cada} meses`}, el día ${f.dia ?? d}`;
  if (f.unidad === 'semana' && cada === 1) return `Todos los ${DIAS_PLURAL[new Date(y, m - 1, d).getDay()]}`;
  if (f.unidad === 'anio' && cada === 1) return 'Cada año';
  if (f.unidad === 'dia' && cada === 1) return 'Todos los días';
  return `Cada ${cada} ${UNIDAD[f.unidad][1]}`;
}

/** Equivalente mensual de un monto según su frecuencia (para "total mensual comprometido"). */
export function montoMensual(monto: number, f: Frecuencia): number {
  const cada = Math.max(1, f.cada || 1);
  const porMes = { dia: 30.4375, semana: 4.348, mes: 1, anio: 1 / 12 }[f.unidad] / cada;
  return Math.round(monto * porMes);
}
