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

// El service worker (modo offline y aviso de versión nueva) se registra en ui/UpdatePrompt.tsx.
