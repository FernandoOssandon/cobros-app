// Importar una cartola: aplica lo que decidiste en la revisión, todo junto (si algo falla, no queda nada a medias).
import { borrarMovAhorro, ID_EFECTIVO } from './ahorros';
import {
  MEDIO_COLORS, borrarGasto, db, guardarAjustes, guardarGasto, guardarMedio, guardarPago, uid,
  type Aprendido, type Importado, type RefApp,
} from './db';
import { borrarIngreso, guardarIngreso } from './ingresos';
import { claveDetalle, type LineaCartola } from './lib/bancos';
import {
  cambiosLigados, claveRef, creadoImportado, idDestino, medioDeCuenta, nombreDestino, restoPago,
  type Decisiones, type ItemCartola, type Propuesta, type Revision,
} from './lib/importar';
import { ocurrenciasEntre, sumarDias } from './lib/recurrence';
import { idOcurrencia } from './recurrentes';

export interface ResultadoImportar {
  ligados: number;
  creados: number;
  corregidos: number;
  borrados: number;
  ignorados: number;
}

const TABLAS = () => [db.gastos, db.movimientos, db.fotos, db.ingresos, db.movAhorro, db.pagosTarjeta, db.medios, db.importados, db.recurrentes, db.pendientes, db.personas, db.cuentas];

/** Recuerda a qué cuenta o tarjeta de la app corresponde este archivo (la próxima vez no se pregunta). */
export async function recordarDestino(clave: string, id: string) {
  const a = await db.ajustes.get('main');
  await guardarAjustes({ importar: { ...a?.importar, [clave]: id } });
}

function aprendidoDe(p: Propuesta): Aprendido {
  switch (p.tipo) {
    case 'gasto':
      return { tipo: 'gasto', descripcion: p.descripcion, categoriaId: p.categoriaId, medioId: p.medioId };
    case 'pago':
    case 'abono':
      return { tipo: p.tipo, personaId: p.personaId };
    case 'ingreso':
      return { tipo: 'ingreso', descripcion: p.descripcion, tipoIngreso: p.tipoIngreso };
    case 'traspaso':
      return { tipo: 'traspaso', cuentaId: p.cuentaId };
    case 'pagoTarjeta':
      return { tipo: 'pagoTarjeta', medioId: p.medioId };
    case 'ignorar':
      return { tipo: 'ignorar' };
  }
}

