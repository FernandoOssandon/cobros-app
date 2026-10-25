// Acción "Respaldar": arma el archivo, lo entrega (compartir o descargar) y marca la fecha.
import { useCallback } from 'react';
import { construirRespaldo, entregarArchivo, marcarRespaldo } from './backup';
import { todayISO } from './lib/format';
import { useToast } from './ui/toast';

export function useRespaldar() {
  const toast = useToast();
  return useCallback(async () => {
    try {
      const r = await construirRespaldo();
      const ok = await entregarArchivo(`me-debes-respaldo-${todayISO()}.json`, JSON.stringify(r, null, 2), 'application/json');
      if (!ok) return; // el usuario cerró el menú de compartir
      await marcarRespaldo(r.exportado);
      toast('Respaldo listo');
    } catch {
      toast('No se pudo crear el respaldo');
    }
  }, [toast]);
}
