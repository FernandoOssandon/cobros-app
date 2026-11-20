// El toast: el contexto y el hook (el componente está en toast.tsx).
import { createContext, useContext } from 'react';

export interface ToastAction {
  label: string;
  run: () => void;
}
export type Show = (msg: string, action?: ToastAction) => void;

export const Ctx = createContext<Show>(() => {});
/** Muestra un toast (con "Deshacer" u otra acción opcional). */
export const useToast = () => useContext(Ctx);