export async function aplicarImportacion(r: Revision, dec: Decisiones, saldoPersona: Map<string, number>): Promise<ResultadoImportar> {
  const res: ResultadoImportar = { ligados: 0, creados: 0, corregidos: 0, borrados: 0, ignorados: 0 };
  const destinoId = idDestino(r.destino);
  const ahora = new Date().toISOString();
  const banco = r.cartola.banco;
  const cuentaId = r.destino.tipo === 'cuenta' ? r.destino.cuenta.id : undefined;

  await db.transaction('rw', TABLAS(), async () => {
    // Cuenta sin registros: parte con el saldo que tenía el banco antes del primer movimiento del archivo.
    if (cuentaId && r.saldoInicial) {
      const f = r.saldoInicial.fecha;
      await db.movAhorro.add({ id: uid(), cuentaId, tipo: 'cuadre', monto: r.saldoInicial.monto, fecha: f, nota: `Saldo según la cartola ${banco}`, creado: new Date(`${f}T23:59:59-03:00`).toISOString() });
    }

    // Débito o transferencia ligado a la cuenta (si no hay, se crea): así los gastos bajan su saldo.
    const medioCuenta = async (l: LineaCartola): Promise<string | undefined> => {
      if (!cuentaId) return undefined;
      const medios = await db.medios.toArray();
      const id = medioDeCuenta(l.detalle, cuentaId, medios);
      if (id) return id;
      const transf = /transf|traspaso/i.test(l.detalle);
      return guardarMedio({ nombre: `${transf ? 'Transferencia' : 'Débito'} ${banco}`, tipo: transf ? 'transferencia' : 'debito', color: MEDIO_COLORS[medios.length % MEDIO_COLORS.length], cuentaId });
    };

    const nombreCuenta = async (id?: string) => (id ? id === ID_EFECTIVO ? 'Efectivo' : (await db.cuentas.get(id))?.nombre : undefined) ?? 'otra cuenta tuya';

    const ingresoResto = async (l: LineaCartola, monto: number, quien: string, creado: string): Promise<RefApp> => {
      const id = await guardarIngreso({ descripcion: `Transferencia de ${quien} (lo que sobró de su pago)`, tipo: 'otro', monto, fecha: l.fecha, cuentaId });
      await db.ingresos.update(id, { creado });
      return { tipo: 'ingreso', id };
    };

    /** Anota lo nuevo según la propuesta. Devuelve lo que quedó en la app. */
    const crear = async (x: ItemCartola, p: Propuesta): Promise<RefApp[]> => {
      const l = x.linea;
      const monto = Math.abs(l.monto);
      const creado = creadoImportado(l.fecha, l.orden);
      switch (p.tipo) {
        case 'gasto': {
          const medioId = r.destino.tipo === 'tarjeta' ? r.destino.medio.id : (p.medioId ?? (await medioCuenta(l)));
          const id = await guardarGasto(
            {
              descripcion: p.descripcion,
              fecha: l.fecha,
              modo: 'solo',
              yoIncluido: true,
              misPartes: 1,
              exactos: {},
              partes: {},
              pagador: 'yo',
              medioId,
              categoriaId: p.categoriaId,
              cuotas: p.cuotas,
              nota: `De la cartola ${banco}: ${l.detalle}`,
            },
            { amount: monto, rows: [], mine: monto, remaining: 0, ok: true },
          );
          await db.gastos.update(id, { creado });
          return [{ tipo: 'gasto', id }];
        }
        case 'pago': {
          const resto = Math.min(p.resto ?? 0, monto - 1);
          const id = await guardarPago(p.personaId, monto - Math.max(0, resto), 'Transferencia', l.fecha, undefined, 'pago', cuentaId);
          await db.movimientos.update(id, { creado });
          const refs: RefApp[] = [{ tipo: 'movimiento', id }];
          if (resto > 0) {
            const quien = (await db.personas.get(p.personaId))?.nombre.split(' ')[0] ?? 'alguien';
            refs.push(await ingresoResto(l, resto, quien, creado));
          }
          return refs;
        }
        case 'abono': {
          const id = await guardarPago(p.personaId, monto, 'Transferencia', l.fecha, undefined, 'abono', cuentaId);
          await db.movimientos.update(id, { creado });
          return [{ tipo: 'movimiento', id }];
        }
        case 'ingreso': {
          let id: string | undefined;
          // El sueldo que ya tiene recurrente queda como su ocurrencia: así el recurrente no lo vuelve a anotar.
          const rec = p.recurrenteId ? await db.recurrentes.get(p.recurrenteId) : undefined;
          if (rec) {
            const occ = ocurrenciasEntre(rec.frecuencia, rec.inicio, sumarDias(l.fecha, -11), sumarDias(l.fecha, 10), rec.fin).sort(
              (a, b) => Math.abs(new Date(a).getTime() - new Date(l.fecha).getTime()) - Math.abs(new Date(b).getTime() - new Date(l.fecha).getTime()),
            )[0];
            if (occ && !(await db.ingresos.get(idOcurrencia(rec.id, occ)))) {
              id = idOcurrencia(rec.id, occ);
              await db.pendientes.delete(id);
              if (!rec.generadoHasta || rec.generadoHasta < occ) await db.recurrentes.update(rec.id, { generadoHasta: occ });
            }
          }
          id = await guardarIngreso({ id, descripcion: p.descripcion, tipo: p.tipoIngreso, monto, fecha: l.fecha, cuentaId, recurrenteId: id ? rec?.id : undefined });
          await db.ingresos.update(id, { creado });
          for (const m of await db.movAhorro.where('cuentaId').equals(cuentaId ?? '').toArray()) if (m.ingresoId === id) await db.movAhorro.update(m.id, { creado });
          return [{ tipo: 'ingreso', id }];
        }
        case 'traspaso': {
          if (!cuentaId) return [];
          const entra = l.monto > 0;
          const traspasoId = p.cuentaId ? uid() : undefined;
          const otra = await nombreCuenta(p.cuentaId);
          const id = uid();
          await db.movAhorro.add({ id, cuentaId, tipo: entra ? 'deposito' : 'retiro', monto, fecha: l.fecha, nota: entra ? `Traspaso desde ${otra}` : `Traspaso a ${otra}`, traspasoId, creado });
          if (p.cuentaId) {
            const aqui = nombreDestino(r.destino);
            await db.movAhorro.add({ id: uid(), cuentaId: p.cuentaId, tipo: entra ? 'retiro' : 'deposito', monto, fecha: l.fecha, nota: entra ? `Traspaso a ${aqui}` : `Traspaso desde ${aqui}`, traspasoId, creado });
          }
          return [{ tipo: 'movAhorro', id }];
        }
        case 'pagoTarjeta': {
          const id = uid();
          if (r.destino.tipo === 'tarjeta') {
            await db.pagosTarjeta.add({ id, medioId: r.destino.medio.id, cuentaId: r.destino.medio.cuentaId, monto, fecha: l.fecha, creado });
            return [{ tipo: 'pagoTarjeta', id }];
          }
          if (p.medioId) {
            await db.pagosTarjeta.add({ id, medioId: p.medioId, cuentaId, monto, fecha: l.fecha, creado });
            return [{ tipo: 'pagoTarjeta', id }];
          }
          // Sin tarjeta elegida: igual sale de la cuenta, para que el saldo calce.
          await db.movAhorro.add({ id, cuentaId: cuentaId!, tipo: 'retiro', monto, fecha: l.fecha, nota: 'Pago de tarjeta', creado });
          return [{ tipo: 'movAhorro', id }];
        }
        case 'ignorar':
          return [];
      }
    };

    /** Deja un registro ligado con el monto y la fecha que corresponden (y en esta cuenta, si no tenía). */
    const corregir = async (x: ItemCartola, accion: 'ligar' | 'banco' | 'app'): Promise<RefApp[]> => {
      const extra: RefApp[] = [];
      const resto = restoPago(x, accion, saldoPersona);
      for (const c of cambiosLigados(x, accion, r.destino)) {
        const { reg } = c;
        const monto = Math.abs(c.monto);
        const cambia = c.monto !== reg.monto || c.fecha !== reg.fecha || !!reg.sinCuenta;
        if (!cambia) continue;
        if (c.monto !== reg.monto) res.corregidos++;
        const id = reg.ref.id;
        switch (reg.ref.tipo) {
          case 'gasto': {
            const g = await db.gastos.get(id);
            if (!g) break;
            // La diferencia es tuya: lo de los demás no cambia.
            const otros = Object.values(g.montos ?? {}).reduce((s, v) => s + v, 0);
            const miParte = g.modo === 'solo' ? monto : Math.max(0, monto - otros);
            await db.gastos.update(id, { total: monto, miParte });
            break;
          }
          case 'movimiento': {
            const quedan = resto ? monto - resto : monto;
            await db.movimientos.update(id, { monto: quedan, fecha: c.fecha, ...(cuentaId ? { cuentaId } : {}) });
            if (resto) {
              const m = await db.movimientos.get(id);
              const quien = m ? (await db.personas.get(m.personaId))?.nombre.split(' ')[0] ?? 'alguien' : 'alguien';
              extra.push(await ingresoResto(x.linea, resto, quien, reg.creado));
            }
            break;
          }
          case 'ingreso': {
            const i = await db.ingresos.get(id);
            if (i) await guardarIngreso({ ...i, monto, fecha: c.fecha, cuentaId: cuentaId ?? i.cuentaId });
            break;
          }
          case 'pagoTarjeta':
            await db.pagosTarjeta.update(id, { monto, fecha: c.fecha });
            break;
          case 'movAhorro': {
            const m = await db.movAhorro.get(id);
            if (!m) break;
            await db.movAhorro.update(id, { monto, fecha: c.fecha });
            // La otra pata del traspaso se mueve igual.
            if (m.traspasoId)
              for (const o of await db.movAhorro.where('traspasoId').equals(m.traspasoId).toArray()) if (o.id !== id) await db.movAhorro.update(o.id, { monto, fecha: c.fecha });
            break;
          }
        }
      }
      return extra;
    };

    const guardarImportado = (x: ItemCartola, estado: Importado['estado'], refs: RefApp[], aprendido?: Aprendido) =>
      db.importados.put({ id: x.huella, destinoId, fecha: x.linea.fecha, monto: x.linea.monto, detalle: x.linea.detalle, estado, refs: refs.length ? refs : undefined, clave: claveDetalle(x.linea.detalle), aprendido, creado: ahora });

    for (const x of r.items) {
      const dcs = dec.items[x.huella];
      if (!dcs) continue;
      if (dcs.accion === 'nuevo') {
        const refs = await crear(x, dcs.propuesta);
        if (refs.length) res.creados++;
        else res.ignorados++;
        await guardarImportado(x, refs.length ? 'creado' : 'ignorado', refs, aprendidoDe(dcs.propuesta));
        continue;
      }
      const extra = await corregir(x, dcs.accion);
      res.ligados++;
      const app = x.app ?? [];
      const principal = app.reduce((a, b) => (Math.abs(b.monto) > Math.abs(a.monto) ? b : a), app[0]);
      await guardarImportado(x, 'ligado', [...app.map((a) => a.ref), ...extra], principal?.aprendido);
    }

    for (const a of r.soloApp) {
      if (!dec.borrar.has(claveRef(a.ref))) continue;
      res.borrados++;
      const id = a.ref.id;
      if (a.ref.tipo === 'gasto') await borrarGasto(id);
      else if (a.ref.tipo === 'movimiento') await db.movimientos.delete(id);
      else if (a.ref.tipo === 'ingreso') await borrarIngreso(id);
      else if (a.ref.tipo === 'pagoTarjeta') await db.pagosTarjeta.delete(id);
      else await borrarMovAhorro(id);
    }
  });
  return res;
}

/** Lo que sirve para saber, al importar, si un archivo ya se importó entero. */
export const yaImportada = (r: Revision) => r.items.every((x) => x.grupo === 'importado' || x.grupo === 'anterior');

