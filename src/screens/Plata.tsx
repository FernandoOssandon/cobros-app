// Mi plata: patrimonio, cuentas de ahorro, depósitos a plazo y la hoja para depositar, retirar o cuadrar.
import { useState } from 'react';
import { asegurarEfectivo, borrarMovAhorro, cobrarDap, cuadrar, ID_EFECTIVO, moverPlata } from '../ahorros';
import { db, type Cuenta } from '../db';
import { useAjustes, useDatos, type Datos } from '../hooks';
import { alVencerDap, patrimonio, plazoDap, saldoCuenta } from '../lib/ahorro';
import { dg, fmt, juntarY, pressKey, shortDate, show, todayISO } from '../lib/format';
import { useNav } from '../nav';
import { Icon } from '../ui/icons';
import { ConfirmSheet, Keypad, PickerSheet, Sheet } from '../ui/kit';
import { useToast } from '../ui/toast';

// ---------- Formatos ----------

export const pct = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;
const MS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const parse = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
/** "1 ene 2027" */
export const fechaLarga = (iso: string) => {
  const d = parse(iso);
  return `${d.getDate()} ${MS[d.getMonth()]} ${d.getFullYear()}`;
};
/** "Lunes 24 may 2027" */
export const fechaConDia = (iso: string) => `${DIAS[parse(iso).getDay()]} ${fechaLarga(iso)}`;
const diasEntre = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
export const cuadradoLbl = (n?: number) => (n === undefined ? 'sin cuadrar' : n <= 0 ? 'cuadrado hoy' : `cuadrado hace ${plural(n, 'día', 'días')}`);
export const tasaLbl = (c: Cuenta) => (c.tasa ? `${pct(c.tasa)}% ${c.tasaUnidad === 'mensual' ? 'mensual' : 'anual'}` : 'sin tasa');
export const TIPO_CUENTA: Record<Cuenta['tipo'], string> = {
  remunerada: 'Cuenta remunerada',
  vista: 'Cuenta vista',
  efectivo: 'Efectivo',
  inversion: 'Inversión',
  dap: 'Depósito a plazo',
};

const vistas = (d: Datos) => d.cuentas.filter((c) => c.tipo === 'vista' && !c.archivada);

// ---------- Pestaña ----------

