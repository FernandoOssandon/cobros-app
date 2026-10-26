import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { guardarPago } from '../db';
import { useDatos } from '../hooks';
import { dg, fmt, pressKey, shortDate, show, todayISO } from '../lib/format';
import { useNav } from '../nav';
import { CloseButton, DateInputPill, Keypad } from '../ui/kit';
import { useToast } from '../ui/toast';

const VIAS = ['Transferencia', 'Efectivo'];

export default function Pay() {
  const { id = '', movId } = useParams();
  const { back } = useNav();
  const toast = useToast();
  const d = useDatos();
  const [pay, setPay] = useState('');
  const [via, setVia] = useState('Transferencia');
  const [fecha, setFecha] = useState(todayISO());
  const loaded = useRef(false);
  const v = d?.persona.get(id);
  const editing = movId ? v?.movs.find((m) => m.id === movId) : undefined;

  useEffect(() => {
    if (!editing || loaded.current) return;
    loaded.current = true;
    setPay(String(editing.monto));
    setVia(editing.detalle);
    setFecha(editing.fecha);
  }, [editing]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPay((p) => pressKey(p, e.key));
      else if (e.key === 'Backspace') setPay((p) => pressKey(p, '⌫'));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  if (!v) return <div className="screen" />;

  // Sentido: si la persona te debe (o están a mano) registras lo que te pagó; si tú le debes, lo que le pagaste.
  const dir: 'pago' | 'abono' = editing ? (editing.tipo === 'abono' ? 'abono' : 'pago') : v.saldo < 0 ? 'abono' : 'pago';
  const signo = dir === 'pago' ? 1 : -1;
  // Al editar, el saldo "antes" no considera el pago que se está editando.
  const owe = Math.max(0, signo * v.saldo + (editing?.monto ?? 0));
  const pa = dg(pay);
  const cerrar = () => back(`/persona/${id}`);
  const guardar = async () => {
    if (!pa) {
      toast('Ingresa el monto');
      return;
    }
    await guardarPago(id, pa, via, fecha, movId, dir);
    toast(movId ? 'Pago actualizado' : `Pago de ${fmt(pa)} registrado`);
    cerrar();
  };

  return (
    <div className="screen">
      <div style={{ flex: 'none', padding: '2px 16px' }}>
        <CloseButton onClick={cerrar} />
      </div>
      <div className="scroll" style={{ padding: '18px 20px 0' }}>
        <h1 className="t-question">{dir === 'pago' ? `¿Cuánto te pagó ${v.first}?` : `¿Cuánto le pagaste a ${v.first}?`}</h1>
        <div className="t-hero-72" style={{ marginTop: 20, color: pay ? 'var(--ink)' : undefined }} aria-label="Monto">
          ${show(pay) || '0'}
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)' }}>
          {owe
            ? `${dir === 'pago' ? 'Te debe' : 'Le debes'} ${fmt(owe)} · queda ${fmt(Math.max(owe - pa, 0))}${pa > owe ? ` (+${fmt(pa - owe)} a favor)` : ''}`
            : 'Están a mano'}
        </div>
        {owe > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="pill h38" onClick={() => setPay(String(owe))}>
              Todo · {fmt(owe)}
            </button>
            <button className="pill h38" onClick={() => setPay(String(Math.round(owe / 2)))}>
              Mitad · {fmt(Math.round(owe / 2))}
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {VIAS.map((m) => (
            <button key={m} className="pill h38" aria-pressed={via === m} onClick={() => setVia(m)}>
              {m}
            </button>
          ))}
          <DateInputPill value={fecha} label={fecha === todayISO() ? 'Hoy' : shortDate(fecha)} onChange={setFecha} />
        </div>
      </div>
      <div style={{ flex: 'none', padding: '6px 16px' }}>
        <Keypad h={48} onKey={(k) => setPay((p) => pressKey(p, k))} />
      </div>
      <div className="foot" style={{ paddingTop: 4 }}>
        <button className="cta" aria-disabled={!pa} onClick={guardar}>
          {movId ? 'Guardar cambios' : 'Registrar pago'}
        </button>
      </div>
    </div>
  );
}
