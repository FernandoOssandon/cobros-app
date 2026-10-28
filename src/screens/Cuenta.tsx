// Detalle de una cuenta de ahorro, formulario de cuenta y formulario de depósito a plazo.
import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { guardarCuenta, quitarCuenta } from '../ahorros';
import { AVATAR_COLORS, db, type Cuenta, type TipoCuenta } from '../db';
import { useDatos } from '../hooks';
import { alVencerDap, anualDesde30, historialCuenta, movimientosCuenta, resumenCuenta } from '../lib/ahorro';
import { dateLabel, dg, diaLabel, fmt, MESES_LARGOS, show, todayISO } from '../lib/format';
import { sumarDias } from '../lib/recurrence';
import { useNav } from '../nav';
import { Icon } from '../ui/icons';
import { BackButton, ConfirmSheet, DateInputPill, Switch, TaskHeader } from '../ui/kit';
import { ColorPicker } from '../ui/sheets';
import { useToast } from '../ui/toast';
import { CuentaIni, cuadradoLbl, fechaConDia, fechaLarga, Ganado, MovSheet, pct, TIPO_CUENTA, useBorrarMovAhorro, type MovPedido } from './Plata';

// ---------- Detalle ----------

export function CuentaDetalle() {
  const { id = '' } = useParams();
  const d = useDatos();
  const { push, back, backLabel } = useNav();
  const [mov, setMov] = useState<MovPedido | null>(null);
  const [borrarMov, setBorrarMov] = useState<string | null>(null);
  const borrar = useBorrarMovAhorro();
  if (!d) return <div className="scroll" />;
  const c = d.cuentas.find((x) => x.id === id);
  if (c?.tipo === 'dap') return <Navigate to={`/deposito/${c.id}`} replace />;
  if (!c) {
    return (
      <div className="scroll" style={{ padding: '4px 20px' }}>
        <BackButton onClick={() => back('/plata')} label={backLabel} />
        <div className="t-note" style={{ padding: '20px 4px' }}>Esta cuenta ya no existe.</div>
      </div>
    );
  }
  const hoy = todayISO();
  const r = resumenCuenta(c, d.movAhorro, hoy);
  const filas = movimientosCuenta(c, d.movAhorro, hoy);
  const serie = historialCuenta(c, d.movAhorro, hoy);
  const conTasa = !!c.tasa && (c.tipo === 'remunerada' || c.tipo === 'inversion');

  // Gráfico (mismo trazado que el prototipo: 318×120, margen de 6 px).
  const W = 318;
  const H = 120;
  let grafico: { line: string; area: string; x: number; y: number } | null = null;
  if (serie.length >= 2) {
    const vals = serie.map((p) => p.saldo);
    const lo = Math.min(...vals) * 0.9;
    const hi = Math.max(...vals) * 1.03 || 1;
    const pts = vals.map((v, i) => [6 + (i * (W - 12)) / (vals.length - 1), H - 10 - ((v - lo) / (hi - lo || 1)) * (H - 22)]);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];
    grafico = { line, area: `${line} L${last[0].toFixed(1)} ${H} L6 ${H} Z`, x: last[0], y: last[1] };
  }
  const crecio = serie.length ? serie[serie.length - 1].saldo - serie[0].saldo : 0;
  const desde = serie[0] ? MESES_LARGOS[Number(serie[0].fecha.slice(5, 7)) - 1] : '';
  const esAhorro = c.tipo === 'remunerada' || c.tipo === 'inversion';

  return (
    <div className="scroll" style={{ padding: '4px 20px var(--safe-bottom)' }}>
      <div className="row-between">
        <BackButton onClick={() => back('/plata')} label={backLabel} />
        <button className="btn-o" onClick={() => push(`/cuenta/${c.id}/editar`)}>
          Editar
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
        <CuentaIni c={c} size={44} />
        <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.1 }} className="ellipsis">
          {c.nombre.toLowerCase()}.
        </h1>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)', marginTop: 8 }}>
        {TIPO_CUENTA[c.tipo]}
        {conTasa ? ` · ${pct(c.tasa!)}% ${c.tasaUnidad === 'mensual' ? 'mensual' : 'anual'}` : ''}
      </div>
      <div className="t-hero-58" style={{ marginTop: 20 }}>{fmt(r.saldo)}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', marginTop: 8 }}>
        {conTasa ? 'Saldo estimado' : 'Saldo'} · {cuadradoLbl(r.diasDesdeCuadre)}
      </div>
      {conTasa && (
        <div style={{ display: 'flex', marginTop: 12 }}>
          <span className="pill-pos" style={r.ganadoMes < 0 ? { borderColor: 'var(--owe)', color: 'var(--owe)' } : undefined}>
            <Ganado v={r.ganadoMes} />
          </span>
        </div>
      )}
      {grafico && (
        <div style={{ marginTop: 18, borderRadius: 24, background: 'var(--surface)', padding: '16px 16px 12px' }}>
          <div className="row-between" style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', paddingBottom: 8 }}>
            <span>Saldo, {serie.length >= 6 ? 'últimos 6 meses' : serie.length === 2 ? 'desde que la anotaste' : `últimos ${serie.length} meses`}</span>
            <span>
              {crecio >= 0 ? '+' : ''}
              {fmt(crecio)} desde {desde}
            </span>
          </div>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', maxWidth: '100%' }} role="img" aria-label={`Saldo: ${serie.map((p) => `${p.label} ${fmt(p.saldo)}`).join(', ')}`}>
            <path d={grafico.area} fill="var(--pos)" fillOpacity={0.14} />
            <path d={grafico.line} fill="none" stroke="var(--pos)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={grafico.x} cy={grafico.y} r={6} fill="var(--surface)" stroke="var(--pos)" strokeWidth={3} />
          </svg>
          <div className="row-between" style={{ paddingTop: 6, fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
            {serie.map((p) => (
              <span key={p.fecha}>{p.label}</span>
            ))}
          </div>
        </div>
      )}
      {esAhorro || c.tipo === 'vista' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
          <button className="cta" style={{ height: 56, fontSize: 17 }} onClick={() => setMov({ cuenta: c, modo: 'deposito' })}>
            Depositar
          </button>
          <button className="btn-line" style={{ fontSize: 17 }} onClick={() => setMov({ cuenta: c, modo: 'retiro' })}>
            Retirar
          </button>
        </div>
      ) : null}
      <button className="box-line" style={{ marginTop: 10 }} onClick={() => setMov({ cuenta: c, modo: 'cuadrar' })}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 17, fontWeight: 800 }}>Cuadrar con el saldo real</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', lineHeight: 1.3 }}>
            {c.tipo === 'efectivo'
              ? 'Cuenta lo que tienes en la billetera y anótalo.'
              : c.tipo === 'vista'
                ? 'Mira tu cartola y anota el saldo.'
                : `Mira cuánto tienes en ${c.nombre} y anótalo. La estimación parte de ahí.`}
          </span>
        </span>
        <Icon name="next" size={20} />
      </button>

      <h2 className="t-section">movimientos.</h2>
      {filas.length ? (
        <div className="list" style={{ padding: '0 16px' }}>
          <div className="inner">
            {filas.map((f, i) => {
              const contenido = (
                <>
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }} className="ellipsis">
                      {f.label}
                    </span>
                    <span className="t-meta">{diaLabel(f.fecha)}</span>
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: f.monto > 0 ? 'var(--pos)' : 'var(--ink)' }}>
                    {f.monto > 0 ? '+' : ''}
                    {fmt(f.monto)}
                  </span>
                </>
              );
              return f.id ? (
                <button key={f.id} className="mov-row" onClick={() => setBorrarMov(f.id!)}>
                  {contenido}
                </button>
              ) : (
                <div key={`i${i}`} className="mov-row">
                  {contenido}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="t-note" style={{ padding: '0 4px' }}>Sin movimientos todavía.</div>
      )}

      {mov && <MovSheet d={d} pedido={mov} onClose={() => setMov(null)} />}
      {borrarMov && (
        <ConfirmSheet
          title="¿Borramos este movimiento?"
          body="El saldo estimado se recalcula sin él."
          confirm="Sí, borrar"
          onClose={() => setBorrarMov(null)}
          onConfirm={async () => {
            const x = borrarMov;
            setBorrarMov(null);
            await borrar(x);
          }}
        />
      )}
    </div>
  );
}

