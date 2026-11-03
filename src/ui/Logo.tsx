// Marca "a mano.": el símbolo (un signo igual) y el logotipo.
// Colores según el tema: claro = barra tinta + barra lima con borde; oscuro = lima + crema.

export function Simbolo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ flex: 'none' }}>
      <rect x="8" y="24" width="84" height="20" rx="10" fill="var(--logo-top)" />
      <rect x="8" y="56" width="84" height="20" rx="10" fill="var(--logo-bottom)" stroke="var(--logo-stroke)" strokeWidth="4" />
    </svg>
  );
}

/** Logotipo: símbolo + "a mano." (el tamaño del texto lo da el contenedor). */
export function Logo({ size = 28, gap = 10 }: { size?: number; gap?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap, whiteSpace: 'nowrap' }}>
      <Simbolo size={size} />
      a mano.
    </span>
  );
}
