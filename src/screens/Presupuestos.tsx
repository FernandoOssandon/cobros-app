// Presupuestos: varios a la vez, cada uno con todo tu gasto o con una o varias categorías, por semana o por mes.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db, type Presupuesto } from '../db';
import { useDatos } from '../hooks';
import { dg, fmt, MESES_LARGOS, show, todayISO } from '../lib/format';
import { avancePresupuesto, avances, categoriasDe, type AvancePresupuesto } from '../lib/presupuestos';
import { useNav } from '../nav';
import { borrarPresupuesto, guardarPresupuesto } from '../presupuestos';
import { Icon } from '../ui/icons';
import { BackButton, CatChip, Pill, Switch, TaskHeader } from '../ui/kit';
import { BarraPresupuesto, categoriasPresupuesto, ChipEstado, IconoPresupuesto, LineasPresupuesto, lineasPresupuesto, nombreAuto, nombrePresupuesto, subPresupuesto } from '../ui/presupuesto';
import { useToast } from '../ui/toast';

export function Presupuestos() {
  const d = useDatos();
  const { push, back, backLabel } = useNav();
  if (!d) return <div className="scroll" />;
  const avs = avances(d.presupuestos, d.imputados, todayISO()).sort((a, b) => a.presupuesto.orden - b.presupuesto.orden);
  return (
    <div className="scroll" style={{ padding: '4px 16px var(--safe-bottom)' }}>
      <div className="row-between">
        <BackButton onClick={() => back('/')} label={backLabel} />
        {avs.length > 0 && (
          <button className="btn-o add" onClick={() => push('/presupuesto/nuevo')}>
            <Icon name="plus" size={16} w={3} />
            Nuevo
          </button>
        )}
      </div>
      <h1 className="t-screen" style={{ margin: '18px 4px 8px' }}>presupuestos.</h1>
      {avs.length > 0 ? (
        <>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.4, padding: '0 4px 16px', textWrap: 'pretty' }}>
            Cuentan solo tu parte de cada gasto. La marca es lo que llevarías hoy gastando parejo.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {avs.map((a) => (
              <TarjetaPresupuesto key={a.presupuesto.id} a={a} onClick={() => push(`/presupuesto/${a.presupuesto.id}`)} />
            ))}
          </div>
        </>
      ) : (
        <div style={{ padding: '40px 4px 0' }}>
          <div className="t-display">
            Sin
            <br />
            límites.
          </div>
          <p className="t-body-muted">Ponle tope a todo lo que gastas o a una o varias categorías, por semana o por mes. Puedes tener varios. Te aviso al 80 % y si te pasas.</p>
          <button className="cta" style={{ marginTop: 26 }} onClick={() => push('/presupuesto/nuevo')}>
            Crear presupuesto
          </button>
        </div>
      )}
    </div>
  );
}

function TarjetaPresupuesto({ a, onClick }: { a: AvancePresupuesto; onClick: () => void }) {
  const d = useDatos();
  const p = a.presupuesto;
  const cats = d ? categoriasPresupuesto(p, d.categoria) : [];
  const l = lineasPresupuesto(a);
  return (
    <button className="card" onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={`Presupuesto ${nombrePresupuesto(p, cats)}`}>
      <span style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) auto', gap: 12, alignItems: 'center', width: '100%' }}>
        <IconoPresupuesto p={p} cats={cats} />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>{nombrePresupuesto(p, cats)}</span>
          <span className="ellipsis" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{subPresupuesto(a, cats)}</span>
        </span>
        <ChipEstado a={a} />
      </span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, width: '100%' }}>
        <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.6 }}>{fmt(a.gastado)}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>de {fmt(p.monto)}</span>
        <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: l.color }}>{l.pct}</span>
      </span>
      <BarraPresupuesto a={a} />
      <LineasPresupuesto a={a} />
    </button>
  );
}

type Alcance = 'todo' | 'categorias';

const ALCANCES: [Alcance, string, string][] = [
  ['todo', 'Todo lo que gastas', 'Tu gasto completo del período.'],
  ['categorias', 'Algunas categorías', 'Una o varias juntas: Salidas, o Comida y Salidas.'],
];

