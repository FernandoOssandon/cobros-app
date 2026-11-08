// ¿Cómo termino el mes?: la proyección hasta el próximo sueldo y el cierre del ciclo (de sueldo a sueldo).
import { useMemo, useState } from 'react';
import { db, guardarAjustes } from '../db';
import { useAjustes, useDatos, type Datos } from '../hooks';
import { aportarMeta } from '../metas';
import { avanceMeta } from '../lib/metas';
import { daysBetween, fmt, juntarY, shortDate, todayISO } from '../lib/format';
import { cicloAnterior, cicloActual, cuentaParaElMes, proyectar, puedeContar, resumenCiclo, tocaCierre, type Ciclo, type LoQueViene, type Proyeccion } from '../lib/proyeccion';
import { sumarDias } from '../lib/recurrence';
import { useNav } from '../nav';
import { Icon } from '../ui/icons';
import { BackButton, Sheet, Switch } from '../ui/kit';
import { useToast } from '../ui/toast';

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const fechaLbl = (iso: string) => shortDate(iso, new Date(`${todayISO()}T12:00:00`));

/** "hasta el sueldo" o "hasta fin de mes". */
export const hastaLbl = (c: Ciclo) => (c.sueldo ? 'hasta el sueldo' : 'hasta fin de mes');
/** Rango de un ciclo: "25 oct – 24 nov". */
export const rangoCiclo = (c: Ciclo) => `${fechaLbl(c.inicio)} – ${fechaLbl(sumarDias(c.hasta, -1))}`;

/** La proyección con los datos de la app. */
export function useProyeccion(d: Datos | undefined): Proyeccion | undefined {
  const hoy = todayISO();
  return useMemo(() => (d ? proyectar(d, hoy) : undefined), [d, hoy]);
}

// ---------- En el resumen ----------

/** Tarjeta del resumen: "$X por día hasta el sueldo". */
export function TarjetaHastaSueldo({ p }: { p: Proyeccion }) {
  const { push } = useNav();
  const c = p.ciclo;
  const falta = p.libre < 0;
  const sub = falta
    ? p.enAhorros > 0
      ? `Tus ahorros tienen ${fmt(p.enAhorros)}`
      : 'Revisa lo que viene antes del sueldo'
    : `Te quedan ${fmt(p.libre)} para ${plural(c.dias, 'día', 'días')}`;
  return (
    <button
      onClick={() => push('/proyeccion')}
      aria-label="Cómo termino el mes"
      data-testid="hasta-sueldo"
      style={{ width: '100%', marginTop: 18, border: '2px solid var(--ink)', borderRadius: 24, background: 'transparent', padding: 16, display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', color: 'var(--ink)' }}
    >
      <span className="row-between" style={{ width: '100%', alignItems: 'baseline' }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{c.sueldo ? 'Hasta el sueldo' : 'Hasta fin de mes'}</span>
        <span className="t-meta">
          {plural(c.dias, 'día', 'días')} · {c.sueldo ? `${c.sueldo.nombre} llega el ${fechaLbl(c.hasta)}` : `el mes cierra el ${fechaLbl(sumarDias(c.hasta, -1))}`}
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1.6, lineHeight: 1, color: falta ? 'var(--danger)' : 'var(--ink)' }}>{fmt(falta ? -p.libre : p.porDia)}</span>
        <span style={{ fontSize: 17, fontWeight: 700 }}>{falta ? 'te faltan' : 'por día'}</span>
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', lineHeight: 1.3 }}>
        {sub}
        {p.ritmo > 0 && !falta ? ` · llevas ${fmt(p.ritmo)} por día` : ''}
        {p.avisos.length ? ` · ${p.avisos.length === 1 ? 'una cuenta no alcanza' : `${p.avisos.length} cuentas no alcanzan`}` : ''}
      </span>
    </button>
  );
}

/** "Llegó el sueldo: cierra el ciclo anterior" (los primeros días después del sueldo). */
export function AvisoCierre({ d }: { d: Datos }) {
  const aj = useAjustes();
  const { push } = useNav();
  const c = tocaCierre(d.recurrentes, d.gastos, aj.ultimoCierre);
  if (!c) return null;
  return (
    <div className="banner-line" style={{ marginTop: 14 }} data-testid="aviso-cierre">
      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.15 }}>{c.sueldo ? 'Llegó el sueldo: cierra el ciclo anterior' : 'Empezó el mes: cierra el anterior'}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.35 }}>{rangoCiclo(c)} · dos minutos para ver cómo te fue y dejar todo en orden.</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="pill" style={{ background: 'var(--ink)', color: 'var(--bg)', border: 'none', fontWeight: 800 }} onClick={() => push('/cierre')}>
          Cerrar el ciclo
        </button>
        <button className="pill" onClick={() => guardarAjustes({ ultimoCierre: c.inicio })}>
          Ahora no
        </button>
      </div>
    </div>
  );
}

