import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { actualizarPersona, borrarPersona } from '../db';
import { usePeople } from '../hooks';
import { elegirContacto, puedeElegirContacto } from '../lib/contacts';
import { fmt } from '../lib/format';
import { useNav } from '../nav';
import { ConfirmSheet, Switch, TaskHeader } from '../ui/kit';
import { useToast } from '../ui/toast';

export default function EditPerson() {
  const { id = '' } = useParams();
  const { back, navigate } = useNav();
  const toast = useToast();
  const people = usePeople();
  const v = people?.find((x) => x.p.id === id);
  const [nombre, setNombre] = useState('');
  const [tel, setTel] = useState('');
  const [arch, setArch] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!v || loaded.current) return;
    loaded.current = true;
    setNombre(v.p.nombre);
    setTel(v.p.telefono);
    setArch(v.p.archivada);
  }, [v]);

  if (!v) return <div className="screen" />;
  const cerrar = () => back(`/persona/${id}`);
  const valid = nombre.trim().length > 0;

  const save = async () => {
    if (!valid) {
      toast('Escribe un nombre');
      return;
    }
    await actualizarPersona(id, { nombre: nombre.trim(), telefono: tel.trim(), archivada: arch });
    toast(arch && !v.p.archivada ? `${v.first} quedó archivada` : 'Cambios guardados');
    if (arch && !v.p.archivada) navigate('/personas', { replace: true });
    else cerrar();
  };

  return (
    <div className="screen">
      <TaskHeader title="editar persona." onClose={cerrar} />
      <div className="scroll" style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div className="t-label">Nombre</div>
          <input className="input-big" value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} autoComplete="off" aria-label="Nombre" />
        </div>
        <div>
          <div className="t-label">Teléfono para WhatsApp</div>
          <input className="input-big" style={{ fontWeight: 600 }} type="tel" inputMode="tel" placeholder="+56 9 1234 5678" value={tel} onChange={(e) => setTel(e.target.value)} aria-label="Teléfono" />
          {puedeElegirContacto() && (
            <button
              className="btn-text"
              style={{ fontSize: 14, textDecoration: 'underline', padding: '0 4px' }}
              onClick={async () => {
                const c = await elegirContacto();
                if (c?.telefono) setTel(c.telefono);
              }}
            >
              Tomar el número de mis contactos
            </button>
          )}
        </div>
        <div className="set-row" style={{ padding: '16px 4px' }}>
          <span>
            <span className="set-title" style={{ display: 'block', fontSize: 18 }}>Archivar</span>
            <span className="t-meta">{v.saldo !== 0 ? `Ojo: el saldo con ${v.first} es de ${fmt(Math.abs(v.saldo))}.` : 'Se oculta de la lista, sin perder su historial.'}</span>
          </span>
          <Switch label="Archivar" on={arch} onChange={setArch} />
        </div>
        {v.movs.length === 0 ? (
          <button className="btn-text" style={{ color: 'var(--danger)', alignSelf: 'flex-start', padding: '0 4px' }} onClick={() => setConfirmDel(true)}>
            Borrar a {v.first}
          </button>
        ) : (
          <div className="t-meta" style={{ padding: '0 4px' }}>Tiene historial, por eso no se puede borrar. Si ya no la usas, archívala.</div>
        )}
      </div>
      <div className="foot">
        <button className="cta" aria-disabled={!valid} onClick={save}>
          Guardar
        </button>
      </div>
      {confirmDel && (
        <ConfirmSheet
          title={`¿Borramos a ${v.first}?`}
          confirm="Sí, borrar"
          onClose={() => setConfirmDel(false)}
          onConfirm={async () => {
            await borrarPersona(id);
            toast(`${v.first} fue borrada`);
            navigate('/personas', { replace: true });
          }}
        />
      )}
    </div>
  );
}
