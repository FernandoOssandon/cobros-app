// Ingresos: el sueldo (fijo cada mes) y lo que entra suelto (una venta, una pega, un reembolso).
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { asegurarEfectivo, ID_EFECTIVO } from '../ahorros';
import { db } from '../db';
import { useDatos, type Datos } from '../hooks';
import { borrarIngreso, cuentasDestino, guardarIngreso, restaurarIngreso, tipoPorNombre } from '../ingresos';
import { dg, diaLabel, fmt, mesLargo, shortDate, show, sumarMes, todayISO } from '../lib/format';
import { diaDeIngreso, ingresosMes } from '../lib/ingresosMes';
import { describirFrecuencia, sumarDias } from '../lib/recurrence';
import { useNav } from '../nav';
import { borrarRecurrente, generarRecurrentes, guardarRecurrente } from '../recurrentes';
import { Icon } from '../ui/icons';
import { BackButton, ConfirmSheet, DateInputPill, TaskHeader } from '../ui/kit';
import { PorConfirmarSheet } from '../ui/sheets';
import { useToast } from '../ui/toast';
import { IconoIngreso } from '../ui/ingreso';

const nombreCuenta = (d: Datos, id?: string) => (id ? d.cuentas.find((c) => c.id === id)?.nombre ?? (id === ID_EFECTIVO ? 'Efectivo' : undefined) : undefined);

