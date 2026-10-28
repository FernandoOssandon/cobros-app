// Íconos de trazo del diseño v2 (stroke = currentColor).
import type { CSSProperties } from 'react';

/** Íconos de categoría. */
export const IC: Record<string, string> = {
  comida: 'M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2.2 0-3.5 2.5-3.5 6.5 0 2.5 1.3 3.5 3.5 3.5',
  transporte: 'M5 16V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v8zM5 11h14M8 16v3M16 16v3',
  casa: 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-6h4v6',
  subs: 'M3.5 5.5h17v11h-17zM9 20.5h6M10.5 8.5v5l4-2.5z',
  salidas: 'M6.5 3.5h11l-1.2 6.5a4.3 4.3 0 0 1-8.6 0zM12 14.5v6M8 20.5h8',
  salud: 'M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z',
  regalo: 'M4 9h16v4H4zM5.5 13v8h13v-8M12 9v12M12 9C11 6 7 5.5 7 8s5 1 5 1zm0 0c1-3 5-3.5 5-1s-5 1-5 1z',
  libro: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  none: 'M9.2 9.2a3 3 0 1 1 4.3 2.7c-.9.4-1.5 1.1-1.5 2.1M12 17.5v.01',
};

/** Íconos de la barra inferior. */
export const NAV = {
  resumen: 'M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z',
  gastos: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  plata: 'M3 7.5h16a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7.5V6.5a2 2 0 0 1 2-2h11.5v3M16.5 14h.01',
  personas: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3.5 6',
  recurrentes: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
};

const P = {
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  contacts: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6zM12.5 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8.5 17a4 4 0 0 1 8 0M4 7h2M4 12h2M4 17h2',
} as const;

export type IconName = keyof typeof P;

export function Svg({ d, size = 20, w = 2, style }: { d: string; size?: number; w?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d={d} />
    </svg>
  );
}

export const Icon = ({ name, size = 20, w = 2.4 }: { name: IconName; size?: number; w?: number }) => <Svg d={P[name]} size={size} w={w} />;
