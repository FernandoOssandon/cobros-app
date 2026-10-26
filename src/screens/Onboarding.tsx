import { guardarAjustes, quitarMedio } from '../db';
import { useDatos } from '../hooks';
import { useNav } from '../nav';
import { Icon } from '../ui/icons';
import { MedioThumb } from '../ui/kit';
import { tipoMedioLabel } from '../ui/rows';
import { useToast } from '../ui/toast';

export default function Onboarding() {
  const d = useDatos();
  const { push, navigate } = useNav();
  const toast = useToast();
  const listo = async () => {
    await guardarAjustes({ onboardingHecho: true });
    navigate('/', { replace: true });
    toast('Listo. A anotar se ha dicho.');
  };
  const medios = d?.medios.filter((m) => !m.archivado) ?? [];
  return (
    <div className="screen">
      <div className="scroll" style={{ padding: '36px 20px 20px' }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>me debes.</div>
        <h1 style={{ fontSize: 56, fontWeight: 800, letterSpacing: -2.4, lineHeight: 0.95, marginTop: 28 }}>
          Agrega tus
          <br />
          tarjetas.
        </h1>
        <p style={{ fontSize: 18, fontWeight: 500, color: 'var(--muted)', marginTop: 14, lineHeight: 1.35, textWrap: 'pretty' }}>
          Así sé de dónde sale cada peso. El efectivo ya viene incluido; las tarjetas las nombras tú.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 26 }}>
          {medios.map((m) => (
            <div key={m.id} style={{ borderRadius: 22, background: 'var(--surface)', padding: '14px 14px 14px 16px', display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) 36px', gap: 12, alignItems: 'center' }}>
              <MedioThumb medio={m} w={44} h={30} r={7} />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 18, fontWeight: 700 }}>{m.nombre}</span>
                <span className="t-meta">
                  {tipoMedioLabel(m.tipo)}
                  {m.tipo === 'credito' && m.diaFacturacion ? ` · factura el ${m.diaFacturacion}` : ''}
                </span>
              </span>
              <button className="btn-round" onClick={() => quitarMedio(m.id)} aria-label={`Quitar ${m.nombre}`}>
                <Icon name="close" size={14} w={3} />
              </button>
            </div>
          ))}
          <button className="btn-dashed" onClick={() => push('/medio/nuevo')}>
            <Icon name="plus" size={20} w={2.8} />
            Agregar tarjeta
          </button>
        </div>
      </div>
      <div className="foot" style={{ gap: 4, paddingTop: 10 }}>
        <button className="cta h60" onClick={listo}>
          Listo, a anotar
        </button>
        <button className="btn-text" onClick={listo}>
          Lo hago después
        </button>
      </div>
    </div>
  );
}
