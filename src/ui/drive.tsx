// Respaldo en Google Drive: el respaldo automático (sin pantalla), el aviso "Respaldar" y la sección de Ajustes.
import { useEffect, useState } from 'react';
import { importarRespaldo, type Respaldo } from '../backup';
import { cambiosDatos, db } from '../db';
import {
  bajarRespaldo, cargarGoogle, clientIdDe, conectarDrive, DEMORA_MS, desconectarDrive, estadoDrive, hayClientIdCompilado, refrescarEstado,
  respaldarEnDrive, respaldosEnDrive, useEstadoDrive, type ResultadoRespaldo,
} from '../drive';
import { useAjustes } from '../hooks';
import { fechaRespaldo, NOMBRE_CARPETA, type ArchivoDrive } from '../lib/drive';
import { dateLabel } from '../lib/format';
import { haceLbl } from '../screens/Correo';
import { ConfirmSheet, Sheet } from './kit';
import { useToast } from './toast';

const RE_CLIENT_ID = /^[\w-]+\.apps\.googleusercontent\.com$/;

/** Sin pantalla: sube el respaldo al rato de cada cambio y al salir de la app (si hay permiso vigente). */
export function RespaldoAutomatico() {
  const aj = useAjustes();
  const conectado = !!aj.drive;
  useEffect(() => {
    if (!conectado) return;
    // Precarga el inicio de sesión de Google: así "Respaldar" abre la ventana al primer toque.
    void cargarGoogle().catch(() => undefined);
    let t: number | undefined;
    const programar = (ms: number) => {
      window.clearTimeout(t);
      t = window.setTimeout(() => void respaldarEnDrive(), ms);
    };
    const onCambio = () => programar(DEMORA_MS);
    // Al salir de la app (cambiar de app, bloquear el teléfono) se intenta subir lo pendiente de inmediato.
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        if (estadoDrive().pendienteDesde) void respaldarEnDrive();
      } else refrescarEstado();
    };
    cambiosDatos.addEventListener('cambio', onCambio);
    document.addEventListener('visibilitychange', onVis);
    const reloj = window.setInterval(refrescarEstado, 60_000);
    if (estadoDrive().pendienteDesde) programar(4000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(reloj);
      cambiosDatos.removeEventListener('cambio', onCambio);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [conectado]);
  return null;
}

/** Mensaje para cada resultado de un respaldo pedido con un toque. */
function textoResultado(r: ResultadoRespaldo): string {
  return r === 'ok' ? 'Respaldado en Drive' : r === 'vacio' ? 'No hay nada que respaldar' : r === 'sin-permiso' ? 'Google no dio permiso' : 'No se pudo respaldar en Drive';
}

/** "Tienes cambios sin respaldar": aparece cuando venció el permiso de Google y hay algo por subir. */
export function AvisoRespaldoDrive() {
  const aj = useAjustes();
  const e = useEstadoDrive();
  const toast = useToast();
  if (!aj.drive || !e.pendienteDesde || e.tokenOk || e.subiendo) return null;
  return (
    <button
      className="banner-det"
      onClick={async () => {
        const r = await respaldarEnDrive({ interactivo: true });
        toast(r === 'error' ? (estadoDrive().error ?? textoResultado(r)) : textoResultado(r));
      }}
    >
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.15 }}>Tienes cambios sin respaldar</span>
        <span className="t-meta">El permiso de Google venció. Un toque y se suben a tu Drive.</span>
      </span>
      <span className="chip-ink">Respaldar</span>
    </button>
  );
}

const tamano = (a: ArchivoDrive) => (a.size ? `${Math.max(1, Math.round(Number(a.size) / 1024))} KB` : '');

