// Textos y formatos chicos que comparten varias pantallas (fuera de los archivos de componentes).
import { AVATAR_COLORS, type Cuenta, type Medio } from '../db';

/** Color del avatar de una persona según su posición. */
export const avatarColor = (i: number) => AVATAR_COLORS[((i % AVATAR_COLORS.length) + AVATAR_COLORS.length) % AVATAR_COLORS.length];

export const tipoMedioLabel = (t: Medio['tipo']) => ({ credito: 'Crédito', debito: 'Débito', efectivo: 'Efectivo', transferencia: 'Transferencia' })[t];

/** "hace 5 min", "hace 2 h", "recién". */
export function haceLbl(iso?: string, ahora = Date.now()) {
  if (!iso) return 'todavía no se revisa';
  const min = Math.floor((ahora - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} ${Math.floor(h / 24) === 1 ? 'día' : 'días'}`;
}

export const pct = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;
const MS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const parse = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
/** "1 ene 2027" */
export const fechaLarga = (iso: string) => {
  const d = parse(iso);
  return `${d.getDate()} ${MS[d.getMonth()]} ${d.getFullYear()}`;
};
/** "Lunes 24 may 2027" */
export const fechaConDia = (iso: string) => `${DIAS[parse(iso).getDay()]} ${fechaLarga(iso)}`;
export const cuadradoLbl = (n?: number) => (n === undefined ? 'sin cuadrar' : n <= 0 ? 'cuadrado hoy' : `cuadrado hace ${plural(n, 'día', 'días')}`);
export const TIPO_CUENTA: Record<Cuenta['tipo'], string> = {
  remunerada: 'Cuenta remunerada',
  vista: 'Cuenta vista',
  efectivo: 'Efectivo',
  inversion: 'Inversión',
  dap: 'Depósito a plazo',
};
