// Detectados en tu correo y Conectar Gmail.
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import scriptGmail from '../../integraciones/gmail/Codigo.gs?raw';
import {
  anotarDetectado, anotarPagoDetectado, conectarCorreo, desconectarCorreo, descartarDetectado, ErrorCorreo, leerCorreo, restaurarDetectado, vincularDetectado,
} from '../correo';
import { borrarGasto, borrarMovimiento, db, guardarAjustes, type Detectado } from '../db';
import { useAjustes, useDatos, type Datos } from '../hooks';
import { daysBetween, fmt, shortDate, todayISO } from '../lib/format';
import { useNav } from '../nav';
import { BackButton, PickerSheet, Sheet } from '../ui/kit';
import { useToast } from '../ui/toast';

/** "Hoy 10:42", "Ayer 19:08", "23 nov 18:30". */
export function cuandoLbl(fecha: string, hora?: string, hoy = todayISO()) {
  const dd = daysBetween(fecha, hoy);
  const dia = dd === 0 ? 'Hoy' : dd === 1 ? 'Ayer' : shortDate(fecha);
  return hora ? `${dia} ${hora}` : dia;
}

/** "hace 5 min", "hace 2 h", "recién". */
export function haceLbl(iso?: string, ahora = Date.now()) {
  if (!iso) return 'todavía no se revisa';
  const min = Math.floor((ahora - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} ${Math.floor(h / 24) === 1 ? 'día' : 'días'}`;
}

/** Cómo se presenta cada detectado: gasto o pago con una persona. */
function vista(x: Detectado, d: Datos) {
  const v = x.personaId ? d.persona.get(x.personaId) : undefined;
  const recibido = x.tipo === 'recibido';
  // Una transferencia enviada a alguien a quien le debes se propone como pago ("le pagué").
  const esPago = recibido || (x.tipo === 'transferencia' && !!v && v.saldo < 0);
  const gastoParecido = !esPago && x.parecidoA ? d.gasto.get(x.parecidoA) : undefined;
  let titulo = x.comercio;
  let meta = '';
  if (recibido) {
    titulo = `Transferencia de ${x.comercio}`;
    meta = v ? `Se anota como pago de ${v.first}${v.saldo > 0 ? ` · te debe ${fmt(v.saldo)}` : ''}` : 'Transferencia recibida · elige de quién';
  } else if (esPago && v) {
    titulo = `Transferencia a ${x.comercio}`;
    meta = `Se anota como pago a ${v.first} · le debes ${fmt(-v.saldo)}`;
  } else {
    const medio = x.medioId ? d.medio.get(x.medioId) : undefined;
    const cat = x.categoriaId ? d.categoria.get(x.categoriaId) : undefined;
    meta = `${medio?.nombre ?? 'Medio por definir'} · ${cat ? `${cat.nombre} (sugerida)` : 'Sin categoría'}`;
  }
  return { v, esPago, recibido, gastoParecido, titulo, meta };
}

export function Detectados() {
  const d = useDatos();
  const aj = useAjustes();
  const { push, back, backLabel } = useNav();
  const toast = useToast();
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState('');
  const [elegirPersona, setElegirPersona] = useState<{ x: Detectado; editar: boolean } | null>(null);
  const conectado = !!aj.correo;
  const ultima = aj.correo?.ultimaLectura;

  // Al abrir, revisa si pasó más de un minuto desde la última lectura.
  useEffect(() => {
    if (!conectado) return;
    if (ultima && Date.now() - new Date(ultima).getTime() < 60_000) return;
    let vivo = true;
    setLeyendo(true);
    leerCorreo()
      .then((r) => {
        if (vivo) setError('');
        if (r?.nuevos) toast(`${r.nuevos} ${r.nuevos === 1 ? 'cobro nuevo' : 'cobros nuevos'} en tu correo`);
      })
      .catch((e) => vivo && setError(e instanceof ErrorCorreo ? e.message : 'No se pudo revisar el correo.'))
      .finally(() => vivo && setLeyendo(false));
    return () => {
      vivo = false;
    };
    // Solo al entrar (y si cambia la conexión).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectado]);

  if (!aj.cargado || !d) return <div className="scroll" />;
  if (!conectado) return <Navigate to="/correo/conectar" replace />;

  const pendientes = d.detectados.filter((x) => x.estado === 'pendiente');

  const anotar = async (x: Detectado) => {
    const antes = { ...x };
    const gid = await anotarDetectado(x.id);
    if (gid)
      toast(`Anotado · ${x.comercio} ${fmt(x.monto)}`, {
        label: 'Deshacer',
        run: async () => {
          await borrarGasto(gid);
          await restaurarDetectado(antes);
        },
      });
  };
  const anotarPago = async (x: Detectado, personaId?: string) => {
    const antes = { ...x };
    const mid = await anotarPagoDetectado(x.id, personaId);
    if (mid)
      toast(`Pago anotado · ${fmt(x.monto)}`, {
        label: 'Deshacer',
        run: async () => {
          await borrarMovimiento(mid);
          await restaurarDetectado(antes);
        },
      });
  };
  const descartar = async (x: Detectado) => {
    const antes = await descartarDetectado(x.id);
    if (antes) toast(`Descartado · ${x.comercio}`, { label: 'Deshacer', run: () => restaurarDetectado(antes) });
  };
  const editarPago = (x: Detectado, pid: string) => push(`/persona/${pid}/pago?det=${encodeURIComponent(x.id)}`);

  return (
    <div className="scroll" style={{ padding: '4px 16px var(--safe-bottom)' }}>
      <div style={{ padding: '0 4px' }}>
        <BackButton onClick={() => back('/plata')} label={backLabel} />
      </div>
      <h1 className="t-screen" style={{ margin: '18px 4px 6px' }}>detectados.</h1>
      <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.4, padding: '0 4px', textWrap: 'pretty' }}>
        Cobros leídos de los correos de tu banco. Nada se anota hasta que lo confirmes.
      </div>
      {error && (
        <div role="alert" style={{ marginTop: 14, borderRadius: 18, border: '2px solid var(--danger)', padding: '12px 14px', fontSize: 15, fontWeight: 700, color: 'var(--danger)', lineHeight: 1.35 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
        {pendientes.map((x) => {
          const vw = vista(x, d);
          const pid = vw.v?.p.id;
          return (
            <div key={x.id} className="det-card" data-testid="detectado">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="det-bank">{x.banco ?? 'Correo'}</span>
                <span className="t-meta">{cuandoLbl(x.fecha, x.hora)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'baseline' }}>
                <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.15, overflowWrap: 'anywhere' }}>{vw.titulo}</span>
                <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.6, color: vw.recibido ? 'var(--pos)' : 'var(--ink)' }}>
                  {vw.recibido ? '+' : ''}
                  {fmt(x.monto)}
                </span>
              </div>
              <div className="t-meta" style={{ marginTop: -4 }}>{vw.meta}</div>
              {vw.gastoParecido && (
                <div style={{ borderRadius: 14, background: 'var(--soft)', padding: '10px 12px', fontSize: 14, fontWeight: 700, color: 'var(--owe)', lineHeight: 1.3 }}>
                  Ya anotaste {vw.gastoParecido.descripcion} por {fmt(vw.gastoParecido.total)} el {shortDate(vw.gastoParecido.fecha)}. ¿Es el mismo?
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {vw.gastoParecido ? (
                  <>
                    <button
                      className="det-prim"
                      onClick={async () => {
                        await vincularDetectado(x.id, vw.gastoParecido!.id);
                        toast('Listo, no se duplica');
                      }}
                    >
                      Es el mismo
                    </button>
                    <button className="det-sec" onClick={() => anotar(x)}>
                      Anotar igual
                    </button>
                  </>
                ) : vw.esPago ? (
                  <>
                    <button className="det-prim" onClick={() => (pid ? anotarPago(x, pid) : setElegirPersona({ x, editar: false }))}>
                      Anotar pago
                    </button>
                    <button className="det-sec" onClick={() => (pid ? editarPago(x, pid) : setElegirPersona({ x, editar: true }))}>
                      Editar
                    </button>
                  </>
                ) : (
                  <>
                    <button className="det-prim" onClick={() => anotar(x)}>
                      Anotar
                    </button>
                    <button className="det-sec" onClick={() => push(`/gasto/nuevo?det=${encodeURIComponent(x.id)}`)}>
                      Editar
                    </button>
                  </>
                )}
                {!vw.gastoParecido && (
                  <button className="btn-text" style={{ marginLeft: 'auto', height: 42, padding: '0 6px', fontSize: 15 }} onClick={() => descartar(x)}>
                    Descartar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!pendientes.length && (
        <div style={{ padding: '30px 4px 10px' }}>
          <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: -2, lineHeight: 0.95 }}>{leyendo ? 'Revisando…' : 'Al día.'}</div>
          <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--muted)', marginTop: 12, lineHeight: 1.35 }}>
            {leyendo ? 'Buscando correos nuevos de tu banco.' : 'No hay cobros nuevos en tu correo. Te avisamos cuando llegue el próximo.'}
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, padding: '16px 4px 0', borderTop: '2px solid var(--ink)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }} className="ellipsis">
            {aj.correo?.email ?? 'Gmail conectado'}
          </span>
          <span className="t-meta">
            {leyendo ? 'Revisando ahora…' : `Revisado ${haceLbl(ultima)}`} · solo correos de bancos
          </span>
        </span>
        <button
          className="btn-o"
          style={{ height: 38, fontSize: 13, padding: '0 14px' }}
          onClick={async () => {
            await desconectarCorreo();
            toast('Gmail desconectado');
            back('/plata');
          }}
        >
          Desconectar
        </button>
      </div>

      {elegirPersona && (
        <PickerSheet
          title={elegirPersona.x.tipo === 'recibido' ? '¿Quién te pagó?' : '¿A quién le pagaste?'}
          value={null}
          options={d.personas.filter((v) => !v.p.archivada).map((v) => ({ value: v.p.id, label: v.p.nombre }))}
          onClose={() => setElegirPersona(null)}
          onPick={async (pid) => {
            const { x, editar } = elegirPersona;
            setElegirPersona(null);
            if (!pid) return;
            await db.detectados.update(x.id, { personaId: pid });
            if (editar) editarPago(x, pid);
            else await anotarPago(x, pid);
          }}
        />
      )}
    </div>
  );
}

// ---------- Conectar Gmail ----------

const PUNTOS: [string, string][] = [
  ['Solo correos de bancos', 'BCI, Banco Estado, Santander, Mach, Tenpo y Mercado Pago. El resto ni lo abrimos.'],
  ['Solo lectura', 'No enviamos, borramos ni movemos correos.'],
  ['Todo queda en tu teléfono', 'Los cobros se guardan acá, como todo lo demás. Desconectas cuando quieras.'],
];

export function ConectarGmail() {
  const { back, navigate, backLabel } = useNav();
  const [paso, setPaso] = useState(false);
  return (
    <div className="screen">
      <div className="scroll" style={{ padding: '4px 20px 20px' }}>
        <BackButton onClick={() => back('/plata')} label={backLabel} />
        <h1 style={{ fontSize: 54, fontWeight: 800, letterSpacing: -2.4, lineHeight: 0.95, marginTop: 28 }}>
          Conecta
          <br />
          tu correo.
        </h1>
        <p style={{ fontSize: 18, fontWeight: 500, color: 'var(--muted)', marginTop: 14, lineHeight: 1.35, textWrap: 'pretty' }}>
          Tu banco te manda un correo por cada compra. Lo leemos y te proponemos el gasto; tú decides si se anota.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 24 }}>
          {PUNTOS.map(([t, b], i) => (
            <div key={t} style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr)', gap: 14, padding: '14px 0', borderTop: '2px solid var(--ink)' }}>
              <span style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--ink)', color: 'var(--bg)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 15 }}>{i + 1}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 17, fontWeight: 800 }}>{t}</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.35, textWrap: 'pretty' }}>{b}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="foot" style={{ gap: 4, paddingTop: 10 }}>
        <button className="cta h60" onClick={() => setPaso(true)}>
          Conectar Gmail
        </button>
        <button className="btn-text" onClick={() => back('/plata')}>
          Ahora no
        </button>
      </div>
      {paso && <ConexionSheet onClose={() => setPaso(false)} onListo={() => navigate('/correo', { replace: true, state: { from: 'Mi plata' } })} />}
    </div>
  );
}

/**
 * La conexión real: el script de Google Apps Script que corre en tu cuenta (ver integraciones/gmail/README.md).
 * Se copia el script, se publica como aplicación web y se pega aquí su URL con la clave.
 */
function ConexionSheet({ onClose, onListo }: { onClose: () => void; onListo: () => void }) {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [clave, setClave] = useState('');
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState('');

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(scriptGmail);
      toast('Script copiado');
    } catch {
      toast('No se pudo copiar. Está en integraciones/gmail/Codigo.gs');
    }
  };
  const probar = async () => {
    if (!/^https:\/\/\S+$/.test(url.trim())) return setError('Pega la URL que termina en /exec.');
    if (clave.trim().length < 8) return setError('La clave debe tener al menos 8 caracteres.');
    setError('');
    setProbando(true);
    try {
      await conectarCorreo(url, clave);
      const r = await leerCorreo();
      toast(`Gmail conectado · ${r?.nuevos ?? 0} ${r?.nuevos === 1 ? 'cobro' : 'cobros'} por revisar`);
      onListo();
    } catch (e) {
      await guardarAjustes({ correo: undefined });
      setError(e instanceof ErrorCorreo ? e.message : 'No se pudo conectar.');
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
    <Sheet onClose={onClose} label="Conectar Gmail" style={{ gap: 12, maxHeight: '92%', overflowY: 'auto' }}>
      <div className="sheet-title" style={{ paddingBottom: 0 }}>
        Conecta tu Gmail.
      </div>
      <div className="sheet-body" style={{ paddingBottom: 4 }}>
        Se hace una vez, con un script que corre en tu propia cuenta de Google. Toma unos 5 minutos.
      </div>
      {paso(
        1,
        'Copia el script',
        <button className="pill h36" style={{ marginTop: 4, padding: '0 14px' }} onClick={copiar}>
          Copiar el script
        </button>,
      )}
      {paso(
        2,
        'Pégalo en Google',
        <>
          Entra a{' '}
          <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer" style={{ color: 'var(--ink)', fontWeight: 700 }}>
            script.google.com
          </a>
          , crea un proyecto, pega el script y cambia <b>CLAVE</b> por una frase larga que solo tú sepas.
        </>,
      )}
      {paso(3, 'Publícalo', 'Implementar → Nueva implementación → Aplicación web. Ejecutar como "Yo"; acceso "Cualquier usuario". Acepta los permisos y copia la URL.')}
      {paso(
        4,
        'Pega la URL y tu clave',
        <span style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <input className="input-big" style={{ fontSize: 14, fontWeight: 600 }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" inputMode="url" autoCapitalize="off" autoCorrect="off" aria-label="URL del script" />
          <input className="input-big" style={{ fontSize: 15, fontWeight: 600 }} value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Tu clave" autoCapitalize="off" autoCorrect="off" aria-label="Clave" />
        </span>,
      )}
      {error && (
        <div role="alert" style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)', padding: '0 4px' }}>
          {error}
        </div>
      )}
      <button className="cta" aria-disabled={probando} onClick={probar}>
        {probando ? 'Probando…' : 'Probar y conectar'}
      </button>
    </Sheet>
  );
}
