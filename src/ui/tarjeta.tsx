// Tarjetas de crédito en la interfaz: cupo usado/disponible y la hoja para pagar la tarjeta.
import { useState } from 'react';
import type { Medio } from '../db';
import type { Datos } from '../hooks';
import { dg, fmt, pressKey, shortDate, show, todayISO } from '../lib/format';
import { sumarDias } from '../lib/recurrence';
import { porPagar, usoTarjeta } from '../lib/tarjetas';
import { pagarTarjeta, borrarPagoTarjeta } from '../tarjetas';
import { Keypad, Sheet } from './kit';
import { useToast } from './toast';

/** Lo usado de cada tarjeta de crédito que está cuadrada con el banco (o tiene pagos anotados). */
export function usadoTarjetas(d: Datos, hoy = todayISO()): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of d.medios) {
    if (m.tipo !== 'credito' || m.archivado) continue;
    if (!m.usoCuadrado && !d.pagosTarjeta.some((p) => p.medioId === m.id)) continue;
    out.set(m.id, usoTarjeta(m, d.gastos, d.pagosTarjeta, hoy).usado);
  }
  return out;
}

/** "Usado $443.385 de $2.000.000" + barra + "disponible $1.556.615". */
export function CupoTarjeta({ m, d, compacto = false }: { m: Medio; d: Datos; compacto?: boolean }) {
  const u = usoTarjeta(m, d.gastos, d.pagosTarjeta);
  if (!u.cupo && !u.cuadrado) return null;
  const pct = u.pct ?? 0;
  const color = pct >= 0.9 ? 'var(--danger)' : pct >= 0.7 ? 'var(--owe)' : 'var(--ink)';
  const fs = compacto ? 13 : 14;
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <span className="ellipsis" style={{ fontSize: fs, fontWeight: 700 }}>
        Usado {fmt(u.usado)}
        {u.cupo ? <span style={{ color: 'var(--muted)', fontWeight: 600 }}> de {fmt(u.cupo)}</span> : null}
      </span>
      {u.cupo ? (
        <span
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct * 100)}
          aria-label={`Cupo usado ${Math.round(pct * 100)} %`}
          style={{ display: 'block', height: 8, borderRadius: 4, background: 'var(--track)', overflow: 'hidden' }}
        >
          <span style={{ display: 'block', width: `${(pct * 100).toFixed(1)}%`, height: 8, borderRadius: 4, background: color }} />
        </span>
      ) : null}
      {u.disponible !== undefined && (
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: fs }}>
          <span style={{ fontWeight: 600, color: 'var(--muted)' }}>{Math.round(pct * 100)} % del cupo</span>
          <span style={{ fontWeight: 800, color: u.disponible < 0 ? 'var(--danger)' : 'var(--pos)', whiteSpace: 'nowrap' }}>
            {u.disponible < 0 ? `te pasaste ${fmt(-u.disponible)}` : `disponible ${fmt(u.disponible)}`}
          </span>
        </span>
      )}
      {!u.cuadrado && <span className="t-meta">Estimado con lo anotado. Cuádralo con tu banco en el medio.</span>}
    </span>
  );
}

type Fecha = 'hoy' | 'ayer';

/** "¿Cuánto pagaste de la CMR?": monto, desde qué cuenta y cuándo. */
export function PagarTarjetaSheet({ m, d, onClose }: { m: Medio; d: Datos; onClose: () => void }) {
  const toast = useToast();
  const hoy = todayISO();
  const u = usoTarjeta(m, d.gastos, d.pagosTarjeta, hoy);
  const pp = porPagar(m, d.imputados, d.movimientos, d.pagosTarjeta, hoy);
  const cuentas = d.cuentas.filter((c) => !c.archivada && c.tipo !== 'dap' && !c.moneda);
  const [amt, setAmt] = useState(pp && pp.queda > 0 ? String(pp.queda) : '');
  const [cuenta, setCuenta] = useState<string | null>(m.cuentaId && cuentas.some((c) => c.id === m.cuentaId) ? m.cuentaId : null);
  const [fecha, setFecha] = useState<Fecha>('hoy');
  const monto = dg(amt);
  const nombreCuenta = cuenta ? cuentas.find((c) => c.id === cuenta)?.nombre : undefined;
  return (
    <Sheet onClose={onClose} label={`Pagar ${m.nombre}`}>
      <div className="t-question" style={{ padding: '16px 4px 0' }}>¿Cuánto pagaste de la {m.nombre}?</div>
      <div className="t-hero-64" style={{ padding: '8px 4px 0', color: amt ? 'var(--ink)' : 'var(--muted)' }} aria-label="Monto del pago">
        ${show(amt) || '0'}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '6px 0 4px' }}>
        {pp && pp.queda > 0 && (
          <button className="pill h36" onClick={() => setAmt(String(pp.queda))}>
            Facturado · {fmt(pp.queda)}
          </button>
        )}
        {u.usado > 0 && (
          <button className="pill h36" onClick={() => setAmt(String(u.usado))}>
            Todo lo usado · {fmt(u.usado)}
          </button>
        )}
      </div>
      <div className="t-label" style={{ paddingTop: 10 }}>Desde</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {cuentas.map((c) => (
          <button key={c.id} className="pill h36" aria-pressed={cuenta === c.id} onClick={() => setCuenta(c.id)}>
            {c.nombre}
          </button>
        ))}
        <button className="pill h36" aria-pressed={cuenta === null} onClick={() => setCuenta(null)}>
          Otra
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 0 0' }}>
        <button className="pill h36" aria-pressed={fecha === 'hoy'} onClick={() => setFecha('hoy')}>
          Hoy
        </button>
        <button className="pill h36" aria-pressed={fecha === 'ayer'} onClick={() => setFecha('ayer')}>
          Ayer
        </button>
      </div>
      <div style={{ padding: '6px 0' }}>
        <Keypad h={42} onKey={(k) => setAmt((v) => pressKey(v, k))} />
      </div>
      <button
        className="cta"
        aria-disabled={!monto}
        onClick={async () => {
          if (!monto) return;
          const id = await pagarTarjeta(m.id, monto, cuenta ?? undefined, fecha === 'hoy' ? hoy : sumarDias(hoy, -1));
          onClose();
          toast(`Pago anotado · ${fmt(monto)} a ${m.nombre}${nombreCuenta ? ` desde ${nombreCuenta}` : ''}`, { label: 'Deshacer', run: () => void borrarPagoTarjeta(id) });
        }}
      >
        Anotar pago
      </button>
      {pp && <div className="t-meta" style={{ textAlign: 'center', paddingTop: 8 }}>Facturado al {shortDate(pp.cierre)}: {fmt(pp.facturado)}{pp.pagado ? ` · ya pagaste ${fmt(pp.pagado)}` : ''}</div>}
    </Sheet>
  );
}
