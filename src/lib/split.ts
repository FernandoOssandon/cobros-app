// Reparto de un cargo entre personas (reglas del handoff, sección "Reparto").

export type SplitMode = 'equal' | 'exact' | 'shares';

export interface SplitInput {
  amount: number;
  /** Ids de las personas seleccionadas, en el orden en que se muestran. */
  ids: string[];
  /** ¿Estoy incluido en el gasto? */
  me: boolean;
  mode: SplitMode;
  /** Montos ingresados a mano (modo Exactos). */
  exact: Record<string, number>;
  /** Partes por persona, de 1 a 9 (modo Partes). */
  parts: Record<string, number>;
  /** Mis partes (modo Partes). */
  myParts: number;
}

export interface SplitRow {
  id: string;
  v: number;
  k: number;
}

export interface SplitResult {
  amount: number;
  rows: SplitRow[];
  mine: number;
  /** Solo modo Exactos: monto − Σ asignado. */
  remaining: number;
  ok: boolean;
}

export function computeSplit(i: SplitInput): SplitResult {
  const { amount, ids, me, mode, exact, parts, myParts } = i;
  let rows: SplitRow[] = [];
  let mine = 0;
  let remaining = 0;
  let ok = amount > 0 && ids.length > 0;

  if (mode === 'equal') {
    const n = ids.length + (me ? 1 : 0);
    const base = n ? Math.floor(amount / n) : 0;
    const rem = amount - base * n;
    rows = ids.map((id, idx) => ({ id, k: 1, v: base + (!me && idx < rem ? 1 : 0) }));
    mine = me ? base + rem : 0;
  } else if (mode === 'exact') {
    rows = ids.map((id) => ({ id, k: 1, v: exact[id] || 0 }));
    remaining = amount - rows.reduce((s, r) => s + r.v, 0);
    mine = me ? Math.max(remaining, 0) : 0;
    ok = ok && (me ? remaining >= 0 : remaining === 0);
  } else {
    const k = (id: string) => parts[id] || 1;
    const total = ids.reduce((s, id) => s + k(id), 0) + (me ? myParts : 0);
    rows = ids.map((id) => ({ id, k: k(id), v: total ? Math.round((amount * k(id)) / total) : 0 }));
    mine = amount - rows.reduce((s, r) => s + r.v, 0);
    if (!me) {
      if (rows.length) rows[0].v += mine;
      mine = 0;
    }
    // Con montos muy chicos el redondeo podría dejar mi parte en negativo.
    ok = ok && mine >= 0 && rows.every((r) => r.v >= 0);
  }
  return { amount, rows, mine, remaining, ok };
}