export function Ingresos() {
  const d = useDatos();
  const { push, back, backLabel } = useNav();
  const [confirmando, setConfirmando] = useState<string | null>(null);
  if (!d) return <div className="scroll" />;
  const hoy = todayISO();
  const mes = hoy.slice(0, 7);
  const im = ingresosMes(mes, d.ingresos, d.recurrentes, d.pendientes, hoy);
  const gastoReal = d.imputados.filter((g) => g.fecha.startsWith(mes)).reduce((s, g) => s + g.miParte, 0);
  const quedan = im.total - gastoReal;
  const hay = im.fijos.length > 0 || d.ingresos.length > 0;
  const confirmP = confirmando ? d.pendientes.find((p) => p.id === confirmando) : undefined;
  const confirmR = confirmP ? d.recurrentes.find((r) => r.id === confirmP.recurrenteId) : undefined;

  return (
    <div className="scroll" style={{ padding: '4px 16px var(--safe-bottom)' }}>
      <div className="row-between">
        <BackButton onClick={() => back('/')} label={backLabel} />
        {hay && (
          <button className="btn-o add" onClick={() => push('/ingreso/nuevo')}>
            <Icon name="plus" size={16} w={3} />
            Ingreso
          </button>
        )}
      </div>
      <h1 className="t-screen" style={{ margin: '18px 4px 4px' }}>ingresos.</h1>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)', padding: '0 4px' }}>{mesLargo(mes)}</div>
      {hay ? (
        <>
          <div style={{ padding: '20px 4px 0' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)' }}>Te entró este mes</div>
            <div className="t-hero-60" style={{ lineHeight: 0.95, letterSpacing: -2.8, marginTop: 6 }}>{fmt(im.total)}</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 10, lineHeight: 1.35, color: quedan >= 0 ? 'var(--pos)' : 'var(--danger)' }}>
              {quedan >= 0 ? `Te quedan ${fmt(quedan)} después de tu gasto real de ${fmt(gastoReal)}.` : `Gastaste ${fmt(-quedan)} más de lo que entró.`}
            </div>
          </div>
          {im.fijos.length > 0 && (
            <>
              <h2 className="t-section">fijos.</h2>
              <div className="list">
                <div className="inner">
                  {im.fijos.map((f) => {
                    const cuenta = nombreCuenta(d, f.r.cuentaId);
                    const variable = f.r.montoTipo === 'variable';
                    const [st, stColor] =
                      f.estado === 'llego'
                        ? [`llegó el ${shortDate(f.fecha!)}`, 'var(--muted)']
                        : f.estado === 'confirmar'
                          ? ['por confirmar', 'var(--owe)']
                          : f.estado === 'llega'
                            ? [`llega el ${shortDate(f.fecha!)}`, 'var(--muted)']
                            : ['terminado', 'var(--muted)'];
                    const monto = f.estado === 'llego' ? f.monto : variable ? undefined : f.r.monto;
                    return (
                      <button key={f.r.id} className="list-row" onClick={() => (f.pendienteId ? setConfirmando(f.pendienteId) : push(`/ingreso/fijo/${f.r.id}`))}>
                        <IconoIngreso fijo />
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 16, fontWeight: 700 }}>{f.r.nombre}</span>
                          <span className="t-meta" style={{ lineHeight: 1.3 }}>
                            {describirFrecuencia(f.r.frecuencia, f.r.inicio)}
                            {cuenta ? ` · llega a ${cuenta}` : ''}
                          </span>
                        </span>
                        <span className="r-right">
                          {monto !== undefined ? (
                            <span className="r-amt" style={{ color: 'var(--pos)' }}>+{fmt(monto)}</span>
                          ) : (
                            <span className="badge" style={{ height: 22, padding: '0 9px', borderRadius: 11, fontSize: 12, color: 'var(--ink)' }}>
                              variable
                            </span>
                          )}
                          <span style={{ fontSize: 12, fontWeight: 700, color: stColor, whiteSpace: 'nowrap' }}>{st}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
          <h2 className="t-section">sueltos.</h2>
          {im.sueltos.length > 0 ? (
            <div className="list">
              <div className="inner">
                {im.sueltos.map((i) => {
                  const cuenta = nombreCuenta(d, i.cuentaId);
                  return (
                    <button key={i.id} className="list-row" onClick={() => push(`/ingreso/${i.id}`)}>
                      <IconoIngreso fijo={false} />
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span className="r-title">{i.descripcion}</span>
                        <span className="t-meta">
                          {diaLabel(i.fecha)}
                          {cuenta ? ` · ${cuenta}` : ''}
                        </span>
                      </span>
                      <span className="r-amt" style={{ color: 'var(--pos)' }}>+{fmt(i.monto)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ padding: '0 4px', fontSize: 16, fontWeight: 600, color: 'var(--muted)', lineHeight: 1.35 }}>Nada suelto este mes. Una venta, una pega o un reembolso van acá.</div>
          )}
        </>
      ) : (
        <div style={{ padding: '40px 4px 0' }}>
          <div className="t-display">
            Nada
            <br />
            entró.
          </div>
          <p className="t-body-muted">Anota tu sueldo como ingreso fijo y lo que te llegue aparte como suelto: una venta, una pega, un reembolso.</p>
          <button className="cta" style={{ marginTop: 26 }} onClick={() => push('/ingreso/nuevo?sueldo=1')}>
            Agregar sueldo
          </button>
        </div>
      )}
      {confirmP && confirmR && <PorConfirmarSheet p={confirmP} r={confirmR} onClose={() => setConfirmando(null)} />}
    </div>
  );
}

// ---------- Nuevo / editar ingreso ----------

type Clase = 'fijo' | 'suelto';
type Fecha = 'hoy' | 'ayer' | 'otro';
const NINGUNA = 'ninguna';

const pad = (n: number) => String(n).padStart(2, '0');
const ultimoDia = (mes: string) => Number(sumarDias(`${sumarMes(mes, 1)}-01`, -1).slice(8, 10));

export function IngresoForm() {
  const { id, rid } = useParams();
  const [params] = useSearchParams();
  const d = useDatos();
  const { back } = useNav();
  const toast = useToast();
  const hoy = todayISO();
  const detId = params.get('det');
  const [clase, setClase] = useState<Clase>(params.get('tipo') === 'suelto' || detId ? 'suelto' : 'fijo');
  const [nombre, setNombre] = useState(params.get('sueldo') ? 'Sueldo' : '');
  const [variable, setVariable] = useState(false);
  const [amt, setAmt] = useState('');
  const [dia, setDia] = useState(30);
  const [desc, setDesc] = useState('');
  const [fechaOp, setFechaOp] = useState<Fecha>('hoy');
  const [fecha, setFecha] = useState(hoy);
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [borrar, setBorrar] = useState(false);
  const [cargado, setCargado] = useState(false);

  const ingreso = id ? d?.ingresos.find((i) => i.id === id) : undefined;
  const fijo = rid ? d?.recurrentes.find((r) => r.id === rid && r.tipo === 'ingreso') : undefined;
  const det = detId ? d?.detectados.find((x) => x.id === detId) : undefined;
  const editando = !!(id || rid);

  // Precarga (una vez, cuando llegan los datos).
  useEffect(() => {
    if (!d || cargado) return;
    const destinos = cuentasDestino(d.cuentas);
    const porDefecto = destinos.length > 1 ? destinos[0].id : NINGUNA;
    const elegirFecha = (f: string) => {
      setFecha(f);
      setFechaOp(f === hoy ? 'hoy' : f === sumarDias(hoy, -1) ? 'ayer' : 'otro');
    };
    if (ingreso) {
      setClase('suelto');
      setAmt(String(ingreso.monto));
      setDesc(ingreso.descripcion);
      elegirFecha(ingreso.fecha);
      setCuenta(ingreso.cuentaId ?? NINGUNA);
    } else if (fijo) {
      setClase('fijo');
      setNombre(fijo.nombre);
      setVariable(fijo.montoTipo === 'variable');
      setAmt(fijo.montoTipo === 'fijo' ? String(fijo.monto) : '');
      setDia(diaDeIngreso(fijo));
      setCuenta(fijo.cuentaId ?? NINGUNA);
    } else if (det) {
      setAmt(String(det.monto));
      setDesc(`Transferencia de ${det.comercio}`);
      elegirFecha(det.fecha);
      setCuenta(porDefecto);
    } else if (id || rid || detId) {
      return; // todavía no aparece (o no existe)
    } else setCuenta(porDefecto);
    setCargado(true);
  }, [d, cargado, ingreso, fijo, det, id, rid, detId, hoy]);

  if (!d) return <div className="screen" />;
  const destinos = cuentasDestino(d.cuentas);
  const cuentaId = cuenta && cuenta !== NINGUNA ? cuenta : undefined;
  const destino = destinos.find((c) => c.id === cuentaId)?.nombre;
  const monto = dg(amt);
  const esFijo = clase === 'fijo';
  const ok = esFijo ? !!nombre.trim() && (variable || monto > 0) : monto > 0;
  const fechaSuelto = fechaOp === 'hoy' ? hoy : fechaOp === 'ayer' ? sumarDias(hoy, -1) : fecha;
  const ayuda = esFijo
    ? `${variable ? 'Cuando llegue te pregunto cuánto fue.' : `Se anota solo cada mes, el día ${dia}.`} ${destino ? `Suma a ${destino} y a tus ingresos del mes.` : 'Suma a tus ingresos del mes.'}`
    : `Suma ${fmt(monto)} ${destino ? `a ${destino}` : 'a tus ingresos del mes'}. No es gasto ni aparece en Gastos.`;

  const guardar = async () => {
    if (esFijo && !nombre.trim()) return toast('Ponle nombre');
    if (!variable || !esFijo) if (!monto) return toast('Falta el monto');
    if (cuentaId === ID_EFECTIVO) await asegurarEfectivo();
    if (esFijo) {
      const mes = hoy.slice(0, 7);
      await guardarRecurrente({
        id: rid,
        nombre: nombre.trim(),
        tipo: 'ingreso',
        montoTipo: variable ? 'variable' : 'fijo',
        monto: variable ? fijo?.monto ?? 0 : monto,
        frecuencia: { unidad: 'mes', cada: 1, dia },
        // El de este mes: si el día ya pasó, se anota ahora (o queda por confirmar si es variable).
        inicio: fijo?.inicio ?? `${mes}-${pad(Math.min(dia, ultimoDia(mes)))}`,
        cuentaId,
      });
      await generarRecurrentes();
      toast(rid ? 'Ingreso actualizado' : variable ? 'Listo. Te pregunto el monto cada mes.' : `Listo. ${nombre.trim()} se anota solo el día ${dia}.`);
    } else {
      const descripcion = desc.trim() || 'Ingreso';
      const iid = await guardarIngreso({
        id: ingreso?.id,
        descripcion,
        tipo: ingreso?.tipo ?? tipoPorNombre(descripcion),
        monto,
        fecha: fechaSuelto,
        cuentaId,
        recurrenteId: ingreso?.recurrenteId,
        detectadoId: ingreso?.detectadoId ?? det?.id,
      });
      if (det && det.estado === 'pendiente') await db.detectados.update(det.id, { estado: 'anotado', ingresoId: iid });
      toast(ingreso ? 'Ingreso actualizado' : `Ingreso anotado · +${fmt(monto)}${destino ? ` en ${destino}` : ''}`);
    }
    back('/ingresos');
  };

  const titulo = editando ? 'editar ingreso.' : 'nuevo ingreso.';
  return (
    <div className="screen">
      <TaskHeader title={titulo} onClose={() => back('/ingresos')} />
      <div className="scroll" style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!editando && (
          <div className="seg">
            <button className="pill grow" style={{ fontSize: 15 }} aria-pressed={esFijo} onClick={() => setClase('fijo')}>
              Fijo cada mes
            </button>
            <button className="pill grow" style={{ fontSize: 15 }} aria-pressed={!esFijo} onClick={() => setClase('suelto')}>
              Suelto
            </button>
          </div>
        )}
        {esFijo ? (
          <>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="¿Cómo se llama?"
              aria-label="Nombre"
              maxLength={40}
              style={{ height: 56, border: 'none', borderBottom: '2px solid var(--ink)', background: 'transparent', fontSize: 30, fontWeight: 800, letterSpacing: -1, padding: '0 4px' }}
            />
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
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, height: 60, marginTop: 10, padding: '0 18px', borderRadius: 30, border: '2px solid var(--ink)', fontSize: 30, fontWeight: 800, letterSpacing: -1, color: amt ? 'var(--ink)' : 'var(--muted)' }}>
                  <span>$</span>
                  <input
                    value={show(amt)}
                    onChange={(e) => setAmt(e.target.value.replace(/\D/g, '').slice(0, 9))}
                    inputMode="numeric"
                    placeholder="0"
                    aria-label="Monto"
                    style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontSize: 30, fontWeight: 800, letterSpacing: -1, padding: 0, color: 'inherit' }}
                  />
                </label>
              ) : (
                <div style={{ marginTop: 10, fontSize: 15, fontWeight: 600, color: 'var(--muted)', padding: '0 4px' }}>Cada mes te pregunto cuánto llegó.</div>
              )}
            </div>
            <div className="row-between" style={{ padding: '0 4px' }}>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>Llega el día</span>
                <span className="t-meta">de cada mes</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn-round" style={{ fontWeight: 800, fontSize: 18 }} onClick={() => setDia((x) => Math.max(1, x - 1))} aria-label="Día anterior">
                  −
                </button>
                <span style={{ fontSize: 22, fontWeight: 800, minWidth: 28, textAlign: 'center' }} aria-label="Día del mes">
                  {dia}
                </span>
                <button className="btn-round" style={{ fontWeight: 800, fontSize: 18 }} onClick={() => setDia((x) => Math.min(31, x + 1))} aria-label="Día siguiente">
                  +
                </button>
              </span>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="t-label">Monto</div>
              <label className="amt-line" style={{ color: amt ? 'var(--ink)' : 'var(--muted)' }}>
                <span>$</span>
                <input value={show(amt)} onChange={(e) => setAmt(e.target.value.replace(/\D/g, '').slice(0, 9))} inputMode="numeric" placeholder="0" aria-label="Monto" />
              </label>
            </div>
            <div>
              <div className="t-label">¿De qué fue?</div>
              <input className="input-big" style={{ fontSize: 17 }} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej.: venta, pega, reembolso" aria-label="¿De qué fue?" maxLength={60} />
            </div>
            <div>
              <div className="t-label">Fecha</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="pill" aria-pressed={fechaOp === 'hoy'} onClick={() => setFechaOp('hoy')}>
                  Hoy
                </button>
                <button className="pill" aria-pressed={fechaOp === 'ayer'} onClick={() => setFechaOp('ayer')}>
                  Ayer
                </button>
                <DateInputPill
                  value={fecha}
                  label={fechaOp === 'otro' ? shortDate(fecha) : 'Otro día'}
                  on={fechaOp === 'otro'}
                  onChange={(v) => {
                    setFecha(v);
                    setFechaOp('otro');
                  }}
                />
              </div>
            </div>
          </>
        )}
        <div>
          <div className="t-label">Llega a</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {destinos.map((c) => (
              <button key={c.id} className="pill" aria-pressed={cuenta === c.id} onClick={() => setCuenta(c.id)}>
                {c.nombre}
              </button>
            ))}
            <button className="pill" aria-pressed={cuenta === NINGUNA} onClick={() => setCuenta(NINGUNA)}>
              Ninguna
            </button>
          </div>
        </div>
        <div className="help-soft">{ayuda}</div>
        {editando && (
          <button className="btn-text" style={{ color: 'var(--danger)' }} onClick={() => setBorrar(true)}>
            Borrar ingreso
          </button>
        )}
      </div>
      <div className="foot">
        <button className="cta" aria-disabled={!ok} onClick={guardar}>
          Guardar ingreso
        </button>
      </div>
      {borrar && (fijo || ingreso) && (
        <ConfirmSheet
          title={fijo ? '¿Borramos este ingreso fijo?' : '¿Borramos este ingreso?'}
          body={fijo ? `${fijo.nombre} deja de anotarse. Lo que ya llegó se queda en tus ingresos.` : `${ingreso!.descripcion} · ${fmt(ingreso!.monto)}. También se quita de ${nombreCuenta(d, ingreso!.cuentaId) ?? 'tus ingresos'}.`}
          confirm="Sí, borrar"
          onClose={() => setBorrar(false)}
          onConfirm={async () => {
            setBorrar(false);
            if (fijo) {
              await borrarRecurrente(fijo.id);
              toast('Ingreso fijo borrado');
            } else {
              const copia = await borrarIngreso(ingreso!.id);
              toast('Ingreso borrado', copia && { label: 'Deshacer', run: () => void restaurarIngreso(copia) });
            }
            back('/ingresos');
          }}
        />
      )}
    </div>
  );
}
