// Vectores de prueba para el núcleo en Kotlin (nucleo/): las mismas entradas, con los resultados que da hoy la
// versión TypeScript. Las pruebas de Kotlin los recorren y exigen el mismo resultado, así las dos versiones no se separan.
// - En tu computador (`npm test`), si la lógica cambió, el archivo se reescribe solo.
// - En la integración continua (CI) solo se compara: si no coincide, falla y pide correr `npm test` localmente.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import type { Frecuencia, Gasto, Medio, Movimiento, Presupuesto } from '../db';
import { cargado, estadosCargos, estadosDeudas, pctPagado, saldo } from '../lib/balance';
import { fechaMasMeses, imputar, parteCuota, type GastoImputado } from '../lib/cuotas';
import { daysBetween, sumarMes } from '../lib/format';
import { clavePeriodo, esPeriodoActual, gastosDelPeriodo, moverPeriodo, periodoEn, resumenTarjeta, tienePeriodo, type Periodo } from '../lib/periodos';
import { avances, categoriasDe, lunesDe, rangoPresupuesto } from '../lib/presupuestos';
import { montoMensual, ocurrencia, ocurrenciasEntre, proxima, sumarDias } from '../lib/recurrence';
import { periodoFacturacion, resumenMes, type Resumen } from '../lib/resumen';
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


// ---------- Fechas y recurrencias (JSON) ----------
// Generador pseudoaleatorio con semilla: los vectores salen siempre iguales.
function azar(semilla: number) {
  let a = semilla >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const entero = (min: number, max: number) => min + Math.floor(f() * (max - min + 1));
  const uno = <T,>(xs: T[]): T => xs[Math.floor(f() * xs.length)];
  return { f, entero, uno };
}
const dos = (n: number) => String(n).padStart(2, '0');
const FECHAS = ['2024-01-31', '2024-02-28', '2024-02-29', '2024-03-01', '2024-12-31', '2025-01-01', '2025-02-28', '2025-03-30', '2025-03-31', '2025-08-31', '2025-10-05', '2026-04-05', '2026-09-06', '2026-10-31', '2026-11-25', '2026-12-31', '2028-02-29', '2000-02-29', '1999-12-31'];

function vectoresFechas() {
  const r = azar(7);
  const fechas = [...FECHAS, ...Array.from({ length: 60 }, () => `${r.entero(1995, 2035)}-${dos(r.entero(1, 12))}-${dos(r.entero(1, 28))}`)];
  const ns = [-400, -60, -31, -1, 0, 1, 2, 7, 28, 29, 30, 31, 59, 365, 366, 1000];
  const frecuencias: Frecuencia[] = [
    { unidad: 'dia', cada: 1 }, { unidad: 'dia', cada: 3 }, { unidad: 'semana', cada: 1 }, { unidad: 'semana', cada: 2 },
    { unidad: 'mes', cada: 1 }, { unidad: 'mes', cada: 1, dia: 31 }, { unidad: 'mes', cada: 1, dia: 30 }, { unidad: 'mes', cada: 2, dia: 29 },
    { unidad: 'mes', cada: 3 }, { unidad: 'mes', cada: 0 }, { unidad: 'anio', cada: 1 }, { unidad: 'anio', cada: 4 },
  ];
  const inicios = ['2024-01-31', '2024-02-29', '2025-01-15', '2025-08-31', '2026-10-25', '2026-03-30'];
  const ocurrencias = [];
  const proximas = [];
  for (const f of frecuencias)
    for (const inicio of inicios) {
      for (const [despues, hasta, fin] of [[undefined, '2027-03-31', undefined], ['2026-11-06', '2027-02-10', undefined], ['', '2026-12-31', '2026-06-30'], ['2026-01-01', '2026-03-01', '']] as (string | undefined)[][])
        ocurrencias.push({ f, inicio, despues: despues ?? null, hasta, fin: fin ?? null, r: ocurrenciasEntre(f, inicio, despues, hasta!, fin, 50) });
      for (const [despues, fin] of [[undefined, undefined], ['2026-11-06', undefined], ['2026-11-06', '2026-10-01'], ['', '2030-01-01']] as (string | undefined)[][])
        proximas.push({ f, inicio, despues: despues ?? null, fin: fin ?? null, r: proxima(f, inicio, despues, fin) ?? null });
    }
  return {
    sumarDias: fechas.flatMap((x) => ns.map((n) => [x, n, sumarDias(x, n)])),
    diasEntre: fechas.slice(0, 40).flatMap((a, i) => fechas.slice(i, i + 6).map((b) => [a, b, daysBetween(a, b)])),
    sumarMes: fechas.flatMap((x) => [-25, -13, -12, -1, 0, 1, 11, 12, 13, 100].map((n) => [x.slice(0, 7), n, sumarMes(x.slice(0, 7), n)])),
    masMeses: fechas.flatMap((x) => [0, 1, 2, 5, 11, 12, 13, 47].map((n) => [x, n, fechaMasMeses(x, n)])),
    lunes: fechas.map((x) => [x, lunesDe(x)]),
    ocurrencia: frecuencias.flatMap((f) => inicios.flatMap((inicio) => [0, 1, 2, 5, 13].map((n) => ({ f, inicio, n, r: ocurrencia(f, inicio, n) })))),
    ocurrencias,
    proximas,
    montoMensual: frecuencias.flatMap((f) => [0, 1, 999, 15880, 34900, 2132204].map((m) => ({ f, m, r: montoMensual(m, f) }))),
    periodoFacturacion: fechas.slice(0, 30).flatMap((x) => [1, 5, 14, 25, 28, 29, 30, 31].map((dia) => [x.slice(0, 7), dia, periodoFacturacion(x.slice(0, 7), dia)])),
    parteCuota: [1, 2, 3, 7, 100, 99999, 300000, 1000001].flatMap((m) => [2, 3, 6, 12, 48].flatMap((n) => [0, 1, n - 1].map((i) => [m, n, i, parteCuota(m, n, i)]))),
  };
}

