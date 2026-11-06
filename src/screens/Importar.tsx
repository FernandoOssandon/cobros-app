// Importar una cartola del banco: se cruza con lo anotado y tú decides qué queda. Al final, la comparación de saldos.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cuadrar, guardarCuenta, ID_EFECTIVO } from '../ahorros';
import { MEDIO_COLORS, guardarMedio, type Medio, type MovAhorro } from '../db';
import { useAjustes, useDatos, type Datos } from '../hooks';
import { aplicarImportacion, recordarDestino, type ResultadoImportar } from '../importar';
import { descripcionDe, ErrorCartola, reconocerCartola, type Cartola } from '../lib/bancos';
import {
  alineacion, claveRef, compararCompras, compararSaldos, decisionesIniciales, efectos, efectosComoMovs, nombreDestino, registrosApp, restoPago, revisar, sumaApp,
  type Accion, type Decision, type Decisiones, type DatosImportar, type Destino, type DiaComparado, type ItemCartola, type Propuesta, type Revision,
} from '../lib/importar';
import { saldoCuenta } from '../lib/ahorro';
import { diaLabel, fmt, shortDate } from '../lib/format';
import { ErrorArchivo, leerXlsx } from '../lib/xlsx';
import { useNav } from '../nav';
import { BackButton, CatChip, Pill, Sheet } from '../ui/kit';
import { useToast } from '../ui/toast';

const CACHE_COMPARTIDO = 'a-mano-compartido';
const CLAVE_COMPARTIDO = '/__compartido__';

function datosImportar(d: Datos): DatosImportar {
  return {
    gastos: d.gastos,
    movimientos: d.movimientos,
    ingresos: d.ingresos,
    movAhorro: d.movAhorro,
    pagosTarjeta: d.pagosTarjeta,
    medios: d.medios,
    cuentas: d.cuentas,
    personas: d.personas.map((v) => v.p),
    saldoPersona: new Map(d.personas.map((v) => [v.p.id, v.saldo])),
    categorias: d.categorias,
    recurrentes: d.recurrentes,
    importados: d.importados,
  };
}

const rango = (desde: string, hasta: string) => (desde === hasta ? shortDate(desde) : `${shortDate(desde)} – ${shortDate(hasta)}`);
const conSigno = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;

/** "Gasto · Comida · Débito Santander", "Pago de Bruno", "Traspaso desde otra cuenta tuya"… */
function describir(p: Propuesta, x: ItemCartola, d: Datos, dest: Destino): string {
  const entra = x.linea.monto > 0;
  switch (p.tipo) {
    case 'gasto': {
      const cat = p.categoriaId ? d.categoria.get(p.categoriaId)?.nombre : undefined;
      const medio = dest.tipo === 'cuenta' ? (p.medioId ? d.medio.get(p.medioId)?.nombre : 'débito de la cuenta') : undefined;
      return ['Gasto', cat ?? 'sin categoría', medio, p.cuotas ? `${p.cuotas} cuotas` : undefined].filter(Boolean).join(' · ');
    }
    case 'pago': {
      const v = d.persona.get(p.personaId);
      return `Pago de ${v?.first ?? 'alguien'}${p.resto ? ` · ${fmt(p.resto)} como ingreso` : ''}`;
    }
    case 'abono':
      return `Le pagaste a ${d.persona.get(p.personaId)?.first ?? 'alguien'}`;
    case 'ingreso':
      return `${p.tipoIngreso === 'sueldo' ? 'Sueldo' : 'Ingreso suelto'} · ${p.descripcion}`;
    case 'traspaso': {
      const otra = p.cuentaId ? (p.cuentaId === ID_EFECTIVO ? 'Efectivo' : d.cuentas.find((c) => c.id === p.cuentaId)?.nombre) : 'otra cuenta tuya';
      return entra ? `Traspaso desde ${otra}` : `Traspaso a ${otra}`;
    }
    case 'pagoTarjeta':
      return dest.tipo === 'tarjeta' ? 'Pago de la tarjeta' : `Pago ${p.medioId ? d.medio.get(p.medioId)?.nombre : 'de tarjeta (elige cuál)'}`;
    case 'ignorar':
      return 'No se anota';
  }
}

/** Lee el archivo compartido desde otra app (lo dejó el service worker). */
async function leerCompartido(): Promise<File | undefined> {
  if (!('caches' in window)) return undefined;
  const cache = await caches.open(CACHE_COMPARTIDO);
  const r = await cache.match(CLAVE_COMPARTIDO);
  if (!r) return undefined;
  await cache.delete(CLAVE_COMPARTIDO);
  const nombre = decodeURIComponent(r.headers.get('x-nombre') ?? 'cartola.xlsx');
  return new File([await r.blob()], nombre);
}

type Paso = 'elegir' | 'destino' | 'revisar' | 'resultado';

