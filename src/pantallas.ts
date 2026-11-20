// Pantallas que se cargan cuando se abren (code splitting): el Resumen va en el paquete inicial y el resto
// se baja aparte. Así la app arranca leyendo menos JavaScript. Después del arranque, `precargarPantallas`
// las trae en segundo plano para que abrirlas sea instantáneo (y quedan en el caché del service worker).
import { lazy, type ComponentType } from 'react';

type Modulo = Record<string, unknown>;
const cargas: (() => Promise<Modulo>)[] = [];

/** Una pantalla perezosa: `exportada` es el nombre del export (o 'default'). */
function pantalla<M extends Modulo>(cargar: () => Promise<M>, exportada: keyof M & string = 'default') {
  cargas.push(cargar);
  return lazy(async () => ({ default: (await cargar())[exportada] as ComponentType }));
}

const gastos = () => import('./screens/Gastos');
const personas = () => import('./screens/Personas');
const plata = () => import('./screens/Plata');
const recurrentes = () => import('./screens/Recurrentes');
const nuevoGasto = () => import('./screens/NuevoGasto');
const gastoDetalle = () => import('./screens/GastoDetalle');
const person = () => import('./screens/Person');
const editPerson = () => import('./screens/EditPerson');
const pay = () => import('./screens/Pay');
const collect = () => import('./screens/Collect');
const nuevoRecurrente = () => import('./screens/NuevoRecurrente');
const grupos = () => import('./screens/Grupos');
const categorias = () => import('./screens/Categorias');
const medios = () => import('./screens/Medios');
const onboarding = () => import('./screens/Onboarding');
const ajustes = () => import('./screens/Ajustes');
const archivadas = () => import('./screens/Archivadas');
const cuenta = () => import('./screens/Cuenta');
const correo = () => import('./screens/Correo');
const presupuestos = () => import('./screens/Presupuestos');
const ingresos = () => import('./screens/Ingresos');
const metas = () => import('./screens/Metas');
const tendencias = () => import('./screens/Tendencias');
const importar = () => import('./screens/Importar');
const proyeccion = () => import('./screens/Proyeccion');

export const Gastos = pantalla(gastos);
export const Personas = pantalla(personas);
export const MiPlata = pantalla(plata);
export const Recurrentes = pantalla(recurrentes);
export const NuevoGasto = pantalla(nuevoGasto);
export const GastoDetalle = pantalla(gastoDetalle);
export const Person = pantalla(person);
export const EditPerson = pantalla(editPerson);
export const Pay = pantalla(pay);
export const Collect = pantalla(collect);
export const NuevoRecurrente = pantalla(nuevoRecurrente);
export const Grupos = pantalla(grupos, 'Grupos');
export const Grupo = pantalla(grupos, 'Grupo');
export const Categorias = pantalla(categorias);
export const Medios = pantalla(medios, 'Medios');
export const MedioForm = pantalla(medios, 'MedioForm');
export const Onboarding = pantalla(onboarding);
export const Ajustes = pantalla(ajustes);
export const Archivadas = pantalla(archivadas);
export const CuentaDetalle = pantalla(cuenta, 'CuentaDetalle');
export const CuentaForm = pantalla(cuenta, 'CuentaForm');
export const DapForm = pantalla(cuenta, 'DapForm');
export const Detectados = pantalla(correo, 'Detectados');
export const ConectarGmail = pantalla(correo, 'ConectarGmail');
export const Presupuestos = pantalla(presupuestos, 'Presupuestos');
export const PresupuestoForm = pantalla(presupuestos, 'PresupuestoForm');
export const Ingresos = pantalla(ingresos, 'Ingresos');
export const IngresoForm = pantalla(ingresos, 'IngresoForm');
export const MetaDetalle = pantalla(metas, 'MetaDetalle');
export const MetaForm = pantalla(metas, 'MetaForm');
export const Tendencias = pantalla(tendencias);
export const Importar = pantalla(importar);
export const ProyeccionPantalla = pantalla(proyeccion, 'ProyeccionPantalla');
export const CierrePantalla = pantalla(proyeccion, 'CierrePantalla');

let precargadas = false;
/** Trae todas las pantallas en segundo plano, cuando el teléfono está libre (una sola vez). */
export function precargarPantallas() {
  if (precargadas) return;
  precargadas = true;
  const ric = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  const luego = (f: () => void) => (ric ? ric(f, { timeout: 3000 }) : window.setTimeout(f, 1500));
  // Unos segundos después del arranque y de a una, para no competir con lo que se está mostrando.
  const siguiente = (i: number) => {
    if (i >= cargas.length) return;
    luego(() => {
      cargas[i]()
        .catch(() => undefined)
        .finally(() => siguiente(i + 1));
    });
  };
  window.setTimeout(() => siguiente(0), 3000);
}
