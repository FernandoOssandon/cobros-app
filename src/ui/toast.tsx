// Toast inferior (2,4 s; 4 s si trae "Deshacer"). En las pestañas va a 166px del fondo, sobre el botón flotante.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { esPestana } from '../nav';

interface ToastAction {
  label: string;
  run: () => void;
}
type Show = (msg: string, action?: ToastAction) => void;

const Ctx = createContext<Show>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; action?: ToastAction; key: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const { pathname } = useLocation();
  const show = useCallback<Show>((msg, action) => {
    window.clearTimeout(timer.current);
    setT({ msg, action, key: Date.now() });
    timer.current = window.setTimeout(() => setT(null), action ? 4000 : 2400);
  }, []);
  const bottom = esPestana(pathname) ? 'calc(140px + var(--tab-bottom))' : 'calc(74px + var(--safe-bottom))';
  return (
    <Ctx.Provider value={show}>
      {children}
      {t && (
        <div className="toast" key={t.key} role="status" aria-live="polite" style={{ bottom }}>
          <span>{t.msg}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                window.clearTimeout(timer.current);
                setT(null);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}
