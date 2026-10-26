import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { agregarFoto, crearPersona, db, guardarGasto, guardarGrupo, type ModoGasto } from '../db';
import { useDatos } from '../hooks';
import { achicarImagen } from '../lib/imagen';
import { dg, fmt, pressKey, shortDate, show, todayISO } from '../lib/format';
import { sumarDias } from '../lib/recurrence';
import { computeSplit, type SplitResult } from '../lib/split';
import { useNav } from '../nav';
import { guardarRecurrente } from '../recurrentes';
import { Icon } from '../ui/icons';
import { CatChip, DateInputPill, Keypad, MedioChip, PersonPick, PickerSheet, Switch, TaskHeader } from '../ui/kit';
import { useToast } from '../ui/toast';

const MODOS: [ModoGasto, string][] = [
  ['solo', 'Solo yo'],
  ['equal', 'Iguales'],
  ['exact', 'Exactos'],
  ['shares', 'Partes'],
];

export default function NuevoGasto() {
  const { id: editId } = useParams();
  const [search] = useSearchParams();
  const paraPersona = search.get('p');
  const { back } = useNav();
  const toast = useToast();
  const d = useDatos();
  const hoy = todayISO();

  const [amt, setAmt] = useState('');
  const [desc, setDesc] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [cat, setCat] = useState<string | null>(null);
  const [medio, setMedio] = useState<string | null>(null);
  const [payer, setPayer] = useState<string>('yo');
  const [mode, setMode] = useState<ModoGasto>(paraPersona ? 'equal' : 'solo');
  const [sel, setSel] = useState<string[]>(paraPersona ? [paraPersona] : []);
  const [me, setMe] = useState(true);
  const [exact, setExact] = useState<Record<string, string>>({});
  const [parts, setParts] = useState<Record<string, number>>({});
  const [myParts, setMyParts] = useState(1);
  const [grupo, setGrupo] = useState<string | null>(null);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [tieneFoto, setTieneFoto] = useState(false);
  const [rep, setRep] = useState(false);
  const [kp, setKp] = useState(!editId);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [grupoSheet, setGrupoSheet] = useState(false);
  const [nuevoGrupo, setNuevoGrupo] = useState('');
  const loaded = useRef(false);
  const file = useRef<HTMLInputElement>(null);

  const editing = editId ? d?.gasto.get(editId) : undefined;

  // Carga inicial: al editar, el gasto; al crear, el último medio usado.
  useEffect(() => {
    if (!d || loaded.current) return;
    if (editId && !editing) return;
    loaded.current = true;
    if (editing) {
      setAmt(String(editing.total));
      setDesc(editing.descripcion);
      setFecha(editing.fecha);
      setCat(editing.categoriaId ?? null);
      setMedio(editing.medioId ?? null);
      setPayer(editing.pagador);
      setMode(editing.modo);
      setSel(editing.participantes);
      setMe(editing.yoIncluido);
      setExact(Object.fromEntries(Object.entries(editing.exactos).map(([k, v]) => [k, String(v)])));
      setParts(editing.partes);
      setMyParts(editing.misPartes || 1);
      setGrupo(editing.grupoId ?? null);
      setTieneFoto(d.conFoto.has(editing.id));
    } else {
      const activos = d.medios.filter((m) => !m.archivado);
      const ultimo = d.gastos
        .filter((g) => g.medioId && g.pagador === 'yo')
        .sort((a, b) => b.creado.localeCompare(a.creado))[0]?.medioId;
      setMedio(ultimo && activos.some((m) => m.id === ultimo) ? ultimo : activos.find((m) => m.tipo !== 'efectivo')?.id ?? activos[0]?.id ?? null);
    }
  }, [d, editId, editing]);

  // Teclado físico (computador): dígitos y borrar, salvo cuando se escribe en un campo.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea')) return;
      if (/^\d$/.test(e.key)) setAmt((v) => pressKey(v, e.key));
      else if (e.key === 'Backspace') setAmt((v) => pressKey(v, '⌫'));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const personas = useMemo(() => (d?.personas ?? []).filter((v) => !v.p.archivada || sel.includes(v.p.id) || payer === v.p.id), [d, sel, payer]);
  if (!d) return <div className="screen" />;

  const payerOther = payer !== 'yo';
  const payerV = payerOther ? d.persona.get(payer) : undefined;
  const amount = dg(amt);
  const ids = personas.filter((v) => sel.includes(v.p.id)).map((v) => v.p.id);
  const meEf = payerOther ? true : me;
  const sp: SplitResult =
    mode === 'solo'
      ? { amount, rows: [], mine: amount, remaining: 0, ok: amount > 0 }
      : computeSplit({ amount, ids, me: meEf, mode, exact: Object.fromEntries(Object.entries(exact).map(([k, v]) => [k, dg(v)])), parts, myParts });
  const saveOk = sp.ok && (!payerOther || sp.mine > 0);
  const cobrar = payerOther ? 0 : sp.amount - sp.mine;

  let summary = '';
  let summaryColor = 'var(--ink)';
  if (!amount) [summary, summaryColor] = ['Ingresa el monto', 'var(--muted)'];
  else if (payerOther) [summary, summaryColor] = [`Le debes ${fmt(sp.mine)} a ${payerV?.first ?? ''}`, 'var(--owe)'];
  else if (mode === 'solo') summary = '100% gasto tuyo';
  else summary = `Tu parte ${fmt(sp.mine)} · por cobrar ${fmt(cobrar)}`;

  let msg = '';
  let msgDanger = false;
  if (mode === 'exact' && amount > 0 && sp.rows.length) {
    if (sp.remaining < 0) [msg, msgDanger] = ['Te pasaste por ' + fmt(-sp.remaining), true];
    else if (sp.remaining > 0 && !meEf) [msg, msgDanger] = ['Faltan ' + fmt(sp.remaining) + ' por asignar', true];
    else if (sp.remaining === 0) msg = 'Todo asignado';
    else msg = 'Lo que no asignes queda como tu parte';
  }
  if (mode === 'shares' && sp.rows.length) msg = 'Ej.: 2 partes paga el doble que 1 parte';
  if (payerOther && mode !== 'solo' && sp.rows.some((r) => r.id !== payer)) {
    msg = `Solo se anota lo tuyo con ${payerV?.first ?? ''}. Lo demás es entre ellos.`;
    msgDanger = false;
  }

  const ayer = sumarDias(hoy, -1);
  const fechaModo = fecha === hoy ? 'hoy' : fecha === ayer ? 'ayer' : 'otro';
  const grupoSel = grupo ? d.grupos.find((g) => g.id === grupo) : undefined;
  const diaRep = Number(fecha.slice(8, 10));

  const elegirModo = (k: ModoGasto) => {
    setMode(k);
    if (k !== 'solo' && payerOther && !sel.includes(payer)) setSel((s) => [...s, payer]);
  };
  const elegirPagador = (pid: string) => {
    setPayer(pid);
    setMe(true);
    if (mode !== 'solo' && !sel.includes(pid)) setSel((s) => [...s, pid]);
  };

  const guardar = async () => {
    if (!saveOk) {
      toast(!amount ? 'Ingresa un monto' : 'Revisa cómo se reparte el monto');
      return;
    }
    const descripcion = desc.trim() || 'Gasto sin nombre';
    const id = await guardarGasto(
      {
        descripcion,
        fecha,
        modo: mode,
        yoIncluido: mode === 'solo' ? true : meEf,
        misPartes: myParts,
        exactos: Object.fromEntries(ids.map((i) => [i, dg(exact[i])])),
        partes: Object.fromEntries(ids.map((i) => [i, parts[i] || 1])),
        pagador: payer,
        medioId: payerOther ? undefined : medio ?? undefined,
        categoriaId: cat ?? undefined,
        grupoId: grupo ?? undefined,
        recurrenteId: editing?.recurrenteId,
        nota: editing?.nota,
      },
      sp,
      editId,
    );
    if (foto) {
      await db.fotos.where('gastoId').equals(id).delete();
      await agregarFoto(id, foto);
    } else if (editing && !tieneFoto) {
      await db.fotos.where('gastoId').equals(id).delete();
    }
    if (rep && !editId && !payerOther) {
      const rid = await guardarRecurrente({
        nombre: descripcion,
        tipo: cobrar > 0 ? 'compartido' : 'mio',
        montoTipo: 'fijo',
        monto: amount,
        frecuencia: { unidad: 'mes', cada: 1, dia: diaRep },
        inicio: fecha,
        generadoHasta: fecha,
        medioId: medio ?? undefined,
        categoriaId: cat ?? undefined,
        reparto:
          cobrar > 0
            ? { modo: mode === 'solo' ? 'equal' : mode, yoIncluido: meEf, misPartes: myParts, participantes: ids, exactos: Object.fromEntries(ids.map((i) => [i, dg(exact[i])])), partes: parts }
            : undefined,
      });
      await db.gastos.update(id, { recurrenteId: rid });
    }
    toast(
      payerOther
        ? `Gasto guardado · le debes ${fmt(sp.mine)} a ${payerV?.first ?? ''}`
        : cobrar > 0
          ? `Gasto guardado · ${fmt(cobrar)} por cobrar`
          : rep && !editId
            ? 'Gasto guardado · se repetirá cada mes'
            : editId
              ? 'Cambios guardados'
              : 'Gasto guardado',
    );
    back(editId ? `/gasto/${editId}` : '/gastos');
  };

  const addPerson = async () => {
    const n = newName.trim();
    if (!n) return;
    const pid = await crearPersona(n);
    setSel((s) => [...s, pid]);
    setNewName('');
    setAdding(false);
  };

  return (
    <div className="screen">
      <TaskHeader title={editId ? 'editar gasto.' : 'nuevo gasto.'} onClose={() => back('/gastos')} />
      <button
        onClick={() => setKp(true)}
        className="t-hero-64"
        style={{ flex: 'none', border: 'none', background: 'transparent', textAlign: 'left', padding: '6px 20px 0', color: amt ? 'var(--ink)' : 'var(--muted)' }}
        aria-label="Monto total"
      >
        ${show(amt) || '0'}
      </button>
      <div style={{ flex: 'none', padding: '0 20px 8px' }}>
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="¿En qué fue?"
          aria-label="Descripción"
          maxLength={60}
          onFocus={() => setKp(false)}
          style={{ width: '100%', height: 40, border: 'none', background: 'transparent', fontSize: 22, fontWeight: 700, padding: 0 }}
        />
      </div>

      <div className="scroll" style={{ padding: '14px 16px 12px', display: 'flex', flexDirection: 'column', gap: 18, borderTop: '2px solid var(--ink)' }}>
        <div>
          <div className="t-label">Fecha</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="pill" aria-pressed={fechaModo === 'hoy'} onClick={() => setFecha(hoy)}>
              Hoy
            </button>
            <button className="pill" aria-pressed={fechaModo === 'ayer'} onClick={() => setFecha(ayer)}>
              Ayer
            </button>
            <DateInputPill value={fecha} on={fechaModo === 'otro'} label={fechaModo === 'otro' ? shortDate(fecha) : 'Otro día'} onChange={setFecha} />
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

        {!payerOther && (
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
        )}

        <div>
          <div className="t-label">¿Quién pagó?</div>
          <div className="seg">
            <button className="pill grow" style={{ fontSize: 15 }} aria-pressed={!payerOther} onClick={() => setPayer('yo')}>
              Yo
            </button>
            <button
              className="pill grow"
              style={{ fontSize: 15 }}
              aria-pressed={payerOther}
              onClick={() => (personas.length ? elegirPagador(payerOther ? payer : personas[0].p.id) : toast('Primero agrega a una persona'))}
            >
              Otra persona
            </button>
          </div>
          {payerOther && (
            <div className="hscroll" style={{ gap: 10, paddingTop: 12 }}>
              {personas.map((v) => (
                <PersonPick key={v.p.id} ini={v.ini} label={v.first} color={v.color} on={payer === v.p.id} ring="var(--owe)" onClick={() => elegirPagador(v.p.id)} />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="t-label">¿Cómo se reparte?</div>
          <div className="seg">
            {MODOS.map(([k, l]) => (
              <button key={k} className="pill h36 grow" style={{ fontSize: 13 }} aria-pressed={mode === k} onClick={() => elegirModo(k)}>
                {l}
              </button>
            ))}
          </div>
          {mode !== 'solo' && (
            <>
              <div className="hscroll" style={{ gap: 10, padding: '12px 16px 4px' }}>
                <button
                  className="pick"
                  aria-pressed={meEf}
                  onClick={() => (payerOther ? toast('Si pagó otra persona, tú participas sí o sí') : setMe((m) => !m))}
                >
                  <span className="ring me" style={{ borderColor: meEf ? 'var(--pos)' : 'var(--track)' }}>
                    Yo
                  </span>
                  <span className="lbl">{meEf ? 'Incluido' : 'No pago'}</span>
                </button>
                {personas.map((v) => {
                  const on = sel.includes(v.p.id);
                  return (
                    <PersonPick
                      key={v.p.id}
                      ini={v.ini}
                      label={v.first}
                      color={v.color}
                      on={on}
                      onClick={() => setSel((s) => (on ? s.filter((x) => x !== v.p.id) : [...s, v.p.id]))}
                    />
                  );
                })}
                <button className="pick" style={{ color: 'var(--muted)' }} onClick={() => setAdding((a) => !a)}>
                  <span className="ring add">+</span>
                  <span className="lbl">Nueva</span>
                </button>
              </div>
              {adding && (
                <form
                  style={{ display: 'flex', gap: 8, padding: '6px 0' }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    addPerson();
                  }}
                >
                  <input className="input-pill" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre de la persona" maxLength={40} autoFocus />
                  <button className="btn-add" type="submit">
                    Agregar
                  </button>
                </form>
              )}
              <div style={{ padding: '4px 4px 0' }}>
                {sp.rows.map((r) => {
                  const v = d.persona.get(r.id);
                  return (
                    <div className="split-row" key={r.id}>
                      <span className="who">
                        {v?.first}
                        {payerOther && r.id === payer && (
                          <span className="badge" style={{ color: 'var(--owe)' }}>
                            pagó
                          </span>
                        )}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {mode === 'exact' && (
                          <input
                            className="split-input"
                            value={show(exact[r.id])}
                            inputMode="numeric"
                            placeholder="$0"
                            aria-label={`Monto de ${v?.first}`}
                            onFocus={() => setKp(false)}
                            onChange={(e) => setExact((x) => ({ ...x, [r.id]: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                          />
                        )}
                        {mode === 'shares' && (
                          <>
                            <button className="btn-round sm" onClick={() => setParts((p) => ({ ...p, [r.id]: Math.max(1, (p[r.id] || 1) - 1) }))} aria-label={`Menos partes para ${v?.first}`}>
                              −
                            </button>
                            <span style={{ fontWeight: 800, minWidth: 14, textAlign: 'center' }}>{r.k}</span>
                            <button className="btn-round sm" onClick={() => setParts((p) => ({ ...p, [r.id]: Math.min(9, (p[r.id] || 1) + 1) }))} aria-label={`Más partes para ${v?.first}`}>
                              +
                            </button>
                            <span style={{ fontSize: 15, color: 'var(--muted)', minWidth: 70, textAlign: 'right' }}>{fmt(r.v)}</span>
                          </>
                        )}
                        {mode === 'equal' && <span style={{ fontSize: 17, fontWeight: 800 }}>{fmt(r.v)}</span>}
                      </div>
                    </div>
                  );
                })}
                {meEf && sp.rows.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 40, fontSize: 15, fontWeight: 700, color: 'var(--muted)' }}>
                    <span>Tu parte</span>
                    {mode === 'shares' && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', marginRight: 10, color: 'var(--ink)' }}>
                        <button className="btn-round sm" style={{ width: 28, height: 28 }} onClick={() => setMyParts((n) => Math.max(1, n - 1))} aria-label="Menos partes para ti">
                          −
                        </button>
                        <span>{myParts}</span>
                        <button className="btn-round sm" style={{ width: 28, height: 28 }} onClick={() => setMyParts((n) => Math.min(9, n + 1))} aria-label="Más partes para ti">
                          +
                        </button>
                      </span>
                    )}
                    <span>{fmt(sp.mine)}</span>
                  </div>
                )}
                {msg && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: msgDanger ? 'var(--danger)' : 'var(--muted)', padding: '4px 0 0', lineHeight: 1.35 }} role={msgDanger ? 'alert' : undefined}>
                    {msg}
                  </div>
                )}
                {ids.length === 0 && <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)', padding: '6px 0' }}>Toca a las personas que participaron.</div>}
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="pill" style={{ padding: '0 12px 0 14px', gap: 6 }} aria-pressed={!!grupoSel} onClick={() => setGrupoSheet(true)}>
            {grupoSel?.nombre ?? 'Grupo o evento'}
            <Icon name="down" size={14} w={3} />
          </button>
          <button
            className="pill"
            style={{ padding: '0 14px 0 12px' }}
            aria-pressed={!!foto || tieneFoto}
            onClick={() => (foto || tieneFoto ? (setFoto(null), setTieneFoto(false)) : file.current?.click())}
          >
            <Icon name="camera" size={18} w={2.2} />
            {foto || tieneFoto ? 'boleta.jpg' : 'Foto de la boleta'}
          </button>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setFoto(await achicarImagen(f));
              e.target.value = '';
            }}
          />
        </div>

        {!editId && !payerOther && (
          <div className="row-between" style={{ paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Repetir</span>
              <span className="t-meta">{rep ? `Cada mes, el día ${diaRep}. Lo verás en Recurrentes.` : 'Lo convierte en recurrente'}</span>
            </span>
            <Switch label="Repetir cada mes" on={rep} onChange={setRep} />
          </div>
        )}
      </div>

      {kp && (
        <div style={{ flex: 'none', borderTop: '2px solid var(--ink)', padding: '0 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setKp(false)} style={{ height: 30, border: 'none', background: 'transparent', fontWeight: 700, fontSize: 13, color: 'var(--muted)', padding: '0 4px' }}>
              Listo
            </button>
          </div>
          <Keypad onKey={(k) => setAmt((v) => pressKey(v, k))} />
        </div>
      )}
      <div className="foot">
        <div style={{ fontSize: 15, fontWeight: 700, color: summaryColor, textAlign: 'center' }}>{summary}</div>
        <button className="cta" aria-disabled={!saveOk} onClick={guardar}>
          {editId ? 'Guardar cambios' : 'Guardar gasto'}
        </button>
      </div>

      {grupoSheet && (
        <PickerSheet
          title="Grupo o evento"
          value={grupo}
          options={[{ value: null, label: 'Ninguno' }, ...d.grupos.filter((g) => !g.archivado).map((g) => ({ value: g.id, label: g.nombre }))]}
          onClose={() => setGrupoSheet(false)}
          onPick={(v) => {
            setGrupo(v);
            setGrupoSheet(false);
          }}
          footer={
            <form
              style={{ display: 'flex', gap: 8, paddingTop: 14 }}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!nuevoGrupo.trim()) return;
                const gid = await guardarGrupo(nuevoGrupo);
                setGrupo(gid);
                setNuevoGrupo('');
                setGrupoSheet(false);
              }}
            >
              <input className="input-pill" value={nuevoGrupo} onChange={(e) => setNuevoGrupo(e.target.value)} placeholder="Nuevo: Viaje a Pucón" maxLength={40} aria-label="Nombre del grupo nuevo" />
              <button className="btn-add" type="submit">
                Crear
              </button>
            </form>
          }
        />
      )}
    </div>
  );
}