// ---------- Datos simulados: cuotas, saldos, resúmenes, períodos y presupuestos (JSON) ----------
const MEDIOS: Medio[] = [
  { id: 'visa', nombre: 'Visa', tipo: 'credito', color: '#000', diaFacturacion: 25, archivado: false, orden: 2, creado: '' },
  { id: 'cmr', nombre: 'CMR', tipo: 'credito', color: '#000', diaFacturacion: 14, archivado: false, orden: 1, creado: '' },
  { id: 'fin', nombre: 'Fin de mes', tipo: 'credito', color: '#000', diaFacturacion: 31, archivado: false, orden: 4, creado: '' },
  { id: 'vieja', nombre: 'Archivada', tipo: 'credito', color: '#000', diaFacturacion: 10, archivado: true, orden: 5, creado: '' },
  { id: 'deb', nombre: 'Débito', tipo: 'debito', color: '#000', archivado: false, orden: 3, creado: '' },
];
const PERSONAS = ['p1', 'p2', 'p3', 'p4'];
const CATS = ['c1', 'c2', 'c3', 'c4'];

function datosSimulados(semilla: number) {
  const r = azar(semilla);
  const fecha = () => {
    const y = r.uno([2025, 2026, 2026, 2026]);
    const m = r.entero(1, 12);
    return `${y}-${dos(m)}-${dos(r.entero(1, new Date(y, m, 0).getDate()))}`;
  };
  const gastos: Gasto[] = [];
  const movimientos: Movimiento[] = [];
  const nG = r.entero(15, 40);
  for (let i = 0; i < nG; i++) {
    const total = r.entero(1, 30000) * 10 + r.entero(0, 9);
    const yo = r.f() < 0.8;
    const pagador = yo ? 'yo' : r.uno(PERSONAS);
    const medioId = yo ? r.uno<string | undefined>(['visa', 'cmr', 'fin', 'vieja', 'deb', undefined]) : undefined;
    const participantes = PERSONAS.filter(() => r.f() < 0.3);
    const miParte = participantes.length ? Math.floor(total / (participantes.length + 1)) : yo ? total : Math.floor(total / 2);
    const montos = participantes.length ? Object.fromEntries(participantes.map((p) => [p, Math.floor((total - miParte) / participantes.length)])) : undefined;
    const g = {
      id: `g${semilla}-${i}`, descripcion: `Gasto ${i}`, total, fecha: fecha(), pagador, medioId, categoriaId: r.uno<string | undefined>([...CATS, undefined]),
      modo: 'equal', yoIncluido: true, miParte, misPartes: 1, participantes, exactos: {}, partes: {}, montos,
      cuotas: medioId && ['visa', 'cmr', 'fin'].includes(medioId) && r.f() < 0.35 ? r.uno([2, 3, 6, 12]) : undefined,
      recurrenteId: r.f() < 0.1 ? 'rec' : undefined,
      creado: `2026-01-01T${dos(r.entero(0, 23))}:${dos(r.entero(0, 59))}:00Z`,
    } as unknown as Gasto;
    gastos.push(g);
    for (const p of participantes) movimientos.push({ id: `m${semilla}-${movimientos.length}`, personaId: p, tipo: 'cargo', detalle: g.descripcion, monto: montos![p], fecha: g.fecha, gastoId: g.id, creado: g.creado });
    if (!yo) movimientos.push({ id: `m${semilla}-${movimientos.length}`, personaId: pagador, tipo: 'deuda', detalle: g.descripcion, monto: miParte, fecha: g.fecha, gastoId: g.id, creado: g.creado });
  }
  for (let i = 0, n = r.entero(3, 15); i < n; i++)
    movimientos.push({
      id: `m${semilla}-${movimientos.length}`, personaId: r.uno(PERSONAS), tipo: r.uno(['pago', 'pago', 'abono']), detalle: 'Transferencia',
      monto: r.entero(1, 5000) * 10, fecha: fecha(), creado: `2026-02-0${r.entero(1, 9)}T10:00:00Z`,
    });
  // Algunos empates de fecha y registro, para probar el orden.
  if (movimientos.length > 3) movimientos.push({ ...movimientos[1], id: `m${semilla}-dup` });
  const presupuestos = [
    { id: 'b1', nombre: '', periodo: 'semana', monto: 80000, archivado: false, orden: 2, creado: '' },
    { id: 'b2', nombre: '', periodo: 'mes', monto: 150000, categoriaIds: ['c1', 'c2'], archivado: false, orden: 1, creado: '' },
    { id: 'b3', nombre: 'Casa', periodo: 'mes', monto: 0, categoriaId: 'c3', archivado: false, orden: 3, creado: '' },
    { id: 'b4', nombre: '', periodo: 'semana', monto: 20000, categoriaIds: [], categoriaId: 'c4', archivado: false, orden: 0, creado: '' },
    { id: 'b5', nombre: '', periodo: 'mes', monto: 10, archivado: true, orden: 9, creado: '' },
  ] as unknown as Presupuesto[];
  return { gastos, movimientos, presupuestos };
}