// ---------- Pantalla: hasta el sueldo ----------

const fila = (label: React.ReactNode, monto: number, op: { fuerte?: boolean; meta?: string; color?: string } = {}) => (
  <span className="row-between" style={{ width: '100%', alignItems: 'baseline', gap: 12 }}>
    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <span style={{ fontSize: op.fuerte ? 16 : 15, fontWeight: op.fuerte ? 800 : 600 }}>{label}</span>
      {op.meta && <span className="t-meta">{op.meta}</span>}
    </span>
    <span style={{ fontSize: op.fuerte ? 18 : 15, fontWeight: op.fuerte ? 800 : 700, whiteSpace: 'nowrap', color: op.color }}>{fmt(monto)}</span>
  </span>
);

const caja = { borderRadius: 24, background: 'var(--surface)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 } as const;

function textoViene(v: LoQueViene, d: Datos): string {
  const medio = v.medioId ? d.medio.get(v.medioId)?.nombre : undefined;
  const cuenta = v.cuentaId ? d.cuentas.find((c) => c.id === v.cuentaId)?.nombre : undefined;
  const cuando = v.tipo === 'confirmar' ? `por confirmar · ${fechaLbl(v.fecha)}` : fechaLbl(v.fecha);
  return [cuando, medio ?? (cuenta ? `a ${cuenta}` : ''), v.estimado && v.tipo !== 'confirmar' ? 'monto estimado' : ''].filter(Boolean).join(' · ');
}

export function ProyeccionPantalla() {
  const d = useDatos();
  const p = useProyeccion(d);
  const { back, backLabel, push } = useNav();
  const [cuentas, setCuentas] = useState(false);
  if (!d || !p) return <div className="scroll" />;
  const c = p.ciclo;
  const falta = p.libre < 0;
  const teDeben = d.personas.reduce((s, v) => s + Math.max(0, v.saldo), 0);
  const ultimoDia = sumarDias(c.hasta, -1);
  const entradas = p.viene.filter((v) => v.monto > 0);
  const salidas = p.viene.filter((v) => v.monto < 0);
  const conAhorros = p.libre + p.enAhorros;

  return (
    <div className="scroll" style={{ padding: '4px 16px var(--safe-bottom)' }}>
      <BackButton onClick={() => back('/')} label={backLabel} />
      <h1 className="t-screen" style={{ margin: '18px 4px 8px' }}>{hastaLbl(c)}.</h1>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.4, padding: '0 4px', textWrap: 'pretty' }}>
        {c.sueldo
          ? `Faltan ${plural(c.dias, 'día', 'días')}: ${c.sueldo.nombre} llega el ${fechaLbl(c.hasta)}.`
          : `Faltan ${plural(c.dias, 'día', 'días')} para fin de mes. Si agregas tu sueldo como ingreso fijo, la cuenta va de sueldo a sueldo.`}
      </div>

      {p.sinCuentas ? (
        <div style={{ ...caja, background: 'var(--soft)', marginTop: 20 }}>
          <span style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.15 }}>¿Desde qué cuentas gastas?</span>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.35 }}>
            Para saber cuánto puedes gastar, la app necesita el saldo de tus cuentas del día a día (corriente, vista, efectivo). Agrégalas en Mi plata o elige cuáles cuentan.
          </span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="pill" style={{ background: 'var(--ink)', color: 'var(--bg)', border: 'none', fontWeight: 800 }} onClick={() => setCuentas(true)}>
              Elegir cuentas
            </button>
            <button className="pill" onClick={() => push('/cuenta/nueva')}>
              Agregar cuenta
            </button>
          </span>
        </div>
      ) : (
        <div style={{ padding: '22px 4px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)' }}>{falta ? 'Te faltan' : 'Puedes gastar'}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            <span className="t-hero-58" style={{ color: falta ? 'var(--danger)' : 'var(--ink)' }} data-testid="por-dia">
              {fmt(falta ? -p.libre : p.porDia)}
            </span>
            {!falta && <span style={{ fontSize: 20, fontWeight: 800 }}>por día</span>}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 10, lineHeight: 1.35 }}>
            {falta ? `para llegar al ${fechaLbl(c.hasta)} con lo que tienes en tus cuentas del mes.` : `Te quedan ${fmt(p.libre)} para ${plural(c.dias, 'día', 'días')}, contando hoy.`}
          </div>
          {p.ritmo > 0 && c.transcurridos >= 3 && (
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted)', marginTop: 6, lineHeight: 1.35 }} data-testid="ritmo">
              Llevas {fmt(p.ritmo)} por día este ciclo
              {p.grandes.length ? ` (sin contar ${p.grandes.length === 1 ? p.grandes[0].descripcion : `${p.grandes.length} gastos grandes`})` : ''}.{' '}
              {p.aEsteRitmo >= 0 ? `A este ritmo llegas al sueldo con ${fmt(p.aEsteRitmo)}.` : `A este ritmo te faltarían ${fmt(-p.aEsteRitmo)}.`}
            </div>
          )}
        </div>
      )}

      {falta && p.enAhorros > 0 && (
        <div className="banner-soft" style={{ marginTop: 16, alignItems: 'flex-start', flexDirection: 'column', gap: 8, padding: '14px 16px' }}>
          <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>
            Tus ahorros tienen {fmt(p.enAhorros)}
            {conAhorros > 0 ? `: contándolos, serían ${fmt(Math.floor(conAhorros / c.dias))} por día.` : ', y aun así no alcanza.'}
          </span>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.35 }}>Si sacas plata de ahí para el mes, haz que esa cuenta cuente.</span>
          <button className="pill h36" onClick={() => setCuentas(true)}>
            Elegir cuentas
          </button>
        </div>
      )}

      {p.avisos.map((a) => (
        <div key={a.cuenta.id} role="alert" style={{ marginTop: 14, borderRadius: 18, border: '2px solid var(--danger)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--danger)', lineHeight: 1.3 }}>
            {a.cuenta.nombre} no alcanza para {a.motivo}
          </span>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.35 }}>Le faltan {fmt(a.falta)} antes del {fechaLbl(c.hasta)}. Pásale plata desde otra cuenta.</span>
        </div>
      ))}

      {!p.sinCuentas && (
        <>
          <div className="row-between" style={{ alignItems: 'baseline', padding: '28px 4px 10px' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.6 }}>la cuenta.</h2>
            <button style={{ border: 'none', background: 'transparent', padding: 0, fontWeight: 700, fontSize: 14, color: 'var(--muted)' }} onClick={() => setCuentas(true)}>
              Elegir cuentas
            </button>
          </div>
          <div style={caja}>
            {fila('Lo que tienes', p.tienes, { fuerte: true })}
            {p.cuentas.map((x) => (
              <button key={x.cuenta.id} onClick={() => push(`/cuenta/${x.cuenta.id}`)} style={{ border: 'none', background: 'transparent', padding: '0 0 0 12px', textAlign: 'left', color: 'var(--ink)' }}>
                {fila(x.cuenta.nombre, x.saldo)}
              </button>
            ))}

            {entradas.length > 0 && (
              <>
                <span style={{ borderTop: '1px solid var(--line)' }} />
                {fila('Lo que entra', entradas.reduce((s, v) => s + v.monto, 0), { fuerte: true, color: 'var(--pos)' })}
                {entradas.map((v, i) => (
                  <span key={i} style={{ paddingLeft: 12 }}>
                    {fila(v.label, v.monto, { meta: textoViene(v, d) })}
                  </span>
                ))}
              </>
            )}

            {p.tarjetas.length > 0 && (
              <>
                <span style={{ borderTop: '1px solid var(--line)' }} />
                {fila('Ya gastado con tarjeta', -p.enTarjetas, { fuerte: true, meta: 'Cuenta hoy, aunque lo pagues después' })}
                {p.tarjetas.map((t) => (
                  <span key={t.medio.id} style={{ paddingLeft: 12 }}>
                    {fila(t.medio.nombre, -t.total, {
                      meta: [t.porPagar > 0 && t.cierre ? `${fmt(t.porPagar)} facturado al ${fechaLbl(t.cierre)} sin pagar` : '', t.abierto > 0 ? `${fmt(t.abierto)} desde el ${fechaLbl(t.desde)}` : '']
                        .filter(Boolean)
                        .join(' · '),
                    })}
                  </span>
                ))}
              </>
            )}

            {salidas.length > 0 && (
              <>
                <span style={{ borderTop: '1px solid var(--line)' }} />
                {fila(`Lo que viene antes del ${fechaLbl(c.hasta)}`, -p.sale, { fuerte: true })}
                {salidas.map((v, i) => (
                  <span key={i} style={{ paddingLeft: 12 }} data-testid="viene">
                    {fila(v.label, v.monto, { meta: textoViene(v, d) })}
                  </span>
                ))}
              </>
            )}

            <span className="row-between" style={{ width: '100%', alignItems: 'baseline', paddingTop: 12, borderTop: '2px solid var(--ink)' }}>
              <span style={{ fontSize: 18, fontWeight: 800 }}>{falta ? 'Te faltan' : 'Te quedan'}</span>
              <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1, color: falta ? 'var(--danger)' : 'var(--pos)', whiteSpace: 'nowrap' }}>{fmt(Math.abs(p.libre))}</span>
            </span>
          </div>

          <div className="t-meta" style={{ padding: '12px 4px 0', lineHeight: 1.4 }}>
            {[
              `El sueldo del ${fechaLbl(c.hasta)} es del ciclo siguiente.`,
              teDeben > 0 ? `Lo que te deben (${fmt(teDeben)}) no cuenta hasta que te paguen.` : '',
              p.enAhorros > 0 && !falta ? `Tus ahorros (${fmt(p.enAhorros)}) no cuentan.` : '',
              `Las cuotas cuentan en su mes; los recurrentes variables, con su último monto. Último día del ciclo: ${fechaLbl(ultimoDia)}.`,
            ]
              .filter(Boolean)
              .join(' ')}
          </div>
        </>
      )}

      <button className="box-line" style={{ marginTop: 24 }} onClick={() => push('/cierre')}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 17, fontWeight: 800 }}>Cierre del ciclo anterior</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', lineHeight: 1.3 }}>{rangoCiclo(cicloAnterior(d.recurrentes))} · cómo te fue y qué quedó por ordenar.</span>
        </span>
        <Icon name="next" size={20} />
      </button>

      {cuentas && <CuentasDelMes d={d} onClose={() => setCuentas(false)} />}
    </div>
  );
}

