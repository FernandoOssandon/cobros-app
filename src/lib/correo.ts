// Lectura de correos del banco (lógica pura): saca monto, comercio, tarjeta y fecha del texto de un correo.
//
// Los bancos chilenos escriben distinto, así que no hay un formato fijo: se buscan frases típicas
// ("compra por $12.990 en COMERCIO", "terminada en 1234", "Pagaste $5.000 a …") y se elige lo más probable.
// Lo que no se reconoce como un movimiento (estados de cuenta, claves, promociones) se ignora.
import type { Categoria, Gasto, Medio, Persona, TipoDetectado } from '../db';
import { daysBetween, todayISO } from './format';

/** Lo que entrega el script de Gmail por cada correo. */
export interface CorreoCrudo {
  id: string;
  /** Fecha del correo (ISO con hora). */
  fecha: string;
  de: string;
  asunto: string;
  texto: string;
}

export interface Lectura {
  tipo: TipoDetectado;
  monto: number;
  comercio: string;
  fecha: string; // YYYY-MM-DD
  hora?: string; // HH:MM
  banco?: string;
  ultimos4?: string;
}

/** Remitentes conocidos → nombre del banco o app. */
const BANCOS: [RegExp, string][] = [
  [/bancoestado/i, 'Banco Estado'],
  [/\bbci\b|bci\.cl/i, 'BCI'],
  [/santander/i, 'Santander'],
  [/bancochile|bancoedwards|banchile/i, 'Banco de Chile'],
  [/itau/i, 'Itaú'],
  [/scotiabank/i, 'Scotiabank'],
  [/bancofalabella|falabella/i, 'Banco Falabella'],
  [/bancoripley|ripley/i, 'Banco Ripley'],
  [/\bbice\b|bice\.cl/i, 'BICE'],
  [/security/i, 'Security'],
  [/coopeuch/i, 'Coopeuch'],
  [/mach/i, 'MACH'],
  [/tenpo/i, 'Tenpo'],
  [/mercadopago|mercado pago/i, 'Mercado Pago'],
  [/tapp/i, 'Tapp'],
];

export const bancoDe = (remitente: string): string | undefined => BANCOS.find(([re]) => re.test(remitente))?.[1];

const ENTIDADES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', deg: '°', ordm: 'º', ordf: 'ª',
};

/** Texto plano y ordenado a partir del cuerpo del correo (sirve también si viene en HTML). */
export function limpiarTexto(t: string): string {
  return t
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTIDADES[e] ?? m)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n[\s]*/g, '\n')
    .trim();
}

/** Minúsculas y sin tildes, para buscar palabras clave. */
const plano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const NO_ES_MOVIMIENTO = /estado de cuenta|clave dinamica|codigo de (verificacion|seguridad)|inicio de sesion|nuevo dispositivo|token|promocion|oferta|cyber|beneficio exclusivo|encuesta|actualiza tus datos|cartola/;

function tipoDe(t: string): TipoDetectado | null {
  if (/pago (de|a) tu tarjeta|pagaste tu tarjeta|pago de tarjeta de credito/.test(t)) return 'otro';
  if (/recibiste|te (ha )?transferi|has recibido|transferencia recibida|abono (en|a) tu cuenta|deposito recibido|te enviaron|te pago/.test(t)) return 'recibido';
  if (/transferencia (de fondos )?(realizada|enviada|exitosa|a terceros)|transferiste|enviaste|comprobante de transferencia/.test(t)) return 'transferencia';
  if (/compra|pagaste|cargo|consumo|pago (en|a|con)|giro|avance|suscripcion|debito automatico|pac\b/.test(t)) return 'compra';
  return null;
}

const MONTO = /(US\$|USD|\$|CLP)\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(?!\d)/g;
const CLAVES_MONTO = /(compra|pag|cargo|monto|total|transfer|abono|recib|por|valor|importe|consumo|giro)/;

/** El monto más probable: en pesos, cerca de una palabra clave; si no, el primero. */
function montoDe(texto: string): number | null {
  const candidatos: { v: number; puntos: number; i: number }[] = [];
  for (const m of texto.matchAll(MONTO)) {
    if (m[1] === 'US$' || m[1] === 'USD') continue;
    const v = Number(m[2].replace(/\./g, ''));
    if (!v) continue;
    const antes = plano(texto.slice(Math.max(0, (m.index ?? 0) - 40), m.index));
    candidatos.push({ v, puntos: CLAVES_MONTO.test(antes) ? 1 : 0, i: m.index ?? 0 });
  }
  if (!candidatos.length) return null;
  candidatos.sort((a, b) => b.puntos - a.puntos || a.i - b.i);
  return candidatos[0].v;
}

