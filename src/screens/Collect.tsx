import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { actualizarPersona, guardarAjustes, registrarCobro } from '../db';
import { useAjustes, usePeople } from '../hooks';
import { cargosPendientes } from '../lib/balance';
import { fmt, relativeDays } from '../lib/format';
import { TONOS, conDatos, enlaceWa, mensajesCobro } from '../lib/messages';
import { BackButton, Switch } from '../ui/kit';
import { useToast } from '../ui/toast';

export default function Collect() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const people = usePeople();
  const aj = useAjustes();
  const [tone, setTone] = useState(0);
  const [edited, setEdited] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const v = people?.find((x) => x.p.id === id);
  if (!v) return <div className="screen" />;

  const msgs = mensajesCobro(v.first, fmt(v.saldo), cargosPendientes(v.movs));
  const text = edited ?? conDatos(msgs[tone], aj.datosBancarios, aj.miNombre, aj.incluirDatos);
  const tel = phone ?? v.p.telefono;
  const back = () => nav(`/persona/${id}`, { replace: true });

  const send = () => {
    // Se abre WhatsApp dentro del mismo toque del usuario para que el navegador no lo bloquee.
    const url = enlaceWa(tel, text);
    // (Sin la opción 'noopener', porque con ella window.open siempre devuelve null.)
    const w = window.open(url, '_blank');
    if (w) w.opener = null;
    else window.location.href = url;
    setSending(true);
    void (async () => {
      if (phone !== null && phone.trim() !== v.p.telefono) await actualizarPersona(id, { telefono: phone.trim() });
      await registrarCobro({ personaId: id, tono: TONOS[tone], monto: v.saldo, mensaje: text });
    })();
    window.setTimeout(() => {
      setSending(false);
      toast(`Cobro enviado a ${v.first}`);
      back();
    }, 1300);
  };

  return (
    <div className="screen">
      <div style={{ flex: 'none', padding: '2px 16px' }}>
        <BackButton onClick={back} label={v.first} />
      </div>
      <div className="scroll" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ padding: '0 4px 6px' }}>
          <h1 className="q-32" style={{ margin: 0 }}>¿Cómo le cobras?</h1>
          {v.ultimoCobro && (
            <div className="meta" style={{ marginTop: 6 }}>
              Último cobro {relativeDays(v.ultimoCobro.fecha)} · {v.cobros.length} {v.cobros.length === 1 ? 'cobro' : 'cobros'} en total
            </div>
          )}
        </div>
        {TONOS.map((label, i) => (
          <button
            key={label}
            className="tone"
            aria-pressed={tone === i}
            onClick={() => {
              setTone(i);
              setEdited(null);
            }}
          >
            <span className="t-name">{label}</span>
            <span className="t-sample">{msgs[i].slice(0, 60)}…</span>
          </button>
        ))}
        <textarea className="wa-text" rows={6} value={text} onChange={(e) => setEdited(e.target.value)} aria-label="Mensaje" style={{ marginTop: 6 }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 4px' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Con mis datos bancarios</span>
          <Switch
            label="Con mis datos bancarios"
            on={aj.incluirDatos}
            onChange={(on) => {
              guardarAjustes({ incluirDatos: on });
              setEdited(null);
            }}
          />
        </div>
        {aj.incluirDatos && !aj.datosBancarios.trim() && (
          <div className="meta" style={{ padding: '0 4px' }}>
            Aún no guardas tus datos de transferencia.{' '}
            <button className="btn-text" style={{ fontSize: 13 }} onClick={() => nav('/ajustes')}>
              Agregarlos
            </button>
          </div>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 4px 0' }}>
          <span className="meta">Teléfono de {v.first}{!v.p.telefono && ' (opcional)'}</span>
          <input
            className="inline-input"
            style={{ flex: 'none' }}
            type="tel"
            inputMode="tel"
            placeholder="+56 9 1234 5678"
            value={tel}
            onChange={(e) => setPhone(e.target.value)}
          />
          {!tel.trim() && <span className="meta">Sin número, WhatsApp te deja elegir el contacto.</span>}
        </label>
      </div>
      <div style={{ flex: 'none', padding: '8px 16px var(--safe-bottom)' }}>
        <button className="cta tall" onClick={send}>
          Mandar por WhatsApp
        </button>
      </div>
      {sending && (
        <div className="sending" role="status">
          <div>Abriendo WhatsApp…</div>
        </div>
      )}
    </div>
  );
}