// ---------- Nueva cuenta / editar ----------

const RAPIDAS: { nombre: string; tipo: TipoCuenta; color: string }[] = [
  { nombre: 'Mach', tipo: 'remunerada', color: '#D9B8FF' },
  { nombre: 'Tenpo', tipo: 'remunerada', color: '#7FD9A8' },
  { nombre: 'Mercado Pago', tipo: 'remunerada', color: '#9EC9FF' },
  { nombre: 'Cuenta RUT', tipo: 'vista', color: '#FFD36E' },
];
const TIPOS: [TipoCuenta, string][] = [
  ['remunerada', 'Remunerada'],
  ['vista', 'Cuenta vista'],
  ['inversion', 'Inversión'],
];

export function CuentaForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const d = useDatos();
  const { back, navigate } = useNav();
  const toast = useToast();
  const editing = id ? d?.cuentas.find((c) => c.id === id) : undefined;
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoCuenta>((params.get('tipo') as TipoCuenta) || 'remunerada');
  const [tasa, setTasa] = useState('');
  const [unidad, setUnidad] = useState<'anual' | 'mensual'>('anual');
  const [saldo, setSaldo] = useState('');
  const [color, setColor] = useState(AVATAR_COLORS[3]);
  const [quitar, setQuitar] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!editing || loaded.current) return;
    loaded.current = true;
    setNombre(editing.nombre);
    setTipo(editing.tipo);
    setTasa(editing.tasa ? String(editing.tasa).replace('.', ',') : '');
    setUnidad(editing.tasaUnidad ?? 'anual');
    setColor(editing.color);
  }, [editing]);

  const conTasa = tipo === 'remunerada' || tipo === 'inversion';
  const tasaNum = parseFloat(tasa.replace(',', '.')) || 0;
  const guardar = async () => {
    if (!nombre.trim()) return toast('Ponle nombre');
    const nueva = await guardarCuenta(
      { id: editing?.id, nombre, tipo, color, tasa: conTasa && tasaNum ? tasaNum : undefined, tasaUnidad: conTasa && tasaNum ? unidad : undefined },
      editing ? undefined : dg(saldo),
    );
    toast(editing ? 'Cuenta actualizada' : `${nombre.trim()} agregada`);
    if (editing) back(`/cuenta/${nueva}`);
    else navigate(`/cuenta/${nueva}`, { replace: true, state: { from: 'Mi plata' } });
  };

  return (
    <div className="screen">
      <TaskHeader title={editing ? 'editar cuenta.' : 'nueva cuenta.'} onClose={() => back('/plata')} />
      <div className="scroll" style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 4px' }}>
          <CuentaIni c={{ nombre: nombre || '?', color } as Cuenta} size={44} />
          <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1 }} className="ellipsis">
            {(nombre || 'mi cuenta').toLowerCase()}.
          </span>
        </div>
        {!editing && (
          <div>
            <div className="t-label">¿Dónde?</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {RAPIDAS.map((r) => (
                <button
                  key={r.nombre}
                  className="pill h38"
                  aria-pressed={nombre === r.nombre}
                  onClick={() => {
                    setNombre(r.nombre);
                    setTipo(r.tipo);
                    setColor(r.color);
                  }}
                >
                  {r.nombre}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="t-label">Nombre</div>
          <input className="input-big" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Mach" maxLength={30} aria-label="Nombre" />
        </div>
        <div>
          <div className="t-label">Tipo</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TIPOS.map(([k, l]) => (
              <button key={k} className="pill h38" aria-pressed={tipo === k} onClick={() => setTipo(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {conTasa && (
          <div>
            <div className="t-label">Tasa</div>
            <label className="rate-pill">
              <input value={tasa} onChange={(e) => setTasa(e.target.value.replace(/[^0-9,.]/g, '').slice(0, 5))} inputMode="decimal" placeholder="4,8" aria-label="Tasa" />
              <span style={{ fontSize: 15, fontWeight: 700 }}>%</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {(['anual', 'mensual'] as const).map((u) => (
                  <button key={u} type="button" className="pill h36" style={{ padding: '0 12px', height: 32 }} aria-pressed={unidad === u} onClick={() => setUnidad(u)}>
                    {u}
                  </button>
                ))}
              </span>
            </label>
            <div className="t-meta" style={{ padding: '6px 4px 0' }}>La que muestra la app del banco. Con ella se estima cuánto vas ganando.</div>
          </div>
        )}
        {!editing ? (
          <div>
            <div className="t-label">Saldo hoy</div>
            <label className="amt-line" style={{ color: saldo ? 'var(--ink)' : 'var(--muted)' }}>
              <span>$</span>
              <input value={show(saldo)} onChange={(e) => setSaldo(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" placeholder="0" aria-label="Saldo hoy" />
            </label>
          </div>
        ) : (
          <div className="t-meta" style={{ padding: '0 4px' }}>Para cambiar el saldo, usa "Cuadrar con el saldo real" en el detalle.</div>
        )}
        <div>
          <div className="t-label">Color</div>
          <ColorPicker colors={AVATAR_COLORS} value={color} onChange={setColor} />
        </div>
        {editing && (
          <button className="btn-text" style={{ color: 'var(--danger)', alignSelf: 'flex-start' }} onClick={() => setQuitar(true)}>
            Quitar esta cuenta
          </button>
        )}
      </div>
      <div className="foot">
        <button className="cta" onClick={guardar}>
          Guardar cuenta
        </button>
      </div>
      {quitar && editing && (
        <ConfirmSheet
          title={`¿Quitamos ${editing.nombre}?`}
          body="Deja de sumar en tu patrimonio. Si tiene movimientos, se guardan por si la vuelves a necesitar."
          confirm="Sí, quitar"
          onClose={() => setQuitar(false)}
          onConfirm={async () => {
            await quitarCuenta(editing.id);
            toast(`${editing.nombre} quitada`);
            navigate('/plata', { replace: true });
          }}
        />
      )}
    </div>
  );
}

// ---------- Depósito a plazo ----------

const BANCOS = ['Banco Estado', 'BCI', 'Santander', 'Itaú'];
const PLAZOS: [number, string][] = [
  [30, '30 d'],
  [60, '60 d'],
  [90, '90 d'],
  [180, '180 d'],
  [365, '1 año'],
];

export function DapForm() {
  const { id } = useParams();
  const d = useDatos();
  const { back } = useNav();
  const toast = useToast();
  const hoy = todayISO();
  const editing = id ? d?.cuentas.find((c) => c.id === id && c.tipo === 'dap') : undefined;
  const [banco, setBanco] = useState('Banco Estado');
  const [otro, setOtro] = useState(false);
  const [amt, setAmt] = useState('');
  const [tasa, setTasa] = useState('0,45');
  const [dias, setDias] = useState(30);
  const [inicio, setInicio] = useState(hoy);
  const [renovar, setRenovar] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!editing?.dap || loaded.current) return;
    loaded.current = true;
    const dp = editing.dap;
    setBanco(editing.nombre);
    setOtro(!BANCOS.includes(editing.nombre));
    setAmt(String(dp.monto));
    setTasa(String(dp.tasa30).replace('.', ','));
    setInicio(dp.inicio);
    setDias(Math.round((new Date(dp.vencimiento).getTime() - new Date(dp.inicio).getTime()) / 86_400_000));
    setRenovar(!!dp.renovar);
  }, [editing]);

  const monto = dg(amt);
  const t30 = parseFloat(tasa.replace(',', '.')) || 0;
  const vencimiento = sumarDias(inicio, dias);
  const final = alVencerDap({ monto, tasa30: t30, inicio, vencimiento, estado: 'vigente' });
  const ok = monto > 0 && t30 > 0 && !!banco.trim();

  const guardar = async () => {
    if (!monto) return toast('Falta el monto');
    if (!t30) return toast('Falta la tasa');
    if (!banco.trim()) return toast('Falta el banco');
    await guardarCuenta({
      id: editing?.id,
      nombre: banco,
      tipo: 'dap',
      institucion: banco.trim(),
      color: editing?.color,
      dap: { monto, tasa30: t30, inicio, vencimiento, estado: 'vigente', renovar },
    });
    toast(editing ? 'Depósito actualizado' : `Depósito guardado · vence el ${fechaLarga(vencimiento)}`);
    back('/plata');
  };

  return (
    <div className="screen">
      <TaskHeader title="depósito a plazo." onClose={() => back('/plata')} />
      <div className="scroll" style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div className="t-label">Monto</div>
          <label className="amt-line" style={{ color: amt ? 'var(--ink)' : 'var(--muted)' }}>
            <span>$</span>
            <input value={show(amt)} onChange={(e) => setAmt(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" placeholder="0" aria-label="Monto" />
          </label>
        </div>
        <div>
          <div className="t-label">Banco</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {BANCOS.map((b) => (
              <button
                key={b}
                className="pill"
                style={{ height: 40, padding: '0 16px', fontSize: 14 }}
                aria-pressed={!otro && banco === b}
                onClick={() => {
                  setOtro(false);
                  setBanco(b);
                }}
              >
                {b}
              </button>
            ))}
            <button
              className="pill"
              style={{ height: 40, padding: '0 16px', fontSize: 14 }}
              aria-pressed={otro}
              onClick={() => {
                setOtro(true);
                if (BANCOS.includes(banco)) setBanco('');
              }}
            >
              Otro
            </button>
          </div>
          {otro && <input className="input-big" style={{ marginTop: 10 }} value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Nombre del banco" maxLength={30} aria-label="Nombre del banco" autoFocus />}
        </div>
        <div>
          <div className="t-label">Tasa</div>
          <label className="rate-pill">
            <input value={tasa} onChange={(e) => setTasa(e.target.value.replace(/[^0-9,]/g, '').slice(0, 5))} inputMode="decimal" aria-label="Tasa cada 30 días" />
            <span style={{ fontSize: 15, fontWeight: 700 }}>% cada 30 días</span>
            <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>{t30 ? `≈ ${pct(Math.round(anualDesde30(t30) * 10) / 10)}% anual` : ''}</span>
          </label>
        </div>
        <div>
          <div className="t-label">Plazo</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {PLAZOS.map(([k, l]) => (
              <button key={k} className="pill" style={{ flex: 1, height: 40, padding: 0, fontSize: 14 }} aria-pressed={dias === k} onClick={() => setDias(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="row-between" style={{ padding: '0 4px' }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Desde</span>
          <DateInputPill value={inicio} label={dateLabel(inicio)} onChange={setInicio} on={inicio !== hoy} />
        </div>
        <div style={{ borderRadius: 24, background: 'var(--ink)', color: 'var(--bg)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>Vence el</span>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>{fechaConDia(vencimiento)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>al vencer recibes</span>
              <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1 }}>{fmt(final)}</span>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>ganas</span>
              <span style={{ fontSize: 18, fontWeight: 800 }}>+{fmt(final - monto)}</span>
            </span>
          </div>
        </div>
        <div className="row-between">
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Renovar al vencer</span>
            <span className="t-meta">{renovar ? `Se renueva por otros ${dias} días con capital e intereses` : 'Te avisamos el día que vence'}</span>
          </span>
          <Switch label="Renovar al vencer" on={renovar} onChange={setRenovar} />
        </div>
        {editing && (
          <button className="btn-text" style={{ color: 'var(--danger)', alignSelf: 'flex-start' }} onClick={() => setBorrar(true)}>
            Borrar depósito
          </button>
        )}
      </div>
      <div className="foot" style={{ paddingTop: 10 }}>
        <button className="cta h60" aria-disabled={!ok} onClick={guardar}>
          Guardar depósito
        </button>
      </div>
      {borrar && editing && (
        <ConfirmSheet
          title={`¿Borramos el depósito en ${editing.nombre}?`}
          body="Deja de sumar en tu patrimonio. No mueve plata a ninguna cuenta."
          confirm="Sí, borrar"
          onClose={() => setBorrar(false)}
          onConfirm={async () => {
            const copia = editing;
            await db.cuentas.delete(copia.id);
            toast('Depósito borrado', { label: 'Deshacer', run: () => db.cuentas.put(copia) });
            back('/plata');
          }}
        />
      )}
    </div>
  );
}
