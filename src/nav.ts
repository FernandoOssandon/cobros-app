// Navegación: pestañas (raíz) y pantallas apiladas con "‹ {pantalla anterior}".
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export const PESTANAS = [
  { path: '/', label: 'Resumen', key: 'resumen' },
  { path: '/gastos', label: 'Gastos', key: 'gastos' },
  { path: '/plata', label: 'Mi plata', key: 'plata' },
  { path: '/personas', label: 'Personas', key: 'personas' },
  { path: '/recurrentes', label: 'Recurrentes', key: 'recurrentes' },
] as const;

export const esPestana = (pathname: string) => PESTANAS.some((p) => p.path === pathname);

/** Nombre de la pantalla actual, para el botón "‹ …" de la siguiente. */
export function nombrePantalla(pathname: string): string {
  const tab = PESTANAS.find((p) => p.path === pathname);
  if (tab) return tab.label;
  if (pathname.startsWith('/gasto/')) return 'Gasto';
  if (pathname.startsWith('/persona/')) return 'Volver';
  if (pathname.startsWith('/grupo/')) return 'Grupo';
  if (pathname === '/grupos') return 'Grupos';
  if (pathname === '/ajustes') return 'Ajustes';
  if (pathname === '/categorias') return 'Categorías';
  if (pathname === '/medios') return 'Medios';
  if (pathname.startsWith('/cuenta/')) return 'Cuenta';
  if (pathname === '/correo') return 'Detectados';
  return 'Volver';
}

interface NavState {
  from?: string;
}

export function useNav() {
  const navigate = useNavigate();
  const location = useLocation();
  /** Abre una pantalla encima de la actual. */
  const push = useCallback(
    (to: string) => navigate(to, { state: { from: nombrePantalla(location.pathname) } satisfies NavState }),
    [navigate, location.pathname],
  );
  /** Cambia de pestaña (no apila). */
  const tab = useCallback((to: string) => navigate(to, { replace: true }), [navigate]);
  /** Vuelve un nivel; si se abrió directo (sin historia), va a `fallback`. */
  const back = useCallback(
    (fallback = '/') => {
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (idx > 0) navigate(-1);
      else navigate(fallback, { replace: true });
    },
    [navigate],
  );
  const backLabel = (location.state as NavState | null)?.from ?? 'Volver';
  return { push, tab, back, backLabel, navigate, location };
}