export default function Importar() {
  const d = useDatos();
  const aj = useAjustes();
  const [sp] = useSearchParams();
  const { back, push, backLabel } = useNav();
  const toast = useToast();
  const [cartola, setCartola] = useState<Cartola | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [error, setError] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [destinoId, setDestinoId] = useState<string | null>(null);
  const [cambiarDestino, setCambiarDestino] = useState(false);
  const [anteriores, setAnteriores] = useState(false);
  const [cambios, setCambios] = useState<Record<string, Decision>>({});
  const [borrar, setBorrar] = useState<Set<string>>(new Set());
  const [editar, setEditar] = useState<ItemCartola | null>(null);
  const [verCoinciden, setVerCoinciden] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportar | null>(null);

  const cargar = async (f: File) => {
    setError('');
    setLeyendo(true);
    try {
      const c = reconocerCartola(await leerXlsx(await f.arrayBuffer()));
      setCartola(c);
      setNombreArchivo(f.name);
      setDestinoId(null);
      setCambios({});
      setBorrar(new Set());
      setResultado(null);
      setAnteriores(false);
    } catch (e) {
      setError(e instanceof ErrorArchivo || e instanceof ErrorCartola ? e.message : 'No pudimos leer el archivo.');
    } finally {
      setLeyendo(false);
    }
  };

  // Compartido desde otra app: el archivo viene guardado por el service worker.
  useEffect(() => {
    if (!sp.get('compartido')) return;
    leerCompartido()
      .then((f) => (f ? cargar(f) : setError('No llegó el archivo. Prueba eligiéndolo desde aquí.')))
      .catch(() => setError('No llegó el archivo. Prueba eligiéndolo desde aquí.'));
    // Solo al entrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A qué cuenta o tarjeta va: la que abrió la importación, la recordada para este archivo o la elegida.
  const destino: Destino | undefined = useMemo(() => {
    if (!d || !cartola) return undefined;
    const pedido = cartola.tipo === 'cuenta' ? sp.get('cuenta') : sp.get('medio');
    const ids = [destinoId, aj.importar?.[cartola.clave], pedido];
    for (const id of ids) {
      if (!id) continue;
      if (cartola.tipo === 'cuenta') {
        const c = d.cuentas.find((x) => x.id === id && !x.archivada && x.tipo !== 'dap' && x.tipo !== 'efectivo' && !x.moneda);
        if (c) return { tipo: 'cuenta', cuenta: c };
      } else {
        const m = d.medios.find((x) => x.id === id && x.tipo === 'credito' && !x.archivado);
        if (m) return { tipo: 'tarjeta', medio: m };
      }
    }
    return undefined;
  }, [d, cartola, destinoId, aj.importar, sp]);

  const di = useMemo(() => (d ? datosImportar(d) : undefined), [d]);
  const rev = useMemo(() => (cartola && destino && di ? revisar(cartola, destino, di, { incluirAnteriores: anteriores }) : undefined), [cartola, destino, di, anteriores]);
  const dec: Decisiones | undefined = useMemo(() => {
    if (!rev) return undefined;
    const base = decisionesIniciales(rev);
    const items = { ...base.items };
    for (const [k, v] of Object.entries(cambios)) if (items[k]) items[k] = v;
    return { items, borrar };
  }, [rev, cambios, borrar]);

  if (!d || !aj.cargado) return <div className="scroll" />;

  const paso: Paso = !cartola ? 'elegir' : !destino || cambiarDestino ? 'destino' : resultado || (rev && rev.items.every((x) => x.grupo === 'importado' || x.grupo === 'anterior')) ? 'resultado' : 'revisar';
  const salir = () => {
    if (destino?.tipo === 'cuenta') back(`/cuenta/${destino.cuenta.id}`);
    else if (destino?.tipo === 'tarjeta') back('/medios');
    else back('/plata');
  };

  return (
    <div className="screen">
      <div className="scroll" style={{ padding: '4px 16px 24px' }}>
        <div style={{ padding: '0 4px' }}>
          <BackButton onClick={salir} label={backLabel} />
        </div>
        {paso === 'elegir' && <Elegir leyendo={leyendo} error={error} onArchivo={cargar} />}
        {paso === 'destino' && cartola && (
          <ElegirDestino
            cartola={cartola}
            d={d}
            actual={destino}
            onElegir={async (id) => {
              await recordarDestino(cartola.clave, id);
              setDestinoId(id);
              setCambiarDestino(false);
              setCambios({});
              setBorrar(new Set());
            }}
          />
        )}
        {paso === 'revisar' && rev && dec && destino && (
          <Revisar
            rev={rev}
            dec={dec}
            d={d}
            di={di!}
            nombreArchivo={nombreArchivo}
            anteriores={anteriores}
            onAnteriores={setAnteriores}
            onCambiarDestino={() => setCambiarDestino(true)}
            onDecidir={(h, v) => setCambios((c) => ({ ...c, [h]: v }))}
            onBorrar={(k, si) =>
              setBorrar((b) => {
                const n = new Set(b);
                if (si) n.add(k);
                else n.delete(k);
                return n;
              })
            }
            onEditar={setEditar}
            verCoinciden={verCoinciden}
            onVerCoinciden={() => setVerCoinciden((v) => !v)}
          />
        )}
        {paso === 'resultado' && rev && destino && <Resultado rev={rev} d={d} di={di!} res={resultado} onIr={push} />}
      </div>

      {paso === 'revisar' && rev && dec && (
        <div className="foot" style={{ paddingTop: 10 }}>
          <button
            className="cta"
            aria-disabled={aplicando}
            onClick={async () => {
              if (aplicando) return;
              setAplicando(true);
              try {
                const r = await aplicarImportacion(rev, dec, di!.saldoPersona);
                await recordarDestino(rev.cartola.clave, rev.destino.tipo === 'cuenta' ? rev.destino.cuenta.id : rev.destino.medio.id);
                setResultado(r);
                setCambios({});
                setBorrar(new Set());
              } catch {
                toast('No se pudo importar. No se cambió nada.');
              } finally {
                setAplicando(false);
              }
            }}
          >
            {aplicando ? 'Importando…' : textoBoton(rev, dec)}
          </button>
        </div>
      )}
      {paso === 'resultado' && (
        <div className="foot" style={{ paddingTop: 10 }}>
          <button className="cta" onClick={salir}>
            Listo
          </button>
        </div>
      )}
      {editar && rev && dec && (
        <EditarSheet
          x={editar}
          dest={rev.destino}
          d={d}
          di={di!}
          actual={dec.items[editar.huella]?.propuesta ?? editar.propuesta}
          onClose={() => setEditar(null)}
          onListo={(p) => {
            setCambios((c) => ({ ...c, [editar.huella]: { accion: 'nuevo', propuesta: p } }));
            setEditar(null);
          }}
        />
      )}
    </div>
  );
}

function textoBoton(rev: Revision, dec: Decisiones): string {
  let nuevos = 0;
  let corregir = 0;
  for (const x of rev.items) {
    const a = dec.items[x.huella];
    if (!a) continue;
    if (a.accion === 'nuevo' && a.propuesta.tipo !== 'ignorar') nuevos++;
    if (a.accion === 'banco') corregir++;
  }
  const partes = [nuevos && `${nuevos} ${nuevos === 1 ? 'nuevo' : 'nuevos'}`, corregir && `${corregir} ${corregir === 1 ? 'corrección' : 'correcciones'}`, dec.borrar.size && `${dec.borrar.size} ${dec.borrar.size === 1 ? 'borrado' : 'borrados'}`].filter(Boolean);
  return partes.length ? `Importar · ${partes.join(', ')}` : 'Importar';
}

// ---------- 1) Elegir el archivo ----------

function Elegir({ leyendo, error, onArchivo }: { leyendo: boolean; error: string; onArchivo: (f: File) => void }) {
  return (
    <>
      <h1 className="t-screen" style={{ margin: '18px 4px 6px' }}>importar cartola.</h1>
      <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.4, padding: '0 4px', textWrap: 'pretty' }}>
        La cruzamos con lo que ya anotaste: lo que calza se liga, lo nuevo te lo proponemos y al final ves si el saldo cuadra con el banco. Nada se anota hasta que lo confirmes.
      </p>
      {error && (
        <div role="alert" style={{ marginTop: 14, borderRadius: 18, border: '2px solid var(--danger)', padding: '12px 14px', fontSize: 15, fontWeight: 700, color: 'var(--danger)', lineHeight: 1.35 }}>
          {error}
        </div>
      )}
      <label className="cta" style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        {leyendo ? 'Leyendo…' : 'Elegir archivo'}
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Archivo de la cartola"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onArchivo(f);
          }}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
        />
      </label>
      <h2 className="t-section">cómo descargarla.</h2>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {[
          ['Santander · cuenta corriente o vista', 'En la web o la app: tu cuenta → Últimos movimientos → Descargar en Excel.'],
          ['CMR Falabella', 'Movimientos de la tarjeta (facturados o por facturar) → Descargar en Excel.'],
          ['Desde el teléfono', 'También puedes abrir el archivo descargado y usar Compartir → a mano.'],
        ].map(([t, b]) => (
          <div key={t} style={{ padding: '12px 4px', borderTop: '2px solid var(--ink)', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 16, fontWeight: 800 }}>{t}</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.35 }}>{b}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- 2) ¿De qué cuenta o tarjeta es? ----------

