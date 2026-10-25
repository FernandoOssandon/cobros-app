import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { actualizarPersona, borrarPersona } from '../db';
import { usePeople } from '../hooks';
import { fmt } from '../lib/format';
import { CloseButton, ConfirmSheet, Switch } from '../ui/kit';
import { elegirContacto, puedeElegirContacto } from '../lib/contacts';
import { useToast } from '../ui/toast';

export default function EditPerson() {
  const { id = '' } = useParams();
  const nav = useNavigate();
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
  const close = () => nav(`/persona/${id}`, { replace: true });
  const valid = nombre.trim().length > 0;

  const save = async () => {
    if (!valid) {
      toast('Escribe un nombre');
      return;
    }
    await actualizarPersona(id, { nombre: nombre.trim(), telefono: tel.trim(), archivada: arch });
    toast(arch && !v.p.archivada ? `${v.first} quedó archivada` : 'Cambios guardados');
    if (arch && !v.p.archivada) nav('/', { replace: true });
    else close();
  };

  return (
    <div className="screen">
      <div style={{ flex: 'none', padding: '2px 16px' }}>
        <CloseButton onClick={close} />
      </div>
      <div className="scroll" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h1 className="question" style={{ margin: 0 }}>Editar a {v.first}</h1>
        <div className="field">
          <label htmlFor="nombre">Nombre</label>
          <input id="nombre" value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="tel">Teléfono para WhatsApp</label>
          <input id="tel" type="tel" inputMode="tel" placeholder="+56 9 1234 5678" value={tel} onChange={(e) => setTel(e.target.value)} />
          {puedeElegirContacto() && (
            <button
              className="btn-text"
              style={{ alignSelf: 'flex-start', fontSize: 14 }}
              onClick={async () => {
                const c = await elegirContacto();
                if (c?.telefono) setTel(c.telefono);
              }}
            >
              Tomar el número de mis contactos
            </button>
          )}
        </div>
        <div className="setting" style={{ borderTopWidth: 2 }}>
          <span>
            <span className="setting-title" style={{ display: 'block' }}>Archivar</span>
            <span className="meta">
              {v.saldo > 0 ? `Ojo: todavía te debe ${fmt(v.saldo)}.` : 'Se oculta del inicio, sin perder su historial.'}
            </span>
          </span>
          <Switch label="Archivar" on={arch} onChange={setArch} />
        </div>
        {v.movs.length === 0 ? (
          <button className="btn-text" style={{ color: 'var(--danger)', alignSelf: 'flex-start' }} onClick={() => setConfirmDel(true)}>
            Borrar a {v.first}
          </button>
        ) : (
          <div className="meta">Tiene historial, por eso no se puede borrar. Si ya no la usas, archívala.</div>
        )}
      </div>
      <div className="foot">
        <button className="cta" aria-disabled={!valid} onClick={save}>
          Guardar
        </button>
      </div>
      {confirmDel && (
        <ConfirmSheet
          title={`¿Borrar a ${v.first}?`}
          confirm="Sí, borrar"
          onClose={() => setConfirmDel(false)}
          onConfirm={async () => {
            await borrarPersona(id);
            toast(`${v.first} fue borrada`);
            nav('/', { replace: true });
          }}
        />
      )}
    </div>
  );
}