/** Elegir qué cuentas cuentan para el mes. */
function CuentasDelMes({ d, onClose }: { d: Datos; onClose: () => void }) {
  const p = useProyeccion(d)!;
  const saldo = new Map([...p.cuentas, ...p.fuera].map((x) => [x.cuenta.id, x.saldo]));
  const lista = d.cuentas.filter(puedeContar).sort((a, b) => a.orden - b.orden);
  return (
    <Sheet onClose={onClose} label="Cuentas del mes" style={{ gap: 6, maxHeight: '85%', overflowY: 'auto' }}>
      <div className="sheet-title" style={{ fontSize: 28 }}>
        cuentas del mes.
      </div>
      <div className="sheet-body" style={{ paddingBottom: 6 }}>
        Las cuentas de donde sale la plata del día a día. Las que dejas fuera son ahorro y no se cuentan.
      </div>
      {lista.length ? (
        lista.map((c) => (
          <div key={c.id} className="row-between" style={{ padding: '10px 4px', borderTop: '1px solid var(--line)', gap: 12 }}>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{c.nombre}</span>
              <span className="t-meta">{fmt(saldo.get(c.id) ?? 0)}</span>
            </span>
            <Switch label={`${c.nombre} cuenta para el mes`} on={cuentaParaElMes(c)} onChange={(on) => db.cuentas.update(c.id, { paraElMes: on })} />
          </div>
        ))
      ) : (
        <div className="t-note" style={{ padding: '8px 4px 20px' }}>
          Todavía no tienes cuentas en Mi plata.
        </div>
      )}
    </Sheet>
  );
}

