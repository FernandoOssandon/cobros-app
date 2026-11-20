// Vectores de prueba para el núcleo en Kotlin (nucleo/): las mismas entradas, con los resultados que da hoy la
// versión TypeScript. Las pruebas de Kotlin los recorren y exigen el mismo resultado, así las dos versiones no se separan.
// - En tu computador (`npm test`), si la lógica cambió, el archivo se reescribe solo.
// - En la integración continua (CI) solo se compara: si no coincide, falla y pide correr `npm test` localmente.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { dvRut, formatearRut, normalizarRut, validarRut } from '../lib/rut';
import { computeSplit, type SplitInput, type SplitMode } from '../lib/split';

const ARCHIVO = path.join(__dirname, '../../nucleo/src/commonTest/kotlin/cl/amano/nucleo/Vectores.kt');

// ---------- RUT ----------
// Dígito verificador: cuerpo␟dv. Validación y formato: entrada␟válido (1/0)␟normalizado␟formateado.
// (␟ = U+241F, un separador que no aparece en los datos).
const S = '␟';
const cuerposRut = [1, 7, 10, 11, 1000005, 5126663, 9999999, 10000013, 11111111, 12345678, 15333444, 22222222, 66666666, 76543210, 77111222, 99999999];
const entradasRut = [
  ...cuerposRut.flatMap((n) => [`${n}-${dvRut(n)}`, `${n}${dvRut(n)}`.toLowerCase(), `${n.toLocaleString('es-CL')}-${dvRut(n)}`]),
  '12.345.678-5', '12345678-4', '1-9', '0-0', '-', '', 'k', 'abc', ' 12.345.678-5 ', '012.345.678-5', '76.543.210-K', '1.000.005-k',
];
const lineasDv = () => [...cuerposRut, 0, 2, 3, 4, 5, 6, 8, 9, 123, 4321, 30686957].map((n) => [n, dvRut(n)].join(S));
const lineasRut = () => entradasRut.map((e) => [e, validarRut(e) ? '1' : '0', normalizarRut(e) ?? '', formatearRut(e)].join(S));

// ---------- Repartos ----------
// Entrada: monto␟ids (a,b)␟yo (1/0)␟modo␟exactos (a=1,b=2)␟partes (a=1)␟misPartes
// Resultado: mio␟restante␟ok (1/0)␟filas (a:v:k,b:v:k)
const montos = [0, 1, 2, 3, 7, 10, 99, 100, 101, 1000, 9990, 12345, 15880, 1000001];
const grupos = [[], ['a'], ['a', 'b'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd', 'e', 'f', 'g']];
function casosReparto(): SplitInput[] {
  const out: SplitInput[] = [];
  for (const amount of montos)
    for (const ids of grupos)
      for (const me of [true, false])
        for (const mode of ['equal', 'exact', 'shares'] as SplitMode[]) {
          const exact: Record<string, number> = {};
          const parts: Record<string, number> = {};
          ids.forEach((id, i) => {
            exact[id] = Math.floor(amount / (ids.length + (me ? 1 : 0) || 1)) + (i === 0 ? amount % 3 : 0);
            parts[id] = ((i * 2) % 9) + 1;
          });
          out.push({ amount, ids, me, mode, exact, parts, myParts: (amount % 4) + 1 });
          // Exactos que suman justo el total (sin mí) y partes sin definir (valen 1).
          if (mode === 'exact' && ids.length) {
            const justo: Record<string, number> = {};
            ids.forEach((id, i) => (justo[id] = i === 0 ? amount - Math.floor(amount / ids.length) * (ids.length - 1) : Math.floor(amount / ids.length)));
            out.push({ amount, ids, me, mode, exact: justo, parts: {}, myParts: 1 });
          }
          if (mode === 'shares') out.push({ amount, ids, me, mode, exact: {}, parts: {}, myParts: 0 });
        }
  return out;
}
const mapa = (m: Record<string, number>) => Object.entries(m).map(([k, v]) => `${k}=${v}`).join(',');
function lineasReparto(): string[] {
  return casosReparto().map((c) => {
    const r = computeSplit(c);
    const entrada = [c.amount, c.ids.join(','), c.me ? 1 : 0, c.mode, mapa(c.exact), mapa(c.parts), c.myParts].join(S);
    const salida = [r.mine, r.remaining, r.ok ? 1 : 0, r.rows.map((f) => `${f.id}:${f.v}:${f.k}`).join(',')].join(S);
    return `${entrada}${S}${salida}`;
  });
}

// ---------- Archivo Kotlin ----------
/** Una constante de texto por bloque (la JVM limita cada constante a 64 KB). */
function constante(nombre: string, lineas: string[]): string {
  const bloques: string[][] = [];
  for (let i = 0; i < lineas.length; i += 150) bloques.push(lineas.slice(i, i + 150));
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$');
  return `internal val ${nombre}: List<String> = listOf(\n${bloques.map((b) => `    ${b.map((l) => `"${esc(l)}"`).join(' +\n        "\\n" + ')},`).join('\n')}\n).flatMap { it.split('\\n') }\n`;
}

function generar(): string {
  return [
    '// ARCHIVO GENERADO por src/tests/vectoresNucleo.test.ts a partir de la versión TypeScript. No editar a mano.',
    '// Separador de campos: U+241F.',
    'package cl.amano.nucleo',
    '',
    constante('VECTORES_DV', lineasDv()),
    constante('VECTORES_RUT', lineasRut()),
    constante('VECTORES_REPARTO', lineasReparto()),
  ].join('\n');
}

it('los vectores del núcleo Kotlin están al día con la versión TypeScript', () => {
  const nuevo = generar();
  let actual = '';
  try {
    actual = readFileSync(ARCHIVO, 'utf8');
  } catch {
    // Todavía no existe.
  }
  if (process.env.CI) {
    expect(actual, 'Los vectores del núcleo no están al día: corre `npm test` en tu computador y sube el archivo').toBe(nuevo);
  } else if (actual !== nuevo) {
    writeFileSync(ARCHIVO, nuevo);
  }
  expect(nuevo.length).toBeGreaterThan(1000);
});
