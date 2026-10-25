import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { borrarTodo, db, exportarRespaldo, guardarAjustes, importarRespaldo, validarRespaldo, type Respaldo } from '../db';
import { isDark, useAjustes } from '../hooks';
import { movimientosCsv } from '../lib/csv';
import { stampLabel, todayISO } from '../lib/format';
import { BackButton, ConfirmSheet, Switch } from '../ui/kit';
import { useToast } from '../ui/toast';

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Settings() {
  const nav = useNavigate();
  const toast = useToast();
  const aj = useAjustes();
  const stats = useLiveQuery(async () => ({
    personas: await db.personas.count(),
    archivadas: await db.personas.filter((p) => p.archivada).count(),
    movs: await db.movimientos.count(),
  }));
  const file = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<Respaldo | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  // Borradores locales para no escribir en la base en cada tecla.
  const [name, setName] = useState<string | null>(null);
  const [bank, setBank] = useState<string | null>(null);

  const exportJson = async () => {
    const r = await exportarRespaldo();
    download(`me-debes-respaldo-${todayISO()}.json`, JSON.stringify(r, null, 2), 'application/json');
    toast('Respaldo guardado');
  };
  const exportCsv = async () => {
    const [ps, ms, cs] = await Promise.all([db.personas.toArray(), db.movimientos.toArray(), db.cargos.toArray()]);
    download(`me-debes-movimientos-${todayISO()}.csv`, movimientosCsv(ps, ms, cs), 'text/csv;charset=utf-8');
    toast('Planilla descargada');
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      setPendingImport(validarRespaldo(JSON.parse(await f.text())));
    } catch (e) {
      toast(e instanceof SyntaxError ? 'El archivo no es un respaldo válido' : (e as Error).message);
    } finally {
      if (file.current) file.current.value = '';
    }
  };

  return (
    <div className="screen">
      <div className="scroll" style={{ padding: '2px 20px var(--safe-bottom)' }}>
        <BackButton onClick={() => nav('/')} />
        <h1 className="title-40" style={{ margin: '18px 0' }}>ajustes.</h1>

        <div className="setting">
          <span className="setting-title">Modo oscuro</span>
          <Switch label="Modo oscuro" on={aj.tema === 'oscuro' || (aj.tema === 'sistema' && isDark())} onChange={(on) => guardarAjustes({ tema: on ? 'oscuro' : 'claro' })} />
        </div>
        <label className="setting-field">
          <span className="meta">Firmo los cobros como</span>
          <input value={name ?? aj.miNombre} placeholder="Tu nombre" onChange={(e) => setName(e.target.value)} onBlur={() => name !== null && guardarAjustes({ miNombre: name.trim() })} />
        </label>
        <label className="setting-field">
          <span className="meta">Mis datos de transferencia</span>
          <input
            className="sm"
            value={bank ?? aj.datosBancarios}
            placeholder="Banco · tipo de cuenta · número · RUT"
            onChange={(e) => setBank(e.target.value)}
            onBlur={() => bank !== null && guardarAjustes({ datosBancarios: bank.trim() })}
          />
        </label>

        {!!stats?.archivadas && (
          <button className="setting" style={{ width: '100%', border: 'none', borderTop: '2px solid var(--ink)', background: 'transparent', textAlign: 'left' }} onClick={() => nav('/archivadas')}>
            <span className="setting-title">Personas archivadas</span>
            <span className="muted" style={{ fontWeight: 700 }}>{stats.archivadas} ›</span>
          </button>
        )}

        <div className="setting" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
          <div className="setting-title">Respaldo</div>
          <div className="muted" style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.4 }}>
            Todo vive en este teléfono. Último respaldo {aj.ultimoRespaldo ? stampLabel(aj.ultimoRespaldo) : 'nunca'} · {stats?.personas ?? 0} personas · {stats?.movs ?? 0} mov.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button className="cta" style={{ height: 50, fontSize: 15 }} onClick={exportJson}>
              Exportar
            </button>
            <button className="btn-line" style={{ height: 50, fontSize: 15 }} onClick={() => file.current?.click()}>
              Importar
            </button>
          </div>
          <button className="btn-line" style={{ height: 50, fontSize: 15 }} onClick={exportCsv}>
            Descargar planilla (Excel)
          </button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>

        <button
          className="setting"
          style={{ width: '100%', border: 'none', borderTop: '2px solid var(--ink)', background: 'transparent', color: 'var(--danger)', fontSize: 20, fontWeight: 700, textAlign: 'left' }}
          onClick={() => setConfirmReset(true)}
        >
          Borrar todo
        </button>
        <div className="meta" style={{ paddingTop: 8 }}>Me Debes 1.0 · funciona sin conexión</div>
      </div>

      {pendingImport && (
        <ConfirmSheet
          title="¿Reemplazar todo con este respaldo?"
          body={`Trae ${pendingImport.personas.length} personas y ${pendingImport.movimientos.length} movimientos. Lo que tienes ahora en el teléfono se borra.`}
          confirm="Sí, restaurar"
          onClose={() => setPendingImport(null)}
          onConfirm={async () => {
            await importarRespaldo(pendingImport);
            setPendingImport(null);
            toast(`Respaldo restaurado · ${pendingImport.personas.length} personas`);
          }}
        />
      )}
      {confirmReset && (
        <ConfirmSheet
          title="¿Borrar todos los datos?"
          body="Se borran personas, cargos, pagos y cobros de este teléfono. No se puede deshacer. Si quieres, exporta un respaldo antes."
          confirm="Sí, borrar todo"
          onClose={() => setConfirmReset(false)}
          onConfirm={async () => {
            await borrarTodo();
            setConfirmReset(false);
            nav('/');
            toast('Se borraron todos los datos');
          }}
        />
      )}
    </div>
  );
}
