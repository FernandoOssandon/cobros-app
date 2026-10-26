import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Frecuencia, Recurrente } from '../db';
import { useDatos } from '../hooks';
import { dg, fmt, shortDate, show, todayISO } from '../lib/format';
import { describirFrecuencia, sumarDias } from '../lib/recurrence';
import { computeSplit, type SplitMode } from '../lib/split';
import { useNav } from '../nav';
import { borrarRecurrente, generarRecurrentes, guardarRecurrente } from '../recurrentes';
import { CatChip, ConfirmSheet, DateInputPill, MedioChip, PersonPick, Switch, TaskHeader } from '../ui/kit';
import { useToast } from '../ui/toast';

type Freq = 'mes' | 'semana' | 'anio' | 'custom';
const TIPOS: [Recurrente['tipo'], string, string][] = [
  ['mio', 'Gasto fijo mío', 'Arriendo, luz, gimnasio. Lo pagas tú y es todo tuyo.'],
  ['compartido', 'Compartido', 'Pagas el total y se le cobra su parte a cada uno.'],
  ['cobro', 'Cobro a una persona', 'Alguien te paga una cuota cada cierto tiempo.'],
];
const DIAS_SEM = ['L', 'M', 'M', 'J', 'V', 'S', 'D']; // índice 0 = lunes
const pad = (n: number) => String(n).padStart(2, '0');