/** Sección "Respaldo en Google Drive" de Ajustes. */
export function SeccionDrive() {
  const aj = useAjustes();
  const e = useEstadoDrive();
  const toast = useToast();
  const [conectar, setConectar] = useState(false);
  const [lista, setLista] = useState<ArchivoDrive[] | null>(null);
  const [mensajeLista, setMensajeLista] = useState('');
  const [desconectar, setDesconectar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const cfg = aj.drive;

  const abrirLista = async () => {
    try {
      setOcupado(true);
      setMensajeLista('');
      setLista(await respaldosEnDrive());
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const detalle = !cfg
    ? 'Sube tu respaldo solo, cada vez que cambias algo, a una carpeta de tu Google Drive. Así no pierdes nada si pierdes el teléfono.'
    : [
        cfg.email ? `Conectado como ${cfg.email}.` : 'Conectado.',
        e.subiendo ? 'Subiendo ahora…' : cfg.ultimaSubida ? `Último respaldo ${haceLbl(cfg.ultimaSubida)}.` : 'Todavía sin respaldo.',
        e.pendienteDesde && !e.subiendo ? (e.tokenOk ? 'Hay cambios por subir.' : 'Hay cambios por subir: el permiso venció, toca "Respaldar ahora".') : '',
      ]
        .filter(Boolean)
        .join(' ');

  return (
    <div style={{ padding: '16px 0', borderTop: '2px solid var(--ink)', display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="seccion-drive">
      <div className="set-title">Respaldo en Google Drive</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.4 }}>{detalle}</div>
      {e.error && (
        <div role="alert" style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)', lineHeight: 1.35 }}>
          {e.error}
        </div>
      )}
      {!cfg ? (
        <button className="cta" style={{ height: 50, fontSize: 15 }} onClick={() => setConectar(true)}>
          Conectar Google Drive
        </button>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              className="cta"
              style={{ height: 50, fontSize: 15 }}
              aria-disabled={e.subiendo}
              onClick={async () => {
                const r = await respaldarEnDrive({ interactivo: true });
                toast(r === 'error' ? (estadoDrive().error ?? textoResultado(r)) : textoResultado(r));
              }}
            >
              Respaldar ahora
            </button>
            <button className="btn-line" style={{ height: 50, fontSize: 15 }} aria-disabled={ocupado} onClick={abrirLista}>
              Restaurar
            </button>
          </div>
          <div className="row-between">
            <span className="t-meta">Carpeta «{NOMBRE_CARPETA}» · guarda los últimos 30 días</span>
            <button className="btn-text" style={{ height: 'auto', padding: 0, fontSize: 14 }} onClick={() => setDesconectar(true)}>
              Desconectar
            </button>
          </div>
        </>
      )}

      {conectar && (
        <ConectarDriveSheet
          onClose={() => setConectar(false)}
          onConectado={async (archivos) => {
            setConectar(false);
            const hayDatos = (await db.gastos.count()) + (await db.personas.count()) + (await db.cuentas.count()) > 0;
            if (!hayDatos && archivos.length) {
              // Teléfono nuevo: lo primero es traer el respaldo, no subir uno vacío.
              setMensajeLista('Encontramos respaldos en tu Drive. ¿Traemos uno a este teléfono?');
              setLista(archivos);
              return;
            }
            const r = await respaldarEnDrive({ interactivo: true });
            toast(r === 'ok' ? 'Drive conectado · respaldo subido' : `Drive conectado · ${textoResultado(r).toLowerCase()}`);
          }}
        />
      )}
      {lista && <RestaurarSheet archivos={lista} mensaje={mensajeLista} onClose={() => setLista(null)} />}
      {desconectar && (
        <ConfirmSheet
          title="¿Desconectamos Drive?"
          body="Se deja de respaldar solo. Los respaldos que ya están en tu Drive se quedan ahí."
          confirm="Sí, desconectar"
          onClose={() => setDesconectar(false)}
          onConfirm={async () => {
            setDesconectar(false);
            await desconectarDrive();
            toast('Drive desconectado');
          }}
        />
      )}
    </div>
  );
}

/** Conectar: el ID de cliente de Google (si no viene en la app) y el permiso. */
function ConectarDriveSheet({ onClose, onConectado }: { onClose: () => void; onConectado: (archivos: ArchivoDrive[]) => void }) {
  const aj = useAjustes();
  const [clientId, setClientId] = useState(aj.drive?.clientId ?? '');
  const [error, setError] = useState('');
  const [probando, setProbando] = useState(false);
  const pideId = !hayClientIdCompilado;
  const origen = window.location.origin;
  useEffect(() => {
    void cargarGoogle().catch(() => undefined);
  }, []);

  const conectar = async () => {
    const cid = pideId ? clientId.trim() : clientIdDe(aj.drive);
    if (pideId && !RE_CLIENT_ID.test(cid ?? '')) return setError('El ID de cliente termina en .apps.googleusercontent.com');
    setError('');
    setProbando(true);
    try {
      onConectado(await conectarDrive(pideId ? cid : undefined));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProbando(false);
    }
  };

  const paso = (n: number, titulo: string, cuerpo: React.ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr)', gap: 10, alignItems: 'start' }}>
      <span style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--ink)', color: 'var(--bg)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13 }}>{n}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 16, fontWeight: 800 }}>{titulo}</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.35 }}>{cuerpo}</span>
      </span>
    </div>
  );

  return (
    <Sheet onClose={onClose} label="Conectar Google Drive" style={{ gap: 12, maxHeight: '92%', overflowY: 'auto' }}>
      <div className="sheet-title" style={{ paddingBottom: 0 }}>
        Conecta tu Drive.
      </div>
      <div className="sheet-body" style={{ paddingBottom: 4 }}>
        La app solo puede ver la carpeta de respaldos que ella misma crea; nada más de tu Drive.
        {pideId ? ' Primero, una vez, necesitas un "ID de cliente" de Google (toma unos 10 minutos):' : ''}
      </div>
      {pideId && (
        <>
          {paso(
            1,
            'Crea un proyecto',
            <>
              En{' '}
              <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer" style={{ color: 'var(--ink)', fontWeight: 700 }}>
                console.cloud.google.com
              </a>{' '}
              crea un proyecto (por ejemplo "a mano") y activa la <b>Google Drive API</b> en la Biblioteca de APIs.
            </>,
          )}
          {paso(2, 'Configura el acceso', 'En Google Auth Platform (pantalla de consentimiento): tipo Externo, nombre "a mano" y tu correo. En Público, agrega tu correo como usuario de prueba.')}
          {paso(
            3,
            'Crea el ID de cliente',
            <>
              Clientes → Crear cliente → Aplicación web. En «Orígenes de JavaScript autorizados» pon <b style={{ color: 'var(--ink)', overflowWrap: 'anywhere' }}>{origen}</b>.
            </>,
          )}
          {paso(
            4,
            'Pégalo aquí',
            <input
              className="input-big"
              style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}
              value={clientId}
              onChange={(ev) => setClientId(ev.target.value)}
              placeholder="123…apps.googleusercontent.com"
              autoCapitalize="off"
              autoCorrect="off"
              aria-label="ID de cliente de Google"
            />,
          )}
        </>
      )}
      {error && (
        <div role="alert" style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)', padding: '0 4px' }}>
          {error}
        </div>
      )}
      <button className="cta" aria-disabled={probando} onClick={conectar}>
        {probando ? 'Conectando…' : 'Conectar con Google'}
      </button>
    </Sheet>
  );
}

