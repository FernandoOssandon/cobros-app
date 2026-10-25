// Mensajes de cobro por WhatsApp (tonos del handoff).

export const TONOS = ['Amable', 'Directo', 'Con humor'] as const;

export function mensajesCobro(nombre: string, saldoFmt: string, pendientes: string[]): string[] {
  const pend = pendientes.join(', ') || 'lo pendiente';
  return [
    `Hola ${nombre}! Te escribo por lo pendiente (${pend}). En total son ${saldoFmt}. Cuando puedas me transfieres. ¡Gracias!`,
    `Hola ${nombre}, te recuerdo que me debes ${saldoFmt} por ${pend}. ¿Me lo transfieres hoy?`,
    `${nombre}, tu deuda conmigo ya está por cumplir años: ${saldoFmt}. Acepto transferencias, efectivo y disculpas.`,
  ];
}

export function conDatos(mensaje: string, datosBancarios: string, miNombre: string, incluir: boolean): string {
  if (!incluir || !datosBancarios.trim()) return mensaje;
  return `${mensaje}\n\n${datosBancarios.trim()}${miNombre.trim() ? '\n' + miNombre.trim() : ''}`;
}

/** Solo dígitos, con 56 al inicio si es un celular chileno escrito sin código de país. */
export function telefonoWa(tel: string): string {
  let d = tel.replace(/\D/g, '');
  if (d.length === 9 && d.startsWith('9')) d = '56' + d;
  return d;
}

/** Enlace wa.me. Sin teléfono, WhatsApp abre el selector de contactos. */
export const enlaceWa = (tel: string, texto: string) =>
  `https://wa.me/${telefonoWa(tel)}?text=${encodeURIComponent(texto)}`;
