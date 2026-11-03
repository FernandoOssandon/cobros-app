// Ícono de ingreso (flecha hacia abajo sobre verde).
import { Svg } from './icons';

export const IC_IN = 'M12 4v11M7 10l5 5 5-5M5 20h14';

/** Ícono de ingreso: relleno verde (fijo) o con borde (suelto). */
export const IconoIngreso = ({ fijo, size = 40 }: { fijo: boolean; size?: number }) => (
  <span
    className="cat-ic"
    style={{ width: size, height: size, boxSizing: 'border-box', background: fijo ? '#7FD9A8' : 'transparent', border: fijo ? 'none' : '2px solid #7FD9A8', color: fijo ? '#0E1A12' : 'var(--ink)' }}
    aria-hidden="true"
  >
    <Svg d={IC_IN} size={Math.round(size / 2)} w={2} />
  </span>
);
