import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { guardarPago } from '../db';
import { usePeople } from '../hooks';
import { dateLabel, dg, fmt, pressKey, show, todayISO } from '../lib/format';
import { CloseButton, DatePill, Keypad } from '../ui/kit';
import { useToast } from '../ui/toast';

const MEDIOS = ['Transferencia', 'Efectivo'];

export default function Pay() {
  const { id = '', movId } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const people = usePeople();
  const [pay, setPay] = useState('');
  const [medio, setMedio] = useState('Transferencia');
  const [fecha, setFecha] = useState(todayISO());
  const loaded = useRef(false);

  const v = people?.find((x) => x.p.id === id);
  const editing = movId ? v?.movs.find((m) => m.id === movId) : undefined;

  useEffect(() => {
    if (!editing || loaded.current) return;
    loaded.current = true;
    setPay(String(editing.monto));
    setMedio(editing.detalle);
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

  // Al editar, el saldo "antes" no considera el pago que se está editando.
  const debe = v.saldo + (editing?.monto ?? 0);
  const amount = dg(pay);
  const close = () => nav(`/persona/${id}`, { replace: true });
  const save = async () => {
    if (!amount) {
      toast('Ingresa el monto recibido');
      return;
    }
    await guardarPago(id, amount, medio, fecha, movId);
    toast(movId ? 'Pago actualizado' : `Pago de ${fmt(amount)} registrado`);
    close();
  };

  return (
    <div className="screen">
      <div style={{ flex: 'none', padding: '2px 16px' }}>
        <CloseButton onClick={close} />
      </div>
      <div className="scroll" style={{ padding: '18px 20px 0' }}>
        <h1 className="question" style={{ margin: 0 }}>
          {movId ? `Editar pago de ${v.first}` : `¿Cuánto pagó ${v.first}?`}
        </h1>
        <div className="hero-72" style={{ marginTop: 20 }} aria-label="Monto recibido">
          ${show(pay) || '0'}
        </div>
        <div className="muted" style={{ fontSize: 16, fontWeight: 600 }}>
          Debe {fmt(Math.max(debe, 0))} · queda {fmt(Math.max(debe - amount, 0))}
          {amount > debe && ` (+${fmt(amount - Math.max(debe, 0))} a favor)`}
        </div>
        {debe > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="pill bordered" onClick={() => setPay(String(debe))}>
              Todo · {fmt(debe)}
            </button>
            <button className="pill bordered" onClick={() => setPay(String(Math.round(debe / 2)))}>
              Mitad · {fmt(Math.round(debe / 2))}
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {MEDIOS.map((m) => (
            <button key={m} className="pill bordered" aria-pressed={medio === m} onClick={() => setMedio(m)}>
              {m}
            </button>
          ))}
          <DatePill value={fecha} label={dateLabel(fecha)} onChange={setFecha} />
        </div>
      </div>
      <Keypad tall onKey={(k) => setPay((p) => pressKey(p, k))} />
      <div style={{ flex: 'none', padding: '4px 16px var(--safe-bottom)' }}>
        <button className="cta" aria-disabled={!amount} onClick={save}>
          {movId ? 'Guardar cambios' : 'Registrar pago'}
        </button>
      </div>
    </div>
  );
}
