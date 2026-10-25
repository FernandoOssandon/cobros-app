// Piezas de interfaz reutilizables (iconos, avatar, switch, teclado, hojas inferiores).
import { useEffect, type ReactNode } from 'react';
import { KEYS } from '../lib/format';

export const AV = ['#C4F25E', '#7FD9A8', '#FFD36E', '#9EC9FF', '#FF9E8A'];

export const IconPlus = ({ size = 22, w = 2.8 }: { size?: number; w?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconClose = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconBack = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
export const IconCal = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

export const BackButton = ({ onClick, label = 'Volver' }: { onClick: () => void; label?: string }) => (
  <button className="btn-outline back" onClick={onClick}>
    <IconBack />
    {label}
  </button>
);

export const CloseButton = ({ onClick }: { onClick: () => void }) => (
  <button className="btn-icon" onClick={onClick} aria-label="Cerrar">
    <IconClose />
  </button>
);

export const Avatar = ({ color, text, size = 42 }: { color: number; text: string; size?: number }) => (
  <span className="avatar" style={{ background: AV[color % AV.length], width: size, height: size, borderRadius: size / 2 }} aria-hidden="true">
    {text}
  </span>
);

export const Switch = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
    <span />
  </button>
);

export const Keypad = ({ onKey, tall }: { onKey: (k: string) => void; tall?: boolean }) => (
  <div className={'keypad' + (tall ? ' tall' : '')}>
    {KEYS.map((k) => (
      <button key={k} onClick={() => onKey(k)} aria-label={k === '⌫' ? 'Borrar' : k}>
        {k}
      </button>
    ))}
  </div>
);

/** Pastilla de fecha que abre el selector nativo. */
export const DatePill = ({ value, label, onChange }: { value: string; label: string; onChange: (v: string) => void }) => (
  <label className="pill bordered date-pill" style={{ height: 32, gap: 6 }}>
    <IconCal />
    {label}
    <input type="date" value={value} max="2100-12-31" onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Fecha" />
  </label>
);

/** Hoja inferior con fondo oscurecido. Se cierra tocando fuera o con Escape. */
export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </>
  );
}

/** Confirmación para acciones que no se pueden deshacer. */
export function ConfirmSheet(props: { title: string; body?: string; confirm: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet onClose={props.onClose} label={props.title}>
      <div className="s-title">{props.title}</div>
      {props.body && <div className="s-body">{props.body}</div>}
      <button className="btn-danger" onClick={props.onConfirm}>
        {props.confirm}
      </button>
      <button className="btn-line" onClick={props.onClose}>
        Cancelar
      </button>
    </Sheet>
  );
}
