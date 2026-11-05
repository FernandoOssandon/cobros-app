import { useMemo, useRef, useState } from 'react';
import { diasSinRespaldo } from '../backup';
import type { Medio } from '../db';
import { useAjustes, useDatos, type Datos } from '../hooks';
import { diaLabel, diaMes, fmt, mesLargo, shortDate, todayISO } from '../lib/format';
import { ingresosMes } from '../lib/ingresosMes';
import { clavePeriodo, estadoCierre, gastosDelPeriodo, periodoEn, periodoTarjeta, rangoPeriodo, resumenTarjeta, tienePeriodo, type PeriodoTarjeta } from '../lib/periodos';
import { avances } from '../lib/presupuestos';
import { proxima } from '../lib/recurrence';
import { idOrigen } from '../lib/cuotas';
import { fmtMoneda } from '../lib/monedas';
import { mesDe, resumenMes } from '../lib/resumen';
import { useNav } from '../nav';
import { elegirClavePeriodo, usePeriodo } from '../periodo';
import { Logo } from '../ui/Logo';
import { anotarAtrasados, mesNombre, repartoRecurrente } from '../recurrentes';
import { useRespaldar } from '../useRespaldo';
import { Icon } from '../ui/icons';
import { PeriodoBar } from '../ui/periodo';
import { CupoTarjeta, PagarTarjetaSheet } from '../ui/tarjeta';
import { BarraPresupuesto, IconoPresupuesto, lineasPresupuesto, nombrePresupuesto } from '../ui/presupuesto';
import { GastoRow, MedioCard, tipoMedioLabel } from '../ui/rows';
import { PorConfirmarSheet } from '../ui/sheets';
import { useToast } from '../ui/toast';

