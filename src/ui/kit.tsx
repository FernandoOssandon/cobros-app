// Piezas de interfaz reutilizables del diseño v2.
import { useEffect, type ReactNode } from 'react';
import { AVATAR_COLORS, type Categoria, type Medio } from '../db';
import { KEYS } from '../lib/format';
import { IC, Icon, Svg } from './icons';

export const avatarColor = (i: number) => AVATAR_COLORS[((i % AVATAR_COLORS.length) + AVATAR_COLORS.length) % AVATAR_COLORS.length];

export const BackButton = ({ onClick, label = 'Volver' }: { onClick: () => void; label?: string }) => (
  <button className="btn-o back" onClick={onClick}>
    <Icon name="back" size={20} />
    {label}
  </button>
);

export const CloseButton = ({ onClick }: { onClick: () => void }) => (
  <button className="btn-icon" onClick={onClick} aria-label="Cerrar">
    <Icon name="close" size={18} w={2.6} />
  </button>
);

/** Encabezado de pantalla de tarea: × a la izquierda y el título centrado. */
export const TaskHeader = ({ title, onClose }: { title: string; onClose: () => void }) => (
  <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 16px' }}>
    <CloseButton onClick={onClose} />
    <span className="t-task">{title}</span>
    <span style={{ width: 44 }} />
  </div>
);

export const Switch = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
    <span />
  </button>
);

export const Keypad = ({ onKey, h = 44 }: { onKey: (k: string) => void; h?: number }) => (
  <div className="keypad">
    {KEYS.map((k) => (
      <button key={k} style={{ height: h }} onClick={() => onKey(k)} aria-label={k === '⌫' ? 'Borrar' : k}>
        {k}
      </button>
    ))}
  </div>
);

export const Avatar = ({ color, text, size = 42, fs }: { color: string; text: string; size?: number; fs?: number }) => (
  <span className="avatar" style={{ width: size, height: size, background: color, fontSize: fs ?? (size >= 42 ? 15 : size >= 36 ? 13 : 11) }} aria-hidden="true">
    {text}
  </span>
);

/** Avatar "Yo" (fondo soft, texto tinta). */
export const AvatarYo = ({ size = 36 }: { size?: number }) => (
  <span className="avatar" style={{ width: size, height: size, background: 'var(--soft)', color: 'var(--ink)', fontSize: size >= 36 ? 13 : 11 }} aria-hidden="true">
    Yo
  </span>
);

/** Círculo de categoría (o "?" punteado si no tiene). */
export function CatIcon({ cat, size = 40 }: { cat?: Categoria | null; size?: number }) {
  const icon = Math.round(size / 2);
  return (
    <span className={'cat-ic' + (cat ? '' : ' none')} style={{ width: size, height: size, background: cat?.color }} aria-hidden="true">
      <Svg d={IC[cat?.icono ?? 'none'] ?? IC.regalo} size={icon} w={2} />
    </span>
  );
}

/** Miniatura de tarjeta del medio de pago. */
export const MedioThumb = ({ medio, w = 38, h = 26, r = 6 }: { medio?: Medio | null; w?: number; h?: number; r?: number }) => (
  <span className={'card-thumb' + (medio ? '' : ' none')} style={{ width: w, height: h, borderRadius: r, background: medio?.color ?? 'transparent' }} aria-hidden="true" />
);

/** Chip de categoría (píldora con círculo de color). */
export const CatChip = ({ cat, on, onClick }: { cat: Categoria; on?: boolean; onClick: () => void }) => (
  <button className="pill cat" aria-pressed={!!on} onClick={onClick}>
    <span className="cat-ic" style={{ width: 28, height: 28, background: cat.color }}>
      <Svg d={IC[cat.icono] ?? IC.regalo} size={16} w={2.2} />
    </span>
    {cat.nombre}
  </button>
);

/** Chip de medio de pago (píldora con miniatura de tarjeta). */
export const MedioChip = ({ medio, on, onClick }: { medio: Medio; on?: boolean; onClick: () => void }) => (
  <button className="pill" style={{ padding: '0 14px' }} aria-pressed={!!on} onClick={onClick}>
    <span style={{ width: 20, height: 14, borderRadius: 3, background: medio.color, border: '1.5px solid #0E1A12', flex: 'none' }} />
    {medio.nombre}
  </button>
);

/** Persona en un selector (avatar de 48 con anillo). */
export function PersonPick(props: { ini: string; label: string; color: string; on: boolean; ring?: string; onClick: () => void }) {
  return (
    <button className={'pick' + (props.on ? '' : ' off')} aria-pressed={props.on} onClick={props.onClick}>
      <span className="ring" style={{ background: props.color, borderColor: props.on ? (props.ring ?? 'var(--pos)') : 'transparent' }}>
        {props.ini}
      </span>
      <span className="lbl">{props.label}</span>
    </button>
  );
}

/** Hoja inferior: tirador, scrim y cierre al tocar fuera o con Escape. */
export function Sheet({ onClose, children, label, style }: { onClose: () => void; children: ReactNode; label: string; style?: React.CSSProperties }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-wrap">
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} style={style}>
        <div className="handle" />
        {children}
      </div>
    </div>
  );
}

/** Confirmación con "Mejor no" / acción destructiva. */
export function ConfirmSheet(props: { title: string; body?: string; confirm: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet onClose={props.onClose} label={props.title}>
      <div className="sheet-title" style={{ paddingTop: 18 }}>{props.title}</div>
      {props.body && <div className="sheet-body">{props.body}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button className="btn-line" onClick={props.onClose}>
          Mejor no
        </button>
        <button className="btn-danger" onClick={props.onConfirm}>
          {props.confirm}
        </button>
      </div>
    </Sheet>
  );
}

/** Lista de opciones con radio (filtros, grupo…). */
export function PickerSheet<T extends string | null>(props: {
  title: string;
  options: { value: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
  onClose: () => void;
  footer?: ReactNode;
}) {
  return (
    <Sheet onClose={props.onClose} label={props.title}>
      <div className="sheet-title" style={{ fontSize: 28 }}>{props.title}</div>
      {props.options.map((o) => (
        <button key={String(o.value)} className="opt-row" onClick={() => props.onPick(o.value)}>
          {o.label}
          <span className="radio" role="radio" aria-checked={props.value === o.value}>
            <span />
          </span>
        </button>
      ))}
      {props.footer}
    </Sheet>
  );
}

/** Píldora de opción simple dentro de un grupo. */
export const Pill = ({ on, onClick, children, className = '' }: { on?: boolean; onClick: () => void; children: ReactNode; className?: string }) => (
  <button className={'pill ' + className} aria-pressed={!!on} onClick={onClick}>
    {children}
  </button>
);

/** Estado vacío con título grande. */
export const EmptyState = ({ title, body, pad = 60 }: { title: ReactNode; body: string; pad?: number }) => (
  <div style={{ padding: `${pad}px 4px 0` }}>
    <div className="t-display">{title}</div>
    <p className="t-body-muted">{body}</p>
  </div>
);

/** Entrada de fecha nativa disfrazada de píldora. */
export const DateInputPill = ({ value, label, onChange, on }: { value: string; label: string; onChange: (v: string) => void; on?: boolean }) => (
  <label className="pill" aria-pressed={!!on} style={{ position: 'relative', overflow: 'hidden', background: on ? 'var(--ink)' : undefined, color: on ? 'var(--bg)' : undefined }}>
    {label}
    <input
      type="date"
      value={value}
      max="2100-12-31"
      onChange={(e) => e.target.value && onChange(e.target.value)}
      aria-label={label}
      style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
    />
  </label>
);
