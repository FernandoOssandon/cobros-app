// Hojas inferiores compartidas: por confirmar, nueva persona y categoría.
import { useState } from 'react';
import { CAT_COLORS, ICONOS_CATEGORIA, crearPersona, guardarCategoria, type Categoria, type Pendiente, type Recurrente } from '../db';
import { confirmarPendiente, mesNombre, saltarPendiente } from '../recurrentes';
import { elegirContacto, puedeElegirContacto } from '../lib/contacts';
import { dg, firstName, fmt, pressKey, show } from '../lib/format';
import { IC, Icon, Svg } from './icons';
import { Keypad, Sheet } from './kit';
import { useToast } from './toast';

/** "Luz de noviembre: ¿cuánto llegó?" */
export function PorConfirmarSheet({ p, r, onClose }: { p: Pendiente; r: Recurrente; onClose: () => void }) {
  const toast = useToast();
  const [amt, setAmt] = useState('');
  const monto = dg(amt);
  const previo = r.ultimoConfirmado && r.monto > 0 ? `En ${mesNombre(r.ultimoConfirmado)} llegaron ${fmt(r.monto)}` : 'Primera vez que lo anotas';
  const confirmar = async () => {
    if (!monto) {
      toast('Ingresa cuánto llegó');
      return;
    }
    await confirmarPendiente(p.id, monto);
    onClose();
    toast(`${r.nombre} anotada · ${fmt(monto)}`);
  };
  return (
    <Sheet onClose={onClose} label="Por confirmar">
      <div className="t-question" style={{ padding: '16px 4px 0' }}>
        {r.nombre} de {mesNombre(p.fecha)}:
        <br />
        ¿cuánto llegó?
      </div>
      <div className="t-hero-64" style={{ padding: '10px 4px 0', color: amt ? 'var(--ink)' : 'var(--muted)' }}>${show(amt) || '0'}</div>
      <div className="row-between" style={{ padding: '4px 4px 8px' }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>{previo}</span>
        {r.ultimoConfirmado && r.monto > 0 && (
          <button className="pill" style={{ height: 34, borderRadius: 17, padding: '0 12px', fontSize: 13 }} onClick={() => setAmt(String(r.monto))}>
            Usar ese monto
          </button>
        )}
      </div>
      <Keypad h={46} onKey={(k) => setAmt((v) => pressKey(v, k))} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 8, marginTop: 8 }}>
        <button
          className="btn-line"
          style={{ fontSize: 15 }}
          onClick={async () => {
            await saltarPendiente(p.id);
            onClose();
            toast('Listo, este mes no se anota');
          }}
        >
          Saltar este mes
        </button>
        <button className="cta" style={{ fontSize: 17 }} aria-disabled={!monto} onClick={confirmar}>
          Confirmar
        </button>
      </div>
    </Sheet>
  );
}

/** "+ Persona": elegir de contactos (Android) o escribir nombre y teléfono. */
export function NuevaPersonaSheet({ onClose, onCreada }: { onClose: () => void; onCreada?: (id: string) => void }) {
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  const [tel, setTel] = useState('');
  const contactos = puedeElegirContacto();
  const guardar = async (n = nombre, t = tel) => {
    if (!n.trim()) {
      toast('Falta el nombre');
      return;
    }
    const id = await crearPersona(n, t);
    onClose();
    toast(`${firstName(n)} quedó agregada a la lista`);
    onCreada?.(id);
  };
  return (
    <Sheet onClose={onClose} label="Nueva persona" style={{ gap: 10 }}>
      <div className="sheet-title" style={{ padding: '12px 4px 4px' }}>nueva persona.</div>
      {contactos && (
        <>
          <button
            className="btn-line"
            style={{ height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
            onClick={async () => {
              const c = await elegirContacto();
              if (c?.nombre) {
                setNombre(c.nombre);
                setTel(c.telefono);
                toast('Contacto elegido');
              }
            }}
          >
            <Icon name="contacts" size={20} w={2.2} />
            Elegir de contactos
          </button>
          <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--muted)', padding: '4px 0' }}>o escríbela</div>
        </>
      )}
      <input className="input-big" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" maxLength={40} aria-label="Nombre" />
      <input className="input-big" style={{ fontWeight: 600 }} value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" type="tel" placeholder="+56 9 1234 5678" aria-label="Teléfono" />
      <button className="cta" style={{ marginTop: 6 }} onClick={() => guardar()}>
        Agregar persona
      </button>
    </Sheet>
  );
}

/** Crear o editar una categoría: nombre, 8 íconos y 6 colores. */
export function CategoriaSheet({ cat, onClose }: { cat?: Categoria; onClose: () => void }) {
  const toast = useToast();
  const [nombre, setNombre] = useState(cat?.nombre ?? '');
  const [icono, setIcono] = useState(cat?.icono ?? 'regalo');
  const [color, setColor] = useState(cat?.color ?? CAT_COLORS[0]);
  const guardar = async () => {
    if (!nombre.trim()) {
      toast('Falta el nombre');
      return;
    }
    await guardarCategoria({ id: cat?.id, nombre: nombre.trim(), icono, color });
    onClose();
    toast(cat ? 'Categoría actualizada' : 'Categoría creada');
  };
  return (
    <Sheet onClose={onClose} label="Categoría" style={{ gap: 14 }}>
      <div className="sheet-title" style={{ padding: '8px 4px 0' }}>{cat ? 'editar categoría.' : 'nueva categoría.'}</div>
      <input className="input-big" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" maxLength={24} aria-label="Nombre" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        {ICONOS_CATEGORIA.map((k) => (
          <button key={k} className="pill" style={{ height: 52, borderRadius: 26 }} aria-pressed={icono === k} aria-label={k} onClick={() => setIcono(k)}>
            <Svg d={IC[k]} size={22} w={2} />
          </button>
        ))}
      </div>
      <ColorPicker colors={CAT_COLORS} value={color} onChange={setColor} />
      <button className="cta" onClick={guardar}>
        Guardar categoría
      </button>
    </Sheet>
  );
}

export const ColorPicker = ({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) => (
  <div style={{ display: 'flex', gap: 10 }} role="radiogroup" aria-label="Color">
    {colors.map((c) => (
      <button
        key={c}
        role="radio"
        aria-checked={value === c}
        aria-label={c}
        onClick={() => onChange(c)}
        style={{ width: 44, height: 44, borderRadius: 22, border: `3px solid ${value === c ? 'var(--ink)' : 'transparent'}`, background: 'transparent', padding: 3 }}
      >
        <span style={{ display: 'block', width: '100%', height: '100%', borderRadius: '50%', background: c }} />
      </button>
    ))}
  </div>
);