export default function MiPlata() {
  const d = useDatos();
  const aj = useAjustes();
  const { push, tab } = useNav();
  const [mov, setMov] = useState<MovPedido | null>(null);
  const [elegirVista, setElegirVista] = useState(false);
  const [dapSheet, setDapSheet] = useState<Cuenta | null>(null);
  if (!d) return <div className="scroll" />;

  const hoy = todayISO();
  const p = patrimonio({ cuentas: d.cuentas, movAhorro: d.movAhorro, personas: d.personas.map((v) => v.p), movimientos: d.movimientos, gastos: d.gastos, medios: d.medios }, hoy);
  const ahorro = p.cuentas.filter((r) => r.cuenta.tipo === 'remunerada' || r.cuenta.tipo === 'inversion');
  const daps = p.cuentas.filter((r) => r.cuenta.tipo === 'dap' && r.cuenta.dap?.estado === 'vigente');
  const vs = vistas(d);

  const abrirEfectivo = async () => {
    const id = await asegurarEfectivo();
    const c = await db.cuentas.get(id);
    if (c) setMov({ cuenta: c, modo: 'cuadrar' });
  };
  const abrirVista = () => {
    if (!vs.length) push('/cuenta/nueva?tipo=vista');
    else if (vs.length === 1) setMov({ cuenta: vs[0], modo: 'cuadrar' });
    else setElegirVista(true);
  };

  const filas = [
    {
      label: 'Ahorros',
      sub: ahorro.length || daps.length ? [ahorro.length && plural(ahorro.length, 'cuenta', 'cuentas'), daps.length && plural(daps.length, 'depósito a plazo', 'depósitos a plazo')].filter(Boolean).join(' y ') : 'Agrega tu primera cuenta',
      v: p.ahorros,
      dot: '#7FD9A8',
      open: () => document.getElementById('cuentas-ahorro')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    },
    { label: 'Cuentas vista', sub: vs.length ? vs.map((c) => c.nombre).join(', ') : 'Toca para anotar el saldo', v: p.vista, dot: '#FFD36E', open: abrirVista },
    { label: 'Efectivo', sub: 'En la billetera', v: p.efectivo, dot: '#9EC9FF', open: abrirEfectivo },
    { label: 'Te deben', sub: plural(p.nTeDeben, 'persona', 'personas'), v: p.teDeben, dot: 'var(--pos)', open: () => tab('/personas?tab=in') },
    { label: 'Debes', sub: plural(p.nDebes, 'persona', 'personas'), v: -p.debes, dot: 'var(--owe)', open: () => tab('/personas?tab=out') },
    {
      label: 'Tarjetas por pagar',
      sub: p.tarjetasCredito.length ? `${p.tarjetasCredito.map((m) => m.nombre).join(', ')} · período actual` : 'Sin tarjetas de crédito',
      v: -p.tarjetas,
      dot: 'var(--owe)',
      open: () => push('/medios'),
    },
  ];
  const segs = ([
    [p.ahorros, '#7FD9A8'],
    [p.vista, '#FFD36E'],
    [p.efectivo, '#9EC9FF'],
    [p.teDeben, 'var(--pos)'],
  ] as const).filter(([v]) => v > 0);
  const liabW = p.pasivos > 0 ? Math.min(100, (p.pasivos / Math.max(p.activos, 1)) * 100) : 0;

  const pendientes = d.detectados.filter((x) => x.estado === 'pendiente');
  const bancos = [...new Set(pendientes.map((x) => x.banco ?? 'tu banco'))];

  return (
    <div className="scroll" style={{ padding: '0 16px 96px' }}>
      <div className="row-between" style={{ padding: '6px 4px 12px' }}>
        <h1 className="t-tab">mi plata.</h1>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>al {shortDate(hoy)}</span>
      </div>
      <div style={{ padding: '8px 4px 0' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)' }}>Patrimonio</div>
        <div className="t-pat" style={{ color: p.total < 0 ? 'var(--owe)' : undefined }}>{fmt(p.total)}</div>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted)', marginTop: 10, lineHeight: 1.35, textWrap: 'pretty' }}>
          Lo que tienes menos lo que debes, con los saldos que la app conoce.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '18px 4px 0' }} aria-hidden="true">
        <div className="row-between" style={{ fontSize: 13, fontWeight: 700 }}>
          <span>tienes</span>
          <span>{fmt(p.activos)}</span>
        </div>
        <div style={{ display: 'flex', gap: 3, height: 14, borderRadius: 7, background: segs.length ? undefined : 'var(--track)' }}>
          {segs.map(([v, c], i) => (
            <span key={i} style={{ flexGrow: v, flexBasis: 0, height: 14, borderRadius: 7, background: c }} />
          ))}
        </div>
        <div className="row-between" style={{ fontSize: 13, fontWeight: 700, color: 'var(--owe)', marginTop: 6 }}>
          <span>debes</span>
          <span>{fmt(p.pasivos)}</span>
        </div>
        <div style={{ height: 14 }}>
          <div style={{ width: `${liabW.toFixed(1)}%`, height: 14, borderRadius: 7, background: 'var(--owe)' }} />
        </div>
      </div>

      <div className="list" style={{ marginTop: 18, padding: '0 16px' }}>
        <div className="inner">
          {filas.map((f) => (
            <button key={f.label} className="pat-row" onClick={f.open}>
              <span style={{ width: 12, height: 12, borderRadius: 6, background: f.dot }} />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{f.label}</span>
                <span className="t-meta ellipsis">{f.sub}</span>
              </span>
              <span style={{ fontSize: 17, fontWeight: 800, color: f.v < 0 ? 'var(--owe)' : 'var(--ink)' }}>{fmt(f.v)}</span>
            </button>
          ))}
        </div>
      </div>

      {aj.correo ? (
        pendientes.length > 0 && (
          <button className="banner-det" onClick={() => push('/correo')}>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.15 }}>
                {plural(pendientes.length, 'cobro detectado', 'cobros detectados')} en tu correo
              </span>
              <span className="t-meta">De {juntarY(bancos)} · por confirmar</span>
            </span>
            <span className="chip-ink">Revisar</span>
          </button>
        )
      ) : (
        <div style={{ marginTop: 14, borderRadius: 22, background: 'var(--soft)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.15 }}>Que tu banco te avise y la app anote</span>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.35 }}>Leemos los correos de compra de tu banco y te proponemos cada cobro.</span>
          <span style={{ display: 'flex' }}>
            <button className="chip-ink" style={{ border: 'none' }} onClick={() => push('/correo/conectar')}>
              Conectar Gmail
            </button>
          </span>
        </div>
      )}

      <h2 className="t-section" id="cuentas-ahorro" style={{ scrollMarginTop: 8 }}>
        cuentas de ahorro.
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ahorro.map((r) => (
          <button key={r.cuenta.id} className="card" style={{ gap: 10 }} onClick={() => push(`/cuenta/${r.cuenta.id}`)}>
            <span style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) auto', gap: 12, alignItems: 'center', width: '100%' }}>
              <CuentaIni c={r.cuenta} />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }} className="ellipsis">
                  {r.cuenta.nombre}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }} className="ellipsis">
                  {tasaLbl(r.cuenta)} · {cuadradoLbl(r.diasDesdeCuadre)}
                </span>
              </span>
              <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.6 }}>{fmt(r.saldo)}</span>
            </span>
            <span className="row-between" style={{ width: '100%', paddingTop: 10, borderTop: '1px solid var(--line)' }}>
              <Ganado v={r.ganadoMes} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>saldo estimado</span>
            </span>
          </button>
        ))}
        <button className="btn-dashed" style={{ height: 60, fontSize: 16 }} onClick={() => push('/cuenta/nueva')}>
          <Icon name="plus" size={18} w={2.8} />
          {ahorro.length ? 'Agregar cuenta' : 'Agregar cuenta de ahorro'}
        </button>
      </div>

      <h2 className="t-section">depósitos a plazo.</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {daps.map(({ cuenta: c }) => {
          const dp = c.dap!;
          const plazo = plazoDap(dp);
          const transcurrido = Math.min(plazo, Math.max(0, diasEntre(dp.inicio, hoy)));
          const faltan = diasEntre(hoy, dp.vencimiento);
          const final = alVencerDap(dp);
          return (
            <button key={c.id} className="card" onClick={() => setDapSheet(c)} aria-label={`Depósito a plazo ${c.nombre}`}>
              <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center', width: '100%' }}>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>{c.nombre}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                    {plazo} días · {pct(dp.tasa30)}% cada 30 días{dp.renovar ? ' · se renueva' : ''}
                  </span>
                </span>
                <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.6 }}>{fmt(dp.monto)}</span>
              </span>
              <span style={{ display: 'block', width: '100%', height: 10, borderRadius: 5, background: 'var(--track)', overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${plazo ? ((transcurrido / plazo) * 100).toFixed(1) : 100}%`, height: 10, borderRadius: 5, background: 'var(--ink)' }} />
              </span>
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', width: '100%' }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: faltan < 0 ? 'var(--owe)' : undefined }}>
                  {faltan > 0 ? `faltan ${plural(faltan, 'día', 'días')}` : faltan === 0 ? 'vence hoy' : 'ya venció'}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
                  {faltan < 0 ? 'venció' : 'vence'} el {fechaLarga(dp.vencimiento)}
                </span>
              </span>
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', width: '100%', paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>al vencer recibes</span>
                  <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, color: 'var(--pos)' }}>{fmt(final)}</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--pos)' }}>+{fmt(final - dp.monto)}</span>
              </span>
            </button>
          );
        })}
        <button className="btn-dashed" style={{ height: 60, fontSize: 16 }} onClick={() => push('/deposito/nuevo')}>
          <Icon name="plus" size={18} w={2.8} />
          Nuevo depósito a plazo
        </button>
      </div>

      {mov && <MovSheet d={d} pedido={mov} onClose={() => setMov(null)} />}
      {elegirVista && (
        <PickerSheet
          title="¿Qué cuenta cuadras?"
          value={null}
          options={vs.map((c) => ({ value: c.id, label: c.nombre }))}
          onClose={() => setElegirVista(false)}
          onPick={(id) => {
            setElegirVista(false);
            const c = vs.find((x) => x.id === id);
            if (c) setMov({ cuenta: c, modo: 'cuadrar' });
          }}
        />
      )}
      {dapSheet && <DapSheet d={d} c={dapSheet} onClose={() => setDapSheet(null)} />}
    </div>
  );
}

export function CuentaIni({ c, size = 40 }: { c: Cuenta; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: size >= 44 ? 15 : 14, background: c.color, border: '2px solid #0E1A12', boxSizing: 'border-box',
        color: '#0E1A12', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: size >= 44 ? 19 : 17, flex: 'none',
      }}
    >
      {(c.nombre.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

export const Ganado = ({ v }: { v: number }) => (
  <span style={{ fontSize: 15, fontWeight: 800, color: v < 0 ? 'var(--owe)' : 'var(--pos)' }}>{v < 0 ? `bajó ${fmt(-v)} este mes` : `ganaste ${fmt(v)} este mes`}</span>
);

// ---------- Hoja de movimiento: depositar, retirar o cuadrar ----------

export interface MovPedido {
  cuenta: Cuenta;
  modo: 'deposito' | 'retiro' | 'cuadrar';
}

const OTRA = 'otra';

export function MovSheet({ d, pedido, onClose }: { d: Datos; pedido: MovPedido; onClose: () => void }) {
  const toast = useToast();
  const { cuenta: c, modo } = pedido;
  const hoy = todayISO();
  const saldoDe = (id: string) => {
    const x = d.cuentas.find((y) => y.id === id);
    return x ? saldoCuenta(x, d.movAhorro.filter((m) => m.cuentaId === id), hoy) : 0;
  };
  // Origen/destino: las cuentas vista, el efectivo y "otra parte" (plata que la app no lleva).
  const opciones = [
    ...vistas(d).filter((x) => x.id !== c.id).map((x) => ({ id: x.id, label: x.nombre })),
    ...(c.id === ID_EFECTIVO ? [] : [{ id: ID_EFECTIVO, label: 'Efectivo' }]),
    { id: OTRA, label: 'Otra parte' },
  ];
  const [amt, setAmt] = useState('');
  const [otra, setOtra] = useState(opciones[0]?.id ?? OTRA);
  const monto = dg(amt);
  const est = saldoDe(c.id);
  const nombreOtra = opciones.find((o) => o.id === otra)?.label ?? '';

  let info = '';
  let infoColor = 'var(--muted)';
  if (modo === 'cuadrar') {
    const dif = monto - est;
    if (amt === '') info = `La app estima ${fmt(est)}`;
    else if (!dif) info = 'Coincide con lo que estimábamos';
    else [info, infoColor] = [`Estimábamos ${fmt(est)} · diferencia ${dif > 0 ? '+' : ''}${fmt(dif)}`, dif > 0 ? 'var(--pos)' : 'var(--owe)'];
  } else if (modo === 'deposito') {
    if (otra === OTRA) info = 'Desde una cuenta que la app no lleva';
    else {
      const src = saldoDe(otra);
      info = `En ${nombreOtra} quedan ${fmt(src - monto)}`;
      if (monto > src) infoColor = 'var(--danger)';
    }
  } else {
    info = `En ${c.nombre} quedan ${fmt(est - monto)}`;
    if (monto > est) infoColor = 'var(--danger)';
  }
  const ok = modo === 'cuadrar' ? amt !== '' : monto > 0 && (modo === 'deposito' ? otra === OTRA || monto <= saldoDe(otra) : monto <= est);

  const hacer = async () => {
    if (!ok) {
      toast(amt === '' || !monto ? 'Ingresa el monto' : 'No alcanza el saldo');
      return;
    }
    if (modo === 'cuadrar') {
      const dif = monto - est;
      await cuadrar(c.id, monto);
      toast(dif ? `Cuadrado · diferencia de ${dif > 0 ? '+' : ''}${fmt(dif)}` : 'Cuadrado · estaba perfecto');
    } else {
      const otraId = otra === OTRA ? undefined : otra === ID_EFECTIVO ? await asegurarEfectivo() : otra;
      await moverPlata(c.id, modo, monto, otraId);
      toast(modo === 'deposito' ? `Depositaste ${fmt(monto)} en ${c.nombre}` : `Retiraste ${fmt(monto)} de ${c.nombre}`);
    }
    onClose();
  };

  const nombre = c.nombre.toLowerCase();
  const titulo = modo === 'cuadrar' ? `cuadrar ${nombre}.` : modo === 'deposito' ? `depositar en ${nombre}.` : `retirar de ${nombre}.`;
  const pregunta =
    modo === 'cuadrar'
      ? c.tipo === 'vista'
        ? '¿Cuánto dice tu cartola hoy?'
        : c.tipo === 'efectivo'
          ? '¿Cuánto tienes en la billetera?'
          : `¿Cuánto dice la app de ${c.nombre} hoy?`
      : modo === 'deposito'
        ? '¿Cuánto depositas?'
        : '¿Cuánto retiras?';

  return (
    <Sheet onClose={onClose} label={titulo}>
      <div className="t-question" style={{ padding: '16px 4px 0' }}>
        {titulo}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)', padding: '4px 4px 0' }}>{pregunta}</div>
      <div className="t-hero-60" style={{ padding: '8px 4px 0', color: amt ? 'var(--ink)' : 'var(--muted)' }} aria-label="Monto">
        ${show(amt) || '0'}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: infoColor, padding: '2px 4px 10px' }}>{info}</div>
      {modo !== 'cuadrar' && (
        <div className="chips-row" style={{ padding: '0 4px 10px' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginRight: 4, flex: 'none' }}>{modo === 'deposito' ? 'Sale de' : 'Llega a'}</span>
          {opciones.map((o) => (
            <button key={o.id} className="pill h36" style={{ padding: '0 12px', flex: 'none' }} aria-pressed={otra === o.id} onClick={() => setOtra(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      <Keypad h={46} onKey={(k) => setAmt((v) => pressKey(v, k))} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 8, marginTop: 8 }}>
        <button className="btn-line" style={{ fontSize: 15 }} onClick={onClose}>
          Cancelar
        </button>
        <button className="cta" style={{ fontSize: 17 }} aria-disabled={!ok} onClick={hacer}>
          {modo === 'cuadrar' ? 'Cuadrar' : modo === 'deposito' ? 'Depositar' : 'Retirar'}
        </button>
      </div>
    </Sheet>
  );
}

// ---------- Hoja de un depósito a plazo ----------

function DapSheet({ d, c, onClose }: { d: Datos; c: Cuenta; onClose: () => void }) {
  const toast = useToast();
  const { push } = useNav();
  const [cobrar, setCobrar] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const opciones = [...vistas(d).map((x) => ({ id: x.id, label: x.nombre })), { id: ID_EFECTIVO, label: 'Efectivo' }, { id: OTRA, label: 'Otra parte' }];
  const [destino, setDestino] = useState(opciones[0].id);
  const dp = c.dap!;
  const final = alVencerDap(dp);
  const faltan = diasEntre(todayISO(), dp.vencimiento);

  if (borrar) {
    return (
      <ConfirmSheet
        title={`¿Borramos el depósito en ${c.nombre}?`}
        body="Deja de sumar en tu patrimonio. No mueve plata a ninguna cuenta."
        confirm="Sí, borrar"
        onClose={() => setBorrar(false)}
        onConfirm={async () => {
          await db.cuentas.delete(c.id);
          onClose();
          toast('Depósito borrado', { label: 'Deshacer', run: () => db.cuentas.put(c) });
        }}
      />
    );
  }
  return (
    <Sheet onClose={onClose} label={`Depósito a plazo ${c.nombre}`} style={{ gap: 10 }}>
      <div className="sheet-title">{c.nombre}</div>
      <div className="sheet-body" style={{ paddingBottom: 6 }}>
        {fmt(dp.monto)} desde el {fechaLarga(dp.inicio)}. {faltan > 0 ? `Vence el ${fechaLarga(dp.vencimiento)}` : `Venció el ${fechaLarga(dp.vencimiento)}`} y recibes {fmt(final)}.
      </div>
      {cobrar ? (
        <>
          <div className="chips-row" style={{ padding: '0 4px 4px' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginRight: 4, flex: 'none' }}>Llega a</span>
            {opciones.map((o) => (
              <button key={o.id} className="pill h36" style={{ padding: '0 12px', flex: 'none' }} aria-pressed={destino === o.id} onClick={() => setDestino(o.id)}>
                {o.label}
              </button>
            ))}
          </div>
          <button
            className="cta"
            onClick={async () => {
              const id = destino === OTRA ? undefined : destino === ID_EFECTIVO ? await asegurarEfectivo() : destino;
              await cobrarDap(c.id, id);
              onClose();
              toast(`Listo · ${fmt(final)}${id ? ` en ${opciones.find((o) => o.id === destino)?.label}` : ''}`);
            }}
          >
            Pasar {fmt(final)}
          </button>
        </>
      ) : (
        <>
          <button className="cta" onClick={() => setCobrar(true)}>
            {faltan > 0 ? 'Lo cobré antes' : 'Ya lo cobré'}
          </button>
          <button className="btn-line" onClick={() => push(`/deposito/${c.id}`)}>
            Editar depósito
          </button>
          <button className="btn-text" style={{ color: 'var(--danger)' }} onClick={() => setBorrar(true)}>
            Borrar depósito
          </button>
        </>
      )}
    </Sheet>
  );
}

// ---------- Movimiento: borrar con deshacer (detalle de cuenta) ----------

export function useBorrarMovAhorro() {
  const toast = useToast();
  return async (id: string) => {
    const m = await borrarMovAhorro(id);
    if (m) toast('Movimiento borrado', { label: 'Deshacer', run: () => db.movAhorro.put(m) });
  };
}
