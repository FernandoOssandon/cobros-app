import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { crearPersona, db, guardarGasto } from '../db';
import { usePeople } from '../hooks';
import { dateLabel, dg, fmt, pressKey, show, todayISO } from '../lib/format';
import { computeSplit, type SplitMode } from '../lib/split';
import { AV, CloseButton, DatePill, Keypad } from '../ui/kit';
import { elegirContacto, puedeElegirContacto } from '../lib/contacts';
import { useToast } from '../ui/toast';

const MODES: [SplitMode, string][] = [
  ['equal', 'Iguales'],
  ['exact', 'Exactos'],
  ['shares', 'Partes'],
];

export default function ChargeForm() {
  const { id: editId } = useParams();
  const [search] = useSearchParams();
  const fromPerson = search.get('p');
  const nav = useNavigate();
  const toast = useToast();
  const people = usePeople();
  const editing = useLiveQuery(() => (editId ? db.gastos.get(editId) : undefined), [editId]);

  const [desc, setDesc] = useState('');
  const [amt, setAmt] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [mode, setMode] = useState<SplitMode>('equal');
  const [sel, setSel] = useState<string[]>(fromPerson ? [fromPerson] : []);
  const [me, setMe] = useState(true);
  const [exact, setExact] = useState<Record<string, string>>({});
  const [parts, setParts] = useState<Record<string, number>>({});
  const [myParts, setMyParts] = useState(1);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const loaded = useRef(false);

  // Al editar, carga el cargo una sola vez.
  useEffect(() => {
    if (!editing || loaded.current) return;
    loaded.current = true;
    setDesc(editing.descripcion);
    setAmt(String(editing.total));
    setFecha(editing.fecha);
    setMode(editing.modo === 'solo' ? 'equal' : editing.modo);
    setSel(editing.participantes);
    setMe(editing.yoIncluido);
    setExact(Object.fromEntries(Object.entries(editing.exactos).map(([k, v]) => [k, String(v)])));
    setParts(editing.partes);
    setMyParts(editing.misPartes || 1);
  }, [editing]);

  // Teclado físico (escritorio): dígitos y borrar, salvo cuando se escribe en un campo.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea')) return;
      if (/^\d$/.test(e.key)) setAmt((v) => pressKey(v, e.key));
      else if (e.key === 'Backspace') setAmt((v) => pressKey(v, '⌫'));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const chips = useMemo(() => (people ?? []).filter((v) => !v.p.archivada || sel.includes(v.p.id)), [people, sel]);
  const ids = chips.filter((v) => sel.includes(v.p.id)).map((v) => v.p.id);
  const sp = computeSplit({
    amount: dg(amt),
    ids,
    me,
    mode,
    exact: Object.fromEntries(Object.entries(exact).map(([k, v]) => [k, dg(v)])),
    parts,
    myParts,
  });
  const byId = new Map(chips.map((v) => [v.p.id, v]));

  let msg = '';
  let msgDanger = false;
  if (mode === 'exact' && sp.amount > 0 && sp.rows.length) {
    if (sp.remaining < 0) [msg, msgDanger] = ['Te pasaste por ' + fmt(-sp.remaining), true];
    else if (sp.remaining > 0 && !me) [msg, msgDanger] = ['Faltan ' + fmt(sp.remaining) + ' por asignar', true];
    else if (sp.remaining === 0) msg = 'Todo asignado';
    else msg = 'Lo que no asignes queda como tu parte';
  }
  if (mode === 'shares' && sp.rows.length) msg = 'Ej.: 2 partes paga el doble que 1 parte.';

  const close = () => {
    if (editId) nav(`/cargo/${editId}`, { replace: true });
    else if (fromPerson) nav(`/persona/${fromPerson}`, { replace: true });
    else nav('/', { replace: true });
  };

  const save = async () => {
    if (!sp.ok) {
      toast(!sp.amount ? 'Ingresa un monto' : !ids.length ? 'Elige al menos una persona' : 'Revisa cómo se reparte el monto');
      return;
    }
    await guardarGasto(
      {
        // Al editar se conservan los datos que esta pantalla todavía no muestra.
        pagador: editing?.pagador,
        medioId: editing?.medioId,
        categoriaId: editing?.categoriaId,
        grupoId: editing?.grupoId,
        recurrenteId: editing?.recurrenteId,
        nota: editing?.nota,
        descripcion: desc,
        fecha,
        modo: mode,
        yoIncluido: me,
        misPartes: myParts,
        exactos: Object.fromEntries(ids.map((i) => [i, dg(exact[i])])),
        partes: Object.fromEntries(ids.map((i) => [i, parts[i] || 1])),
      },
      sp,
      editId,
    );
    toast((editId ? 'Cargo actualizado · ' : 'Cargo guardado · ') + fmt(sp.amount - sp.mine) + ' por cobrar');
    close();
  };

  const addPerson = async (nombre = newName, telefono = '') => {
    const n = nombre.trim();
    if (!n) return;
    const pid = await crearPersona(n, telefono);
    setSel((s) => [...s, pid]);
    setNewName('');
    setAdding(false);
  };

  if (!people || (editId && !loaded.current && editing === undefined)) return <div className="screen" />;
  const showAdd = adding || chips.length === 0;

  return (
    <div className="screen">
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', padding: '2px 16px' }}>
        <CloseButton onClick={close} />
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="¿En qué fue?"
          aria-label="Descripción del gasto"
          maxLength={60}
          style={{ flex: 1, minWidth: 0, marginLeft: 12, height: 44, border: 'none', background: 'transparent', fontSize: 20, fontWeight: 700, textAlign: 'right' }}
        />
      </div>
      <div className="hero-64" style={{ flex: 'none', padding: '4px 20px 0' }} aria-label="Monto total">
        ${show(amt) || '0'}
      </div>
      <div style={{ flex: 'none', padding: '6px 20px 0' }}>
        <DatePill value={fecha} label={dateLabel(fecha)} onChange={setFecha} />
      </div>

      <div className="picker">
        <button className="pick" onClick={() => setMe((m) => !m)} aria-pressed={me}>
          <span className="ring me" style={{ borderColor: me ? 'var(--accent)' : 'var(--track)' }}>
            Yo
          </span>
          <span className="lbl">{me ? 'Incluido' : 'No pago'}</span>
        </button>
        {chips.map((v) => {
          const on = sel.includes(v.p.id);
          return (
            <button
              key={v.p.id}
              className="pick"
              style={{ opacity: on ? 1 : 0.45 }}
              aria-pressed={on}
              onClick={() => setSel((s) => (on ? s.filter((x) => x !== v.p.id) : [...s, v.p.id]))}
            >
              <span className="ring" style={{ background: AV[v.p.color % AV.length], borderColor: on ? 'var(--pos)' : 'transparent' }}>
                {v.ini}
              </span>
              <span className="lbl">{v.first}</span>
            </button>
          );
        })}
        <button className="pick muted" onClick={() => setAdding((a) => !a)}>
          <span className="ring add">+</span>
          <span className="lbl">Nueva</span>
        </button>
      </div>
      {showAdd && (
        <form
          style={{ flex: 'none', display: 'flex', gap: 8, padding: '4px 16px' }}
          onSubmit={(e) => {
            e.preventDefault();
            addPerson();
          }}
        >
          <input className="inline-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre de la persona" maxLength={40} autoFocus={adding} />
          <button className="btn-add" type="submit">
            Agregar
          </button>
          {puedeElegirContacto() && (
            <button
              type="button"
              className="btn-outline"
              style={{ height: 42, borderRadius: 21 }}
              onClick={async () => {
                const c = await elegirContacto();
                if (c?.nombre) addPerson(c.nombre, c.telefono);
              }}
            >
              Contactos
            </button>
          )}
        </form>
      )}

      <div style={{ flex: 'none', display: 'flex', gap: 6, padding: '8px 16px' }} role="radiogroup" aria-label="Modo de reparto">
        {MODES.map(([k, label]) => (
          <button key={k} className="pill mode" aria-pressed={mode === k} onClick={() => setMode(k)}>
            {label}
          </button>
        ))}
      </div>

      <div className="scroll" style={{ padding: '2px 20px' }}>
        {sp.rows.map((r) => {
          const v = byId.get(r.id)!;
          return (
            <div className="split-row" key={r.id}>
              <span className="who">{v.first}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {mode === 'exact' && (
                  <input
                    className="split-input"
                    value={show(exact[r.id])}
                    inputMode="numeric"
                    placeholder="$0"
                    aria-label={`Monto de ${v.first}`}
                    onChange={(e) => setExact((x) => ({ ...x, [r.id]: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                  />
                )}
                {mode === 'shares' && (
                  <Stepper value={r.k} onChange={(k) => setParts((p) => ({ ...p, [r.id]: k }))} label={v.first} amount={r.v} />
                )}
                {mode === 'equal' && <span style={{ fontSize: 18, fontWeight: 800 }}>{fmt(r.v)}</span>}
              </div>
            </div>
          );
        })}
        {me && sp.rows.length > 0 && (
          mode === 'shares' ? (
            <div className="split-row muted">
              <span className="who" style={{ fontSize: 15, fontWeight: 600 }}>Tu parte</span>
              <Stepper value={myParts} onChange={setMyParts} label="ti" amount={sp.mine} />
            </div>
          ) : (
            <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 15, fontWeight: 600 }}>
              <span>Tu parte</span>
              <span>{fmt(sp.mine)}</span>
            </div>
          )
        )}
        {msg && (
          <div style={{ fontSize: 13, fontWeight: 600, padding: '2px 0', color: msgDanger ? 'var(--danger)' : 'var(--muted)' }} role={msgDanger ? 'alert' : undefined}>
            {msg}
          </div>
        )}
        {ids.length === 0 && (
          <div className="muted" style={{ fontSize: 15, fontWeight: 600, padding: '8px 0' }}>
            Toca a las personas que participaron.
          </div>
        )}
      </div>

      <Keypad onKey={(k) => setAmt((v) => pressKey(v, k))} />
      <div style={{ flex: 'none', padding: '4px 16px var(--safe-bottom)' }}>
        <button className="cta" aria-disabled={!sp.ok} onClick={save}>
          {editId ? 'Guardar cambios' : 'Guardar cargo'}
        </button>
      </div>
    </div>
  );
}

function Stepper({ value, onChange, label, amount }: { value: number; onChange: (v: number) => void; label: string; amount: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button className="stepper" onClick={() => onChange(Math.max(1, value - 1))} aria-label={`Menos partes para ${label}`}>
        −
      </button>
      <span style={{ fontWeight: 800, minWidth: 14, textAlign: 'center', color: 'var(--ink)' }}>{value}</span>
      <button className="stepper" onClick={() => onChange(Math.min(9, value + 1))} aria-label={`Más partes para ${label}`}>
        +
      </button>
      <span className="muted" style={{ fontSize: 15, minWidth: 70, textAlign: 'right' }}>
        {fmt(amount)}
      </span>
    </div>
  );
}
