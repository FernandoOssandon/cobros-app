import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MEDIO_COLORS, db, guardarMedio, quitarMedio, type Medio, type TipoMedio } from '../db';
import { useDatos } from '../hooks';
import { dg, diaLabel, fmt, show, todayISO } from '../lib/format';
import { usoTarjeta } from '../lib/tarjetas';
import { borrarPagoTarjeta, cuadrarTarjeta } from '../tarjetas';
import { CupoTarjeta, PagarTarjetaSheet } from '../ui/tarjeta';
import { mesDe } from '../lib/resumen';
import { useNav } from '../nav';
import { Icon } from '../ui/icons';
import { BackButton, ConfirmSheet, MedioThumb, Switch, TaskHeader } from '../ui/kit';
import { tipoMedioLabel } from '../ui/rows';
import { ColorPicker } from '../ui/sheets';
import { useToast } from '../ui/toast';

export function Medios() {
  const d = useDatos();
  const { push, back, backLabel } = useNav();
  const [pagar, setPagar] = useState<Medio | null>(null);
  if (!d) return <div className="scroll" />;
  const mes = todayISO().slice(0, 7);
  const activos = d.medios.filter((m) => !m.archivado);
  return (
    <div className="scroll" style={{ padding: '4px 16px var(--safe-bottom)' }}>
      <div className="row-between">
        <BackButton onClick={() => back('/')} label={backLabel} />
        <button className="btn-o add" onClick={() => push('/medio/nuevo')}>
          <Icon name="plus" size={16} w={3} />
          Agregar
        </button>
      </div>
      <h1 className="t-screen" style={{ margin: '18px 4px 16px' }}>medios de pago.</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {activos.map((m) => {
          const total = d.imputados.filter((g) => g.medioId === m.id && g.pagador === 'yo' && mesDe(g.fecha) === mes).reduce((s, g) => s + g.total, 0);
          const cuenta = m.cuentaId ? d.cuentas.find((c) => c.id === m.cuentaId)?.nombre : undefined;
          const fila = (
            <button key={m.id} className="card" style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) auto', gap: 12, alignItems: 'center' }} onClick={() => push(`/medio/${m.id}`)}>
              <MedioThumb medio={m} w={48} h={32} r={7} />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 17, fontWeight: 700 }}>{m.nombre}</span>
                <span className="t-meta">
                  {tipoMedioLabel(m.tipo)}
                  {m.tipo === 'credito' && m.diaFacturacion ? ` · factura el ${m.diaFacturacion}` : ''}
                  {m.ultimos4 ? ` · •••• ${m.ultimos4}` : ''}
                  {cuenta && m.tipo !== 'credito' ? ` · sale de ${cuenta}` : ''}
                </span>
              </span>
              <span className="r-right" style={{ gap: 0 }}>
                <span style={{ fontSize: 17, fontWeight: 800 }}>{fmt(total)}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>este mes</span>
              </span>
            </button>
          );
          if (m.tipo !== 'credito') return fila;
          const u = usoTarjeta(m, d.gastos, d.pagosTarjeta);
          return (
            <div key={m.id} className="card" style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
              <div style={{ width: '100%' }}>{fila}</div>
              {(u.cupo || u.cuadrado || u.usado > 0) && (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px 14px' }}>
                  <CupoTarjeta m={m} d={d} compacto />
                  <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="pill h36" onClick={() => push(`/importar?medio=${m.id}`)} aria-label={`Importar movimientos de ${m.nombre}`}>
                      Importar
                    </button>
                    <button className="pill h36" onClick={() => setPagar(m)} aria-label={`Pagar ${m.nombre}`}>
                      Pagar tarjeta
                    </button>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {pagar && <PagarTarjetaSheet m={pagar} d={d} onClose={() => setPagar(null)} />}
    </div>
  );
}

const TIPOS: TipoMedio[] = ['credito', 'debito', 'efectivo', 'transferencia'];

export function MedioForm() {
  const { id } = useParams();
  const d = useDatos();
  const { back } = useNav();
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoMedio>('credito');
  const [color, setColor] = useState(MEDIO_COLORS[0]);
  const [billOn, setBillOn] = useState(true);
  const [bill, setBill] = useState(25);
  const [ultimos4, setUltimos4] = useState('');
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [cupo, setCupo] = useState('');
  const [usado, setUsado] = useState('');
  const [quitar, setQuitar] = useState(false);
  const loaded = useRef(false);
  const editing = id ? d?.medio.get(id) : undefined;

  useEffect(() => {
    if (!editing || loaded.current) return;
    loaded.current = true;
    setNombre(editing.nombre);
    setTipo(editing.tipo);
    setColor(editing.color);
    setBillOn(!!editing.diaFacturacion);
    setBill(editing.diaFacturacion ?? 25);
    setUltimos4(editing.ultimos4 ?? '');
    setCuentaId(editing.cuentaId ?? null);
    setCupo(editing.cupo ? String(editing.cupo) : '');
  }, [editing]);

  const guardar = async () => {
    if (!nombre.trim()) return toast('Ponle nombre');
    const conTarjeta = tipo === 'credito' || tipo === 'debito';
    const mid = await guardarMedio({
      id,
      nombre: nombre.trim(),
      tipo,
      color,
      diaFacturacion: tipo === 'credito' && billOn ? bill : undefined,
      ultimos4: conTarjeta && ultimos4.length === 4 ? ultimos4 : undefined,
      cuentaId: cuentaId ?? undefined,
      cupo: tipo === 'credito' && dg(cupo) ? dg(cupo) : undefined,
    });
    // "Lo usado hoy" cuadra la tarjeta con el banco (solo si se escribió algo).
    if (tipo === 'credito' && usado !== '') await cuadrarTarjeta(mid, dg(usado));
    toast(id ? 'Medio actualizado' : `${nombre.trim()} agregada`);
    back('/medios');
  };

  return (
    <div className="screen">
      <TaskHeader title={id ? 'editar medio.' : 'nuevo medio.'} onClose={() => back('/medios')} />
      <div className="scroll" style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ height: 130, flex: 'none', borderRadius: 22, background: color, border: '2px solid #0E1A12', padding: '16px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: '#0E1A12' }}>
          <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.6 }}>{nombre || 'Mi tarjeta'}</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{tipoMedioLabel(tipo)}</span>
        </div>
        <div>
          <div className="t-label">Nombre</div>
          <input className="input-big" style={{ fontSize: 18 }} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Visa BCI" maxLength={30} aria-label="Nombre" />
        </div>
        <div>
          <div className="t-label">Tipo</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TIPOS.map((k) => (
              <button key={k} className="pill h38" aria-pressed={tipo === k} onClick={() => setTipo(k)}>
                {tipoMedioLabel(k)}
              </button>
            ))}
          </div>
        </div>
        {(tipo === 'credito' || tipo === 'debito') && (
          <div>
            <div className="t-label">Últimos 4 dígitos (opcional)</div>
            <input
              className="input-big"
              style={{ fontSize: 18, letterSpacing: 2 }}
              value={ultimos4}
              onChange={(e) => setUltimos4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="1234"
              inputMode="numeric"
              aria-label="Últimos 4 dígitos"
            />
            <div className="t-meta" style={{ padding: '6px 4px 0' }}>Para reconocer la tarjeta en los correos del banco.</div>
          </div>
        )}
        {d && (
          <div>
            <div className="t-label">{tipo === 'credito' ? 'Se paga desde' : tipo === 'efectivo' ? 'Es la plata de' : 'Sale de la cuenta'}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {d.cuentas
                .filter((c) => !c.archivada && c.tipo !== 'dap' && !c.moneda)
                .map((c) => (
                  <button key={c.id} className="pill h38" aria-pressed={cuentaId === c.id} onClick={() => setCuentaId(c.id)}>
                    {c.nombre}
                  </button>
                ))}
              <button className="pill h38" aria-pressed={cuentaId === null} onClick={() => setCuentaId(null)}>
                Ninguna
              </button>
            </div>
            <div className="t-meta" style={{ padding: '6px 4px 0', lineHeight: 1.35 }}>
              {tipo === 'credito'
                ? 'La cuenta que aparece primero al pagar la tarjeta.'
                : 'Lo que pagas con este medio baja el saldo estimado de esa cuenta en Mi plata.'}
            </div>
          </div>
        )}
        {tipo === 'credito' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="t-label" style={{ padding: '0 4px' }}>Cupo</span>
              <input className="input-big" style={{ fontSize: 18 }} value={cupo ? `$${show(cupo)}` : ''} onChange={(e) => setCupo(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="$0" inputMode="numeric" aria-label="Cupo" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="t-label" style={{ padding: '0 4px' }}>Usado hoy</span>
              <input
                className="input-big"
                style={{ fontSize: 18 }}
                value={usado !== '' ? `$${show(usado)}` : ''}
                onChange={(e) => setUsado(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder={editing ? `$${show(String(usoTarjeta(editing, d?.gastos ?? [], d?.pagosTarjeta ?? []).usado))}` : '$0'}
                inputMode="numeric"
                aria-label="Usado hoy"
              />
            </label>
            <div className="t-meta" style={{ gridColumn: '1 / -1', padding: '0 4px', lineHeight: 1.35 }}>
              "Usado hoy" es el cupo utilizado que muestra tu banco. Desde ahí la app suma tus compras y resta los pagos.
            </div>
          </div>
        )}
        <div>
          <div className="t-label">Color</div>
          <ColorPicker colors={MEDIO_COLORS} value={color} onChange={setColor} />
        </div>
        {tipo === 'credito' && (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="row-between" style={{ padding: '0 4px' }}>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>Día de facturación</span>
                <span className="t-meta">Opcional. El resumen muestra el período.</span>
              </span>
              <Switch label="Día de facturación" on={billOn} onChange={setBillOn} />
            </div>
            {billOn && (
              <div className="row-between" style={{ padding: '0 4px' }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>Factura el día</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button className="btn-round" onClick={() => setBill((x) => Math.max(1, x - 1))} aria-label="Día anterior">
                    −
                  </button>
                  <span style={{ fontSize: 22, fontWeight: 800, minWidth: 28, textAlign: 'center' }}>{bill}</span>
                  <button className="btn-round" onClick={() => setBill((x) => Math.min(31, x + 1))} aria-label="Día siguiente">
                    +
                  </button>
                </span>
              </div>
            )}
          </div>
        )}
        {editing?.tipo === 'credito' && d && d.pagosTarjeta.some((p) => p.medioId === editing.id) && (
          <div>
            <div className="t-label">Pagos anotados (toca para quitar)</div>
            <div className="list">
              <div className="inner">
                {d.pagosTarjeta
                  .filter((p) => p.medioId === editing.id)
                  .slice(0, 12)
                  .map((p) => (
                    <button
                      key={p.id}
                      className="mov-row"
                      style={{ padding: '12px 14px' }}
                      onClick={async () => {
                        const copia = await borrarPagoTarjeta(p.id);
                        toast('Pago quitado', copia && { label: 'Deshacer', run: () => void db.pagosTarjeta.put(copia) });
                      }}
                    >
                      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: 16, fontWeight: 700 }}>Pago</span>
                        <span className="t-meta">
                          {diaLabel(p.fecha)}
                          {p.cuentaId ? ` · desde ${d.cuentas.find((c) => c.id === p.cuentaId)?.nombre ?? ''}` : ''}
                        </span>
                      </span>
                      <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--pos)' }}>{fmt(p.monto)}</span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
        {id && (
          <button className="btn-text" style={{ color: 'var(--danger)', alignSelf: 'flex-start' }} onClick={() => setQuitar(true)}>
            Quitar este medio
          </button>
        )}
      </div>
      <div className="foot">
        <button className="cta" onClick={guardar}>
          Guardar medio
        </button>
      </div>
      {quitar && editing && (
        <ConfirmSheet
          title={`¿Quitamos ${editing.nombre}?`}
          body="Deja de aparecer al anotar gastos. Los gastos que ya tiene se quedan como están."
          confirm="Sí, quitar"
          onClose={() => setQuitar(false)}
          onConfirm={async () => {
            await quitarMedio(editing.id);
            toast(`${editing.nombre} quitada`);
            back('/medios');
          }}
        />
      )}
    </div>
  );
}
