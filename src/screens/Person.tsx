import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { actualizarCargo, borrarCobro, borrarMovimiento, restaurar, type Cobro, type Movimiento } from '../db';
import { useDatos } from '../hooks';
import { dg, fmt, show, shortDate, todayISO } from '../lib/format';
import { useNav } from '../nav';
import { Icon } from '../ui/icons';
import { BackButton, DateInputPill, Sheet } from '../ui/kit';
import { useToast } from '../ui/toast';

type Item = { kind: 'mov'; key: string; m: Movimiento } | { kind: 'cobro'; key: string; c: Cobro };
const ORDEN = { cargo: 1, deuda: 1, pago: 2, abono: 2 } as const;

export default function Person() {
  const { id = '' } = useParams();
  const { push, back, backLabel } = useNav();
  const toast = useToast();
  const d = useDatos();
  const [sheet, setSheet] = useState<Item | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const v = d?.persona.get(id);

  const items = useMemo<Item[]>(() => {
    if (!v) return [];
    const a: Item[] = v.movs.map((m) => ({ kind: 'mov', key: `${m.fecha}|${ORDEN[m.tipo]}|${m.creado}`, m }));
    const b: Item[] = v.cobros.map((c) => ({ kind: 'cobro', key: `${todayISO(new Date(c.fecha))}|3|${c.fecha}`, c }));
    return [...a, ...b].sort((x, y) => x.key.localeCompare(y.key));
  }, [v]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [items.length]);

  if (!d) return <div className="screen" />;
  if (!v) {
    return (
      <div className="screen" style={{ padding: 16, gap: 16 }}>
        <div>
          <BackButton onClick={() => back('/personas')} label={backLabel} />
        </div>
        <div className="t-note">Esta persona ya no existe.</div>
      </div>
    );
  }

  const bal = v.saldo;
  const color = bal > 0 ? 'var(--pos)' : 'var(--owe)';
  const undoable = async (p: Promise<Parameters<typeof restaurar>[0]>, msg: string) => {
    const snap = await p;
    setSheet(null);
    toast(msg, { label: 'Deshacer', run: () => restaurar(snap) });
  };

  return (
    <div className="screen">
      <div className="row-between" style={{ flex: 'none', padding: '4px 16px' }}>
        <BackButton onClick={() => back('/personas')} label={backLabel} />
        <button className="btn-o" onClick={() => push(`/persona/${id}/editar`)}>
          Editar
        </button>
      </div>
      <div style={{ flex: 'none', padding: '16px 20px 14px' }}>
        <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: -1.4, lineHeight: 1, overflowWrap: 'anywhere' }}>{v.p.nombre}</h1>
        {bal === 0 ? (
          <div style={{ display: 'inline-flex', marginTop: 12, height: 44, padding: '0 16px', borderRadius: 22, border: '2px solid var(--ink)', alignItems: 'center', fontSize: 18, fontWeight: 800 }}>
            a mano, sin deudas
          </div>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, marginTop: 12, padding: '4px 16px 6px', borderRadius: 18, border: `2px solid ${color}`, color }}>
            <span style={{ fontSize: 17, fontWeight: 700 }}>{bal > 0 ? 'te debe' : 'le debes'}</span>
            <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>{fmt(Math.abs(bal))}</span>
          </div>
        )}
        {v.p.archivada && <div className="t-meta" style={{ marginTop: 8 }}>Archivada</div>}
      </div>

      <div className="scroll chat" ref={scroller}>
        {items.length === 0 && (
          <div className="t-note" style={{ margin: 'auto', textAlign: 'center' }}>
            Aquí aparecerá la historia con {v.first}.
          </div>
        )}
        {items.map((it) => {
          if (it.kind === 'cobro') {
            return (
              <button key={it.c.id} className="aviso" onClick={() => setSheet(it)}>
                Le cobraste por WhatsApp · {shortDate(todayISO(new Date(it.c.fecha)))}
              </button>
            );
          }
          const m = it.m;
          const g = m.gastoId ? d.gasto.get(m.gastoId) : undefined;
          const deTotal = g && g.total !== m.monto ? `de ${fmt(g.total)} · ` : '';
          // Los cargos sin gasto (cuotas de un cobro recurrente) se editan en una hoja.
          const abrirGasto = () => (m.gastoId ? push(`/gasto/${m.gastoId}`) : setSheet(it));
          switch (m.tipo) {
            case 'cargo':
              return (
                <button key={m.id} className="bub cargo" onClick={abrirGasto}>
                  <div className="b1">{m.detalle}</div>
                  <div className="b2">+{fmt(m.monto)}</div>
                  <div className="b3">{(m.recurrenteId && !m.gastoId ? 'se repite · ' : deTotal) + shortDate(m.fecha)}</div>
                </button>
              );
            case 'deuda':
              return (
                <button key={m.id} className="bub porti" onClick={abrirGasto}>
                  <div className="b1">Pagó por ti · {m.detalle}</div>
                  <div className="b2">{fmt(m.monto)}</div>
                  <div className="b3">{deTotal + shortDate(m.fecha)}</div>
                </button>
              );
            case 'pago':
              return (
                <button key={m.id} className="bub pago" onClick={() => setSheet(it)}>
                  <div className="b1">Te pagó · {m.detalle}</div>
                  <div className="b2">−{fmt(m.monto)}</div>
                  <div className="b3">{shortDate(m.fecha)}</div>
                </button>
              );
            case 'abono':
              return (
                <button key={m.id} className="bub abono" onClick={() => setSheet(it)}>
                  <div className="b1">Le pagaste · {m.detalle}</div>
                  <div className="b2">{fmt(m.monto)}</div>
                  <div className="b3">{shortDate(m.fecha)}</div>
                </button>
              );
          }
        })}
      </div>

      <div className="actions">
        <button className="btn-line" onClick={() => push(`/gasto/nuevo?p=${id}`)} aria-label={`Nuevo gasto con ${v.first}`}>
          <Icon name="plus" size={22} w={2.6} />
        </button>
        <button className="btn-line" onClick={() => push(`/persona/${id}/pago`)}>
          {bal < 0 ? 'Le pagué' : 'Pagó'}
        </button>
        <button
          className="btn-ink"
          style={{ opacity: bal > 0 ? 1 : 0.4 }}
          onClick={() => (bal > 0 ? push(`/persona/${id}/cobro`) : toast(bal < 0 ? 'Aquí el que debe eres tú' : `${v.first} no tiene saldo pendiente`))}
        >
          Cobrar por WhatsApp
        </button>
      </div>

      {sheet?.kind === 'mov' && sheet.m.tipo === 'cargo' && (
        <CargoSheet
          m={sheet.m}
          recurrente={sheet.m.recurrenteId ? d.recurrentes.find((r) => r.id === sheet.m.recurrenteId) : undefined}
          onClose={() => setSheet(null)}
          onVerRecurrente={(rid) => push(`/recurrente/${rid}`)}
          onGuardado={() => {
            setSheet(null);
            toast('Cargo actualizado');
          }}
          onBorrar={() => undoable(borrarMovimiento(sheet.m.id), 'Cargo borrado')}
        />
      )}
      {sheet?.kind === 'mov' && (sheet.m.tipo === 'pago' || sheet.m.tipo === 'abono') && (
        <Sheet onClose={() => setSheet(null)} label="Pago" style={{ gap: 10 }}>
          <div className="sheet-title">{sheet.m.tipo === 'abono' ? 'Le pagaste' : 'Te pagó'} {fmt(sheet.m.monto)}</div>
          <div className="sheet-body" style={{ paddingBottom: 6 }}>
            {sheet.m.detalle} · {shortDate(sheet.m.fecha)}
          </div>
          <button className="btn-ink" onClick={() => push(`/persona/${id}/pago/${sheet.m.id}`)}>
            Editar pago
          </button>
          <button className="btn-line danger" onClick={() => undoable(borrarMovimiento(sheet.m.id), 'Pago borrado')}>
            Borrar pago
          </button>
        </Sheet>
      )}
      {sheet?.kind === 'cobro' && (
        <Sheet onClose={() => setSheet(null)} label="Cobro" style={{ gap: 10 }}>
          <div className="sheet-title">Cobro {sheet.c.tono.toLowerCase()} · {shortDate(todayISO(new Date(sheet.c.fecha)))}</div>
          <div style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto', background: 'var(--surface)', borderRadius: 18, padding: '12px 14px', fontSize: 15, lineHeight: 1.45 }}>{sheet.c.mensaje}</div>
          <button className="btn-line" onClick={() => setSheet(null)}>
            Cerrar
          </button>
          <button className="btn-text" style={{ color: 'var(--danger)' }} onClick={() => undoable(borrarCobro(sheet.c.id), 'Registro de cobro borrado')}>
            Borrar este registro
          </button>
        </Sheet>
      )}
    </div>
  );
}

