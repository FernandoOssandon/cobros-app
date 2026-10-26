import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { entregarArchivo, importarRespaldo, validarRespaldo, type Respaldo } from '../backup';
import { borrarTodo, db, guardarAjustes } from '../db';
import { isDark, useAjustes } from '../hooks';
import { gastosCsv, movimientosCsv } from '../lib/csv';
import { shortDate, todayISO } from '../lib/format';
import { useNav } from '../nav';
import { useRespaldar } from '../useRespaldo';
import { Icon } from '../ui/icons';
import { BackButton, ConfirmSheet, Switch } from '../ui/kit';
import { useToast } from '../ui/toast';
import { UpdateBanner } from '../ui/UpdatePrompt';

export default function Ajustes() {
  const { push, back, backLabel, navigate } = useNav();
  const toast = useToast();
  const aj = useAjustes();
  const respaldar = useRespaldar();
  const stats = useLiveQuery(async () => ({
    personas: await db.personas.count(),
    archivadas: await db.personas.filter((p) => p.archivada).count(),
    gastos: await db.gastos.count(),
    medios: await db.medios.filter((m) => !m.archivado).count(),
    categorias: await db.categorias.filter((c) => !c.archivada).count(),
  }));
  const file = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<Respaldo | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [bank, setBank] = useState<string | null>(null);

  const dias = aj.ultimoRespaldo ? Math.floor((Date.now() - new Date(aj.ultimoRespaldo).getTime()) / 86_400_000) : null;
  const respaldoLabel =
    dias === null
      ? 'Todo vive en este teléfono. Todavía no haces un respaldo.'
      : dias === 0
        ? 'Todo vive en este teléfono. Último respaldo: hoy.'
        : `Todo vive en este teléfono. Último respaldo hace ${dias} ${dias === 1 ? 'día' : 'días'} (${shortDate(todayISO(new Date(aj.ultimoRespaldo!)))}).`;

  const exportCsv = async (cual: 'deudas' | 'gastos') => {
    const [ps, ms, gs, md, cs] = await Promise.all([db.personas.toArray(), db.movimientos.toArray(), db.gastos.toArray(), db.medios.toArray(), db.categorias.toArray()]);
    const contenido = cual === 'deudas' ? movimientosCsv(ps, ms, gs) : gastosCsv(gs, ps, md, cs);
    if (await entregarArchivo(`me-debes-${cual}-${todayISO()}.csv`, contenido, 'text/csv;charset=utf-8')) toast('Planilla lista');
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

  const fila = (titulo: string, sub: string, to: string) => (
    <button className="set-row" onClick={() => push(to)}>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="set-title">{titulo}</span>
        <span className="t-meta">{sub}</span>
      </span>
      <Icon name="next" size={20} />
    </button>
  );

  return (
    <div className="screen">
      <div className="scroll" style={{ padding: '4px 20px var(--safe-bottom)' }}>
        <BackButton onClick={() => back('/')} label={backLabel} />
        <h1 className="t-screen" style={{ margin: '18px 0 16px' }}>ajustes.</h1>
        <UpdateBanner />
        <div className="set-row">
          <span className="set-title">Modo oscuro</span>
          <Switch label="Modo oscuro" on={aj.tema === 'oscuro' || (aj.tema === 'sistema' && isDark())} onChange={(on) => guardarAjustes({ tema: on ? 'oscuro' : 'claro' })} />
        </div>
        <label className="set-field">
          <span className="t-meta">Firmo los cobros como</span>
          <input value={name ?? aj.miNombre} placeholder="Tu nombre" onChange={(e) => setName(e.target.value)} onBlur={() => name !== null && guardarAjustes({ miNombre: name.trim() })} />
        </label>
        <label className="set-field">
          <span className="t-meta">Mis datos de transferencia</span>
          <input
            style={{ fontSize: 17, fontWeight: 600 }}
            value={bank ?? aj.datosBancarios}
            placeholder="Banco · tipo de cuenta · número · RUT"
            onChange={(e) => setBank(e.target.value)}
            onBlur={() => bank !== null && guardarAjustes({ datosBancarios: bank.trim() })}
          />
        </label>
        {fila('Medios de pago', `${stats?.medios ?? 0} ${stats?.medios === 1 ? 'medio' : 'medios'}`, '/medios')}
        {fila('Categorías', `${stats?.categorias ?? 0} categorías`, '/categorias')}
        {!!stats?.archivadas && fila('Personas archivadas', `${stats.archivadas} ${stats.archivadas === 1 ? 'persona' : 'personas'}`, '/archivadas')}

        <div style={{ padding: '16px 0', borderTop: '2px solid var(--ink)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="set-title">Respaldo</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted)', lineHeight: 1.4 }}>{respaldoLabel}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button className="cta" style={{ height: 50, fontSize: 15 }} onClick={respaldar}>
              Exportar
            </button>
            <button className="btn-line" style={{ height: 50, fontSize: 15 }} onClick={() => file.current?.click()}>
              Importar
            </button>
          </div>
          <div className="row-between">
            <span style={{ fontSize: 15, fontWeight: 700 }}>Recordarme respaldar cada 7 días</span>
            <Switch label="Recordarme respaldar cada 7 días" on={aj.recordarRespaldo} onChange={(on) => guardarAjustes({ recordarRespaldo: on })} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="t-meta" style={{ marginRight: 4 }}>Planillas Excel:</span>
            <button className="pill h36" onClick={() => exportCsv('gastos')}>
              Gastos
            </button>
            <button className="pill h36" onClick={() => exportCsv('deudas')}>
              Deudas
            </button>
          </div>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        <button className="set-row" style={{ color: 'var(--danger)', fontSize: 20, fontWeight: 700 }} onClick={() => setConfirmReset(true)}>
          Borrar todo
        </button>
        <div className="t-meta" style={{ paddingTop: 8 }}>Me Debes {__APP_VERSION__} · funciona sin conexión</div>
      </div>

      {pendingImport && (
        <ConfirmSheet
          title="¿Reemplazar todo con este respaldo?"
          body={`Trae ${pendingImport.personas.length} personas y ${pendingImport.gastos.length} gastos. Lo que tienes ahora en el teléfono se borra.`}
          confirm="Sí, restaurar"
          onClose={() => setPendingImport(null)}
          onConfirm={async () => {
            await importarRespaldo(pendingImport);
            setPendingImport(null);
            toast(`Respaldo restaurado · ${pendingImport.gastos.length} gastos`);
          }}
        />
      )}
      {confirmReset && (
        <ConfirmSheet
          title="¿Borrar todo?"
          body="Se van todos los gastos, personas y recurrentes. Si no tienes respaldo, no hay vuelta atrás."
          confirm="Sí, borrar todo"
          onClose={() => setConfirmReset(false)}
          onConfirm={async () => {
            await borrarTodo();
            setConfirmReset(false);
            navigate('/', { replace: true });
            toast('Se borraron todos los datos');
          }}
        />
      )}
    </div>
  );
}
