// Marca "a mano.": el símbolo es un signo igual (dos barras del color del fondo sobre un cuadro de tinta).
// Proporciones del handoff: cuadro de 34 con radio 11 y barras de 16×4 con radio 2 y 5 de separación.

export function Simbolo({ size = 34 }: { size?: number }) {
  const k = size / 34;
  const barra = { width: 16 * k, height: Math.max(2, 4 * k), borderRadius: 2 * k, background: 'var(--bg)' };
  return (
    <span
      aria-hidden="true"
      style={{ flex: 'none', width: size, height: size, borderRadius: 11 * k, background: 'var(--ink)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 * k }}
    >
      <span style={barra} />
      <span style={barra} />
    </span>
  );
}

/** Logotipo: símbolo + "a mano." (el tamaño del texto lo da el contenedor). */
export function Logo({ size = 34, gap = 10 }: { size?: number; gap?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap, whiteSpace: 'nowrap' }}>
      <Simbolo size={size} />
      a mano.
    </span>
  );
}
