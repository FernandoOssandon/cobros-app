import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { borrarCobro, borrarMovimiento, db, restaurar, type Cobro, type Movimiento } from '../db';
import { usePeople } from '../hooks';
import { estadosCargos } from '../lib/balance';
import { fmt, relativeDays, shortDate, todayISO } from '../lib/format';
import { BackButton, IconPlus, Sheet } from '../ui/kit';
import { useToast } from '../ui/toast';

type Item =
  | { kind: 'mov'; key: string; m: Movimiento }
  | { kind: 'cobro'; key: string; c: Cobro };

export default function Person() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const all = usePeople();
  const cargos = useLiveQuery(() => db.cargos.toArray());
  const [sheet, setSheet] = useState<Item | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const v = all?.find((x) => x.p.id === id);
  const items = useMemo<Item[]>(() => {
    if (!v) return [];
    const a: Item[] = v.movs.map((m) => ({ kind: 'mov', key: `${m.fecha}|${m.creado}`, m }));
    const b: Item[] = v.cobros.map((c) => ({ kind: 'cobro', key: `${todayISO(new Date(c.fecha))}|${c.fecha}`, c }));
    return [...a, ...b].sort((x, y) => x.key.localeCompare(y.key));
  }, [v]);
  const estados = useMemo(() => (v ? estadosCargos(v.movs) : new Map()), [v]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [items.length]);

  if (!all) return <div className="screen" />;
  if (!v) {
    return (
      <div className="screen" style={{ padding: 20, gap: 16 }}>
        <BackButton onClick={() => nav('/')} />
        <div className="empty-note">Esta persona ya no existe.</div>
      </div>
    );
  }

  const owes = v.saldo > 0;
  const cargoInfo = (m: Movimiento) => {
    const c = m.cargoId ? cargos?.find((x) => x.id === m.cargoId) : undefined;
    const n = c ? c.participantes.length + (c.yoIncluido ? 1 : 0) : 0;
    return n > 1 ? `dividido entre ${n}` : '';
  };

  const undoable = async (p: Promise<Parameters<typeof restaurar>[0]>, msg: string) => {
    const snap = await p;
    setSheet(null);
    toast(msg, { label: 'Deshacer', run: () => restaurar(snap) });
  };

  return (
    <div className="screen">
      <div style={{ flex: 'none', padding: '4px 16px', display: 'flex', justifyContent: 'space-between' }}>
        <BackButton onClick={() => nav('/')} />
        <button className="btn-outline" onClick={() => nav(`/persona/${id}/editar`)}>
          Editar
        </button>
      </div>
      <div style={{ flex: 'none', padding: '16px 20px 14px' }}>
        <h1 className="title" style={{ margin: 0 }}>{v.p.nombre}</h1>
        {owes ? (
          <div className="balance-chip">
            <span className="lbl">debe</span>
            <span className="amt">{fmt(v.saldo)}</span>
          </div>
        ) : (
          <div className="balance-chip settled">a mano, sin deudas</div>
        )}
        {(v.p.archivada || v.saldo < 0 || v.ultimoCobro) && (
          <div className="meta" style={{ marginTop: 10 }}>
            {[
              v.p.archivada && 'Archivada',
              v.saldo < 0 && `${fmt(-v.saldo)} a su favor`,
              v.ultimoCobro && `Último cobro ${relativeDays(v.ultimoCobro.fecha)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}
      </div>

      <div className="scroll history" ref={scroller}>
        {items.length === 0 && (
          <div className="empty-note" style={{ margin: 'auto', textAlign: 'center' }}>
            Aquí aparecerá la historia con {v.first}.
          </div>
        )}
        {items.map((it) => {
          if (it.kind === 'cobro') {
            return (
              <button key={it.c.id} className="event" onClick={() => setSheet(it)}>
                Le cobraste <b>{fmt(it.c.monto)}</b> por WhatsApp · {shortDate(todayISO(new Date(it.c.fecha)))}
              </button>
            );
          }
          const m = it.m;
          if (m.tipo === 'cargo') {
            const e = estados.get(m.id);
            const shared = cargoInfo(m);
            return (
              <button key={m.id} className="bubble cargo" onClick={() => (m.cargoId ? nav(`/cargo/${m.cargoId}`) : undefined)}>
                <div className="b-desc">{m.detalle}</div>
                <div className="b-amt">+{fmt(m.monto)}</div>
                <div className="b-meta">
                  <span>{shortDate(m.fecha)}</span>
                  {shared && <span>· {shared}</span>}
                  {e?.estado === 'pagado' && <span className="tag solid">pagado</span>}
                  {e?.estado === 'parcial' && <span className="tag">quedan {fmt(e.pendiente)}</span>}
                </div>
              </button>
            );
          }
          return (
            <button key={m.id} className="bubble pago" onClick={() => setSheet(it)}>
              <div className="b-desc">Pagó · {m.detalle}</div>
              <div className="b-amt">−{fmt(m.monto)}</div>
              <div className="b-meta">{shortDate(m.fecha)}</div>
            </button>
          );
        })}
      </div>

      <div className="actions">
        <button className="btn-line" onClick={() => nav(`/cargo/nuevo?p=${id}`)} aria-label={`Nuevo cargo para ${v.first}`}>
          <IconPlus size={22} w={2.6} />
        </button>
        <button className="btn-line" onClick={() => nav(`/persona/${id}/pago`)}>
          Pagó
        </button>
        <button
          className="btn-ink"
          style={{ opacity: owes ? 1 : 0.4 }}
          onClick={() => (owes ? nav(`/persona/${id}/cobro`) : toast(`${v.first} no tiene saldo pendiente`))}
        >
          Cobrar por WhatsApp
        </button>
      </div>

      {sheet?.kind === 'mov' && (
        <Sheet onClose={() => setSheet(null)} label="Pago">
          <div className="s-title">Pago de {fmt(sheet.m.monto)}</div>
          <div className="s-body">
            {sheet.m.detalle} · {shortDate(sheet.m.fecha)}
          </div>
          <button className="btn-ink" onClick={() => nav(`/persona/${id}/pago/${sheet.m.id}`)}>
            Editar pago
          </button>
          <button className="btn-line" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => undoable(borrarMovimiento(sheet.m.id), 'Pago borrado')}>
            Borrar pago
          </button>
        </Sheet>
      )}
      {sheet?.kind === 'cobro' && (
        <Sheet onClose={() => setSheet(null)} label="Cobro">
          <div className="s-title">
            Cobro {sheet.c.tono.toLowerCase()} · {shortDate(todayISO(new Date(sheet.c.fecha)))}
          </div>
          <div className="s-body" style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto', background: 'var(--surface)', color: 'var(--ink)', borderRadius: 18, padding: '12px 14px', fontSize: 15 }}>
            {sheet.c.mensaje}
          </div>
          <button className="btn-line" onClick={() => setSheet(null)}>
            Cerrar
          </button>
          <button className="btn-text" style={{ color: 'var(--danger)', height: 40 }} onClick={() => undoable(borrarCobro(sheet.c.id), 'Registro de cobro borrado')}>
            Borrar este registro
          </button>
        </Sheet>
      )}
    </div>
  );
}
