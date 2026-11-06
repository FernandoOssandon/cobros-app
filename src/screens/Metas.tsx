// Metas de ahorro: tarjeta (en Mi plata), detalle con aportes y formulario.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db, type CodigoMoneda, type Meta } from '../db';
import { useAjustes, useDatos } from '../hooks';
import { actualizarIndicadores } from '../indicadores';
import { dg, diaLabel, fmt, MESES_LARGOS, pressKey, shortDate, show, todayISO } from '../lib/format';
import { avanceMeta, type AvanceMeta } from '../lib/metas';
import { aBorrador, aPesos, fmtMoneda, leerDecimal, MONEDAS, nombreMoneda, simboloMoneda } from '../lib/monedas';
import { aportarMeta, borrarMeta, guardarMeta, quitarAporte } from '../metas';
import { useNav } from '../nav';
import { Svg } from '../ui/icons';
import { BackButton, ConfirmSheet, DateInputPill, Keypad, Sheet, TaskHeader } from '../ui/kit';
import { useToast } from '../ui/toast';

export const IC_META = 'M5 21V4M5 4h11l-2 4 2 4H5';

const mesYAnio = (fecha: string, hoy = todayISO()) => `${MESES_LARGOS[Number(fecha.slice(5, 7)) - 1]}${fecha.slice(0, 4) !== hoy.slice(0, 4) ? ' ' + fecha.slice(0, 4) : ''}`;

/** "te faltan $190.000 · aparta $47.500 al mes hasta marzo" (o "¡Lo lograste!"). */
export function lineaMeta(a: AvanceMeta): { texto: string; color: string } {
  if (a.lograda) return { texto: '¡Lo lograste! Ya juntaste lo que querías.', color: 'var(--pos)' };
  if (a.dias !== undefined && a.dias < 0) return { texto: `Ya pasó la fecha · te faltan ${fmt(a.falta)}`, color: 'var(--owe)' };
  if (a.meses && a.meta.fecha) return { texto: `te faltan ${fmt(a.falta)} · aparta ${fmt(a.porMes)} al mes hasta ${mesYAnio(a.meta.fecha)}`, color: 'var(--muted)' };
  return { texto: `te faltan ${fmt(a.falta)}`, color: 'var(--muted)' };
}

export const IconoMeta = ({ m, size = 40 }: { m: Pick<Meta, 'color'>; size?: number }) => (
  <span className="cat-ic" style={{ width: size, height: size, background: m.color }} aria-hidden="true">
    <Svg d={IC_META} size={Math.round(size / 2)} w={2} />
  </span>
);

export const BarraMeta = ({ a, alto = 10 }: { a: AvanceMeta; alto?: number }) => (
  <span
    role="meter"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(a.pct * 100)}
    aria-label={`${Math.round(a.pct * 100)} % de la meta`}
    style={{ display: 'block', width: '100%', height: alto, borderRadius: alto / 2, background: 'var(--track)', overflow: 'hidden' }}
  >
    <span style={{ display: 'block', width: `${(a.pct * 100).toFixed(1)}%`, height: alto, borderRadius: alto / 2, background: a.lograda ? 'var(--pos)' : 'var(--ink)' }} />
  </span>
);

export function TarjetaMeta({ a, onClick }: { a: AvanceMeta; onClick: () => void }) {
  const l = lineaMeta(a);
  return (
    <button className="card" style={{ gap: 10 }} onClick={onClick} aria-label={`Meta ${a.meta.nombre}`}>
      <span style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) auto', gap: 12, alignItems: 'center', width: '100%' }}>
        <IconoMeta m={a.meta} />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span className="ellipsis" style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>{a.meta.nombre}</span>
          <span className="ellipsis" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
            {fmt(a.llevas)} de {a.meta.moneda && a.meta.montoMoneda ? fmtMoneda(a.meta.moneda, a.meta.montoMoneda) : fmt(a.objetivo)}
            {a.cuenta ? ` · en ${a.cuenta.nombre}` : ''}
          </span>
        </span>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.6, color: a.lograda ? 'var(--pos)' : 'var(--ink)' }}>{Math.round(a.pct * 100)} %</span>
      </span>
      <BarraMeta a={a} />
      <span style={{ fontSize: 13, fontWeight: 700, color: l.color, lineHeight: 1.3 }}>{l.texto}</span>
    </button>
  );
}

// ---------- Detalle ----------

