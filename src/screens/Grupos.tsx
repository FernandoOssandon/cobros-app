import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { archivarGrupo, borrarGrupo, guardarGrupo, restaurarGrupo, type Gasto, type Grupo as GrupoT } from '../db';
import { useDatos, type Datos } from '../hooks';
import { fmt, shortDate } from '../lib/format';
import { useNav } from '../nav';
import { Icon } from '../ui/icons';
import { BackButton, ConfirmSheet, Sheet } from '../ui/kit';
import { GastoRow } from '../ui/rows';
import { useToast } from '../ui/toast';

/** "18–20 nov", "3 nov" o "28 oct – 2 nov". */
function rango(es: Gasto[]) {
  if (!es.length) return '';
  const f = es.map((g) => g.fecha).sort();
  const a = f[0];
  const b = f[f.length - 1];
  if (a === b) return shortDate(a);
  if (a.slice(0, 7) === b.slice(0, 7)) return `${Number(a.slice(8, 10))}–${shortDate(b)}`;
  return `${shortDate(a)} – ${shortDate(b)}`;
}

/** Estadísticas de un grupo: quién puso cuánto y a quién le tocaba cuánto. */
function stats(d: Datos, grupoId: string) {
  const es = d.gastos.filter((g) => g.grupoId === grupoId).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const montoDe = (g: Gasto, pid: string) => g.montos?.[pid] ?? d.movimientos.find((m) => m.gastoId === g.id && m.personaId === pid && m.tipo === 'cargo')?.monto ?? 0;
  const ids = new Set<string>();
  let yo = false;
  for (const g of es) {
    if (g.pagador === 'yo' || g.miParte > 0) yo = true;
    else ids.add(g.pagador);
    g.participantes.forEach((p) => ids.add(p));
    if (g.pagador !== 'yo') ids.add(g.pagador);
  }
  const miembros = [...(yo ? ['yo'] : []), ...[...ids].filter((x) => d.persona.has(x))];
  const filas = miembros.map((k) => {
    const puso = es.filter((g) => g.pagador === k).reduce((s, g) => s + g.total, 0);
    const tocaba = es.reduce((s, g) => s + (k === 'yo' ? g.miParte : montoDe(g, k)), 0);
    return { k, puso, tocaba, neto: puso - tocaba };
  });
  const falta = new Map<string, number>();
  for (const g of es) {
    if (g.pagador !== 'yo') continue;
    for (const m of d.movimientos.filter((x) => x.gastoId === g.id && x.tipo === 'cargo')) {
      const p = d.estado.get(m.id)?.pendiente ?? m.monto;
      if (p > 0) falta.set(m.personaId, (falta.get(m.personaId) ?? 0) + p);
    }
  }
  return { es, miembros, filas, falta, total: es.reduce((s, g) => s + g.total, 0), miParte: es.reduce((s, g) => s + g.miParte, 0) };
}

function Av({ d, k, size = 36 }: { d: Datos; k: string; size?: number }) {
  const v = d.persona.get(k);
  const yo = k === 'yo';
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: yo ? 'var(--soft)' : v?.color, color: yo ? 'var(--ink)' : '#0E1A12', fontSize: size >= 36 ? 13 : 11, border: size < 36 ? '2px solid var(--surface)' : undefined, marginLeft: size < 36 ? -8 : 0 }}
    >
      {yo ? 'Yo' : v?.ini}
    </span>
  );
}

