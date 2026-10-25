// Toast inferior (2,4 s) con acción opcional, por ejemplo "Deshacer".
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

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
  const show = useCallback<Show>((msg, action) => {
    window.clearTimeout(timer.current);
    setT({ msg, action, key: Date.now() });
    timer.current = window.setTimeout(() => setT(null), action ? 4500 : 2400);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {t && (
        <div className="toast" key={t.key} role="status" aria-live="polite">
          <span>{t.msg}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
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