export function MetaDetalle() {
  const { id } = useParams();
  const d = useDatos();
  const aj = useAjustes();
  const { push, back, backLabel } = useNav();
  const toast = useToast();
  const [mov, setMov] = useState<'aportar' | 'sacar' | null>(null);
  const [quitar, setQuitar] = useState<string | null>(null);
  if (!d) return <div className="scroll" />;
  const m = d.metas.find((x) => x.id === id);
  if (!m)
    return (
      <div className="scroll" style={{ padding: '4px 16px' }}>
        <BackButton onClick={() => back('/plata')} label={backLabel} />
        <div className="t-note" style={{ padding: '40px 4px' }}>Esta meta ya no existe.</div>
      </div>
    );
  const a = avanceMeta(m, d.cuentas, d.movCuentas, aj.indicadores);
  const l = lineaMeta(a);
  const aporte = quitar ? m.aportes.find((x) => x.id === quitar) : undefined;
  return (
    <div className="scroll" style={{ padding: '4px 16px var(--safe-bottom)' }}>
      <div className="row-between">
        <BackButton onClick={() => back('/plata')} label={backLabel} />
        <button className="btn-o" onClick={() => push(`/meta/${m.id}/editar`)}>
          Editar
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 4px 0' }}>
        <IconoMeta m={m} size={36} />
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--muted)' }}>
          Meta: {m.moneda && m.montoMoneda ? `${fmtMoneda(m.moneda, m.montoMoneda)} (≈ ${fmt(a.objetivo)})` : fmt(a.objetivo)}
          {m.fecha ? ` para el ${shortDate(m.fecha)}` : ''}
        </span>
      </div>
      <h1 className="t-screen" style={{ margin: '10px 4px 0', textWrap: 'pretty' }}>{m.nombre}</h1>
      <div style={{ padding: '20px 4px 0' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)' }}>Llevas</div>
        <div className="t-hero" style={{ marginTop: 6 }}>{fmt(a.llevas)}</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>
          {Math.round(a.pct * 100)} % de {fmt(a.objetivo)}
        </div>
      </div>
      <div style={{ padding: '14px 4px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <BarraMeta a={a} alto={14} />
        <span style={{ fontSize: 15, fontWeight: 800, color: l.color === 'var(--muted)' ? 'var(--ink)' : l.color, lineHeight: 1.3 }}>{l.texto}</span>
      </div>

      {a.cuenta ? (
        <div className="help-soft" style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span>
            El avance es el saldo estimado de {a.cuenta.nombre}. Lo que deposites ahí cuenta para la meta.
          </span>
          <span>
            <button className="btn-o" style={{ background: 'transparent' }} onClick={() => push(`/cuenta/${a.cuenta!.id}`)}>
              Ver {a.cuenta.nombre}
            </button>
          </span>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8, marginTop: 20 }}>
            <button className="btn-ink" onClick={() => setMov('aportar')}>
              Aportar
            </button>
            <button className="btn-line" onClick={() => setMov('sacar')} disabled={a.llevas <= 0} style={{ opacity: a.llevas > 0 ? 1 : 0.4 }}>
              Sacar
            </button>
          </div>
          <h2 className="t-section">aportes.</h2>
          {m.aportes.length ? (
            <div className="list">
              <div className="inner">
                {[...m.aportes].reverse().map((x) => (
                  <button key={x.id} className="list-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }} onClick={() => setQuitar(x.id)}>
                    <span className="r-title">{diaLabel(x.fecha)}</span>
                    <span className="r-amt" style={{ color: x.monto > 0 ? 'var(--pos)' : 'var(--owe)' }}>
                      {x.monto > 0 ? '+' : '−'}
                      {fmt(Math.abs(x.monto))}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ padding: '0 4px', fontSize: 16, fontWeight: 600, color: 'var(--muted)', lineHeight: 1.35 }}>
              Todavía nada. Cada vez que apartes plata para esto, anótala con Aportar.
            </div>
          )}
        </>
      )}

      {mov && (
        <AporteSheet
          modo={mov}
          max={mov === 'sacar' ? a.llevas : undefined}
          onClose={() => setMov(null)}
          onListo={async (monto) => {
            setMov(null);
            const aid = await aportarMeta(m.id, mov === 'aportar' ? monto : -monto);
            toast(mov === 'aportar' ? `Aporte anotado · +${fmt(monto)}` : `Sacaste ${fmt(monto)} de la meta`, aid ? { label: 'Deshacer', run: () => void quitarAporte(m.id, aid) } : undefined);
          }}
        />
      )}
      {aporte && (
        <ConfirmSheet
          title="¿Quitamos este aporte?"
          body={`${diaLabel(aporte.fecha)} · ${aporte.monto > 0 ? '+' : '−'}${fmt(Math.abs(aporte.monto))}`}
          confirm="Sí, quitar"
          onClose={() => setQuitar(null)}
          onConfirm={async () => {
            setQuitar(null);
            await quitarAporte(m.id, aporte.id);
            toast('Aporte quitado', { label: 'Deshacer', run: () => void db.metas.update(m.id, { aportes: m.aportes }) });
          }}
        />
      )}
    </div>
  );
}

function AporteSheet({ modo, max, onClose, onListo }: { modo: 'aportar' | 'sacar'; max?: number; onClose: () => void; onListo: (monto: number) => void }) {
  const [amt, setAmt] = useState('');
  const monto = dg(amt);
  const ok = monto > 0 && (max === undefined || monto <= max);
  return (
    <Sheet onClose={onClose} label={modo === 'aportar' ? '¿Cuánto aportas?' : '¿Cuánto sacas?'}>
      <div className="t-question" style={{ padding: '16px 4px 0' }}>{modo === 'aportar' ? '¿Cuánto aportas?' : '¿Cuánto sacas?'}</div>
      <div className="t-hero-64" style={{ padding: '10px 4px 0', color: amt ? 'var(--ink)' : 'var(--muted)' }}>${show(amt) || '0'}</div>
      {max !== undefined && monto > max && <div className="t-meta" style={{ padding: '0 4px', color: 'var(--owe)' }}>En la meta hay {fmt(max)}.</div>}
      <div style={{ padding: '8px 0' }}>
        <Keypad onKey={(k) => setAmt((v) => pressKey(v, k))} />
      </div>
      <button className="cta" aria-disabled={!ok} onClick={() => ok && onListo(monto)}>
        {modo === 'aportar' ? `Aportar ${monto ? fmt(monto) : ''}` : `Sacar ${monto ? fmt(monto) : ''}`}
      </button>
    </Sheet>
  );
}

// ---------- Nueva / editar meta ----------

export function MetaForm() {
  const { id } = useParams();
  const d = useDatos();
  const aj = useAjustes();
  const { back, navigate } = useNav();
  const toast = useToast();
  const hoy = todayISO();
  const [nombre, setNombre] = useState('');
  const [moneda, setMoneda] = useState<CodigoMoneda | 'CLP'>('CLP');
  const [amt, setAmt] = useState('');
  const [amtMon, setAmtMon] = useState('');
  const [conFecha, setConFecha] = useState(false);
  const [fecha, setFecha] = useState(() => {
    const [y, m] = hoy.split('-').map(Number);
    return `${y + (m + 6 > 12 ? 1 : 0)}-${String(((m + 5) % 12) + 1).padStart(2, '0')}-01`;
  });
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [borrar, setBorrar] = useState(false);
  const editing = id ? d?.metas.find((m) => m.id === id) : undefined;

  useEffect(() => {
    if (!editing) return;
    setNombre(editing.nombre);
    if (editing.moneda && editing.montoMoneda) {
      setMoneda(editing.moneda);
      setAmtMon(aBorrador(editing.montoMoneda));
    } else setAmt(String(editing.monto));
    if (editing.fecha) {
      setConFecha(true);
      setFecha(editing.fecha);
    }
    setCuenta(editing.cuentaId ?? null);
  }, [editing]);

  if (!d) return <div className="screen" />;
  const enPesos = moneda === 'CLP';
  const montoMoneda = leerDecimal(amtMon);
  const ind = enPesos ? undefined : aj.indicadores?.[moneda];
  const monto = enPesos ? dg(amt) : ind ? aPesos(montoMoneda, ind.valor) : editing?.monto ?? 0;
  const cuentas = d.cuentas.filter((c) => !c.archivada && c.tipo !== 'dap' && !c.moneda);
  const nombreCuenta = cuenta ? cuentas.find((c) => c.id === cuenta)?.nombre : undefined;
  const ok = !!nombre.trim() && (enPesos ? monto > 0 : montoMoneda > 0);
  const vista =
    ok && monto > 0
      ? avanceMeta(
          { id: id ?? 'nueva', nombre, monto, fecha: conFecha ? fecha : undefined, cuentaId: cuenta ?? undefined, aportes: editing?.aportes ?? [], color: '', archivada: false, orden: 0, creado: '' },
          d.cuentas,
          d.movCuentas,
          aj.indicadores,
          hoy,
        )
      : null;

  const guardar = async () => {
    if (!nombre.trim()) return toast('Ponle nombre');
    if (!ok) return toast('Falta el monto');
    const mid = await guardarMeta({
      id,
      nombre,
      monto,
      moneda: enPesos ? undefined : moneda,
      montoMoneda: enPesos ? undefined : montoMoneda,
      fecha: conFecha ? fecha : undefined,
      cuentaId: cuenta ?? undefined,
    });
    toast(id ? 'Meta actualizada' : `Meta creada · ${nombre.trim()}`);
    if (id) back(`/meta/${id}`);
    else navigate(`/meta/${mid}`, { replace: true, state: { from: 'Mi plata' } });
  };

  return (
    <div className="screen">
      <TaskHeader title={id ? 'editar meta.' : 'nueva meta.'} onClose={() => back(id ? `/meta/${id}` : '/plata')} />
      <div className="scroll" style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="¿Para qué ahorras?"
          aria-label="Nombre de la meta"
          maxLength={40}
          style={{ height: 56, border: 'none', borderBottom: '2px solid var(--ink)', background: 'transparent', fontSize: 30, fontWeight: 800, letterSpacing: -1, padding: '0 4px' }}
        />
        <div>
          <div className="t-label">¿Cuánto quieres juntar?</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, height: 60, padding: '0 18px', borderRadius: 30, border: '2px solid var(--ink)', fontSize: 30, fontWeight: 800, letterSpacing: -1 }}>
            <span style={{ flex: 'none' }}>{simboloMoneda(moneda)}</span>
            {enPesos ? (
              <input value={show(amt)} onChange={(e) => setAmt(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" placeholder="0" aria-label="Monto de la meta" style={campo} />
            ) : (
              <input value={amtMon} onChange={(e) => setAmtMon(e.target.value.replace(/[^\d,.]/g, '').slice(0, 10))} inputMode="decimal" placeholder="0" aria-label={`Monto en ${nombreMoneda(moneda)}`} style={campo} />
            )}
          </label>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {(['CLP', ...MONEDAS] as const).map((c) => (
              <button
                key={c}
                className="pill h36"
                style={{ padding: '0 12px', fontSize: 13 }}
                aria-pressed={moneda === c}
                onClick={() => {
                  setMoneda(c);
                  if (c !== 'CLP') void actualizarIndicadores();
                }}
              >
                {c === 'CLP' ? 'Pesos' : c === 'USD' ? 'US$' : c === 'EUR' ? '€' : 'UF'}
              </button>
            ))}
          </div>
          {!enPesos && (
            <div className="t-meta" style={{ marginTop: 8, padding: '0 4px', lineHeight: 1.35 }}>
              {ind ? `${montoMoneda ? `${fmtMoneda(moneda, montoMoneda)} son ${fmt(monto)} hoy. ` : ''}El avance se compara con el valor del día.` : `Sin el valor del ${nombreMoneda(moneda)} por ahora: se actualiza cuando haya conexión.`}
            </div>
          )}
        </div>
        <div>
          <div className="t-label">¿Para cuándo?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="pill" aria-pressed={!conFecha} onClick={() => setConFecha(false)}>
              Sin fecha
            </button>
            <DateInputPill
              value={fecha}
              on={conFecha}
              label={conFecha ? shortDate(fecha) : 'Elegir fecha'}
              onChange={(v) => {
                setFecha(v);
                setConFecha(true);
              }}
            />
          </div>
        </div>
        <div>
          <div className="t-label">¿Dónde la juntas?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {cuentas.map((c) => (
              <button key={c.id} className="pill" aria-pressed={cuenta === c.id} onClick={() => setCuenta(c.id)}>
                {c.nombre}
              </button>
            ))}
            <button className="pill" aria-pressed={cuenta === null} onClick={() => setCuenta(null)}>
              Aparte
            </button>
          </div>
        </div>
        <div className="help-soft">
          {nombreCuenta ? `El avance es el saldo de ${nombreCuenta}: lo que deposites ahí cuenta para la meta.` : 'Anotas tus aportes a mano en la meta. No mueve plata de tus cuentas.'}
          {vista && vista.meses > 0 && !vista.lograda ? ` Para llegar, aparta ${fmt(vista.porMes)} al mes.` : ''}
          {vista?.lograda ? ' ¡Con lo que llevas ya la cumples!' : ''}
        </div>
        {editing && (
          <button className="btn-text" style={{ color: 'var(--danger)' }} onClick={() => setBorrar(true)}>
            Borrar meta
          </button>
        )}
      </div>
      <div className="foot">
        <button className="cta" aria-disabled={!ok} onClick={guardar}>
          Guardar meta
        </button>
      </div>
      {borrar && editing && (
        <ConfirmSheet
          title="¿Borramos esta meta?"
          body={`${editing.nombre}. La plata no se mueve: solo deja de verse la meta${editing.aportes.length ? ' y sus aportes' : ''}.`}
          confirm="Sí, borrar"
          onClose={() => setBorrar(false)}
          onConfirm={async () => {
            setBorrar(false);
            const copia = await borrarMeta(editing.id);
            toast('Meta borrada', copia && { label: 'Deshacer', run: () => void db.metas.put(copia) });
            navigate('/plata', { replace: true });
          }}
        />
      )}
    </div>
  );
}

const campo = { flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontSize: 30, fontWeight: 800, letterSpacing: -1, padding: 0 } as const;