function ElegirDestino({ cartola, d, actual, onElegir }: { cartola: Cartola; d: Datos; actual?: Destino; onElegir: (id: string) => void }) {
  const [creando, setCreando] = useState(false);
  const esCuenta = cartola.tipo === 'cuenta';
  const opciones = esCuenta
    ? d.cuentas.filter((c) => !c.archivada && c.tipo !== 'dap' && c.tipo !== 'efectivo' && !c.moneda).map((c) => ({ id: c.id, nombre: c.nombre }))
    : d.medios.filter((m) => m.tipo === 'credito' && !m.archivado).map((m) => ({ id: m.id, nombre: m.nombre }));
  const nueva = esCuenta ? `${cartola.titulo.replace(/\s+[\d-]+$/, '')} ${cartola.banco}` : 'CMR Falabella';
  const crear = async () => {
    if (creando) return;
    setCreando(true);
    const id = esCuenta
      ? await guardarCuenta({ nombre: nueva, tipo: 'vista', institucion: cartola.banco })
      : await guardarMedio({ nombre: nueva, tipo: 'credito', color: MEDIO_COLORS[d.medios.length % MEDIO_COLORS.length] });
    onElegir(id);
  };
  return (
    <>
      <h1 className="t-screen" style={{ margin: '18px 4px 6px' }}>{esCuenta ? '¿de qué cuenta es?' : '¿de qué tarjeta es?'}</h1>
      <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.4, padding: '0 4px' }}>
        {cartola.titulo} · {rango(cartola.desde, cartola.hasta)} · {cartola.lineas.length} movimientos. La próxima vez lo recordamos.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
        {opciones.map((o) => (
          <button key={o.id} className="box-line" aria-pressed={actual && (actual.tipo === 'cuenta' ? actual.cuenta.id : actual.medio.id) === o.id} onClick={() => onElegir(o.id)}>
            <span style={{ fontSize: 17, fontWeight: 800 }}>{o.nombre}</span>
            <span aria-hidden="true">›</span>
          </button>
        ))}
        {!opciones.some((o) => o.nombre.toLowerCase() === nueva.toLowerCase()) && (
          <button className="btn-line" style={{ height: 54 }} onClick={crear}>
            {creando ? 'Creando…' : `Crear ${esCuenta ? 'cuenta' : 'tarjeta'} "${nueva}"`}
          </button>
        )}
      </div>
    </>
  );
}

// ---------- 3) Revisar ----------

interface PropsRevisar {
  rev: Revision;
  dec: Decisiones;
  d: Datos;
  di: DatosImportar;
  nombreArchivo: string;
  anteriores: boolean;
  onAnteriores: (v: boolean) => void;
  onCambiarDestino: () => void;
  onDecidir: (huella: string, v: Decision) => void;
  onBorrar: (clave: string, si: boolean) => void;
  onEditar: (x: ItemCartola) => void;
  verCoinciden: boolean;
  onVerCoinciden: () => void;
}

