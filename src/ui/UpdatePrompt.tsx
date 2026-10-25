// Aviso "Hay una versión nueva". El service worker nuevo espera hasta que el usuario toque "Actualizar".
import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const CADA_HORA = 60 * 60 * 1000;

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // Revisa si hay versión nueva cada hora y cada vez que vuelves a la app.
      setInterval(() => reg.update().catch(() => {}), CADA_HORA);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    },
  });

  useEffect(() => {
    if (needRefresh) navigator.vibrate?.(20);
  }, [needRefresh]);

  if (!needRefresh) return null;
  return (
    <div className="update" role="status">
      <span>Hay una versión nueva</span>
      <button className="update-go" onClick={() => updateServiceWorker(true)}>
        Actualizar
      </button>
      <button className="update-x" onClick={() => setNeedRefresh(false)} aria-label="Más tarde">
        ×
      </button>
    </div>
  );
}