// ---------- Pantalla: cierre del ciclo ----------

export function CierrePantalla() {
  const d = useDatos();
  const aj = useAjustes();
  const { back, backLabel, push, tab } = useNav();
  const toast = useToast();
  const hoy = todayISO();
  const [aportados, setAportados] = useState<Set<string>>(new Set());
  if (!d || !aj.cargado) return <div className="scroll" />;
  const c = cicloAnterior(d.recurrentes, hoy);
  const r = resumenCiclo(c, d);
  const cerrado = !!aj.ultimoCierre && aj.ultimoCierre >= c.inicio;
  const actual = cicloActual(d.recurrentes, hoy);

  const detectados = aj.correo ? d.detectados.filter((x) => x.estado === 'pendiente').length : 0;
  const porConfirmar = d.pendientes.length;
  const credito = d.medios.filter((m) => m.tipo === 'credito' && !m.archivado);
  const sinCuadrar = d.cuentas
    .filter(cuentaParaElMes)
    .map((cu) => ({ cu, ultimo: d.movAhorro.filter((m) => m.cuentaId === cu.id && m.tipo === 'cuadre').reduce((u, m) => (m.fecha > u ? m.fecha : u), '') }))
    .filter((x) => !x.ultimo || daysBetween(x.ultimo, hoy) > 20);
  const tareas: { id: string; titulo: string; sub: string; ir: () => void }[] = [
    ...(r.sinCategoria ? [{ id: 'cat', titulo: plural(r.sinCategoria, 'gasto sin categoría', 'gastos sin categoría'), sub: 'Así Tendencias y los presupuestos dicen la verdad.', ir: () => tab('/gastos?cat=none') }] : []),
    ...(detectados ? [{ id: 'det', titulo: plural(detectados, 'cobro del correo por confirmar', 'cobros del correo por confirmar'), sub: 'Anótalos o descártalos.', ir: () => push('/correo') }] : []),
    ...(porConfirmar ? [{ id: 'rec', titulo: plural(porConfirmar, 'recurrente por confirmar', 'recurrentes por confirmar'), sub: 'Pon el monto real de la luz, los gastos comunes…', ir: () => tab('/recurrentes') }] : []),
    ...(credito.length ? [{ id: 'tar', titulo: 'Cruza la cartola de tus tarjetas', sub: 'Importa el Excel del banco y ves si cuadra con lo anotado.', ir: () => push('/importar') }] : []),
    ...(sinCuadrar.length === 1
      ? [
          {
            id: 'cu',
            titulo: `Cuadra ${sinCuadrar[0].cu.nombre}`,
            sub: sinCuadrar[0].ultimo ? `El último cuadre fue hace ${daysBetween(sinCuadrar[0].ultimo, hoy)} días.` : 'Todavía no la cuadras con el banco.',
            ir: () => push(`/cuenta/${sinCuadrar[0].cu.id}`),
          },
        ]
      : sinCuadrar.length > 1
        ? [{ id: 'cu', titulo: `Cuadra ${sinCuadrar.length} cuentas con el banco`, sub: `${juntarY(sinCuadrar.map((x) => x.cu.nombre))}: hace más de 20 días sin cuadrar.`, ir: () => tab('/plata') }]
        : []),
  ];
  const metas = d.metas.map((m) => avanceMeta(m, d.cuentas, d.movCuentas, aj.indicadores, hoy)).filter((a) => !a.lograda);
  const comparacion =
    r.gastoAnterior === undefined
      ? ''
      : r.gastoReal === r.gastoAnterior
        ? 'Igual que el ciclo anterior.'
        : `${fmt(Math.abs(r.gastoReal - r.gastoAnterior))} ${r.gastoReal > r.gastoAnterior ? 'más' : 'menos'} que el ciclo anterior.`;

  return (
    <div className="scroll" style={{ padding: '4px 16px var(--safe-bottom)' }}>
      <BackButton onClick={() => back('/')} label={backLabel} />
      <h1 className="t-screen" style={{ margin: '18px 4px 8px' }}>cierre.</h1>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.4, padding: '0 4px' }}>
        {rangoCiclo(c)} · {c.sueldo ? 'de sueldo a sueldo' : 'el mes'}
        {cerrado ? ' · ya lo cerraste' : ''}
        {r.incompletoDesde ? `. Empezaste a anotar el ${fechaLbl(r.incompletoDesde)}: los números son solo desde ahí.` : ''}
      </div>

      <div style={{ ...caja, marginTop: 20 }} data-testid="cierre-numeros">
        {fila('Ingresos', r.ingresos, { color: 'var(--pos)' })}
        {fila('Gasto real', -r.gastoReal, { meta: [plural(r.nGastos, 'gasto', 'gastos'), comparacion].filter(Boolean).join(' · ') })}
        <span className="row-between" style={{ width: '100%', alignItems: 'baseline', paddingTop: 12, borderTop: '2px solid var(--ink)' }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>{r.quedo >= 0 ? 'Te quedó' : 'Gastaste de más'}</span>
          <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1, color: r.quedo >= 0 ? 'var(--pos)' : 'var(--danger)', whiteSpace: 'nowrap' }}>{fmt(Math.abs(r.quedo))}</span>
        </span>
      </div>

      <h2 className="t-section">por ordenar.</h2>
      {tareas.length ? (
        <div className="list">
          <div className="inner">
            {tareas.map((t) => (
              <button
                key={t.id}
                onClick={t.ir}
                style={{ width: '100%', border: 'none', borderTop: '1px solid var(--line)', background: 'transparent', padding: 14, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 20px', gap: 12, alignItems: 'center', textAlign: 'left', color: 'var(--ink)' }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{t.titulo}</span>
                  <span className="t-meta" style={{ lineHeight: 1.3 }}>
                    {t.sub}
                  </span>
                </span>
                <Icon name="next" size={20} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="t-note" style={{ padding: '0 4px' }}>
          Todo en orden.
        </div>
      )}

      {metas.length > 0 && (
        <>
          <h2 className="t-section">tus metas.</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {metas.map((a) => {
              const monto = a.porMes || Math.min(a.falta, Math.max(0, r.quedo));
              const hecho = aportados.has(a.meta.id);
              return (
                <div key={a.meta.id} style={{ ...caja, gap: 8 }} data-testid="meta-cierre">
                  <span className="row-between" style={{ alignItems: 'baseline' }}>
                    <span style={{ fontSize: 16, fontWeight: 800 }}>{a.meta.nombre}</span>
                    <span className="t-meta">te faltan {fmt(a.falta)}</span>
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.35 }}>
                    {a.porMes ? `Para llegar a tiempo, aparta ${fmt(a.porMes)} al mes.` : 'Sin fecha: aparta lo que puedas.'}
                    {a.cuenta ? ` Se junta en ${a.cuenta.nombre}: pásale la plata desde tu cuenta del mes.` : ''}
                  </span>
                  {a.cuenta ? (
                    <span style={{ display: 'flex' }}>
                      <button className="pill h36" onClick={() => push(`/cuenta/${a.cuenta!.id}`)}>
                        Ir a {a.cuenta.nombre}
                      </button>
                    </span>
                  ) : (
                    monto > 0 && (
                      <span style={{ display: 'flex' }}>
                        <button
                          className="pill h36"
                          aria-disabled={hecho}
                          style={hecho ? undefined : { background: 'var(--ink)', color: 'var(--bg)', border: 'none', fontWeight: 800 }}
                          onClick={async () => {
                            if (hecho) return;
                            await aportarMeta(a.meta.id, monto);
                            setAportados(new Set([...aportados, a.meta.id]));
                            toast(`Aportaste ${fmt(monto)} a ${a.meta.nombre}`);
                          }}
                        >
                          {hecho ? 'Aportado' : `Aportar ${fmt(monto)}`}
                        </button>
                      </span>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ padding: '28px 0 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          className="cta"
          onClick={async () => {
            await guardarAjustes({ ultimoCierre: [aj.ultimoCierre ?? '', c.inicio].sort()[1] });
            toast(r.quedo >= 0 ? `Ciclo cerrado · te quedó ${fmt(r.quedo)}` : 'Ciclo cerrado');
            back('/');
          }}
        >
          {cerrado ? 'Listo' : 'Cerrar el ciclo'}
        </button>
        <span className="t-meta" style={{ textAlign: 'center' }}>
          Ahora vas en el ciclo {rangoCiclo(actual)}.
        </span>
      </div>
    </div>
  );
}
