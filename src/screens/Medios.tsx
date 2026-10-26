import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MEDIO_COLORS, guardarMedio, quitarMedio, type TipoMedio } from '../db';
import { useDatos } from '../hooks';
import { fmt, todayISO } from '../lib/format';
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
          const total = d.gastos.filter((g) => g.medioId === m.id && g.pagador === 'yo' && mesDe(g.fecha) === mes).reduce((s, g) => s + g.total, 0);
          return (
            <button key={m.id} className="card" style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) auto', gap: 12, alignItems: 'center' }} onClick={() => push(`/medio/${m.id}`)}>
              <MedioThumb medio={m} w={48} h={32} r={7} />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 17, fontWeight: 700 }}>{m.nombre}</span>
                <span className="t-meta">
                  {tipoMedioLabel(m.tipo)}
                  {m.tipo === 'credito' && m.diaFacturacion ? ` · factura el ${m.diaFacturacion}` : ''}
                </span>
              </span>
              <span className="r-right" style={{ gap: 0 }}>
                <span style={{ fontSize: 17, fontWeight: 800 }}>{fmt(total)}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>este mes</span>
              </span>
            </button>
          );
        })}
      </div>
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
  }, [editing]);

  const guardar = async () => {
    if (!nombre.trim()) return toast('Ponle nombre');
    await guardarMedio({ id, nombre: nombre.trim(), tipo, color, diaFacturacion: tipo === 'credito' && billOn ? bill : undefined });
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