export default function Resumen() {
  const d = useDatos();
  const aj = useAjustes();
  const { push, tab } = useNav();
  const toast = useToast();
  const respaldar = useRespaldar();
  const scroll = useRef<HTMLDivElement>(null);
  const { periodo } = usePeriodo(d?.medios ?? SIN_MEDIOS);
  const hoy = todayISO();
  const mesActual = hoy.slice(0, 7);
  const mes = periodo.tipo === 'mes' ? periodo.mes : periodo.cierreMes;
  const esActual = mes === mesActual;
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const r = useMemo(() => (d ? resumenMes(mes, d.imputados, d.movimientos, d.medios) : null), [d, mes]);
  if (!d || !r) return <div className="scroll" />;

  const encabezado = (
    <>
      <div className="row-between" style={{ padding: '6px 4px 12px' }}>
        <h1 className="t-tab">
          <Logo size={34} />
        </h1>
        <button className="btn-o" onClick={() => push('/ajustes')}>
          Ajustes
        </button>
      </div>
      <PeriodoBar medios={d.medios} style={{ padding: '0 4px' }} />
    </>
  );
  if (periodo.tipo === 'tarjeta') {
    return (
      <div className="scroll pad-tab" style={{ padding: '0 16px 96px' }}>
        {encabezado}
        <PeriodoTarjetaVista p={periodo} d={d} />
      </div>
    );
  }

  const delMes = d.imputados.filter((g) => mesDe(g.fecha) === mes);
  const hayDatos = d.gastos.length > 0 || d.personas.length > 0;
  /** Tocar una tarjeta de crédito con día de facturación la elige como período. */
  const abrirMedio = (m?: Medio) => {
    if (m && tienePeriodo(m)) {
      elegirClavePeriodo(clavePeriodo(esActual ? periodoEn(hoy, m) : periodoTarjeta(m, mes)));
      scroll.current?.scrollTo({ top: 0 });
    } else push('/medios');
  };

  // Recurrentes atrasados (fijos de meses anteriores) agrupados.
  const atrasados = d.pendientes.filter((p) => p.tipo === 'anotar');
  const recAtr = new Set(atrasados.map((p) => p.recurrenteId));
  const unRec = recAtr.size === 1 ? d.recurrentes.find((x) => recAtr.has(x.id)) : undefined;
  const tituloAtr = unRec
    ? `Tienes ${atrasados.length} ${atrasados.length === 1 ? 'mes' : 'meses'} de ${unRec.nombre} por anotar`
    : `Tienes ${atrasados.length} recurrentes por anotar`;

  // Recordatorio de respaldo.
  const primer = [...d.gastos.map((g) => g.creado), ...d.personas.map((v) => v.p.creado)].sort()[0];
  const dias = diasSinRespaldo(aj, primer);
  const verRespaldo = aj.recordarRespaldo && hayDatos && dias !== null && dias > 7;

  // Por confirmar y próximos pagos (solo en el mes en curso).
  const porConfirmar = d.pendientes.filter((p) => p.tipo === 'confirmar');
  const proximos = d.recurrentes
    .filter((x) => x.activo)
    .map((x) => ({ x, f: proxima(x.frecuencia, x.inicio, [x.generadoHasta ?? '', hoy].sort()[1], x.fin) }))
    .filter((o): o is { x: typeof o.x; f: string } => !!o.f && o.f <= sumarDias30(hoy))
    .sort((a, b) => a.f.localeCompare(b.f));

  const confirmP = confirmando ? d.pendientes.find((p) => p.id === confirmando) : undefined;
  const confirmR = confirmP ? d.recurrentes.find((x) => x.id === confirmP.recurrenteId) : undefined;
  const hayMes = delMes.length > 0;
  const verSaldos = r.teDeben > 0 || r.debes > 0;

  return (
    <div className="scroll pad-tab" style={{ padding: '0 16px 96px' }} ref={scroll}>
      {encabezado}

      {esActual && atrasados.length > 0 && (
        <div className="banner-line" style={{ marginTop: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.15 }}>{tituloAtr}</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.35 }}>
            No abrías la app desde {mesNombre(atrasados[0].fecha)}. Los fijos se juntaron.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="pill"
              style={{ background: 'var(--ink)', color: 'var(--bg)', border: 'none', fontWeight: 800 }}
              onClick={async () => {
                const { n, total } = await anotarAtrasados();
                toast(`Anotamos ${n} ${unRec ? (n === 1 ? 'mes de ' : 'meses de ') + unRec.nombre : 'recurrentes'} · ${fmt(total)}`);
              }}
            >
              Anotar los {atrasados.length}
            </button>
            <button className="pill" onClick={() => tab('/recurrentes')}>
              Revisar
            </button>
          </div>
        </div>
      )}

      {esActual && verRespaldo && (
        <div className="banner-soft" style={{ marginTop: 14 }}>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>
            {aj.ultimoRespaldo ? `Hace ${dias} días que no respaldas` : 'Todavía no respaldas tus datos'}
          </span>
          <button
            style={{ flex: 'none', height: 38, padding: '0 14px', borderRadius: 19, border: 'none', background: 'var(--ink)', color: 'var(--bg)', fontWeight: 800, fontSize: 13 }}
            onClick={respaldar}
          >
            Respaldar ahora
          </button>
        </div>
      )}

      {hayMes ? (
        <div style={{ padding: '20px 4px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)' }}>Gasto real del mes</div>
          <div className="t-hero" style={{ marginTop: 6 }}>{fmt(r.gastoReal)}</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 12, lineHeight: 1.35 }}>Salió de tus medios {fmt(r.salio)}</div>
          {r.adelantado > 0 && <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted)' }}>adelantaste {fmt(r.adelantado)} por otros</div>}
        </div>
      ) : (
        <div style={{ padding: '70px 4px 0' }}>
          <div className="t-display">{esActual ? 'Mes en blanco.' : `Nada en ${mesLargo(mes).split(' ')[0]}.`}</div>
          <p className="t-body-muted">
            {esActual
              ? 'Todavía no anotas ni un gasto. Empieza por el café de hoy: el primero cuesta, los demás salen solos.'
              : 'Para atrás no hay nada anotado en este mes.'}
          </p>
        </div>
      )}

      {verSaldos && (
        <div style={{ display: 'flex', gap: 8, padding: '14px 4px 0', flexWrap: 'wrap' }}>
          <button className="pill" style={{ borderColor: 'var(--pos)', color: 'var(--pos)', fontWeight: 800, fontSize: 15 }} onClick={() => tab('/personas?tab=in')}>
            Te deben {fmt(r.teDeben)}
          </button>
          <button className="pill" style={{ borderColor: 'var(--owe)', color: 'var(--owe)', fontWeight: 800, fontSize: 15 }} onClick={() => tab('/personas?tab=out')}>
            Debes {fmt(r.debes)}
          </button>
        </div>
      )}

      <IngresosYPresupuestos d={d} mes={mes} esActual={esActual} gastoReal={r.gastoReal} />

      {hayMes && r.porMedio.length > 0 && (
        <>
          <h2 className="t-section">tus medios.</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {r.porMedio.map((pm) => {
              const m = pm.medioId ? d.medio.get(pm.medioId) : undefined;
              let meta = m ? tipoMedioLabel(m.tipo) : 'Gastos anotados antes de las tarjetas';
              if (m && tienePeriodo(m)) meta += ` · período ${rangoPeriodo(esActual ? periodoEn(hoy, m) : periodoTarjeta(m, mes))}`;
              return <MedioCard key={pm.medioId ?? 'sin'} r={pm} medio={m} meta={meta} onClick={() => abrirMedio(m)} />;
            })}
          </div>
        </>
      )}

      {esActual && porConfirmar.length > 0 && (
        <>
          <h2 className="t-section">por confirmar.</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {porConfirmar.map((p) => {
              const rec = d.recurrentes.find((x) => x.id === p.recurrenteId);
              if (!rec) return null;
              return (
                <button
                  key={p.id}
                  onClick={() => setConfirmando(p.id)}
                  style={{ width: '100%', border: '2px solid var(--ink)', borderRadius: 24, background: 'transparent', padding: '14px 14px 14px 16px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center', textAlign: 'left' }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 18, fontWeight: 800 }}>
                      {rec.nombre} de {mesNombre(p.fecha)}
                    </span>
                    <span className="t-meta">
                      Variable{rec.ultimoConfirmado && rec.monto ? ` · en ${mesNombre(rec.ultimoConfirmado)} llegaron ${fmt(rec.monto)}` : ''}
                    </span>
                  </span>
                  <span style={{ height: 40, padding: '0 14px', borderRadius: 20, background: 'var(--ink)', color: 'var(--bg)', display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap' }}>
                    ¿Cuánto llegó?
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {esActual && proximos.length > 0 && (
        <>
          <h2 className="t-section">próximos pagos.</h2>
          <div className="list" style={{ padding: '0 16px' }}>
            <div className="inner">
              {proximos.map(({ x, f }) => {
                const dm = diaMes(f);
                const sub =
                  x.tipo === 'ingreso'
                    ? 'Ingreso'
                    : x.tipo === 'cobro'
                    ? `Te paga ${d.persona.get(x.personaId ?? '')?.first ?? ''}`
                    : x.tipo === 'compartido'
                      ? `Compartido · tu parte ${fmt(repartoRecurrente(x, x.monto).mine)}`
                      : (x.medioId && d.medio.get(x.medioId)?.nombre) || '';
                const variable = x.montoTipo === 'variable';
                return (
                  <div key={x.id} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                      <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>{dm.dia}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{dm.mes}</span>
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{x.nombre}</span>
                      <span className="t-meta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: x.tipo === 'cobro' || x.tipo === 'ingreso' ? 'var(--pos)' : variable ? 'var(--muted)' : 'var(--ink)' }}>
                      {variable ? 'variable' : (x.tipo === 'cobro' || x.tipo === 'ingreso' ? '+' : '') + (x.moneda && x.montoMoneda ? fmtMoneda(x.moneda, x.montoMoneda) : fmt(x.monto))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {hayDatos && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '24px 4px 0' }}>
          <button className="btn-o" onClick={() => push(`/categorias${esActual ? '' : '?mes=' + mes}`)}>
            Por categoría
          </button>
          <button className="btn-o" onClick={() => push('/tendencias')}>
            Tendencias
          </button>
          <button className="btn-o" onClick={() => push('/grupos')}>
            Grupos y eventos
          </button>
          <button className="btn-o" onClick={() => push('/medios')}>
            Medios de pago
          </button>
          <button className="btn-o" onClick={() => push('/presupuestos')}>
            Presupuestos
          </button>
          <button className="btn-o" onClick={() => push('/ingresos')}>
            Ingresos
          </button>
        </div>
      )}

      {confirmP && confirmR && <PorConfirmarSheet p={confirmP} r={confirmR} onClose={() => setConfirmando(null)} />}
    </div>
  );
}

const SIN_MEDIOS: Medio[] = [];

const caja = { borderRadius: 22, background: 'var(--soft)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 } as const;
const botonTinta = { height: 40, padding: '0 16px', borderRadius: 20, border: 'none', background: 'var(--ink)', color: 'var(--bg)', fontWeight: 800, fontSize: 14 } as const;

/** Tarjeta "Ingresos · Gasto real · Te quedan" y presupuestos en riesgo (solo en el mes calendario). */
function IngresosYPresupuestos({ d, mes, esActual, gastoReal }: { d: Datos; mes: string; esActual: boolean; gastoReal: number }) {
  const { push } = useNav();
  const hoy = todayISO();
  const im = ingresosMes(mes, d.ingresos, d.recurrentes, d.pendientes, hoy);
  const hayIngresos = im.total > 0 || im.fijos.length > 0 || im.sueltos.length > 0;
  const quedan = im.total - gastoReal;
  const cuenta = (id?: string) => (id ? d.cuentas.find((c) => c.id === id)?.nombre : undefined);
  const sub = [
    ...im.fijos.map((f) => {
      const a = cuenta(f.r.cuentaId);
      if (f.estado === 'llego') return `${f.r.nombre} llegó el ${shortDate(f.fecha!)}${a ? ` a ${a}` : ''}`;
      if (f.estado === 'confirmar') return `${f.r.nombre} por confirmar`;
      if (f.estado === 'llega' && f.fecha && mesDe(f.fecha) === mes) return `${f.r.nombre} llega el ${shortDate(f.fecha)}`;
      return '';
    }),
    im.sueltos.length ? `${im.sueltos.length} ${im.sueltos.length === 1 ? 'ingreso suelto' : 'ingresos sueltos'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const avs = esActual ? avances(d.presupuestos, d.imputados, hoy) : [];
  const riesgo = avs.filter((a) => a.estado !== 'bien').sort((a, b) => a.presupuesto.orden - b.presupuesto.orden);

  return (
    <>
      {hayIngresos && (esActual || im.total > 0) ? (
        <button
          onClick={() => push('/ingresos')}
          aria-label="Ingresos del mes"
          style={{ width: '100%', marginTop: 18, border: 'none', borderRadius: 24, background: 'var(--surface)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}
        >
          <span className="row-between" style={{ width: '100%', alignItems: 'baseline' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Ingresos</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--pos)' }}>{fmt(im.total)}</span>
          </span>
          <span className="row-between" style={{ width: '100%', alignItems: 'baseline' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Gasto real</span>
            <span style={{ fontSize: 18, fontWeight: 800 }}>{fmt(-gastoReal)}</span>
          </span>
          <span className="row-between" style={{ width: '100%', alignItems: 'baseline', paddingTop: 12, borderTop: '2px solid var(--ink)' }}>
            <span style={{ fontSize: 18, fontWeight: 800 }}>{quedan >= 0 ? 'Te quedan' : 'Gastaste de más'}</span>
            <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1.2, color: quedan >= 0 ? 'var(--pos)' : 'var(--danger)', whiteSpace: 'nowrap' }}>{fmt(Math.abs(quedan))}</span>
          </span>
          {sub && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', lineHeight: 1.3 }}>{sub}</span>}
        </button>
      ) : (
        esActual && (
          <div style={{ ...caja, marginTop: 18 }}>
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.15 }}>¿Cuánto te entra al mes?</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.35 }}>Anota tu sueldo y te digo cuánto te queda después de los gastos.</span>
            <span style={{ display: 'flex' }}>
              <button style={botonTinta} onClick={() => push('/ingreso/nuevo?sueldo=1')}>
                Agregar sueldo
              </button>
            </span>
          </div>
        )
      )}

      {esActual && riesgo.length > 0 && (
        <>
          <div className="row-between" style={{ alignItems: 'baseline', padding: '28px 4px 10px' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.6 }}>presupuestos en riesgo.</h2>
            <button style={{ border: 'none', background: 'transparent', padding: 0, fontWeight: 700, fontSize: 14, color: 'var(--muted)' }} onClick={() => push('/presupuestos')}>
              {avs.length > 1 ? `Ver los ${avs.length}` : 'Ver'}
            </button>
          </div>
          <div className="list">
            <div className="inner">
              {riesgo.map((a) => {
                const cat = a.presupuesto.categoriaId ? d.categoria.get(a.presupuesto.categoriaId) : undefined;
                const l = lineasPresupuesto(a);
                return (
                  <button
                    key={a.presupuesto.id}
                    onClick={() => push('/presupuestos')}
                    style={{ width: '100%', border: 'none', borderTop: '1px solid var(--line)', background: 'transparent', padding: 14, display: 'grid', gridTemplateColumns: '36px minmax(0,1fr) auto', gap: 12, alignItems: 'center', textAlign: 'left' }}
                  >
                    <IconoPresupuesto p={a.presupuesto} cat={cat} size={36} />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{nombrePresupuesto(a.presupuesto, cat)}</span>
                      <BarraPresupuesto a={a} alto={10} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: l.color }}>{l.riesgo}</span>
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: l.color, whiteSpace: 'nowrap' }}>{l.pct}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
      {esActual && avs.length > 0 && riesgo.length === 0 && (
        <button
          onClick={() => push('/presupuestos')}
          style={{ width: '100%', marginTop: 14, border: 'none', borderRadius: 22, background: 'var(--soft)', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', fontSize: 15, fontWeight: 700 }}
        >
          <span>{avs.length === 1 ? 'Tu presupuesto va bien.' : `Tus ${avs.length} presupuestos van bien.`}</span>
          <Icon name="next" size={18} />
        </button>
      )}
      {esActual && avs.length === 0 && (
        <div style={{ ...caja, marginTop: 14 }}>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.15 }}>Ponle tope a la semana.</span>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.35 }}>Un límite semanal o por categoría, y te aviso antes de pasarte.</span>
          <span style={{ display: 'flex' }}>
            <button style={botonTinta} onClick={() => push('/presupuesto/nuevo')}>
              Crear presupuesto
            </button>
          </span>
        </div>
      )}
    </>
  );
}

/** Resumen de un período de tarjeta: lo que llegará en su estado de cuenta. */
function PeriodoTarjetaVista({ p, d }: { p: PeriodoTarjeta; d: Datos }) {
  const { push, tab } = useNav();
  const [pagar, setPagar] = useState(false);
  const hoy = todayISO();
  const m = d.medio.get(p.medioId);
  const r = resumenTarjeta(p, d.imputados, d.movimientos, hoy);
  const gastos = gastosDelPeriodo(p, d.imputados).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado.localeCompare(a.creado));
  if (!gastos.length)
    return (
      <div style={{ padding: '60px 4px 0' }}>
        <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -2.4, lineHeight: 0.95 }}>
          Nada en este
          <br />
          período.
        </div>
        <p className="t-body-muted">
          No anotaste compras con {m?.nombre ?? 'esta tarjeta'} entre el {shortDate(p.desde)} y el {shortDate(p.hasta)}.
        </p>
        {m && (m.cupo || m.usoCuadrado) && (
          <div className="card" style={{ marginTop: 20 }}>
            <CupoTarjeta m={m} d={d} />
          </div>
        )}
      </div>
    );
  const seg = (v: number, bg: string) => <span style={{ display: v > 0 ? 'block' : 'none', flexGrow: v, background: bg }} />;
  return (
    <>
      <div style={{ padding: '20px 4px 0' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)' }}>{r.cerrado ? 'Llegó en tu estado de cuenta' : 'Llegará en tu estado de cuenta'}</div>
        <div className="t-hero" style={{ marginTop: 6 }}>{fmt(r.facturado)}</div>
        <div style={{ display: 'flex', marginTop: 14 }}>
          <span style={{ height: 36, padding: '0 14px', borderRadius: 18, border: `2px solid ${r.cerrado ? 'var(--muted)' : 'var(--ink)'}`, color: r.cerrado ? 'var(--muted)' : 'var(--ink)', fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center' }}>
            {estadoCierre(p, hoy)}
          </span>
        </div>
      </div>
      {m && (m.cupo || m.usoCuadrado) && (
        <div style={{ padding: '16px 4px 0' }}>
          <CupoTarjeta m={m} d={d} />
        </div>
      )}
      <div style={{ marginTop: 20, borderRadius: 24, background: 'var(--surface)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--ink)' }} />
              tuyo
            </span>
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8 }}>{fmt(r.tuyo)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>de otros</span>
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8 }}>{fmt(r.deOtros)}</span>
          </div>
        </div>
        <span className="stack">
          {seg(r.tuyo, 'var(--ink)')}
          {seg(r.recuperado, 'var(--pos)')}
          {seg(r.pendiente, 'var(--owe)')}
        </span>
        {r.deOtros > 0 ? (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--pos)' }} />
              {fmt(r.recuperado)} ya te pagaron
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--owe)' }} />
              {fmt(r.pendiente)} pendientes
            </span>
          </div>
        ) : (
          <div className="t-meta">Todo tuyo, nadie te debe nada de este estado de cuenta.</div>
        )}
      </div>
      <h2 className="t-section">cargos del período.</h2>
      <div className="list">
        <div className="inner">
          {gastos.map((g) => (
            <GastoRow key={g.id} g={g} d={d} meta={diaLabel(g.fecha)} onClick={() => push(`/gasto/${idOrigen(g)}`)} />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '20px 4px 0' }}>
        <button className="btn-o" onClick={() => tab('/gastos')}>
          Ver en Gastos
        </button>
        {m && (
          <button className="btn-o" onClick={() => setPagar(true)}>
            Pagar tarjeta
          </button>
        )}
        <button className="btn-o" onClick={() => push('/medios')}>
          Medios de pago
        </button>
      </div>
      {pagar && m && <PagarTarjetaSheet m={m} d={d} onClose={() => setPagar(false)} />}
    </>
  );
}

const sumarDias30 = (hoy: string) => {
  const [y, m, dd] = hoy.split('-').map(Number);
  const x = new Date(y, m - 1, dd + 30);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
