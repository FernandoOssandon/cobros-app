import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { borrarFoto, borrarGasto, db, reemplazarFoto, restaurar } from '../db';
import { useDatos } from '../hooks';
import { fmt, juntarY, shortDate } from '../lib/format';
import { achicarImagen } from '../lib/imagen';
import { describirFrecuencia } from '../lib/recurrence';
import { useNav } from '../nav';
import { Icon } from '../ui/icons';
import { Avatar, AvatarYo, BackButton, CatChip, CatIcon, ConfirmSheet } from '../ui/kit';
import { useToast } from '../ui/toast';

export default function GastoDetalle() {
  const { id = '' } = useParams();
  const d = useDatos();
  const { push, back, backLabel } = useNav();
  const toast = useToast();
  const [borrar, setBorrar] = useState(false);
  const foto = useLiveQuery(() => db.fotos.where('gastoId').equals(id).first(), [id]);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [fotoGrande, setFotoGrande] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!foto) return setFotoUrl(null);
    const u = URL.createObjectURL(foto.blob);
    setFotoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [foto]);

  if (!d) return <div className="screen" />;
  const g = d.gasto.get(id);
  if (!g) {
    return (
      <div className="screen" style={{ padding: 16, gap: 16 }}>
        <div>
          <BackButton onClick={() => back('/gastos')} label={backLabel} />
        </div>
        <div className="t-note">Este gasto ya no existe.</div>
      </div>
    );
  }

  const cat = g.categoriaId ? d.categoria.get(g.categoriaId) : undefined;
  const other = g.pagador !== 'yo';
  const payer = other ? d.persona.get(g.pagador) : undefined;
  const medio = g.medioId ? d.medio.get(g.medioId) : undefined;
  const grupo = g.grupoId ? d.grupos.find((x) => x.id === g.grupoId) : undefined;
  const rec = g.recurrenteId ? d.recurrentes.find((x) => x.id === g.recurrenteId) : undefined;
  const movs = d.movimientos.filter((m) => m.gastoId === g.id);
  const montoDe = (pid: string) => g.montos?.[pid] ?? movs.find((m) => m.personaId === pid && m.tipo === 'cargo')?.monto ?? 0;
  const involucrados = other ? [payer?.first ?? ''] : g.participantes.map((p) => d.persona.get(p)?.first ?? '');

  type Fila = { key: string; nombre: string; avatar: React.ReactNode; monto: number; estado: string; color: string };
  const filas: Fila[] = [];
  if (g.participantes.length > 0 || other) {
    // Yo primero.
    if (other) {
      const deuda = movs.find((m) => m.tipo === 'deuda');
      const pend = deuda ? d.estado.get(deuda.id)?.pendiente ?? deuda.monto : 0;
      filas.push({ key: 'yo', nombre: 'Tú', avatar: <AvatarYo />, monto: g.miParte, estado: pend > 0 ? `le debes ${fmt(pend)}` : 'ya le pagaste', color: pend > 0 ? 'var(--owe)' : 'var(--pos)' });
    } else if (g.yoIncluido) {
      filas.push({ key: 'yo', nombre: 'Tú', avatar: <AvatarYo />, monto: g.miParte, estado: 'tu parte', color: 'var(--muted)' });
    }
    for (const pid of g.participantes) {
      const v = d.persona.get(pid);
      if (!v) continue;
      let estado = 'entre ellos';
      let color = 'var(--muted)';
      if (!other) {
        const cargo = movs.find((m) => m.personaId === pid && m.tipo === 'cargo');
        const pend = cargo ? d.estado.get(cargo.id)?.pendiente ?? cargo.monto : 0;
        [estado, color] = pend > 0 ? [`quedan ${fmt(pend)}`, 'var(--owe)'] : ['pagado', 'var(--pos)'];
      } else if (pid === g.pagador) estado = 'pagó el total';
      filas.push({ key: pid, nombre: v.p.nombre, avatar: <Avatar color={v.color} text={v.ini} size={36} />, monto: montoDe(pid), estado, color });
    }
  }

  const elegirFoto = async (f?: File) => {
    if (file.current) file.current.value = '';
    if (!f) return;
    setSubiendo(true);
    try {
      await reemplazarFoto(g.id, await achicarImagen(f));
      toast(foto ? 'Foto cambiada' : 'Foto guardada');
    } catch {
      toast('No se pudo leer esa imagen');
    } finally {
      setSubiendo(false);
    }
  };
  const quitarFoto = async () => {
    if (!foto) return;
    const copia = foto;
    await borrarFoto(copia.id);
    setFotoGrande(false);
    toast('Foto quitada', { label: 'Deshacer', run: () => db.fotos.put(copia) });
  };

  const eliminar = async () => {
    const snap = await borrarGasto(g.id);
    setBorrar(false);
    toast('Gasto borrado', { label: 'Deshacer', run: () => restaurar(snap) });
    back('/gastos');
  };

  return (
    <div className="screen">
      <div className="row-between" style={{ flex: 'none', padding: '4px 16px' }}>
        <BackButton onClick={() => back('/gastos')} label={backLabel} />
        <button className="btn-o" onClick={() => push(`/gasto/${g.id}/editar`)}>
          Editar
        </button>
      </div>
      <div className="scroll" style={{ padding: '16px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CatIcon cat={cat} size={36} />
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--muted)' }}>{cat?.nombre ?? 'Sin categoría'}</span>
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1.05, marginTop: 12, textWrap: 'pretty' }}>{g.descripcion}</h1>
        <div className="t-hero-64" style={{ lineHeight: 1, marginTop: 6 }}>{fmt(g.total)}</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)', marginTop: 4 }}>
          {shortDate(g.fecha)} · {other ? `pagó ${payer?.first ?? ''}` : medio?.nombre ?? 'sin medio de pago'}
        </div>

        {!cat && (
          <div style={{ marginTop: 16, border: '2px dashed var(--danger)', borderRadius: 22, padding: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Este gasto anda sin categoría.</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)', marginTop: 2 }}>Ponle una y el resumen te cuadra.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {d.categorias
                .filter((c) => !c.archivada)
                .map((c) => (
                  <CatChip
                    key={c.id}
                    cat={c}
                    onClick={async () => {
                      await db.gastos.update(g.id, { categoriaId: c.id });
                      toast(`Listo, quedó en ${c.nombre}`);
                    }}
                  />
                ))}
            </div>
          </div>
        )}

        {fotoUrl ? (
          <>
            <button
              onClick={() => setFotoGrande((x) => !x)}
              aria-label="Foto de la boleta"
              style={{ display: 'block', width: '100%', marginTop: 18, height: fotoGrande ? 'auto' : 150, borderRadius: 22, border: '2px solid var(--ink)', overflow: 'hidden', padding: 0, background: 'var(--soft)' }}
            >
              <img src={fotoUrl} alt="Boleta" style={{ display: 'block', width: '100%', height: fotoGrande ? 'auto' : '100%', objectFit: 'cover' }} />
            </button>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="pill h36" onClick={() => file.current?.click()} disabled={subiendo}>
                Cambiar foto
              </button>
              <button className="pill h36" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={quitarFoto}>
                Quitar
              </button>
            </div>
          </>
        ) : (
          <button className="btn-dashed" style={{ width: '100%', marginTop: 18, height: 56, fontSize: 16 }} onClick={() => file.current?.click()} disabled={subiendo}>
            <Icon name="camera" size={20} w={2.4} />
            {subiendo ? 'Guardando foto…' : 'Agregar foto de la boleta'}
          </button>
        )}
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => elegirFoto(e.target.files?.[0])} aria-label="Elegir foto de la boleta" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginTop: 20, padding: '14px 0', borderTop: '2px solid var(--ink)' }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>{other ? `Tu parte, la pagó ${payer?.first ?? ''}` : 'Tu parte'}</span>
          <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.6 }}>{fmt(g.miParte)}</span>
        </div>

        {filas.length > 0 && (
          <div style={{ borderTop: '2px solid var(--ink)', paddingTop: 6 }}>
            {filas.map((f) => (
              <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '8px 0' }}>
                {f.avatar}
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{f.nombre}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: f.color }}>{f.estado}</span>
                </span>
                <span style={{ fontSize: 17, fontWeight: 800 }}>{fmt(f.monto)}</span>
              </div>
            ))}
          </div>
        )}

        {grupo && (
          <button
            onClick={() => push(`/grupo/${grupo.id}`)}
            style={{ width: '100%', marginTop: 8, padding: '14px 0', border: 'none', borderTop: '2px solid var(--ink)', background: 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}
          >
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="t-meta">Grupo</span>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{grupo.nombre}</span>
            </span>
            <Icon name="next" size={20} />
          </button>
        )}
        {rec && (
          <button
            onClick={() => push(`/recurrente/${rec.id}`)}
            style={{ width: '100%', padding: '14px 0', border: 'none', borderTop: '2px solid var(--ink)', background: 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}
          >
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="t-meta">Se repite · {describirFrecuencia(rec.frecuencia, rec.inicio).toLowerCase()}</span>
              <span style={{ fontSize: 17, fontWeight: 700 }}>Editar el recurrente</span>
            </span>
            <Icon name="next" size={20} />
          </button>
        )}
      </div>
      <div className="foot" style={{ paddingTop: 10 }}>
        <button className="btn-line danger" style={{ fontSize: 16 }} onClick={() => setBorrar(true)}>
          Borrar gasto
        </button>
      </div>
      {borrar && (
        <ConfirmSheet
          title="¿Borramos este gasto?"
          body={`${g.descripcion} · ${fmt(g.total)}${involucrados.length ? `. Se ajustan los saldos con ${juntarY(involucrados)}.` : '.'}`}
          confirm="Sí, borrar"
          onClose={() => setBorrar(false)}
          onConfirm={eliminar}
        />
      )}
    </div>
  );
}
