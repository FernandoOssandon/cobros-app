// Versión nueva: el service worker nuevo espera hasta que el usuario toque "Actualizar".
// Se muestra como toast superior en la app y como banner en Ajustes.
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Icon } from './icons';

const CADA_HORA = 60 * 60 * 1000;

interface UpdateCtx {
  hay: boolean;
  actualizar: () => void;
}
const Ctx = createContext<UpdateCtx>({ hay: false, actualizar: () => {} });
export const useUpdate = () => useContext(Ctx);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const {
    needRefresh: [hay],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      setInterval(() => reg.update().catch(() => {}), CADA_HORA);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    },
  });
  return <Ctx.Provider value={{ hay, actualizar: () => updateServiceWorker(true) }}>{children}</Ctx.Provider>;
}

/** Toast superior "Hay una versión nueva" (en Ajustes se ve el banner en su lugar). */
export function UpdateToast() {
  const { hay, actualizar } = useUpdate();
  const [oculto, setOculto] = useState(false);
  const { pathname } = useLocation();
  if (!hay || oculto || pathname === '/ajustes') return null;
  return (
    <div className="upd-toast" role="status">
      <span style={{ flex: 1, fontSize: 15, fontWeight: 800 }}>Hay una versión nueva</span>
      <button className="go" onClick={actualizar}>
        Actualizar
      </button>
      <button className="x" onClick={() => setOculto(true)} aria-label="Más tarde">
        <Icon name="close" size={14} w={3} />
      </button>
    </div>
  );
}

/** Banner de Ajustes. */
export function UpdateBanner() {
  const { hay, actualizar } = useUpdate();
  if (!hay) return null;
  return (
    <div className="upd-banner">
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 16, fontWeight: 800 }}>Hay una versión nueva</span>
        <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.75 }}>Se instala en un segundo y tus datos quedan igual.</span>
      </span>
      <button className="go" style={{ height: 40, padding: '0 16px', borderRadius: 20 }} onClick={actualizar}>
        Actualizar
      </button>
    </div>
  );
}