const PALABRAS_CORTE = '(?:el|la|los|con|por|a las|desde|fecha|hora|rut|monto|cuenta|de su|de tu|n[°º]|y)';
const NOMBRE = "([A-Za-z0-9ÁÉÍÓÚÑáéíóúñü*&'./\\- ]{2,60}?)";
// El punto corta solo si termina la frase ("NETFLIX.COM" sigue siendo un nombre).
// Abreviaturas que no terminan el nombre ("Copec Av. Grecia", "Farmacia Sta. Lucía").
const ABREV = '(?<!\\b(?:Av|Avda|Sta|Sto|Dr|Pje|Sr|Sra|Cía|Cia|Ltda|Spa|Gral|Pdte|Of|Loc|N))';
const FIN = `(?=\\s+${PALABRAS_CORTE}\\b|\\s*[,;:\\n(]|${ABREV}\\.(?:\\s|$)|\\s*$)`;
const NO_COMERCIO = /^(tu|su|la|el|cuotas?|linea|cuenta|tarjeta|pesos|chile|tu cuenta|la cuenta|el comercio|linea de credito)$/i;

function limpiarComercio(s: string): string {
  const x = s.replace(/\s+/g, ' ').replace(/^[\s:*-]+|[\s:*.-]+$/g, '').trim();
  return x.length > 40 ? x.slice(0, 40).trim() : x;
}

function comercioDe(texto: string, tipo: TipoDetectado): string | undefined {
  const rotulo = /(?:comercio|establecimiento|destinatario|nombre del destinatario|beneficiario|origen|remitente)\s*:\s*([^\n]{2,60})/i.exec(texto);
  if (rotulo) return limpiarComercio(rotulo[1]);
  const patrones =
    tipo === 'recibido'
      ? [new RegExp(`\\bde\\s+${NOMBRE}${FIN}`, 'g')]
      : tipo === 'transferencia'
        ? [new RegExp(`\\b(?:a|para)\\s+${NOMBRE}${FIN}`, 'g')]
        : [new RegExp(`\\ben\\s+${NOMBRE}${FIN}`, 'g'), new RegExp(`\\b(?:a|para)\\s+${NOMBRE}${FIN}`, 'g')];
  for (const re of patrones) {
    for (const m of texto.matchAll(re)) {
      const c = limpiarComercio(m[1]);
      // Un comercio suele empezar con mayúscula o número y no es una palabra genérica.
      if (c.length >= 2 && /^[A-ZÁÉÍÓÚÑ0-9]/.test(c) && !NO_COMERCIO.test(c) && !/^\$|^\d+$/.test(c)) return c;
    }
  }
  return undefined;
}

function fechaDe(texto: string, correo: string): { fecha: string; hora?: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const respaldo = todayISO(new Date(correo));
  const f = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/.exec(texto);
  let fecha = respaldo;
  if (f) {
    const [d, m] = [Number(f[1]), Number(f[2])];
    const y = f[3].length === 2 ? 2000 + Number(f[3]) : Number(f[3]);
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    // Se acepta solo si es una fecha válida y cercana al correo (evita confundirla con vencimientos u otras fechas).
    const ok = m >= 1 && m <= 12 && d >= 1 && d <= 31 && Math.abs(daysBetween(iso, respaldo)) <= 7;
    if (ok) fecha = iso;
  }
  const h = /\b([01]?\d|2[0-3]):([0-5]\d)(?::\d{2})?\s*(?:hrs?\.?|horas)?/.exec(texto);
  return { fecha, hora: h ? `${pad(Number(h[1]))}:${h[2]}` : undefined };
}

/** Lee un correo. Devuelve null si no parece un movimiento de plata. */
export function interpretarCorreo(c: CorreoCrudo): Lectura | null {
  const texto = limpiarTexto(`${c.asunto}\n${c.texto}`);
  const t = plano(texto);
  if (NO_ES_MOVIMIENTO.test(t)) return null;
  const tipo = tipoDe(t);
  if (!tipo) return null;
  const monto = montoDe(texto);
  if (!monto) return null;
  const banco = bancoDe(c.de);
  const ultimos4 = /(?:terminad[ao]s? en|termina en|finalizada en|\*{2,}\s?|x{3,}|n[°º]\s*\*+)\s*(\d{4})\b/i.exec(texto)?.[1];
  return {
    tipo,
    monto,
    comercio: comercioDe(texto, tipo) ?? (limpiarComercio(c.asunto) || banco || 'Movimiento'),
    ...fechaDe(texto, c.fecha),
    banco,
    ultimos4,
  };
}

const normal = (s: string) => plano(s).replace(/[^a-z0-9]/g, '');

/**
 * Medio de pago de un movimiento: primero por los últimos 4 dígitos;
 * si no, el único medio activo cuyo nombre menciona al banco.
 */
