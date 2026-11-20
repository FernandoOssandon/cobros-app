// RUT chileno: limpiar, validar el dígito verificador (módulo 11) y dar formato. Lógica pura.

/** Solo dígitos y la K final, en mayúscula: "12.345.678-k" → "12345678K". */
export const limpiarRut = (s: string) => s.replace(/[^0-9kK]/g, '').toUpperCase();

/** Dígito verificador de un RUT (sin el dígito): módulo 11. */
export function dvRut(cuerpo: number | string): string {
  const digitos = String(cuerpo).replace(/\D/g, '');
  let suma = 0;
  let factor = 2;
  for (let i = digitos.length - 1; i >= 0; i--) {
    suma += Number(digitos[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}

/** ¿Es un RUT válido? Acepta puntos, guion y la K en minúscula. */
export function validarRut(s: string): boolean {
  const l = limpiarRut(s);
  if (l.length < 2 || !/^\d+[\dK]$/.test(l)) return false;
  const cuerpo = l.slice(0, -1);
  return Number(cuerpo) > 0 && dvRut(cuerpo) === l.slice(-1);
}

/** Forma en que se guarda: "12345678-5" (sin puntos, con guion). `undefined` si no es válido. */
export function normalizarRut(s: string | undefined | null): string | undefined {
  if (!s || !validarRut(s)) return undefined;
  const l = limpiarRut(s);
  return `${Number(l.slice(0, -1))}-${l.slice(-1)}`;
}

/** Para mostrar: "12.345.678-5". Si no es válido, devuelve el texto tal cual. */
export function formatearRut(s: string): string {
  const n = normalizarRut(s);
  if (!n) return s;
  const [cuerpo, dv] = n.split('-');
  return `${Number(cuerpo).toLocaleString('es-CL')}-${dv}`;
}