/** Hoja para editar un cargo suelto: la cuota de un cobro recurrente. */
function CargoSheet(props: {
  m: Movimiento;
  recurrente?: { id: string; nombre: string };
  onClose: () => void;
  onVerRecurrente: (id: string) => void;
  onGuardado: () => void;
  onBorrar: () => void;
}) {
  const { m, recurrente } = props;
  const [monto, setMonto] = useState(String(m.monto));
  const [detalle, setDetalle] = useState(m.detalle);
  const [fecha, setFecha] = useState(m.fecha);
  const valor = dg(monto);
  const guardar = async () => {
    if (!valor) return;
    await actualizarCargo(m.id, { monto: valor, fecha, detalle });
    props.onGuardado();
  };
  return (
    <Sheet onClose={props.onClose} label="Cargo" style={{ gap: 10 }}>
      <div className="sheet-title">Te debe {fmt(valor)}</div>
      <div className="sheet-body" style={{ paddingBottom: 4 }}>
        {recurrente ? `Viene de “${recurrente.nombre}”. Cambiarla aquí no toca las próximas.` : 'Cargo sin gasto asociado.'}
      </div>
      <input className="input-big" value={detalle} onChange={(e) => setDetalle(e.target.value)} maxLength={60} aria-label="Detalle" />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          className="input-big"
          style={{ flex: 1, fontSize: 22, fontWeight: 800 }}
          inputMode="numeric"
          value={monto ? `$${show(monto)}` : ''}
          placeholder="$0"
          onChange={(e) => setMonto(String(dg(e.target.value)).slice(0, 9))}
          aria-label="Monto"
        />
        <DateInputPill value={fecha} label={shortDate(fecha)} onChange={setFecha} />
      </div>
      <button className="btn-ink" style={{ opacity: valor ? 1 : 0.4 }} onClick={guardar}>
        Guardar cambios
      </button>
      {recurrente && (
        <button className="btn-line" onClick={() => props.onVerRecurrente(recurrente.id)}>
          Ver el cobro recurrente
        </button>
      )}
      <button className="btn-text" style={{ color: 'var(--danger)' }} onClick={props.onBorrar}>
        Borrar este cargo
      </button>
    </Sheet>
  );
}
