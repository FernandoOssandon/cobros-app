import { useEffect, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAjustes, useThemeSync } from './hooks';
import { esPestana, useNav } from './nav';
import { generarRecurrentes } from './recurrentes';
import { TabBar } from './ui/rows';
import { ToastProvider, useToast } from './ui/toast';
import { UpdateProvider, UpdateToast } from './ui/UpdatePrompt';
import Resumen from './screens/Resumen';
import Gastos from './screens/Gastos';
import NuevoGasto from './screens/NuevoGasto';
import GastoDetalle from './screens/GastoDetalle';
import Personas from './screens/Personas';
import Person from './screens/Person';
import EditPerson from './screens/EditPerson';
import Pay from './screens/Pay';
import Collect from './screens/Collect';
import Recurrentes from './screens/Recurrentes';
import NuevoRecurrente from './screens/NuevoRecurrente';
import { Grupo, Grupos } from './screens/Grupos';
import Categorias from './screens/Categorias';
import { MedioForm, Medios } from './screens/Medios';
import Onboarding from './screens/Onboarding';
import Ajustes from './screens/Ajustes';
import Archivadas from './screens/Archivadas';

export default function App() {
  const aj = useAjustes();
  useThemeSync(aj.tema);
  return (
    <HashRouter>
      <div className="app">
        <ToastProvider>
          <UpdateProvider>
            <UpdateToast />
            <RecurrentesAlDia />
            <PrimerUso />
            <Routes>
              <Route path="/" element={<Tab><Resumen /></Tab>} />
              <Route path="/gastos" element={<Tab><Gastos /></Tab>} />
              <Route path="/personas" element={<Tab><Personas /></Tab>} />
              <Route path="/recurrentes" element={<Tab><Recurrentes /></Tab>} />
              <Route path="/gasto/nuevo" element={<NuevoGasto />} />
              <Route path="/gasto/:id" element={<GastoDetalle />} />
              <Route path="/gasto/:id/editar" element={<NuevoGasto />} />
              <Route path="/persona/:id" element={<Person />} />
              <Route path="/persona/:id/editar" element={<EditPerson />} />
              <Route path="/persona/:id/pago" element={<Pay />} />
              <Route path="/persona/:id/pago/:movId" element={<Pay />} />
              <Route path="/persona/:id/cobro" element={<Collect />} />
              <Route path="/recurrente/nuevo" element={<NuevoRecurrente />} />
              <Route path="/recurrente/:id" element={<NuevoRecurrente />} />
              <Route path="/grupos" element={<Grupos />} />
              <Route path="/grupo/:id" element={<Grupo />} />
              <Route path="/categorias" element={<Categorias />} />
              <Route path="/medios" element={<Medios />} />
              <Route path="/medio/nuevo" element={<MedioForm />} />
              <Route path="/medio/:id" element={<MedioForm />} />
              <Route path="/ajustes" element={<Ajustes />} />
              <Route path="/bienvenida" element={<Onboarding />} />
              <Route path="/archivadas" element={<Archivadas />} />
              {/* Rutas de la 1.x */}
              <Route path="/cargo/nuevo" element={<Navigate to="/gasto/nuevo" replace />} />
              <Route path="/cargo/:id" element={<RedirigeCargo />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </UpdateProvider>
        </ToastProvider>
      </div>
    </HashRouter>
  );
}

/** Pestaña: contenido + barra inferior + botón "Nuevo gasto". */
function Tab({ children }: { children: ReactNode }) {
  const { tab, push, location } = useNav();
  return (
    <div className="screen">
      {children}
      <TabBar current={location.pathname} onTab={tab} onNuevo={() => push('/gasto/nuevo')} />
    </div>
  );
}

function RedirigeCargo() {
  const { id } = useParams();
  return <Navigate to={`/gasto/${id}`} replace />;
}

/** La primera vez (o tras actualizar desde la 1.x) muestra "Agrega tus tarjetas". */
function PrimerUso() {
  const aj = useAjustes();
  const nav = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (aj.cargado && !aj.onboardingHecho && esPestana(pathname)) nav('/bienvenida', { replace: true });
  }, [aj.cargado, aj.onboardingHecho, pathname, nav]);
  return null;
}

/** Al abrir la app (y al volver a ella) anota los recurrentes que tocaban. */
function RecurrentesAlDia() {
  const toast = useToast();
  useEffect(() => {
    let corriendo = false;
    const run = async () => {
      if (corriendo) return;
      corriendo = true;
      try {
        const { anotados, porConfirmar } = await generarRecurrentes();
        const partes = [
          anotados && `${anotados} ${anotados === 1 ? 'recurrente anotado' : 'recurrentes anotados'}`,
          porConfirmar && `${porConfirmar} por confirmar`,
        ].filter(Boolean);
        if (partes.length) toast(partes.join(' · '));
      } finally {
        corriendo = false;
      }
    };
    run();
    const onVis = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [toast]);
  return null;
}
