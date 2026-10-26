// Formato de montos (CLP sin decimales) y fechas, según el handoff.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** $79.500 · negativos con el signo menos tipográfico (−$1.000). */
export const fmt = (n: number): string =>
  (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-CL');

/** Extrae solo los dígitos de un texto y lo convierte a número (0 si está vacío). */
export const dg = (s: unknown): number => parseInt(String(s ?? '').replace(/\D/g, ''), 10) || 0;

/** Muestra un borrador numérico con separador de miles ('' si está vacío). */
export const show = (s: string | undefined | null): string =>
  s === '' || s == null ? '' : dg(s).toLocaleString('es-CL');

/** Aplica una tecla del teclado numérico propio a un borrador (máx. 9 dígitos, sin ceros a la izquierda). */
export const pressKey = (value: string, key: string): string => {
  const v = key === '⌫' ? value.slice(0, -1) : (value + key).replace(/^0+/, '');
  return v.length > 9 ? value : v;
};

export const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'];

export const initials = (n: string): string =>
  n.trim().split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export const firstName = (n: string): string => n.trim().split(/\s+/)[0] ?? '';

/** Fecha local de hoy en formato ISO (YYYY-MM-DD). */
export const todayISO = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseISO = (iso: string): Date => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** "3 oct" (o "3 oct 2025" si no es del año en curso). */
export const shortDate = (iso: string, now = new Date()): string => {
  const d = parseISO(iso);
  const base = `${d.getDate()} ${MESES[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
};

/** "Hoy, 22 oct" / "Ayer, 21 oct" / "3 oct". */
export const dateLabel = (iso: string, now = new Date()): string => {
  const days = daysBetween(iso, todayISO(now));
  if (days === 0) return `Hoy, ${shortDate(iso, now)}`;
  if (days === 1) return `Ayer, ${shortDate(iso, now)}`;
  return shortDate(iso, now);
};

export const daysBetween = (fromISO: string, toISO: string): number =>
  Math.round((parseISO(toISO).getTime() - parseISO(fromISO).getTime()) / 86_400_000);

/** "hoy", "ayer", "hace 12 días". */
export const relativeDays = (iso: string, now = new Date()): string => {
  const d = daysBetween(iso.slice(0, 10), todayISO(now));
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  return `hace ${d} días`;
};

/** "Hoy, 21:04" o "18 oct, 21:04" para marcas de tiempo completas. */
export const stampLabel = (isoStamp: string, now = new Date()): string => {
  const d = new Date(isoStamp);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = todayISO(d) === todayISO(now) ? 'Hoy' : shortDate(todayISO(d), now);
  return `${day}, ${hm}`;
};

export const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "noviembre 2026" a partir de "2026-11". */
export const mesLargo = (mes: string) => `${MESES_LARGOS[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

/** Mes anterior/siguiente en formato YYYY-MM. */
export const sumarMes = (mes: string, n: number) => {
  const d = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Encabezado de día del registro: "Hoy", "Ayer", "Lunes 23" (o "Lunes 23 oct" si es de otro mes). */
export function diaLabel(iso: string, now = new Date()): string {
  const hoy = todayISO(now);
  const dd = daysBetween(iso, hoy);
  if (dd === 0) return 'Hoy';
  if (dd === 1) return 'Ayer';
  const d = parseISO(iso);
  const base = `${cap(DIAS[d.getDay()])} ${d.getDate()}`;
  if (iso.slice(0, 7) === hoy.slice(0, 7)) return base;
  return `${base} ${MESES[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? '' : ' ' + d.getFullYear()}`;
}

/** "y" para unir nombres: "Camila, Javiera y Fernanda". */
export const juntarY = (a: string[]) => (a.length <= 1 ? a[0] ?? '' : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1]);

/** Día y mes corto por separado (para la lista de próximos pagos). */
export const diaMes = (iso: string) => ({ dia: Number(iso.slice(8, 10)), mes: MESES[Number(iso.slice(5, 7)) - 1] });
