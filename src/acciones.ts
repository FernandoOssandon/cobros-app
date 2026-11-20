// Acciones con deshacer que usan varias pantallas (hooks sin componentes).
import { borrarMovAhorro } from './ahorros';
import { db } from './db';
import { useToast } from './ui/toastCtx';

export function useBorrarMovAhorro() {
  const toast = useToast();
  return async (id: string) => {
    const patas = await borrarMovAhorro(id);
    if (patas.length) toast(patas.length > 1 ? 'Traspaso borrado de las dos cuentas' : 'Movimiento borrado', { label: 'Deshacer', run: () => db.movAhorro.bulkPut(patas) });
  };
}
