import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { actualizarPersona, guardarAjustes, registrarCobro } from '../db';
import { useAjustes, usePeople } from '../hooks';
import { useNav } from '../nav';
import { cargosPendientes } from '../lib/balance';
import { fmt, relativeDays } from '../lib/format';
import { TONOS, conDatos, enlaceWa, mensajesCobro } from '../lib/messages';
import { BackButton, Switch } from '../ui/kit';
import { useToast } from '../ui/toast';

export default function Collect() {
  const { id = '' } = useParams();
  const { back: volver, push } = useNav();
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
  const back = () => volver(`/persona/${id}`);

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
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1 }}>¿Cómo le cobras?</h1>
          {v.ultimoCobro && (
            <div className="t-meta" style={{ marginTop: 6 }}>
              Último cobro {relativeDays(v.ultimoCobro.fecha)} · {v.cobros.length} {v.cobros.length === 1 ? 'cobro' : 'cobros'} en total
            </div>
          )}
        </div>
        {TONOS.map((label, i) => (
          <button
            key={label}
            aria-pressed={tone === i}
            onClick={() => {
              setTone(i);
              setEdited(null);
            }}
            style={{
              border: `2px solid ${tone === i ? 'var(--ink)' : 'var(--track)'}`,
              borderRadius: 22,
              background: tone === i ? 'var(--ink)' : 'transparent',
              color: tone === i ? 'var(--bg)' : 'var(--ink)',
              padding: '12px 16px',
              textAlign: 'left',
            }}
          >
            <span style={{ display: 'block', fontSize: 18, fontWeight: 800 }}>{label}</span>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 500, opacity: 0.75, marginTop: 2 }}>{msgs[i].slice(0, 60)}…</span>
          </button>
        ))}
        <textarea
          rows={6}
          value={text}
          onChange={(e) => setEdited(e.target.value)}
          aria-label="Mensaje"
          style={{ marginTop: 6, resize: 'none', padding: '14px 16px', borderRadius: 22, border: 'none', background: 'var(--surface)', fontSize: 15, lineHeight: 1.45 }}
        />
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
          <div className="t-meta" style={{ padding: '0 4px' }}>
            Aún no guardas tus datos de transferencia.{' '}
            <button className="btn-text" style={{ fontSize: 13, height: 'auto', textDecoration: 'underline' }} onClick={() => push('/ajustes')}>
              Agregarlos
            </button>
          </div>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 4px 0' }}>
          <span className="t-meta">Teléfono de {v.first}{!v.p.telefono && ' (opcional)'}</span>
          <input
            className="input-pill"
            style={{ flex: 'none' }}
            type="tel"
            inputMode="tel"
            placeholder="+56 9 1234 5678"
            value={tel}
            onChange={(e) => setPhone(e.target.value)}
          />
          {!tel.trim() && <span className="t-meta">Sin número, WhatsApp te deja elegir el contacto.</span>}
        </label>
      </div>
      <div className="foot">
        <button className="cta h60" onClick={send}>
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
