import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Pide al navegador que no borre los datos por falta de espacio o inactividad.
navigator.storage?.persist?.().catch(() => {});

// Service worker: modo offline y actualizaciones automáticas. Si el entorno no lo permite, la app sigue funcionando.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {});
}