/** Hoja para crear o editar un grupo: nombre, terminarlo y borrarlo. */
function GrupoSheet({ grupo, nGastos, onClose, onBorrado }: { grupo?: GrupoT; nGastos?: number; onClose: () => void; onBorrado?: () => void }) {
  const toast = useToast();
  const [nombre, setNombre] = useState(grupo?.nombre ?? '');
  const [confirmar, setConfirmar] = useState(false);
  const guardar = async () => {
    if (!nombre.trim()) return toast('Ponle nombre');
    await guardarGrupo(nombre, grupo?.id);
    toast(grupo ? 'Grupo actualizado' : `${nombre.trim()} creado`);
    onClose();
  };
  if (confirmar && grupo) {
    return (
      <ConfirmSheet
        title={`¿Borramos ${grupo.nombre}?`}
        body={nGastos ? `${nGastos === 1 ? 'El gasto se queda' : `Los ${nGastos} gastos se quedan`} como están, solo salen del grupo. Los saldos no cambian.` : 'No tiene gastos. Los saldos no cambian.'}
        confirm="Sí, borrar"
        onClose={() => setConfirmar(false)}
        onConfirm={async () => {
          const snap = await borrarGrupo(grupo.id);
          onBorrado?.();
          if (snap) toast('Grupo borrado', { label: 'Deshacer', run: () => restaurarGrupo(snap) });
        }}
      />
    );
  }
  return (
    <Sheet onClose={onClose} label={grupo ? 'Editar grupo' : 'Nuevo grupo'} style={{ gap: 10 }}>
      <div className="sheet-title">{grupo ? 'Editar grupo' : 'Nuevo grupo'}</div>
      <input className="input-big" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Viaje a Pucón" maxLength={40} aria-label="Nombre del grupo" autoFocus={!grupo} />
      <button className="btn-ink" onClick={guardar}>
        {grupo ? 'Guardar cambios' : 'Crear grupo'}
      </button>
      {grupo && (
        <>
          <button
            className="btn-line"
            onClick={async () => {
              await archivarGrupo(grupo.id, !grupo.archivado);
              toast(grupo.archivado ? 'Grupo reabierto' : 'Grupo terminado. Ya no aparece al anotar gastos.');
              onClose();
            }}
          >
            {grupo.archivado ? 'Reabrir grupo' : 'Marcar como terminado'}
          </button>
          <button className="btn-text" style={{ color: 'var(--danger)' }} onClick={() => setConfirmar(true)}>
            Borrar grupo
          </button>
        </>
      )}
    </Sheet>
  );
}

function GrupoCard({ d, g, s, onClick }: { d: Datos; g: GrupoT; s: ReturnType<typeof stats>; onClick: () => void }) {
  return (
    <button className="card" style={{ gap: 6, opacity: g.archivado ? 0.7 : 1 }} onClick={onClick}>
      <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>{g.nombre}</span>
      <span style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1.4, lineHeight: 1 }}>{fmt(s.total)}</span>
      <span className="row-between" style={{ width: '100%', marginTop: 4, gap: 10 }}>
        <span className="t-meta">
          {s.miembros.length} {s.miembros.length === 1 ? 'persona' : 'personas'}
          {s.es.length ? ` · ${rango(s.es)}` : ''} · {s.es.length} {s.es.length === 1 ? 'gasto' : 'gastos'}
        </span>
        <span style={{ display: 'flex', paddingLeft: 8 }}>
          {s.miembros.slice(0, 5).map((k) => (
            <Av key={k} d={d} k={k} size={30} />
          ))}
        </span>
      </span>
    </button>
  );
}

export function Grupos() {
  const d = useDatos();
  const { push, back, backLabel } = useNav();
  const [nuevo, setNuevo] = useState(false);
  if (!d) return <div className="scroll" />;
  const grupos = d.grupos
    .map((g) => ({ g, s: stats(d, g.id) }))
    .sort((a, b) => (b.s.es[0]?.fecha ?? b.g.creado).localeCompare(a.s.es[0]?.fecha ?? a.g.creado));
  const activos = grupos.filter((x) => !x.g.archivado);
  const terminados = grupos.filter((x) => x.g.archivado);
  return (
    <div className="scroll" style={{ padding: '4px 16px var(--safe-bottom)' }}>
      <div className="row-between">
        <BackButton onClick={() => back('/gastos')} label={backLabel} />
        <button className="btn-o add" onClick={() => setNuevo(true)}>
          <Icon name="plus" size={16} w={3} />
          Nuevo
        </button>
      </div>
      <h1 className="t-screen" style={{ margin: '18px 4px 16px' }}>grupos.</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {activos.map(({ g, s }) => (
          <GrupoCard key={g.id} d={d} g={g} s={s} onClick={() => push(`/grupo/${g.id}`)} />
        ))}
      </div>
      {!grupos.length && (
        <div className="t-note" style={{ padding: '10px 4px' }}>
          Sin grupos todavía. Crea uno aquí o al anotar un gasto: el viaje, el cumpleaños, el depto.
        </div>
      )}
      {terminados.length > 0 && (
        <>
          <h2 className="t-section" style={{ paddingTop: 26 }}>terminados.</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {terminados.map(({ g, s }) => (
              <GrupoCard key={g.id} d={d} g={g} s={s} onClick={() => push(`/grupo/${g.id}`)} />
            ))}
          </div>
        </>
      )}
      {nuevo && <GrupoSheet onClose={() => setNuevo(false)} />}
    </div>
  );
}

