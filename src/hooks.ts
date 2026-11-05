// Consultas en vivo a la base de datos (se actualizan solas cuando cambian los datos).
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import {
  AJUSTES_DEFAULT, db,
  type Ajustes, type Categoria, type Cobro, type Cuenta, type Detectado, type Gasto, type Grupo, type Ingreso, type Medio, type Meta, type PagoTarjeta, type MovAhorro, type Movimiento,
  type Pendiente, type Persona, type Presupuesto, type Recurrente,
} from './db';
import { byDate, cargado, estadosCargos, estadosDeudas, pctPagado, saldo, type EstadoCargo } from './lib/balance';
import { imputar, type GastoImputado } from './lib/cuotas';
import { flujosCuentas } from './lib/flujos';
import { firstName, initials } from './lib/format';
import { avatarColor } from './ui/kit';

export interface PersonView {
  p: Persona;
  first: string;
  ini: string;
  /** Color del avatar (hex). */
  color: string;
  movs: Movimiento[];
  cobros: Cobro[];
  /** Positivo: te debe. Negativo: le debes. */
  saldo: number;
  cargado: number;
  pct: number;
  ultimoCobro?: Cobro;
  /** Fecha del último movimiento (para "a mano · último mov. 21 nov"). */
  ultimoMov?: string;
}

export function buildViews(personas: Persona[], movs: Movimiento[], cobros: Cobro[]): PersonView[] {
  return personas
    .slice()
    .sort((a, b) => a.creado.localeCompare(b.creado))
    .map((p) => {
      const m = movs.filter((x) => x.personaId === p.id).sort(byDate);
      const c = cobros.filter((x) => x.personaId === p.id).sort((a, b) => a.fecha.localeCompare(b.fecha));
      return {
        p,
        first: firstName(p.nombre),
        ini: initials(p.nombre),
        color: avatarColor(p.color),
        movs: m,
        cobros: c,
        saldo: saldo(m),
        cargado: cargado(m),
        pct: pctPagado(m),
        ultimoCobro: c[c.length - 1],
        ultimoMov: m[m.length - 1]?.fecha,
      };
    });
}

export interface Datos {
  personas: PersonView[];
  persona: Map<string, PersonView>;
  gastos: Gasto[];
  /**
   * Los gastos tal como cuentan en el tiempo: una compra en N cuotas aparece como N gastos, uno en cada mes.
   * Úsalo para todo lo que mira un período (gasto del mes, tarjetas, presupuestos, tendencias).
   */
  imputados: GastoImputado[];
  gasto: Map<string, Gasto>;
  movimientos: Movimiento[];
  medios: Medio[];
  medio: Map<string, Medio>;
  categorias: Categoria[];
  categoria: Map<string, Categoria>;
  grupos: Grupo[];
  recurrentes: Recurrente[];
  pendientes: Pendiente[];
  /** Ids de gastos con foto de boleta. */
  conFoto: Set<string>;
  /** Estado de cada cargo y de cada deuda (FIFO por persona), por id de movimiento. */
  estado: Map<string, { estado: EstadoCargo; pendiente: number }>;
  /** Mi plata. */
  cuentas: Cuenta[];
  movAhorro: MovAhorro[];
  /** Detectados en el correo (todos los estados). */
  detectados: Detectado[];
  /** Plata que entra (sueldo e ingresos sueltos), del más nuevo al más antiguo. */
  ingresos: Ingreso[];
  presupuestos: Presupuesto[];
  /** Metas de ahorro activas, en orden. */
  metas: Meta[];
  pagosTarjeta: PagoTarjeta[];
  /**
   * Movimientos de las cuentas de Mi plata más los que vienen de otras partes (gastos con débito,
   * pagos por transferencia, pagos de tarjeta). Úsalo para saldos; `movAhorro` es solo lo guardado.
   */
  movCuentas: MovAhorro[];
}

/** Todos los datos de la app en una sola consulta en vivo (son pocos). `undefined` mientras carga. */
export function useDatos(): Datos | undefined {
  return useLiveQuery(async () => {
    const [ps, gs, ms, cs, md, cat, gr, rec, pen, fotos, cuentas, movAhorro, detectados, ingresos, presupuestos, metas, pagosTarjeta] = await Promise.all([
      db.personas.toArray(), db.gastos.toArray(), db.movimientos.toArray(), db.cobros.toArray(), db.medios.toArray(),
      db.categorias.toArray(), db.grupos.toArray(), db.recurrentes.toArray(), db.pendientes.toArray(), db.fotos.orderBy('gastoId').uniqueKeys(),
      db.cuentas.toArray(), db.movAhorro.toArray(), db.detectados.toArray(), db.ingresos.toArray(), db.presupuestos.toArray(), db.metas.toArray(), db.pagosTarjeta.toArray(),
    ]);
    const personas = buildViews(ps, ms, cs);
    const estado = new Map<string, { estado: EstadoCargo; pendiente: number }>();
    for (const v of personas) {
      for (const [k, e] of estadosCargos(v.movs)) estado.set(k, e);
      for (const [k, e] of estadosDeudas(v.movs)) estado.set(k, e);
    }
    const mediosOrden = md.slice().sort((a, b) => a.orden - b.orden);
    const catsOrden = cat.slice().sort((a, b) => a.orden - b.orden);
    return {
      personas,
      persona: new Map(personas.map((v) => [v.p.id, v])),
      gastos: gs,
      imputados: imputar(gs),
      gasto: new Map(gs.map((g) => [g.id, g])),
      movimientos: ms,
      medios: mediosOrden,
      medio: new Map(md.map((m) => [m.id, m])),
      categorias: catsOrden,
      categoria: new Map(cat.map((c) => [c.id, c])),
      grupos: gr,
      recurrentes: rec,
      pendientes: pen.sort((a, b) => a.fecha.localeCompare(b.fecha)),
      conFoto: new Set(fotos.map(String)),
      estado,
      cuentas: cuentas.sort((a, b) => a.orden - b.orden),
      movAhorro,
      detectados: detectados.sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.hora ?? '').localeCompare(a.hora ?? '')),
      ingresos: ingresos.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado.localeCompare(a.creado)),
      presupuestos: presupuestos.filter((p) => !p.archivado).sort((a, b) => a.orden - b.orden),
      metas: metas.filter((m) => !m.archivada).sort((a, b) => a.orden - b.orden),
      pagosTarjeta: pagosTarjeta.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado.localeCompare(a.creado)),
      movCuentas: flujosCuentas({ cuentas, movAhorro, gastos: gs, medios: md, movimientos: ms, pagosTarjeta, personas: ps }),
    } satisfies Datos;
  });
}

export function useAjustes(): Ajustes & { cargado: boolean } {
  const a = useLiveQuery(() => db.ajustes.get('main').then((x) => x ?? null));
  return { ...AJUSTES_DEFAULT, ...a, cargado: a !== undefined };
}

/** Aplica el tema (claro / oscuro / sistema) al documento. */
export function useThemeSync(tema: Ajustes['tema']) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = tema === 'oscuro' || (tema === 'sistema' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0B110D' : '#F3F0E6'));
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [tema]);
}

export const isDark = () => document.documentElement.dataset.theme === 'dark';

/** Mantiene usePeople para pantallas que solo necesitan personas. */
export function usePeople(): PersonView[] | undefined {
  return useDatos()?.personas;
}
