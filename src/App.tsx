import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAjustes, useThemeSync } from './hooks';
import { ToastProvider } from './ui/toast';
import Home from './screens/Home';
import Person from './screens/Person';
import EditPerson from './screens/EditPerson';
import ChargeForm from './screens/ChargeForm';
import ChargeDetail from './screens/ChargeDetail';
import Pay from './screens/Pay';
import Collect from './screens/Collect';
import Settings from './screens/Settings';
import Archived from './screens/Archived';

export default function App() {
  const aj = useAjustes();
  useThemeSync(aj.tema);
  return (
    <HashRouter>
      <div className="app">
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/persona/:id" element={<Person />} />
            <Route path="/persona/:id/editar" element={<EditPerson />} />
            <Route path="/persona/:id/pago" element={<Pay />} />
            <Route path="/persona/:id/pago/:movId" element={<Pay />} />
            <Route path="/persona/:id/cobro" element={<Collect />} />
            <Route path="/cargo/nuevo" element={<ChargeForm />} />
            <Route path="/cargo/:id" element={<ChargeDetail />} />
            <Route path="/cargo/:id/editar" element={<ChargeForm />} />
            <Route path="/ajustes" element={<Settings />} />
            <Route path="/archivadas" element={<Archived />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </div>
    </HashRouter>
  );
}
