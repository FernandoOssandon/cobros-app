// Valor del día de la UF, el dólar y el euro, desde mindicador.cl (API pública con datos del Banco Central).
// Se guarda el último valor en Ajustes para usarlo sin conexión.
import { db, guardarAjustes } from './db';
import { leerMindicador, type Indicadores } from './lib/monedas';

export const URL_INDICADORES = 'https://mindicador.cl/api';
/** Cada cuánto se vuelven a pedir (la UF y el dólar cambian una vez al día). */
const VIGENCIA_MS = 6 * 60 * 60 * 1000;

export async function actualizarIndicadores(f: typeof fetch = fetch, forzar = false): Promise<Indicadores | null> {
  const previos = (await db.ajustes.get('main'))?.indicadores;
  if (!forzar && previos?.actualizado && Date.now() - new Date(previos.actualizado).getTime() < VIGENCIA_MS) return previos;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await f(URL_INDICADORES, { signal: ctl.signal });
    if (!res.ok) return null;
    const nuevos = leerMindicador(await res.json());
    if (!nuevos.UF && !nuevos.USD && !nuevos.EUR) return null;
    // Si falta alguno, se conserva el anterior.
    const juntos: Indicadores = { ...previos, ...Object.fromEntries(Object.entries(nuevos).filter(([, v]) => v !== undefined)) };
    await guardarAjustes({ indicadores: juntos });
    return juntos;
  } catch {
    return null; // sin conexión: se usa el último valor guardado
  } finally {
    clearTimeout(t);
  }
}
