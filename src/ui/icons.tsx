// Íconos de trazo del diseño v2 (stroke = currentColor).
import type { CSSProperties } from 'react';

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