/** Mismas categorías (sin importar el orden). */
const mismas = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function PresupuestoForm() {
  const { id } = useParams();
  const d = useDatos();
  const { back } = useNav();
  const toast = useToast();
  const [alcance, setAlcance] = useState<Alcance>('todo');
  const [cats, setCats] = useState<string[]>([]);
  const [periodo, setPeriodo] = useState<Presupuesto['periodo']>('semana');
  const [nombre, setNombre] = useState('');
  const [amt, setAmt] = useState('');
  const [avisar, setAvisar] = useState(true);
  const editing = id ? d?.presupuestos.find((p) => p.id === id) : undefined;

  useEffect(() => {
    if (!editing) return;
    const c = categoriasDe(editing);
    setAlcance(c.length ? 'categorias' : 'todo');
    setCats(c);
    setPeriodo(editing.periodo);
    setNombre(editing.categoriaId && !editing.categoriaIds?.length ? '' : editing.nombre);
    setAmt(String(editing.monto));
    setAvisar(editing.avisar !== false);
  }, [editing]);

  if (!d) return <div className="screen" />;
  const hoy = todayISO();
  const monto = dg(amt);
  const elegidas = alcance === 'categorias' ? cats : [];
  const listo = alcance === 'todo' || cats.length > 0;
  const catsObj = categoriasPresupuesto({ categoriaIds: elegidas }, d.categoria);
  const auto = nombreAuto({ periodo }, catsObj);
  const borrador: Presupuesto = {
    id: id ?? 'nuevo',
    nombre: nombre.trim(),
    periodo,
    monto,
    categoriaIds: elegidas.length ? elegidas : undefined,
    avisar,
    archivado: false,
    orden: editing?.orden ?? 0,
    creado: '',
  };
  // Otro presupuesto con el mismo período y las mismas categorías: se reemplaza (no tiene sentido tener dos).
  const igual = (p: Presupuesto) => p.id !== id && p.periodo === periodo && mismas(categoriasDe(p), elegidas);
  const repetido = d.presupuestos.find(igual);
  const llevas = avancePresupuesto({ ...borrador, monto: Math.max(1, monto) }, d.imputados, hoy).gastado;
  const vista = monto && listo ? avancePresupuesto(borrador, d.imputados, hoy) : null;
  const cuando = periodo === 'semana' ? 'Esta semana' : `En ${MESES_LARGOS[Number(hoy.slice(5, 7)) - 1]}`;
  const referencia = !listo ? 'Elige al menos una categoría para ver cuánto llevas.' : `${cuando} llevas ${fmt(llevas)}${elegidas.length ? ` en ${auto}` : ''}`;
  const toggle = (c: string) => setCats((xs) => (xs.includes(c) ? xs.filter((x) => x !== c) : [...xs, c]));

  const guardar = async () => {
    if (!listo) return toast('Elige al menos una categoría');
    if (!monto) return toast('Falta el límite');
    // Si ya cruzó un umbral al guardar, no avisar de nuevo por eso mismo.
    const a = avancePresupuesto(borrador, d.imputados, hoy);
    const avisado = a.estado === 'excedido' ? `${a.desde}:100` : a.pct >= 0.8 ? `${a.desde}:80` : undefined;
    await db.transaction('rw', db.presupuestos, async () => {
      for (const p of d.presupuestos.filter(igual)) await borrarPresupuesto(p.id);
      await guardarPresupuesto({ id, nombre: borrador.nombre, periodo, monto, categoriaIds: borrador.categoriaIds, categoriaId: undefined, avisar, avisado });
    });
    toast(id ? 'Presupuesto actualizado' : `Presupuesto guardado · ${fmt(monto)} ${periodo === 'semana' ? 'a la semana' : 'al mes'}`);
    back('/presupuestos');
  };

  return (
    <div className="screen">
      <TaskHeader title={id ? 'editar presupuesto.' : 'nuevo presupuesto.'} onClose={() => back('/presupuestos')} />
      <div className="scroll" style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div className="t-label">Qué cuenta</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ALCANCES.map(([k, l, ds]) => (
              <button
                key={k}
                aria-pressed={alcance === k}
                onClick={() => setAlcance(k)}
                style={{ border: `2px solid ${alcance === k ? 'var(--ink)' : 'var(--track)'}`, borderRadius: 22, background: alcance === k ? 'var(--ink)' : 'transparent', color: alcance === k ? 'var(--bg)' : 'var(--ink)', padding: '12px 16px', textAlign: 'left' }}
              >
                <span style={{ display: 'block', fontSize: 17, fontWeight: 800 }}>{l}</span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 500, opacity: 0.75, marginTop: 2 }}>{ds}</span>
              </button>
            ))}
          </div>
        </div>
        {alcance === 'categorias' && (
          <div>
            <div className="t-label">Categorías {cats.length > 1 ? `· ${cats.length}` : ''}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {d.categorias
                .filter((c) => !c.archivada || cats.includes(c.id))
                .map((c) => (
                  <CatChip key={c.id} cat={c} on={cats.includes(c.id)} onClick={() => toggle(c.id)} />
                ))}
            </div>
          </div>
        )}
        <div>
          <div className="t-label">Cada</div>
          <div className="seg">
            <Pill on={periodo === 'semana'} onClick={() => setPeriodo('semana')} className="grow">
              Semana
            </Pill>
            <Pill on={periodo === 'mes'} onClick={() => setPeriodo('mes')} className="grow">
              Mes
            </Pill>
          </div>
        </div>
        <div>
          <div className="t-label">Límite</div>
          <label className="amt-line" style={{ color: amt ? 'var(--ink)' : 'var(--muted)' }}>
            <span>$</span>
            <input value={show(amt)} onChange={(e) => setAmt(e.target.value.replace(/\D/g, '').slice(0, 9))} inputMode="numeric" placeholder="0" aria-label="Límite" />
            <span style={{ flex: 'none', fontSize: 16, fontWeight: 700, letterSpacing: 0, color: 'var(--muted)' }}>{periodo === 'semana' ? 'a la semana' : 'al mes'}</span>
          </label>
        </div>
        <div>
          <div className="t-label">Nombre (opcional)</div>
          <input className="input-big" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={auto} maxLength={40} aria-label="Nombre del presupuesto" />
        </div>
        {repetido && (
          <div style={{ borderRadius: 16, background: 'var(--soft)', padding: '12px 14px', fontSize: 14, fontWeight: 700, color: 'var(--owe)', lineHeight: 1.35 }}>
            Ya tienes «{nombrePresupuesto(repetido, categoriasPresupuesto(repetido, d.categoria))}» con lo mismo y {periodo === 'semana' ? 'por semana' : 'por mes'} ({fmt(repetido.monto)}). Si guardas, lo reemplazas.
          </div>
        )}
        <div style={{ borderRadius: 24, background: 'var(--surface)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="t-label" style={{ padding: 0 }}>{referencia}</div>
          {vista && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>Así quedaría hoy</span>
                <span style={{ marginLeft: 'auto' }}>
                  <ChipEstado a={vista} />
                </span>
              </div>
              <BarraPresupuesto a={vista} />
              <LineasPresupuesto a={vista} />
            </>
          )}
        </div>
        <div className="row-between">
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Avisarme al 80 %</span>
            <span className="t-meta">Y otra vez si te pasas.</span>
          </span>
          <Switch label="Avisarme al 80 %" on={avisar} onChange={setAvisar} />
        </div>
        {editing && (
          <button
            className="btn-text"
            style={{ color: 'var(--danger)' }}
            onClick={async () => {
              const copia = await borrarPresupuesto(editing.id);
              toast('Presupuesto borrado', copia && { label: 'Deshacer', run: () => db.presupuestos.put(copia).then(() => undefined) });
              back('/presupuestos');
            }}
          >
            Borrar presupuesto
          </button>
        )}
      </div>
      <div className="foot">
        <button className="cta" aria-disabled={!(monto && listo)} onClick={guardar}>
          Guardar presupuesto
        </button>
      </div>
    </div>
  );
}