export function Grupo() {
  const { id = '' } = useParams();
  const d = useDatos();
  const { push, back, backLabel } = useNav();
  const [editar, setEditar] = useState(false);
  if (!d) return <div className="scroll" />;
  const g = d.grupos.find((x) => x.id === id);
  if (!g) {
    return (
      <div className="scroll" style={{ padding: '4px 16px' }}>
        <BackButton onClick={() => back('/grupos')} label={backLabel} />
        <div className="t-note" style={{ padding: '20px 4px' }}>Este grupo ya no existe.</div>
      </div>
    );
  }
  const s = stats(d, g.id);
  return (
    <div className="scroll" style={{ padding: '4px 16px var(--safe-bottom)' }}>
      <div className="row-between">
        <BackButton onClick={() => back('/grupos')} label={backLabel} />
        <button className="btn-o" onClick={() => setEditar(true)}>
          Editar
        </button>
      </div>
      <div style={{ padding: '18px 4px 0' }}>
        {g.archivado && <div className="t-meta" style={{ marginBottom: 6 }}>Grupo terminado</div>}
        <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1 }}>{g.nombre}</h1>
        <div className="t-hero-64" style={{ lineHeight: 1, marginTop: 8 }}>{fmt(s.total)}</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)', marginTop: 4 }}>
          tu parte {fmt(s.miParte)}
          {s.es.length ? ` · ${rango(s.es)}` : ''}
        </div>
      </div>

      {s.filas.length > 0 && (
        <>
          <h2 className="t-section" style={{ paddingTop: 26 }}>cuánto puso cada uno.</h2>
          <div className="list">
            <div className="inner">
              {s.filas.map((f) => {
                const yo = f.k === 'yo';
                const net =
                  f.neto > 0 ? `${yo ? 'te deben' : 'le deben'} ${fmt(f.neto)}` : f.neto < 0 ? `${yo ? 'debes' : 'debe'} ${fmt(-f.neto)}` : 'al día';
                const col = f.neto > 0 ? 'var(--pos)' : f.neto < 0 ? 'var(--owe)' : 'var(--muted)';
                return (
                  <div key={f.k} className="list-row c36">
                    <Av d={d} k={f.k} />
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{yo ? 'Tú' : d.persona.get(f.k)?.p.nombre}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                        {yo ? 'pusiste' : 'puso'} {fmt(f.puso)} · {yo ? 'te tocaba' : 'le tocaba'} {fmt(f.tocaba)}
                      </span>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: col, textAlign: 'right', whiteSpace: 'nowrap' }}>{net}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <h2 className="t-section" style={{ paddingTop: 26 }}>falta por pagarte.</h2>
      {s.falta.size > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...s.falta.entries()].map(([pid, monto]) => {
            const v = d.persona.get(pid);
            return (
              <button
                key={pid}
                onClick={() => push(`/persona/${pid}`)}
                style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '10px 14px', borderRadius: 22, border: '2px solid var(--owe)', background: 'transparent', textAlign: 'left' }}
              >
                <Av d={d} k={pid} />
                <span style={{ fontSize: 16, fontWeight: 700 }}>{v?.p.nombre}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--owe)' }}>quedan {fmt(monto)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: '0 4px', fontSize: 17, fontWeight: 600, color: 'var(--muted)' }}>Todos te pagaron su parte. Grupo ejemplar.</div>
      )}

      <h2 className="t-section" style={{ paddingTop: 26 }}>gastos del grupo.</h2>
      {s.es.length ? (
        <div className="list">
          <div className="inner">
            {s.es.map((x) => (
              <GastoRow key={x.id} g={x} d={d} onClick={() => push(`/gasto/${x.id}`)} />
            ))}
          </div>
        </div>
      ) : (
        <div className="t-note" style={{ padding: '0 4px' }}>Todavía no hay gastos en este grupo.</div>
      )}
      {editar && <GrupoSheet grupo={g} nGastos={s.es.length} onClose={() => setEditar(false)} onBorrado={() => back('/grupos')} />}
    </div>
  );
}