function Revisar(p: PropsRevisar) {
  const { rev, dec, d } = p;
  const parecidos = rev.items.filter((x) => x.grupo === 'parecido');
  const nuevos = rev.items.filter((x) => x.grupo === 'nuevo');
  const coinciden = rev.items.filter((x) => x.grupo === 'coincide');
  const importados = rev.items.filter((x) => x.grupo === 'importado').length;
  const anteriores = rev.items.filter((x) => x.grupo === 'anterior').length;
  const c = rev.cartola;
  return (
    <>
      <h1 className="t-screen" style={{ margin: '18px 4px 6px' }}>revisar.</h1>
      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)', lineHeight: 1.4, padding: '0 4px' }}>
        {c.titulo} · {rango(c.desde, c.hasta)} → <b style={{ color: 'var(--ink)' }}>{nombreDestino(rev.destino)}</b>{' '}
        <button className="btn-text" style={{ height: 'auto', padding: 0, fontSize: 15, textDecoration: 'underline' }} onClick={p.onCambiarDestino}>
          cambiar
        </button>
      </p>
      <Comparacion rev={rev} dec={dec} d={d} di={p.di} />
      {rev.saldoInicial && (
        <p className="t-meta" style={{ padding: '10px 4px 0', lineHeight: 1.35 }}>
          {nombreDestino(rev.destino)} no tiene saldo en la app: parte con {fmt(rev.saldoInicial.monto)}, lo que tenía el banco el {shortDate(rev.saldoInicial.fecha)}.
        </p>
      )}

      {parecidos.length > 0 && (
        <>
          <Titulo n={parecidos.length} texto="parecidos." sub="El mismo movimiento con otro monto. Elige cuál queda." />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {parecidos.map((x) => (
              <TarjetaParecido key={x.huella} x={x} dcs={dec.items[x.huella]} {...p} />
            ))}
          </div>
        </>
      )}

      {nuevos.length > 0 && (
        <>
          <Titulo n={nuevos.length} texto="nuevos." sub="Están en el banco y no en la app. Revisa cómo se anotan." />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {nuevos.map((x) => (
              <TarjetaNuevo key={x.huella} x={x} dcs={dec.items[x.huella]} {...p} />
            ))}
          </div>
        </>
      )}

      {rev.soloApp.length > 0 && (
        <>
          <Titulo n={rev.soloApp.length} texto="solo en la app." sub={`Anotados entre el ${shortDate(c.cobertura.desde)} y el ${shortDate(c.cobertura.hasta)}, pero no están en el banco. Quizá agrupan varias compras, o el banco aún no los procesa.`} />
          <div className="list" style={{ padding: '0 16px' }}>
            <div className="inner">
              {rev.soloApp.map((a) => {
                const k = claveRef(a.ref);
                const sale = dec.borrar.has(k);
                return (
                  <div key={k} className="mov-row" data-testid="solo-app" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, textDecoration: sale ? 'line-through' : undefined }} className="ellipsis">
                        {a.label}
                      </span>
                      <span className="t-meta">
                        {diaLabel(a.fecha)} · {fmt(Math.abs(a.monto))}
                      </span>
                    </span>
                    <span className="seg">
                      <Pill on={!sale} onClick={() => p.onBorrar(k, false)} className="h36">
                        Dejar
                      </Pill>
                      <Pill on={sale} onClick={() => p.onBorrar(k, true)} className="h36">
                        Borrar
                      </Pill>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {coinciden.length > 0 && (
        <>
          <Titulo n={coinciden.length} texto="ya estaban." sub="Mismo monto y fecha cercana: se ligan sin cambiar nada. En pagos, ingresos y traspasos queda la fecha del banco." />
          <button className="pill h38" onClick={p.onVerCoinciden} aria-expanded={p.verCoinciden}>
            {p.verCoinciden ? 'Ocultar' : `Ver los ${coinciden.length}`}
          </button>
          {p.verCoinciden && (
            <div className="list" style={{ padding: '0 16px', marginTop: 10 }}>
              <div className="inner">
                {coinciden.map((x) => {
                  const distinto = dec.items[x.huella]?.accion === 'nuevo';
                  return (
                    <div key={x.huella} className="mov-row">
                      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: 15, fontWeight: 700 }} className="ellipsis">
                          {(x.app ?? []).map((a) => a.label).join(' + ')}
                        </span>
                        <span className="t-meta ellipsis">
                          {diaLabel(x.linea.fecha)} · banco: {descripcionDe(x.linea.detalle)}
                          {distinto ? ` · se anota aparte (${describir(dec.items[x.huella].propuesta, x, d, rev.destino)})` : ''}
                        </span>
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: x.linea.monto > 0 && rev.destino.tipo === 'cuenta' ? 'var(--pos)' : 'var(--ink)' }}>{conSigno(x.linea.monto)}</span>
                        <button
                          className="btn-text"
                          style={{ height: 'auto', padding: 0, fontSize: 13 }}
                          onClick={() => p.onDecidir(x.huella, { accion: distinto ? 'ligar' : 'nuevo', propuesta: x.propuesta })}
                        >
                          {distinto ? 'Es el mismo' : 'No es el mismo'}
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {(importados > 0 || anteriores > 0 || p.anteriores) && (
        <div className="t-meta" style={{ padding: '22px 4px 0', lineHeight: 1.4 }}>
          {importados > 0 && `${importados} ya ${importados === 1 ? 'se importó' : 'se importaron'} antes. `}
          {(anteriores > 0 || p.anteriores) && rev.inicio && (
            <>
              {anteriores > 0 ? `${anteriores} ${anteriores === 1 ? 'es' : 'son'} de antes del ${shortDate(rev.inicio)} y ya ${anteriores === 1 ? 'está' : 'están'} en el saldo con que partió ${nombreDestino(rev.destino)}. ` : 'Incluyendo los de antes del inicio. '}
              <button className="btn-text" style={{ height: 'auto', padding: 0, fontSize: 13, textDecoration: 'underline' }} onClick={() => p.onAnteriores(!p.anteriores)}>
                {p.anteriores ? 'No incluirlos' : 'Incluirlos igual'}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

const Titulo = ({ n, texto, sub }: { n: number; texto: string; sub: string }) => (
  <>
    <h2 className="t-section" style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      {texto}
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--muted)' }}>{n}</span>
    </h2>
    <p className="t-meta" style={{ padding: '0 4px 10px', marginTop: -6, lineHeight: 1.35 }}>
      {sub}
    </p>
  </>
);

function Linea({ x, dest, banco, children }: { x: ItemCartola; dest: Destino; banco: string; children?: ReactNode }) {
  const entra = x.linea.monto > 0 && dest.tipo === 'cuenta';
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="det-bank">{banco}</span>
        <span className="t-meta">{diaLabel(x.linea.fecha)}</span>
        {x.linea.cuotas ? <span className="t-meta">· {x.linea.cuotas} cuotas</span> : null}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'baseline' }}>
        <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.15, overflowWrap: 'anywhere' }}>{descripcionDe(x.linea.detalle)}</span>
        <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.6, color: entra ? 'var(--pos)' : 'var(--ink)' }}>
          {entra ? '+' : ''}
          {fmt(Math.abs(x.linea.monto))}
        </span>
      </div>
      {children}
    </>
  );
}

function TarjetaParecido({ x, dcs, rev, d, di, onDecidir, onEditar }: PropsRevisar & { x: ItemCartola; dcs?: Decision }) {
  const accion: Accion = dcs?.accion ?? 'banco';
  const app = x.app ?? [];
  const resto = restoPago(x, accion, di.saldoPersona);
  const set = (a: Accion) => onDecidir(x.huella, { accion: a, propuesta: dcs?.propuesta ?? x.propuesta });
  return (
    <div className="det-card" data-testid="parecido">
      <Linea x={x} dest={rev.destino} banco={rev.cartola.banco} />
      <div style={{ borderRadius: 14, background: 'var(--soft)', padding: '10px 12px', fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>
        En la app: {app.map((a) => `${a.label} ${fmt(Math.abs(a.monto))} (${shortDate(a.fecha)})`).join(' + ')}
        <span style={{ display: 'block', color: 'var(--owe)' }}>Diferencia {conSigno(Math.abs(x.linea.monto) - Math.abs(sumaApp(x)))}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }} role="group" aria-label="Cuál queda">
        <Pill on={accion === 'banco'} onClick={() => set('banco')} className="h36 grow chico">
          Banco
        </Pill>
        <Pill on={accion === 'app'} onClick={() => set('app')} className="h36 grow chico">
          App
        </Pill>
        <Pill on={accion === 'nuevo'} onClick={() => set('nuevo')} className="h36 grow chico">
          Son otros
        </Pill>
      </div>
      <span className="t-meta" style={{ lineHeight: 1.35 }}>
        {accion === 'banco' && (resto ? `Te debía ${fmt(Math.abs(x.linea.monto) - resto)}: el pago salda eso y ${fmt(resto)} quedan como ingreso suelto.` : `Se corrige a ${fmt(Math.abs(x.linea.monto))} en la app.`)}
        {accion === 'app' && 'Queda como está. La diferencia aparecerá al comparar el saldo.'}
        {accion === 'nuevo' && (
          <>
            Se anota aparte: {describir(dcs?.propuesta ?? x.propuesta, x, d, rev.destino)} ·{' '}
            <button className="btn-text" style={{ height: 'auto', padding: 0, fontSize: 13, textDecoration: 'underline' }} onClick={() => onEditar(x)}>
              cambiar
            </button>
          </>
        )}
      </span>
    </div>
  );
}

function TarjetaNuevo({ x, dcs, rev, d, onDecidir, onEditar }: PropsRevisar & { x: ItemCartola; dcs?: Decision }) {
  const propuesta = dcs?.propuesta ?? x.propuesta;
  const ignorar = propuesta.tipo === 'ignorar';
  const falta = propuesta.tipo === 'pagoTarjeta' && rev.destino.tipo === 'cuenta' && !propuesta.medioId;
  return (
    <div className="det-card" data-testid="nuevo" style={ignorar ? { opacity: 0.6 } : undefined}>
      <Linea x={x} dest={rev.destino} banco={rev.cartola.banco} />
      <span className="t-meta" style={{ marginTop: -4, color: falta ? 'var(--owe)' : undefined }}>
        {describir(propuesta, x, d, rev.destino)}
        {x.motivo && !ignorar ? ` · ${x.motivo.toLowerCase()}` : ''}
      </span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="det-sec" onClick={() => onEditar(x)}>
          Cambiar
        </button>
        <button
          className="btn-text"
          style={{ marginLeft: 'auto', height: 42, padding: '0 6px', fontSize: 15 }}
          onClick={() => onDecidir(x.huella, { accion: 'nuevo', propuesta: ignorar ? (x.propuesta.tipo === 'ignorar' ? { tipo: 'gasto', descripcion: descripcionDe(x.linea.detalle) } : x.propuesta) : { tipo: 'ignorar' } })}
        >
          {ignorar ? 'Anotar' : 'No anotar'}
        </button>
      </div>
    </div>
  );
}

// ---------- Comparación del saldo (o de las compras) ----------

function useComparacion(rev: Revision, dec: Decisiones | undefined, d: Datos, di: DatosImportar) {
  return useMemo(() => {
    const ef = [...(dec ? efectos(rev, dec, d.medios) : []), ...alineacion(rev, dec, di)];
    if (rev.destino.tipo === 'cuenta') {
      const c = rev.destino.cuenta;
      const movs = [...d.movCuentas.filter((m) => m.cuentaId === c.id), ...efectosComoMovs(c.id, ef, rev)];
      const dias = compararSaldos(rev.cartola, rev.inicio ?? rev.saldoInicial?.fecha, (f) => saldoCuenta(c, movs, f));
      return { tipo: 'cuenta' as const, dias, final: dias[dias.length - 1] };
    }
    const compras = compararCompras(rev, registrosApp(rev.destino, di), ef);
    return { tipo: 'tarjeta' as const, compras };
  }, [rev, dec, d, di]);
}

function Comparacion({ rev, dec, d, di }: { rev: Revision; dec: Decisiones; d: Datos; di: DatosImportar }) {
  const cmp = useComparacion(rev, dec, d, di);
  const [ver, setVer] = useState(false);
  if (cmp.tipo === 'cuenta') {
    const f = cmp.final;
    if (!f) return null;
    const malos = cmp.dias.filter((x) => x.dif);
    return (
      <div style={{ marginTop: 14, borderRadius: 22, border: `2px solid ${f.dif ? 'var(--owe)' : 'var(--pos)'}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="comparacion">
        <span className="row-between">
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--muted)' }}>Saldo al {shortDate(f.fecha)}, con estos cambios</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: f.dif ? 'var(--owe)' : 'var(--pos)' }}>{f.dif ? 'No cuadra' : 'Cuadra'}</span>
        </span>
        <span className="row-between" style={{ fontSize: 17, fontWeight: 800 }}>
          <span>Banco {fmt(f.banco)}</span>
          <span>App {fmt(f.app)}</span>
        </span>
        {malos.length > 0 && (
          <button className="btn-text" style={{ alignSelf: 'flex-start', height: 'auto', padding: 0, fontSize: 14, textDecoration: 'underline' }} onClick={() => setVer(!ver)}>
            {ver ? 'Ocultar días' : f.dif ? `Diferencia ${conSigno(f.dif)} · ver desde cuándo` : `${malos.length} ${malos.length === 1 ? 'día no calzó' : 'días no calzaron'} antes · ver`}
          </button>
        )}
        {ver && <DiasDif dias={malos} />}
      </div>
    );
  }
  const c = cmp.compras;
  if (!c) return null;
  return (
    <div style={{ marginTop: 14, borderRadius: 22, border: `2px solid ${c.dif ? 'var(--owe)' : 'var(--pos)'}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="comparacion">
      <span className="row-between">
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--muted)' }}>Compras {rango(c.desde, c.hasta)}, con estos cambios</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: c.dif ? 'var(--owe)' : 'var(--pos)' }}>{c.dif ? 'No cuadra' : 'Cuadra'}</span>
      </span>
      <span className="row-between" style={{ fontSize: 17, fontWeight: 800 }}>
        <span>Banco {fmt(c.banco)}</span>
        <span>App {fmt(c.app)}</span>
      </span>
      {c.dias.length > 0 && (
        <button className="btn-text" style={{ alignSelf: 'flex-start', height: 'auto', padding: 0, fontSize: 14, textDecoration: 'underline' }} onClick={() => setVer(!ver)}>
          {ver ? 'Ocultar días' : `Diferencia ${conSigno(c.dif)} · ver qué días`}
        </button>
      )}
      {ver && <DiasDif dias={c.dias} />}
    </div>
  );
}

const DiasDif = ({ dias }: { dias: DiaComparado[] }) => (
  <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>
    {dias.slice(0, 20).map((x) => (
      <div key={x.fecha} className="row-between" style={{ borderTop: '1px solid var(--line)', padding: '8px 0', fontSize: 14, fontWeight: 600 }}>
        <span>{diaLabel(x.fecha)}</span>
        <span style={{ color: 'var(--muted)' }}>
          banco {fmt(x.banco)} · app {fmt(x.app)}
        </span>
        <span style={{ fontWeight: 800, color: 'var(--owe)', minWidth: 70, textAlign: 'right' }}>{conSigno(x.dif)}</span>
      </div>
    ))}
  </div>
);

// ---------- 4) Resultado ----------

function Resultado({ rev, d, di, res, onIr }: { rev: Revision; d: Datos; di: DatosImportar; res: ResultadoImportar | null; onIr: (p: string) => void }) {
  const toast = useToast();
  const cmp = useComparacion(rev, undefined, d, di);
  const [abierto, setAbierto] = useState<string | null>(null);
  const resumen = res
    ? [
        res.ligados && `${res.ligados} ya estaban`,
        res.creados && `${res.creados} ${res.creados === 1 ? 'anotado' : 'anotados'}`,
        res.corregidos && `${res.corregidos} ${res.corregidos === 1 ? 'corregido' : 'corregidos'}`,
        res.borrados && `${res.borrados} ${res.borrados === 1 ? 'borrado' : 'borrados'}`,
        res.ignorados && `${res.ignorados} sin anotar`,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Esta cartola ya estaba importada.';

  if (cmp.tipo === 'tarjeta') {
    const c = cmp.compras;
    const ok = !c || !c.dif;
    return (
      <>
        <h1 style={{ fontSize: 54, fontWeight: 800, letterSpacing: -2.4, lineHeight: 0.95, margin: '28px 4px 10px' }}>{ok ? 'Cuadra.' : 'No cuadra.'}</h1>
        <p style={{ fontSize: 17, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.4, padding: '0 4px' }}>
          {c ? `Compras del ${shortDate(c.desde)} al ${shortDate(c.hasta)}: el banco suma ${fmt(c.banco)} y la app ${fmt(c.app)}${c.dif ? ` (diferencia ${conSigno(c.dif)})` : ''}.` : 'No hay compras para comparar en estas fechas.'}
        </p>
        <p className="t-meta" style={{ padding: '10px 4px 0' }}>{resumen}</p>
        {c && c.dias.length > 0 && (
          <>
            <h2 className="t-section">días que no calzan.</h2>
            <DiasDif dias={c.dias} />
            <p className="t-meta" style={{ padding: '8px 4px 0', lineHeight: 1.35 }}>
              Revisa en Gastos lo que anotaste esos días con {nombreDestino(rev.destino)}. Si una compra aparece un día en el banco y otro en la app, verás la misma diferencia con signo contrario.
            </p>
            <button className="btn-line" style={{ marginTop: 12 }} onClick={() => onIr('/gastos')}>
              Ir a Gastos
            </button>
          </>
        )}
      </>
    );
  }

  if (rev.destino.tipo !== 'cuenta') return null;
  const f = cmp.final;
  const malos = cmp.dias.filter((x) => x.dif);
  const c = rev.destino.cuenta;
  const ok = !f || !f.dif;
  const filasDia = (fecha: string) => d.movCuentas.filter((m) => m.cuentaId === c.id && m.fecha === fecha && m.tipo !== 'cuadre');
  const ir = (origen: MovAhorro['origen']) => {
    if (origen?.tipo === 'gasto') onIr(`/gasto/${origen.id}`);
    else if (origen?.tipo === 'pago' && origen.personaId) onIr(`/persona/${origen.personaId}`);
    else if (origen?.tipo === 'pagoTarjeta') onIr('/medios');
    else onIr(`/cuenta/${c.id}`);
  };
  return (
    <>
      <h1 style={{ fontSize: 54, fontWeight: 800, letterSpacing: -2.4, lineHeight: 0.95, margin: '28px 4px 10px' }}>{ok ? 'Cuadra.' : 'No cuadra.'}</h1>
      <p style={{ fontSize: 17, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.4, padding: '0 4px', textWrap: 'pretty' }}>
        {f
          ? ok
            ? `Al ${shortDate(f.fecha)}, la app y el banco tienen ${fmt(f.banco)} en ${c.nombre}.`
            : `Al ${shortDate(f.fecha)} el banco tiene ${fmt(f.banco)} y la app ${fmt(f.app)}: diferencia ${conSigno(f.dif)}.`
          : 'No hay saldos para comparar.'}
      </p>
      <p className="t-meta" style={{ padding: '10px 4px 0' }}>{resumen}</p>

      {malos.length > 0 && (
        <>
          <h2 className="t-section">{ok ? 'días que no calzaron.' : 'desde cuándo no calza.'}</h2>
          <p className="t-meta" style={{ padding: '0 4px 10px', marginTop: -6, lineHeight: 1.35 }}>
            {ok
              ? 'Al final cuadra (un cuadre anterior absorbió la diferencia), pero estos días el saldo de la app y el del banco no eran iguales.'
              : `El ${shortDate(malos[0].fecha)} es el primer día distinto. Toca un día para ver el banco y la app lado a lado.`}
          </p>
          <div className="list" style={{ padding: '0 16px' }}>
            <div className="inner">
              {malos.slice(0, 30).map((x) => (
                <div key={x.fecha} style={{ borderTop: '1px solid var(--line)' }}>
                  <button className="mov-row" style={{ borderTop: 'none' }} onClick={() => setAbierto(abierto === x.fecha ? null : x.fecha)} aria-expanded={abierto === x.fecha}>
                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{diaLabel(x.fecha)}</span>
                      <span className="t-meta">
                        banco {fmt(x.banco)} · app {fmt(x.app)}
                      </span>
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--owe)' }}>{conSigno(x.dif)}</span>
                  </button>
                  {abierto === x.fecha && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 0 12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span className="t-label" style={{ padding: 0 }}>Banco</span>
                        {x.lineas.map((l) => (
                          <span key={l.orden} style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
                            {descripcionDe(l.detalle)} <b>{conSigno(l.monto)}</b>
                          </span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span className="t-label" style={{ padding: 0 }}>App</span>
                        {filasDia(x.fecha).length ? (
                          filasDia(x.fecha).map((m) => (
                            <button key={m.id} onClick={() => ir(m.origen)} style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', fontSize: 13, fontWeight: 600, lineHeight: 1.3, color: 'var(--ink)', textDecoration: 'underline' }}>
                              {m.nota ?? (m.tipo === 'deposito' ? 'Depósito' : 'Retiro')} <b>{conSigno(m.tipo === 'deposito' ? m.monto : -m.monto)}</b>
                            </button>
                          ))
                        ) : (
                          <span className="t-meta">Nada anotado ese día.</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {f && f.dif !== 0 && (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            className="box-line"
            onClick={async () => {
              await cuadrar(c.id, f.banco, f.fecha);
              toast(`Cuadrada con el banco · ajuste de ${conSigno(f.dif)}`);
            }}
          >
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 17, fontWeight: 800 }}>Cuadrar con el banco</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', lineHeight: 1.3 }}>
                La app queda con {fmt(f.banco)} al {shortDate(f.fecha)}. La diferencia ({conSigno(f.dif)}) aparece como "Ajuste al cuadrar".
              </span>
            </span>
            <span aria-hidden="true">›</span>
          </button>
          <button className="btn-line" onClick={() => onIr(`/cuenta/${c.id}`)}>
            Lo reviso yo
          </button>
        </div>
      )}
    </>
  );
}

// ---------- Cambiar cómo se anota ----------

type TipoP = Propuesta['tipo'];

function EditarSheet({ x, dest, d, di, actual, onClose, onListo }: { x: ItemCartola; dest: Destino; d: Datos; di: DatosImportar; actual: Propuesta; onClose: () => void; onListo: (p: Propuesta) => void }) {
  const entra = x.linea.monto > 0;
  const tipos: [TipoP, string][] =
    dest.tipo === 'tarjeta'
      ? entra
        ? [['gasto', 'Gasto'], ['ignorar', 'No anotar']]
        : [['pagoTarjeta', 'Pago de la tarjeta'], ['ignorar', 'No anotar']]
      : entra
        ? [['pago', 'Pago de alguien'], ['ingreso', 'Ingreso'], ['traspaso', 'Desde otra cuenta tuya'], ['ignorar', 'No anotar']]
        : [['gasto', 'Gasto'], ['abono', 'Le pagué a alguien'], ['traspaso', 'A otra cuenta tuya'], ['pagoTarjeta', 'Pago de tarjeta'], ['ignorar', 'No anotar']];
  const [tipo, setTipo] = useState<TipoP>(actual.tipo);
  const [desc, setDesc] = useState(actual.tipo === 'gasto' || actual.tipo === 'ingreso' ? actual.descripcion : descripcionDe(x.linea.detalle));
  const [cat, setCat] = useState(actual.tipo === 'gasto' ? actual.categoriaId : undefined);
  const [persona, setPersona] = useState(actual.tipo === 'pago' || actual.tipo === 'abono' ? actual.personaId : undefined);
  const [sueldo, setSueldo] = useState(actual.tipo === 'ingreso' && actual.tipoIngreso === 'sueldo');
  const [otra, setOtra] = useState<string | undefined>(actual.tipo === 'traspaso' ? actual.cuentaId : undefined);
  const [tarjeta, setTarjeta] = useState(actual.tipo === 'pagoTarjeta' ? actual.medioId : undefined);
  const monto = Math.abs(x.linea.monto);
  const debe = persona ? (di.saldoPersona.get(persona) ?? 0) : 0;
  const resto = tipo === 'pago' && debe > 0 && monto > debe ? monto - debe : undefined;
  const cuentas = d.cuentas.filter((c) => !c.archivada && c.tipo !== 'dap' && !c.moneda && (dest.tipo !== 'cuenta' || c.id !== dest.cuenta.id));
  const credito = d.medios.filter((m) => m.tipo === 'credito' && !m.archivado);

  const listo = () => {
    let p: Propuesta;
    switch (tipo) {
      case 'gasto':
        p = { tipo: 'gasto', descripcion: desc.trim() || descripcionDe(x.linea.detalle), categoriaId: cat, medioId: actual.tipo === 'gasto' ? actual.medioId : undefined, cuotas: x.linea.cuotas };
        break;
      case 'pago':
      case 'abono':
        if (!persona) return;
        p = tipo === 'pago' ? { tipo, personaId: persona, resto } : { tipo, personaId: persona };
        break;
      case 'ingreso':
        p = { tipo: 'ingreso', descripcion: desc.trim() || descripcionDe(x.linea.detalle), tipoIngreso: sueldo ? 'sueldo' : 'otro', recurrenteId: actual.tipo === 'ingreso' && sueldo ? actual.recurrenteId : undefined };
        break;
      case 'traspaso':
        p = { tipo: 'traspaso', cuentaId: otra };
        break;
      case 'pagoTarjeta':
        p = { tipo: 'pagoTarjeta', medioId: dest.tipo === 'tarjeta' ? undefined : tarjeta };
        break;
      default:
        p = { tipo: 'ignorar' };
    }
    onListo(p);
  };

  return (
    <Sheet onClose={onClose} label="Cómo se anota" style={{ gap: 12, maxHeight: '92%', overflowY: 'auto' }}>
      <div className="sheet-title" style={{ paddingBottom: 0 }}>
        {descripcionDe(x.linea.detalle)}
      </div>
      <div className="sheet-body" style={{ paddingBottom: 0 }}>
        {diaLabel(x.linea.fecha)} · {entra && dest.tipo === 'cuenta' ? '+' : ''}
        {fmt(monto)}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {tipos.map(([t, label]) => (
          <Pill key={t} on={tipo === t} onClick={() => setTipo(t)} className="h38">
            {label}
          </Pill>
        ))}
      </div>
      {(tipo === 'gasto' || tipo === 'ingreso') && (
        <input className="input-big" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descripción" maxLength={60} aria-label="Descripción" />
      )}
      {tipo === 'gasto' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {d.categorias
            .filter((c) => !c.archivada)
            .map((c) => (
              <CatChip key={c.id} cat={c} on={cat === c.id} onClick={() => setCat(cat === c.id ? undefined : c.id)} />
            ))}
        </div>
      )}
      {tipo === 'ingreso' && (
        <div className="seg">
          <Pill on={!sueldo} onClick={() => setSueldo(false)} className="h36">
            Ingreso suelto
          </Pill>
          <Pill on={sueldo} onClick={() => setSueldo(true)} className="h36">
            Sueldo
          </Pill>
        </div>
      )}
      {(tipo === 'pago' || tipo === 'abono') && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {d.personas
              .filter((v) => !v.p.archivada)
              .map((v) => (
                <Pill key={v.p.id} on={persona === v.p.id} onClick={() => setPersona(v.p.id)} className="h36">
                  {v.first}
                  {tipo === 'pago' && v.saldo > 0 ? ` · ${fmt(v.saldo)}` : tipo === 'abono' && v.saldo < 0 ? ` · ${fmt(-v.saldo)}` : ''}
                </Pill>
              ))}
          </div>
          {resto ? <span className="t-meta">Te debía {fmt(debe)}: el resto ({fmt(resto)}) se anota como ingreso suelto.</span> : null}
        </>
      )}
      {tipo === 'traspaso' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {cuentas.map((c) => (
            <Pill key={c.id} on={otra === c.id} onClick={() => setOtra(c.id)} className="h36">
              {c.nombre}
            </Pill>
          ))}
          <Pill on={!otra} onClick={() => setOtra(undefined)} className="h36">
            Una que no llevo en la app
          </Pill>
        </div>
      )}
      {tipo === 'pagoTarjeta' && dest.tipo === 'cuenta' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {credito.map((m: Medio) => (
            <Pill key={m.id} on={tarjeta === m.id} onClick={() => setTarjeta(m.id)} className="h36">
              {m.nombre}
            </Pill>
          ))}
        </div>
      )}
      <button className="cta" aria-disabled={(tipo === 'pago' || tipo === 'abono') && !persona} onClick={listo}>
        Listo
      </button>
    </Sheet>
  );
}