const micro = (x: number) => (Number.isFinite(x) ? Math.round(x * 1e6) : 'inf');
const jsonResumen = (r: Resumen) => ({
  mes: r.mes, gastoReal: r.gastoReal, salio: r.salio, adelantado: r.adelantado, teDeben: r.teDeben, debes: r.debes,
  porMedio: r.porMedio.map((m) => [m.medioId, m.total, m.mio, m.otrosCobrado, m.otrosPendiente]),
  porCategoria: r.porCategoria.map((c) => [c.categoriaId, c.monto]),
});
const jsonPeriodo = (p: Periodo) => [p.tipo, p.desde, p.hasta, p.tipo === 'mes' ? p.mes : null, p.tipo === 'tarjeta' ? p.medioId : null, p.tipo === 'tarjeta' ? p.cierreMes : null, clavePeriodo(p)];

function vectorDatos(semilla: number) {
  const { gastos, movimientos, presupuestos } = datosSimulados(semilla);
  const imp: GastoImputado[] = imputar(gastos);
  const personas = Object.fromEntries(
    PERSONAS.map((p) => {
      const movs = movimientos.filter((m) => m.personaId === p);
      const est = (m: Map<string, { estado: string; pendiente: number }>) => [...m.entries()].map(([id, e]) => [id, e.estado, e.pendiente]);
      return [p, { saldo: saldo(movs), cargado: cargado(movs), pct: pctPagado(movs), cargos: est(estadosCargos(movs)), deudas: est(estadosDeudas(movs)) }];
    }),
  );
  const meses = ['2025-12', '2026-01', '2026-02', '2026-06', '2026-11'];
  const hoys = ['2026-01-04', '2026-02-28', '2026-06-15', '2026-11-25', '2026-11-30'];
  const conPeriodo = MEDIOS.filter(tienePeriodo);
  return {
    gastos: gastos.map((g) => ({ id: g.id, total: g.total, fecha: g.fecha, pagador: g.pagador, miParte: g.miParte, medioId: g.medioId ?? null, categoriaId: g.categoriaId ?? null, montos: g.montos ?? null, cuotas: g.cuotas ?? null, recurrenteId: g.recurrenteId ?? null, creado: g.creado })),
    movimientos: movimientos.map((m) => ({ id: m.id, personaId: m.personaId, tipo: m.tipo, monto: m.monto, fecha: m.fecha, creado: m.creado, gastoId: m.gastoId ?? null })),
    presupuestos: presupuestos.map((p) => ({ id: p.id, periodo: p.periodo, monto: p.monto, categoriaIds: p.categoriaIds ?? null, categoriaId: p.categoriaId ?? null, archivado: p.archivado, orden: p.orden })),
    esperado: {
      imputados: imp.map((g) => [g.id, g.fecha, g.total, g.miParte, g.montos ?? null, g.cuota ? [g.cuota.n, g.cuota.de, g.cuota.origenId, g.cuota.totalCompra, g.cuota.fechaCompra] : null]),
      personas,
      resumenes: meses.map((mes) => jsonResumen(resumenMes(mes, imp, movimientos, MEDIOS))),
      periodos: hoys.flatMap((hoy) => [undefined, ...MEDIOS].map((m) => {
        const p = periodoEn(hoy, m);
        return [hoy, m?.id ?? null, jsonPeriodo(p), jsonPeriodo(moverPeriodo(p, -1, MEDIOS)), jsonPeriodo(moverPeriodo(p, 1, MEDIOS)), esPeriodoActual(p, hoy), gastosDelPeriodo(p, imp).map((g) => g.id)];
      })),
      tarjetas: hoys.flatMap((hoy) => conPeriodo.flatMap((m) => [0, -1, 1].map((n) => {
        const p = moverPeriodo(periodoEn(hoy, m), n, MEDIOS) as Extract<Periodo, { tipo: 'tarjeta' }>;
        const t = resumenTarjeta(p, imp, movimientos, hoy);
        return [hoy, m.id, n, [t.facturado, t.tuyo, t.deOtros, t.recuperado, t.pendiente, t.nGastos, t.diasAlCierre, t.cerrado]];
      }))),
      categorias: presupuestos.map((p) => [p.id, categoriasDe(p)]),
      avances: hoys.map((hoy) => [hoy, avances(presupuestos, imp, hoy).map((a) => [a.presupuesto.id, a.desde, a.hasta, a.gastado, a.restante, micro(a.pct), a.diasTotales, a.diasTranscurridos, a.diasRestantes, a.porDia, a.proyeccion, a.excesoProyectado, a.estado])]),
      rangos: hoys.flatMap((hoy) => (['semana', 'mes'] as const).map((per) => [hoy, per, rangoPresupuesto(per, hoy)])),
    },
  };
}

/** Un documento JSON como lista de trozos (cada constante de texto de la JVM admite hasta 64 KB). */
function constanteJson(nombre: string, docs: unknown[]): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$');
  const trozos = (s: string) => s.match(/[\s\S]{1,20000}/g) ?? [''];
  return `internal val ${nombre}: List<String> = listOf(\n${docs
    .map((d) => `    listOf(\n${trozos(JSON.stringify(d)).map((t) => `        "${esc(t)}",`).join('\n')}\n    ).joinToString(""),`)
    .join('\n')}\n)\n`;
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
    constanteJson('VECTORES_FECHAS', [vectoresFechas()]),
    constanteJson('VECTORES_DATOS', [11, 23, 37, 41, 58, 64, 79, 83].map(vectorDatos)),
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
