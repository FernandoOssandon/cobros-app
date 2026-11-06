/** Versión de la app (viene de package.json, la inyecta Vite). */
declare const __APP_VERSION__: string;

/** Variables de compilación (Netlify → Environment variables). */
interface ImportMetaEnv {
  /** ID de cliente OAuth de Google para el respaldo en Drive (opcional: también se puede escribir en la app). */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