/** Primera fecha ≥ hoy que cae el día `dia` del mes (si el mes es corto, el último día). */
function proximoDiaMes(hoy: string, dia: number) {
  const [y, m] = hoy.split('-').map(Number);
  for (let k = 0; k < 2; k++) {
    const base = new Date(y, m - 1 + k, 1);
    const ult = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const f = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(Math.min(dia, ult))}`;
    if (f >= hoy) return f;
  }
  return hoy;
}
/** Primera fecha ≥ hoy que cae en el día de semana `wd` (0 = lunes). */
function proximoDiaSemana(hoy: string, wd: number) {
  for (let k = 0; k < 7; k++) {
    const f = sumarDias(hoy, k);
    const [y, m, d] = f.split('-').map(Number);
    if ((new Date(y, m - 1, d).getDay() + 6) % 7 === wd) return f;
  }
  return hoy;
}

export default function NuevoRecurrente() {
  const { id } = useParams();
  const { back } = useNav();
  const toast = useToast();
  const d = useDatos();
  const hoy = todayISO();
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<Recurrente['tipo']>('mio');
  const [variable, setVariable] = useState(false);
  const [amt, setAmt] = useState('');
  const [freq, setFreq] = useState<Freq>('mes');
  const [dia, setDia] = useState(Number(hoy.slice(8, 10)));
  const [wd, setWd] = useState(0);
  const [n, setN] = useState(2);
  const [unit, setUnit] = useState<'dia' | 'semana' | 'mes'>('semana');
  const [inicio, setInicio] = useState(hoy);
  const [inicioManual, setInicioManual] = useState(false);
  const [finOn, setFinOn] = useState(false);
  const [fin, setFin] = useState(sumarDias(hoy, 365));
  const [medio, setMedio] = useState<string | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [modo, setModo] = useState<SplitMode>('equal');
  const [exact, setExact] = useState<Record<string, string>>({});
  const [parts, setParts] = useState<Record<string, number>>({});
  const [persona, setPersona] = useState<string | null>(null);
  const [borrar, setBorrar] = useState(false);
  const loaded = useRef(false);
  const editing = id ? d?.recurrentes.find((r) => r.id === id) : undefined;

  useEffect(() => {
    if (!d || loaded.current) return;
    if (id && !editing) return;
    loaded.current = true;
    if (!editing) {
      setMedio(d.medios.find((m) => !m.archivado && m.tipo !== 'efectivo')?.id ?? d.medios[0]?.id ?? null);
      setCat(d.categorias.find((c) => c.id === 'cat-casa')?.id ?? null);
      return;
    }
    const f = editing.frecuencia;
    setNombre(editing.nombre);
    setTipo(editing.tipo);
    setVariable(editing.montoTipo === 'variable');
    setAmt(editing.montoTipo === 'fijo' ? String(editing.monto) : '');
    const [y, m, dd] = editing.inicio.split('-').map(Number);
    if (f.unidad === 'mes' && f.cada === 1) [setFreq('mes'), setDia(f.dia ?? dd)];
    else if (f.unidad === 'semana' && f.cada === 1) [setFreq('semana'), setWd((new Date(y, m - 1, dd).getDay() + 6) % 7)];
    else if (f.unidad === 'anio' && f.cada === 1) setFreq('anio');
    else [setFreq('custom'), setN(f.cada), setUnit(f.unidad === 'anio' ? 'mes' : f.unidad)];
    setInicio(editing.inicio);
    setInicioManual(true);
    if (editing.fin) [setFinOn(true), setFin(editing.fin)];
    setMedio(editing.medioId ?? null);
    setCat(editing.categoriaId ?? null);
    if (editing.reparto) {
      setSel(editing.reparto.participantes);
      setModo(editing.reparto.modo);
      setExact(Object.fromEntries(Object.entries(editing.reparto.exactos).map(([k, v]) => [k, String(v)])));
      setParts(editing.reparto.partes);
    }
    setPersona(editing.personaId ?? null);
  }, [d, id, editing]);

  // Si no eligió la fecha a mano, "Empieza" sigue a la frecuencia.
  useEffect(() => {
    if (inicioManual) return;
    if (freq === 'mes') setInicio(proximoDiaMes(hoy, dia));
    else if (freq === 'semana') setInicio(proximoDiaSemana(hoy, wd));
    else setInicio(hoy);
  }, [freq, dia, wd, hoy, inicioManual]);

  if (!d) return <div className="screen" />;
  const personas = d.personas.filter((v) => !v.p.archivada || sel.includes(v.p.id) || persona === v.p.id);
  const frecuencia: Frecuencia =
    freq === 'mes'
      ? { unidad: 'mes', cada: 1, dia }
      : freq === 'semana'
        ? { unidad: 'semana', cada: 1 }
        : freq === 'anio'
          ? { unidad: 'anio', cada: 1 }
          : { unidad: unit, cada: n, ...(unit === 'mes' ? { dia: Number(inicio.slice(8, 10)) } : {}) };
  const amount = dg(amt);
  const ids = personas.filter((v) => sel.includes(v.p.id)).map((v) => v.p.id);
  const rsp = computeSplit({ amount, ids, me: true, mode: modo, exact: Object.fromEntries(Object.entries(exact).map(([k, v]) => [k, dg(v)])), parts, myParts: 1 });

  const guardar = async () => {
    if (!nombre.trim()) return toast('Ponle nombre');
    if (!variable && !amount) return toast('Falta el monto');
    if (tipo === 'compartido' && !ids.length) return toast('Elige con quién lo compartes');
    if (tipo === 'cobro' && !persona) return toast('Elige a quién le cobras');
    if (tipo === 'compartido' && !variable && !rsp.ok) return toast('Revisa cómo se reparte el monto');
    await guardarRecurrente({
      id,
      nombre: nombre.trim(),
      tipo,
      montoTipo: variable ? 'variable' : 'fijo',
      monto: variable ? editing?.monto ?? 0 : amount,
      frecuencia,
      inicio,
      fin: finOn ? fin : undefined,
      medioId: tipo === 'cobro' ? undefined : medio ?? undefined,
      categoriaId: tipo === 'cobro' ? undefined : cat ?? undefined,
      reparto:
        tipo === 'compartido'
          ? { modo, yoIncluido: true, misPartes: 1, participantes: ids, exactos: Object.fromEntries(ids.map((i) => [i, dg(exact[i])])), partes: parts, baseTotal: variable ? undefined : amount }
          : undefined,
      personaId: tipo === 'cobro' ? persona ?? undefined : undefined,
    });
    await generarRecurrentes();
    toast(id ? 'Recurrente actualizado' : variable ? 'Listo. Te pregunto el monto cada vez.' : 'Listo. Se anota solo.');
    back('/recurrentes');
  };

  return (
    <div className="screen">
      <TaskHeader title={id ? 'editar recurrente.' : 'nuevo recurrente.'} onClose={() => back('/recurrentes')} />
      <div className="scroll" style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="¿Cómo se llama?"
          aria-label="Nombre"
          maxLength={40}
          style={{ height: 56, border: 'none', borderBottom: '2px solid var(--ink)', background: 'transparent', fontSize: 30, fontWeight: 800, letterSpacing: -1, padding: '0 4px' }}
        />
        <div>
          <div className="t-label">Tipo</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TIPOS.map(([k, l, ds]) => (
              <button
                key={k}
                aria-pressed={tipo === k}
                onClick={() => setTipo(k)}
                style={{
                  border: `2px solid ${tipo === k ? 'var(--ink)' : 'var(--track)'}`,
                  borderRadius: 22,
                  background: tipo === k ? 'var(--ink)' : 'transparent',
                  color: tipo === k ? 'var(--bg)' : 'var(--ink)',
                  padding: '12px 16px',
                  textAlign: 'left',
                }}
              >
                <span style={{ display: 'block', fontSize: 17, fontWeight: 800 }}>{l}</span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 500, opacity: 0.75, marginTop: 2 }}>{ds}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="t-label">Monto</div>
          <div className="seg">
            <button className="pill grow" style={{ fontSize: 15 }} aria-pressed={!variable} onClick={() => setVariable(false)}>
              Monto fijo
            </button>
            <button className="pill grow" style={{ fontSize: 15 }} aria-pressed={variable} onClick={() => setVariable(true)}>
              Variable
            </button>
          </div>
          {!variable ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, height: 60, marginTop: 10, padding: '0 18px', borderRadius: 30, border: '2px solid var(--ink)', fontSize: 30, fontWeight: 800, letterSpacing: -1 }}>
              <span>$</span>
              <input
                value={show(amt)}
                onChange={(e) => setAmt(e.target.value.replace(/\D/g, '').slice(0, 9))}
                inputMode="numeric"
                placeholder="0"
                aria-label="Monto"
                style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontSize: 30, fontWeight: 800, letterSpacing: -1, padding: 0 }}
              />
            </label>
          ) : (
            <div style={{ marginTop: 10, fontSize: 15, fontWeight: 600, color: 'var(--muted)', padding: '0 4px' }}>Cada vez que toque, te pregunto cuánto llegó.</div>
          )}
        </div>

        <div>
          <div className="t-label">Frecuencia</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(
              [
                ['mes', 'Mensual'],
                ['semana', 'Semanal'],
                ['anio', 'Anual'],
                ['custom', 'Personalizada'],
              ] as [Freq, string][]
            ).map(([k, l]) => (
              <button key={k} className="pill h38" aria-pressed={freq === k} onClick={() => setFreq(k)}>
                {l}
              </button>
            ))}
          </div>
          {freq === 'mes' && (
            <div className="row-between" style={{ marginTop: 12, padding: '0 4px' }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>El día</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn-round" onClick={() => setDia((x) => Math.max(1, x - 1))} aria-label="Día anterior">
                  −
                </button>
                <span style={{ fontSize: 22, fontWeight: 800, minWidth: 28, textAlign: 'center' }}>{dia}</span>
                <button className="btn-round" onClick={() => setDia((x) => Math.min(31, x + 1))} aria-label="Día siguiente">
                  +
                </button>
              </span>
            </div>
          )}
          {freq === 'semana' && (
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              {DIAS_SEM.map((l, i) => (
                <button key={i} className="pill grow" style={{ fontWeight: 800 }} aria-pressed={wd === i} onClick={() => setWd(i)} aria-label={['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][i]}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {freq === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '0 4px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Cada</span>
              <button className="btn-round" style={{ width: 34, height: 34 }} onClick={() => setN((x) => Math.max(1, x - 1))} aria-label="Menos">
                −
              </button>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{n}</span>
              <button className="btn-round" style={{ width: 34, height: 34 }} onClick={() => setN((x) => Math.min(30, x + 1))} aria-label="Más">
                +
              </button>
              {(
                [
                  ['dia', 'días'],
                  ['semana', 'semanas'],
                  ['mes', 'meses'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} className="pill" style={{ height: 34, borderRadius: 17, padding: '0 12px', fontSize: 13 }} aria-pressed={unit === k} onClick={() => setUnit(k)}>
                  {l}
                </button>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10, padding: '0 4px', fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>{describirFrecuencia(frecuencia, inicio)}</div>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="row-between" style={{ padding: '0 4px' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Empieza</span>
            <DateInputPill
              value={inicio}
              label={shortDate(inicio) + (inicio.slice(0, 4) === hoy.slice(0, 4) ? ` ${inicio.slice(0, 4)}` : '')}
              onChange={(v) => {
                setInicio(v);
                setInicioManual(true);
                if (freq === 'mes') setDia(Number(v.slice(8, 10)));
              }}
            />
          </div>
          <div className="row-between" style={{ padding: '0 4px' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Tiene fecha de término</span>
            <Switch label="Tiene fecha de término" on={finOn} onChange={setFinOn} />
          </div>
          {finOn && (
            <div className="row-between" style={{ padding: '0 4px' }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Termina</span>
              <DateInputPill value={fin} label={shortDate(fin) + (fin.slice(0, 4) === hoy.slice(0, 4) ? ` ${fin.slice(0, 4)}` : '')} onChange={setFin} />
            </div>
          )}
        </div>

        {tipo !== 'cobro' && (
          <>
            <div>
              <div className="t-label">Medio de pago</div>
              <div className="hscroll">
                {d.medios
                  .filter((m) => !m.archivado || m.id === medio)
                  .map((m) => (
                    <MedioChip key={m.id} medio={m} on={medio === m.id} onClick={() => setMedio(m.id)} />
                  ))}
              </div>
            </div>
            <div>
              <div className="t-label">Categoría</div>
              <div className="hscroll">
                {d.categorias
                  .filter((c) => !c.archivada)
                  .map((c) => (
                    <CatChip key={c.id} cat={c} on={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)} />
                  ))}
              </div>
            </div>
          </>
        )}

        {tipo === 'compartido' && (
          <div>
            <div className="t-label">¿Con quién lo compartes?</div>
            <div className="hscroll" style={{ gap: 10, paddingBottom: 10 }}>
              {personas.map((v) => {
                const on = sel.includes(v.p.id);
                return <PersonPick key={v.p.id} ini={v.ini} label={v.first} color={v.color} on={on} onClick={() => setSel((s) => (on ? s.filter((x) => x !== v.p.id) : [...s, v.p.id]))} />;
              })}
              {!personas.length && <span className="t-meta">Primero agrega personas en la pestaña Personas.</span>}
            </div>
            <div className="seg">
              {(
                [
                  ['equal', 'Iguales'],
                  ['exact', 'Exactos'],
                  ['shares', 'Partes'],
                ] as [SplitMode, string][]
              ).map(([k, l]) => (
                <button key={k} className="pill h36 grow" aria-pressed={modo === k} onClick={() => setModo(k)}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{ padding: '6px 4px 0' }}>
              {!variable &&
                rsp.rows.map((r) => {
                  const v = d.persona.get(r.id);
                  return (
                    <div key={r.id} className="split-row" style={{ minHeight: 42 }}>
                      <span className="who">{v?.first}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {modo === 'exact' && (
                          <input
                            className="split-input"
                            value={show(exact[r.id])}
                            inputMode="numeric"
                            placeholder="$0"
                            aria-label={`Monto de ${v?.first}`}
                            onChange={(e) => setExact((x) => ({ ...x, [r.id]: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                          />
                        )}
                        {modo === 'shares' && (
                          <>
                            <button className="btn-round sm" onClick={() => setParts((p) => ({ ...p, [r.id]: Math.max(1, (p[r.id] || 1) - 1) }))} aria-label="Menos partes">
                              −
                            </button>
                            <span style={{ fontWeight: 800, minWidth: 14, textAlign: 'center' }}>{r.k}</span>
                            <button className="btn-round sm" onClick={() => setParts((p) => ({ ...p, [r.id]: Math.min(9, (p[r.id] || 1) + 1) }))} aria-label="Más partes">
                              +
                            </button>
                            <span style={{ fontSize: 15, color: 'var(--muted)', minWidth: 64, textAlign: 'right' }}>{fmt(r.v)}</span>
                          </>
                        )}
                        {modo === 'equal' && <span style={{ fontSize: 17, fontWeight: 800 }}>{fmt(r.v)}</span>}
                      </div>
                    </div>
                  );
                })}
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', paddingTop: 8 }}>
                {variable ? 'El reparto se calcula cuando confirmes el monto' : `Tu parte ${fmt(rsp.mine)} · se cobra ${fmt(rsp.amount - rsp.mine)} al mes`}
              </div>
            </div>
          </div>
        )}

        {tipo === 'cobro' && (
          <div>
            <div className="t-label">¿Quién te paga?</div>
            <div className="hscroll" style={{ gap: 10 }}>
              {personas.map((v) => (
                <PersonPick key={v.p.id} ini={v.ini} label={v.first} color={v.color} on={persona === v.p.id} onClick={() => setPersona(v.p.id)} />
              ))}
              {!personas.length && <span className="t-meta">Primero agrega personas en la pestaña Personas.</span>}
            </div>
          </div>
        )}

        <div className="help-soft">Los fijos se anotan solos; los variables te los pregunto.</div>
        {id && (
          <button className="btn-text" style={{ color: 'var(--danger)' }} onClick={() => setBorrar(true)}>
            Borrar recurrente
          </button>
        )}
      </div>
      <div className="foot">
        <button className="cta" onClick={guardar}>
          Guardar recurrente
        </button>
      </div>
      {borrar && editing && (
        <ConfirmSheet
          title="¿Borramos este recurrente?"
          body={`${editing.nombre} deja de anotarse. Lo que ya está anotado se queda en el historial.`}
          confirm="Sí, borrar"
          onClose={() => setBorrar(false)}
          onConfirm={async () => {
            await borrarRecurrente(editing.id);
            toast('Recurrente borrado');
            back('/recurrentes');
          }}
        />
      )}
    </div>
  );
}