export function reconocerMedio(l: Pick<Lectura, 'ultimos4' | 'banco'>, medios: Medio[]): string | undefined {
  const activos = medios.filter((m) => !m.archivado);
  if (l.ultimos4) {
    const m = activos.find((x) => x.ultimos4 === l.ultimos4);
    if (m) return m.id;
  }
  if (l.banco) {
    const b = normal(l.banco);
    const del = activos.filter((m) => m.tipo !== 'efectivo' && normal(m.nombre).includes(b));
    if (del.length === 1) return del[0].id;
  }
  return undefined;
}

/**
 * Gasto ya anotado que probablemente es el mismo: mismo monto, hasta 1 día de diferencia y,
 * si ambos tienen medio de pago, el mismo medio.
 */
export function buscarParecido(
  l: Pick<Lectura, 'monto' | 'fecha'> & { medioId?: string },
  gastos: Gasto[],
  yaUsados: Set<string> = new Set(),
): string | undefined {
  return gastos.find(
    (g) =>
      g.pagador === 'yo' &&
      g.total === l.monto &&
      !yaUsados.has(g.id) &&
      Math.abs(daysBetween(g.fecha, l.fecha)) <= 1 &&
      (!l.medioId || !g.medioId || g.medioId === l.medioId),
  )?.id;
}

/** Palabras clave → id de categoría por defecto. */
const REGLAS: [RegExp, string][] = [
  [/uber|cabify|didi|copec|shell|petrobras|aramco|enex|metro|bip|red movilidad|turbus|pullman|latam|sky airline|jetsmart|autopista|estacionamiento|parking/, 'cat-transporte'],
  [/spotify|netflix|disney|hbo|max\b|prime video|amazon prime|youtube|apple\.com|icloud|google|chatgpt|openai|crunchyroll|paramount|star\+/, 'cat-suscripciones'],
  [/farmacia|cruz verde|salcobrand|ahumada|clinica|dental|laboratorio|isapre|fonasa|medic/, 'cat-salud'],
  [/lider|jumbo|unimarc|tottus|santa isabel|acuenta|ok market|oxxo|starbucks|rappi|pedidosya|pedidos ya|uber eats|mcdonald|burger|kfc|domino|papa john|sushi|panaderia|cafe|restaurant|botiller|minimarket|supermercado/, 'cat-comida'],
  [/cine|cinemark|cineplanet|hoyts|bar\b|pub|teatro|ticketmaster|puntoticket|passline|discoteca/, 'cat-salidas'],
  [/enel|cge|aguas andinas|esval|essbio|metrogas|abastible|lipigas|gasco|vtr|movistar|entel|claro|wom|mundo|gtd|arriendo|gastos comunes|sodimac|easy|homecenter|ikea/, 'cat-casa'],
];

/**
 * Categoría sugerida para un comercio: la del último gasto con la misma descripción;
 * si no hay, por palabras clave. Solo devuelve categorías que existen y no están archivadas.
 */
export function sugerirCategoria(comercio: string, gastos: Gasto[], categorias: Categoria[]): string | undefined {
  const activas = new Set(categorias.filter((c) => !c.archivada).map((c) => c.id));
  // "Jumbo Bilbao" calza con un gasto "Jumbo" (y al revés): uno empieza con el otro.
  const a = normal(comercio);
  const calza = (desc: string) => {
    const b = normal(desc);
    return a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a));
  };
  const previo = gastos.filter((g) => g.categoriaId && activas.has(g.categoriaId) && calza(g.descripcion)).sort((x, y) => y.fecha.localeCompare(x.fecha))[0];
  if (previo) return previo.categoriaId;
  const p = plano(comercio);
  return REGLAS.find(([re, id]) => re.test(p) && activas.has(id))?.[1];
}

/** Persona cuyo nombre aparece en el texto (nombre completo, o nombre y apellido). */
export function reconocerPersona(texto: string, personas: Persona[]): string | undefined {
  const t = ` ${plano(texto).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
  // Puntaje = cuántas palabras del nombre aparecen; gana el más específico ("Diego Fuentes" antes que "Diego").
  const puntajes = personas
    .filter((p) => !p.archivada)
    .map((p) => {
      const partes = plano(p.nombre).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
      const completo = partes.length > 0 && t.includes(` ${partes.join(' ')} `);
      const enTexto = partes.filter((x) => t.includes(` ${x} `)).length;
      const ok = completo || (partes.length >= 2 && t.includes(` ${partes[0]} `) && enTexto >= 2);
      return { id: p.id, puntos: ok ? enTexto : 0 };
    })
    .filter((x) => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos);
  if (!puntajes.length || (puntajes[1] && puntajes[1].puntos === puntajes[0].puntos)) return undefined;
  return puntajes[0].id;
}
