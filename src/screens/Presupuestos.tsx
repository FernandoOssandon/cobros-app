// Presupuestos: un total semanal y topes mensuales por categoría.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db, type Presupuesto } from '../db';
import { useDatos } from '../hooks';
import { dg, fmt, MESES_LARGOS, show, todayISO } from '../lib/format';
import { avancePresupuesto, avances, type AvancePresupuesto } from '../lib/presupuestos';
import { useNav } from '../nav';
import { borrarPresupuesto, guardarPresupuesto } from '../presupuestos';
import { Icon } from '../ui/icons';
import { BackButton, CatChip, Switch, TaskHeader } from '../ui/kit';
import { BarraPresupuesto, ChipEstado, IconoPresupuesto, LineasPresupuesto, lineasPresupuesto, nombrePresupuesto, subPresupuesto } from '../ui/presupuesto';
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
          <p className="t-body-muted">Ponle tope a la semana completa o a una categoría, como Salidas o Supermercado. Te aviso al 80 % y si te pasas.</p>
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
  const cat = p.categoriaId ? d?.categoria.get(p.categoriaId) : undefined;
  const l = lineasPresupuesto(a);
  return (
    <button className="card" onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={`Presupuesto ${nombrePresupuesto(p, cat)}`}>
      <span style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) auto', gap: 12, alignItems: 'center', width: '100%' }}>
        <IconoPresupuesto p={p} cat={cat} />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>{nombrePresupuesto(p, cat)}</span>
          <span className="ellipsis" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{subPresupuesto(a, cat)}</span>
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

type Tipo = 'semana' | 'categoria';

const TIPOS: [Tipo, string, string][] = [
  ['semana', 'Total semanal', 'Todo lo que gastas de lunes a domingo.'],
  ['categoria', 'Por categoría', 'Un tope mensual para Salidas, Supermercado o la que elijas.'],
];

export function PresupuestoForm() {
  const { id } = useParams();
  const d = useDatos();
  const { back } = useNav();
  const toast = useToast();
  const [tipo, setTipo] = useState<Tipo>('semana');
  const [cat, setCat] = useState<string | null>(null);
  const [amt, setAmt] = useState('');
  const [avisar, setAvisar] = useState(true);
  const editing = id ? d?.presupuestos.find((p) => p.id === id) : undefined;

  useEffect(() => {
    if (!editing) return;
    setTipo(editing.categoriaId ? 'categoria' : 'semana');
    setCat(editing.categoriaId ?? null);
    setAmt(String(editing.monto));
    setAvisar(editing.avisar !== false);
  }, [editing]);

  if (!d) return <div className="screen" />;
  const hoy = todayISO();
  const monto = dg(amt);
  const listo = tipo === 'semana' || !!cat;
  const categoria = cat ? d.categoria.get(cat) : undefined;
  const borrador: Presupuesto = {
    id: id ?? 'nuevo',
    nombre: tipo === 'semana' ? 'Total semanal' : categoria?.nombre ?? '',
    periodo: tipo === 'semana' ? 'semana' : 'mes',
    monto,
    categoriaId: tipo === 'categoria' ? cat ?? undefined : undefined,
    avisar,
    archivado: false,
    orden: editing?.orden ?? 0,
    creado: '',
  };
  const igual = (p: Presupuesto) => p.id !== id && (tipo === 'semana' ? !p.categoriaId && p.periodo === 'semana' : !!cat && p.categoriaId === cat);
  const repetido = d.presupuestos.find(igual);
  const llevas = avancePresupuesto({ ...borrador, monto: Math.max(1, monto) }, d.imputados, hoy).gastado;
  const vista = monto && listo ? avancePresupuesto(borrador, d.imputados, hoy) : null;
  const referencia =
    tipo === 'semana'
      ? `Esta semana llevas ${fmt(llevas)}`
      : categoria
        ? `En ${MESES_LARGOS[Number(hoy.slice(5, 7)) - 1]} llevas ${fmt(llevas)} en ${categoria.nombre}`
        : 'Elige una categoría para ver cuánto llevas.';

  const guardar = async () => {
    if (!listo) return toast('Elige una categoría');
    if (!monto) return toast('Falta el límite');
    // Si ya cruzó un umbral al guardar, no avisar de nuevo por eso mismo.
    const a = avancePresupuesto(borrador, d.imputados, hoy);
    const avisado = a.estado === 'excedido' ? `${a.desde}:100` : a.pct >= 0.8 ? `${a.desde}:80` : undefined;
    await db.transaction('rw', db.presupuestos, async () => {
      for (const p of d.presupuestos.filter(igual)) await borrarPresupuesto(p.id);
      await guardarPresupuesto({ id, nombre: borrador.nombre, periodo: borrador.periodo, monto, categoriaId: borrador.categoriaId, avisar, avisado });
    });
    toast(id ? 'Presupuesto actualizado' : `Presupuesto guardado · ${fmt(monto)} ${tipo === 'semana' ? 'a la semana' : 'al mes'}`);
    back('/presupuestos');
  };

  return (
    <div className="screen">
      <TaskHeader title={id ? 'editar presupuesto.' : 'nuevo presupuesto.'} onClose={() => back('/presupuestos')} />
      <div className="scroll" style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div className="t-label">Tipo</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TIPOS.map(([k, l, ds]) => (
              <button
                key={k}
                aria-pressed={tipo === k}
                onClick={() => setTipo(k)}
                style={{ border: `2px solid ${tipo === k ? 'var(--ink)' : 'var(--track)'}`, borderRadius: 22, background: tipo === k ? 'var(--ink)' : 'transparent', color: tipo === k ? 'var(--bg)' : 'var(--ink)', padding: '12px 16px', textAlign: 'left' }}
              >
                <span style={{ display: 'block', fontSize: 17, fontWeight: 800 }}>{l}</span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 500, opacity: 0.75, marginTop: 2 }}>{ds}</span>
              </button>
            ))}
          </div>
        </div>
        {tipo === 'categoria' && (
          <div>
            <div className="t-label">Categoría</div>
            <div className="hscroll">
              {d.categorias
                .filter((c) => !c.archivada || c.id === cat)
                .map((c) => (
                  <CatChip key={c.id} cat={c} on={cat === c.id} onClick={() => setCat(c.id)} />
                ))}
            </div>
          </div>
        )}
        <div>
          <div className="t-label">Límite</div>
          <label className="amt-line" style={{ color: amt ? 'var(--ink)' : 'var(--muted)' }}>
            <span>$</span>
            <input value={show(amt)} onChange={(e) => setAmt(e.target.value.replace(/\D/g, '').slice(0, 9))} inputMode="numeric" placeholder="0" aria-label="Límite" />
            <span style={{ flex: 'none', fontSize: 16, fontWeight: 700, letterSpacing: 0, color: 'var(--muted)' }}>{tipo === 'semana' ? 'a la semana' : 'al mes'}</span>
          </label>
        </div>
        {repetido && (
          <div style={{ borderRadius: 16, background: 'var(--soft)', padding: '12px 14px', fontSize: 14, fontWeight: 700, color: 'var(--owe)', lineHeight: 1.35 }}>
            {tipo === 'semana' ? 'Ya tienes un total semanal de ' : `${categoria?.nombre ?? 'Esa categoría'} ya tiene un tope de `}
            {fmt(repetido.monto)}. Si guardas, lo reemplazas.
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