/** Los respaldos de Drive: elegir uno, confirmar y restaurar. */
function RestaurarSheet({ archivos, mensaje, onClose }: { archivos: ArchivoDrive[]; mensaje?: string; onClose: () => void }) {
  const toast = useToast();
  const [elegido, setElegido] = useState<{ a: ArchivoDrive; r: Respaldo } | null>(null);
  const [bajando, setBajando] = useState<string | null>(null);
  if (elegido) {
    return (
      <ConfirmSheet
        title={`¿Reemplazar todo con el respaldo del ${dateLabel(fechaRespaldo(elegido.a)).toLowerCase()}?`}
        body={`Trae ${elegido.r.personas.length} personas y ${elegido.r.gastos.length} gastos. Lo que tienes ahora en el teléfono se borra.`}
        confirm="Sí, restaurar"
        onClose={() => setElegido(null)}
        onConfirm={async () => {
          await importarRespaldo(elegido.r);
          onClose();
          toast(`Respaldo restaurado · ${elegido.r.gastos.length} gastos`);
        }}
      />
    );
  }
  return (
    <Sheet onClose={onClose} label="Restaurar desde Drive" style={{ gap: 8, maxHeight: '85%', overflowY: 'auto' }}>
      <div className="sheet-title" style={{ fontSize: 28 }}>
        restaurar.
      </div>
      <div className="sheet-body" style={{ paddingBottom: 6 }}>
        {mensaje || 'Elige el respaldo. Lo que tienes ahora en el teléfono se reemplaza.'}
      </div>
      {archivos.length ? (
        archivos.map((a) => (
          <button
            key={a.id}
            className="opt-row"
            aria-disabled={!!bajando}
            onClick={async () => {
              if (bajando) return;
              setBajando(a.id);
              try {
                setElegido({ a, r: await bajarRespaldo(a.id) });
              } catch (err) {
                toast((err as Error).message);
              } finally {
                setBajando(null);
              }
            }}
          >
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span>{dateLabel(fechaRespaldo(a))}</span>
              <span className="t-meta">{bajando === a.id ? 'Bajando…' : [tamano(a), `subido ${haceLbl(a.modifiedTime)}`].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
        ))
      ) : (
        <div className="t-note" style={{ padding: '8px 4px 20px' }}>
          Todavía no hay respaldos en tu Drive.
        </div>
      )}
    </Sheet>
  );
}
