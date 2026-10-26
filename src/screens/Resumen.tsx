import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { diasSinRespaldo } from '../backup';
import { useAjustes, useDatos } from '../hooks';
import { diaMes, fmt, mesLargo, shortDate, sumarMes, todayISO } from '../lib/format';
import { proxima } from '../lib/recurrence';
import { mesDe, periodoFacturacion, resumenMes } from '../lib/resumen';
import { useNav } from '../nav';
import { anotarAtrasados, mesNombre, repartoRecurrente } from '../recurrentes';
import { useRespaldar } from '../useRespaldo';
import { Icon } from '../ui/icons';
import { MedioCard, tipoMedioLabel } from '../ui/rows';
import { PorConfirmarSheet } from '../ui/sheets';
import { useToast } from '../ui/toast';

export default function Resumen() {
  const d = useDatos();
  const aj = useAjustes();
  const { push, tab } = useNav();
  const toast = useToast();
  const respaldar = useRespaldar();
  const [params, setParams] = useSearchParams();
  const hoy = todayISO();
  const mesActual = hoy.slice(0, 7);
  const mes = params.get('mes') ?? mesActual;
  const esActual = mes === mesActual;
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const r = useMemo(() => (d ? resumenMes(mes, d.gastos, d.movimientos, d.medios) : null), [d, mes]);
  if (!d || !r) return <div className="scroll" />;

  const delMes = d.gastos.filter((g) => mesDe(g.fecha) === mes);
  const hayDatos = d.gastos.length > 0 || d.personas.length > 0;
  const cambiarMes = (n: number) => {
    const m = sumarMes(mes, n);
    if (m > mesActual) return;
    setParams(m === mesActual ? {} : { mes: m }, { replace: true });
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
    <div className="scroll pad-tab" style={{ padding: '0 16px 96px' }}>
      <div className="row-between" style={{ padding: '6px 4px 12px' }}>
        <h1 className="t-tab">me debes.</h1>
        <button className="btn-o" onClick={() => push('/ajustes')}>
          Ajustes
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
        <button className="btn-round" onClick={() => cambiarMes(-1)} aria-label="Mes anterior">
          <Icon name="back" size={16} w={3} />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, minWidth: 140, textAlign: 'center' }}>{mesLargo(mes)}</span>
        <button className="btn-round" style={{ opacity: esActual ? 0.3 : 1 }} disabled={esActual} onClick={() => cambiarMes(1)} aria-label="Mes siguiente">
          <Icon name="next" size={16} w={3} />
        </button>
      </div>

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

      {hayMes && r.porMedio.length > 0 && (
        <>
          <h2 className="t-section">tus medios.</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {r.porMedio.map((pm) => {
              const m = pm.medioId ? d.medio.get(pm.medioId) : undefined;
              let meta = m ? tipoMedioLabel(m.tipo) : 'Gastos anotados antes de las tarjetas';
              if (m?.tipo === 'credito' && m.diaFacturacion) {
                const p = periodoFacturacion(mes, m.diaFacturacion);
                meta += ` · período ${shortDate(p.desde)} – ${shortDate(p.hasta)}`;
              }
              return <MedioCard key={pm.medioId ?? 'sin'} r={pm} medio={m} meta={meta} onClick={() => push('/medios')} />;
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
                  x.tipo === 'cobro'
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
                    <span style={{ fontSize: 16, fontWeight: 800, color: x.tipo === 'cobro' ? 'var(--pos)' : variable ? 'var(--muted)' : 'var(--ink)' }}>
                      {variable ? 'variable' : (x.tipo === 'cobro' ? '+' : '') + fmt(x.monto)}
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
          <button className="btn-o" onClick={() => push('/grupos')}>
            Grupos y eventos
          </button>
          <button className="btn-o" onClick={() => push('/medios')}>
            Medios de pago
          </button>
        </div>
      )}

      {confirmP && confirmR && <PorConfirmarSheet p={confirmP} r={confirmR} onClose={() => setConfirmando(null)} />}
    </div>
  );
}

const sumarDias30 = (hoy: string) => {
  const [y, m, dd] = hoy.split('-').map(Number);
  const x = new Date(y, m - 1, dd + 30);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
