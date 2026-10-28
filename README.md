# Me Debes

**Versión 2.2 "Mi plata"**: patrimonio, cuentas de ahorro con interés estimado, depósitos a plazo y cobros detectados en los correos del banco (Gmail, vía un script propio: ver `integraciones/gmail/README.md`).

**Versión 2.1**: editar las cuotas de los cobros recurrentes, foto de la boleta desde el detalle, grupos que se editan, terminan y borran, y pruebas de punta a punta. Detalle en [CHANGELOG.md](CHANGELOG.md).

**Versión 2.0**: la app pasó de "quién me debe" a "a dónde se va mi plata". Implementa el handoff de diseño v2 (`design_handoff_me_debes/`): barra inferior con Resumen, Gastos, Personas y Recurrentes; gastos solo míos, compartidos o pagados por otra persona; deudas en ambos sentidos; medios de pago con nombre y barra apilada (tuyo / recuperado / pendiente); recurrentes fijos, variables ("por confirmar") y atrasados ("Anotar los N"); grupos y eventos; categorías con color; foto de la boleta; búsqueda y filtros; onboarding "Agrega tus tarjetas".

PWA móvil para llevar la cuenta de quién te debe plata. Está construida a partir del handoff de diseño "Lúdica" (`design_handoff_me_debes`). Funciona sin conexión y guarda los datos solo en el teléfono, en IndexedDB.

**Stack:** React 19 + Vite + TypeScript, `vite-plugin-pwa` (Workbox) y Dexie (IndexedDB). La fuente Bricolage Grotesque viene incluida en la app, así que también funciona offline.

## Cómo correrla

```bash
npm install
npm run dev        # desarrollo en http://localhost:5173
npm test           # pruebas de la lógica (reparto, saldos, respaldo, CSV)
npm run e2e        # compila y prueba la app completa en un Chrome de celular
npm run build      # genera la versión de producción en dist/
npm run preview    # sirve dist/ para probar la PWA (service worker incluido)
```

### Pruebas de punta a punta

Viven en `e2e/` y usan Playwright. Abren la app compilada, cargan `e2e/fixtures/respaldo-ejemplo.json` (datos inventados, con la fecha congelada en el 25 de noviembre de 2026) y recorren los flujos importantes: primer uso, gastos compartidos, pagos, recurrentes, cobro por WhatsApp, respaldo, fotos y grupos. Si la app tira un error en la consola, la prueba falla.

- La primera vez: `npx playwright install chromium`.
- `npm run e2e` corre todo. `npx playwright test grupos` corre solo las que mencionan "grupos".
- Si algo falla, `npx playwright show-report` muestra qué pasó paso a paso.

## Publicar versiones nuevas

El sitio de Netlify está conectado a este repo y `netlify.toml` define cómo compilar, así que **cada `git push` a `main` publica una versión nueva**.

1. Sube el número en `package.json` (`"version"`); se muestra en Ajustes. Anota los cambios en `CHANGELOG.md`.
2. `npm test`, `npm run e2e` y `git push`.
3. En el teléfono aparece el aviso **"Hay una versión nueva · Actualizar"**: la app revisa cada hora y cada vez que vuelves a abrirla.

**Los datos no se pierden al actualizar.** Viven en el teléfono (IndexedDB) asociados a la dirección del sitio, y cada cambio de estructura incluye una migración probada (`src/tests/migration.test.ts`). Solo se pierden si cambia la dirección del sitio, si se desinstala la app o si se borran los datos del navegador. Por eso existe el recordatorio de respaldo.

> Transición 1.0 → 1.1: la 1.0 se actualizaba sola y no sabe mostrar el aviso. `public/sw-transicion.js` hace que la primera versión con aviso se active sola; desde ahí cada versión espera a que toques "Actualizar".

## Publicarla por primera vez

La PWA necesita HTTPS para poder instalarse. La opción más rápida:

1. Ejecuta `npm run build`, o usa la carpeta `dist/` que ya viene generada.
2. Entra a https://app.netlify.com/drop y arrastra la carpeta `dist/`.
3. Abre el enlace en el teléfono:
   - **Android (Chrome):** menú ⋮ → "Instalar app".
   - **iPhone (Safari):** botón Compartir → "Agregar a inicio".

También sirven GitHub Pages o Cloudflare Pages. La app usa rutas con `#` y una base relativa, así que funciona en cualquier carpeta.

## Qué se agregó respecto al handoff (brechas)

| Brecha | Solución, con el mismo lenguaje visual |
|---|---|
| El historial de cobros no se guardaba | Cada "Mandar por WhatsApp" crea un registro `Cobro`. Aparece como un aviso centrado con borde punteado en el historial de la persona ("Le cobraste $7.200 por WhatsApp · 10 oct"), como "Cobrado hace N días" en la tarjeta de Inicio y como "Último cobro…" en el detalle y en la pantalla de cobro. Al tocar el aviso se ve el mensaje enviado. |
| El cargo compartido no quedaba vinculado | Nueva entidad `Cargo`. Cada movimiento lleva su `cargoId` y la burbuja dice "dividido entre N". Al tocarla se abre el **detalle del cargo**, con los participantes, el estado de cada uno, tu parte, y las opciones de editar y borrar. |
| No había dónde ingresar el teléfono | Pantalla **Editar persona** (nombre, teléfono, archivar) y un campo de teléfono en la pantalla de cobro, que se guarda al enviar. Sin número, WhatsApp abre el selector de contactos. |
| No se podían editar ni borrar movimientos | Los cargos se editan y borran desde su detalle. Al tocar un pago se abre una hoja inferior con "Editar pago" y "Borrar pago". Al borrar aparece un toast con **Deshacer**. |
| La fecha siempre era "hoy" | Una pastilla de fecha en Nuevo cargo y en Registrar pago, para anotar gastos de días anteriores. |
| Exportar a Excel | En Ajustes, "Descargar planilla (Excel)": un CSV con `;` y UTF-8 que Excel en español abre directo. |
| Archivar personas | Desde Editar persona. Las personas archivadas se ocultan de Inicio y del selector, y se ven en "Ver archivadas". Solo se puede **borrar** a alguien sin historial. |
| Estado de cada cargo | Los pagos se aplican a los cargos más antiguos primero. Cada burbuja muestra "pagado" o "quedan $X". |
| Confirmaciones | "Importar" y "Borrar todo" piden confirmación en una hoja inferior, como recomienda el handoff para producción. |

## Modelo de datos (base v4, app 2.0)

| Tabla | Qué guarda |
|---|---|
| `gastos` | Todo lo que se paga: total, fecha, `pagador` (`'yo'` o una persona), medio de pago, categoría, grupo, `miParte` y reparto (`solo`, `equal`, `exact`, `shares`). |
| `movimientos` | Lo que cambia el saldo con una persona: `cargo` (me debe), `pago` (me pagó), `deuda` (le debo: pagó por mí) y `abono` (le pagué). Saldo neto = cargos − pagos − deudas + abonos. |
| `recurrentes` | Plantillas de 3 tipos: `mio` (arriendo, luz), `compartido` (Netflix con amigos) y `cobro` (cuota que alguien me paga). El monto puede ser `fijo` (se anota solo) o `variable` (queda en `pendientes` para confirmar). Se generan al abrir la app. |
| `medios`, `categorias`, `grupos`, `fotos` | Tarjetas con nombre y color (el efectivo viene incluido), categorías con ícono y color (vienen 6), eventos y fotos de boletas (se achican antes de guardarse). |
| `personas`, `cobros`, `ajustes` | Igual que en la 1.0, más el recordatorio de respaldo. |
| `cuentas`, `movAhorro` | Mi plata (base v5): cuentas remuneradas, vista, depósitos a plazo e inversiones. `movAhorro` guarda cuadres (saldo real), depósitos y retiros. El saldo se estima con interés diario desde el último cuadre. |
| `detectados` | Movimientos leídos de los correos del banco, por confirmar (ver `integraciones/gmail/README.md`). |

La lógica pura vive en `src/lib/`: `resumen.ts` (gasto real del mes y desglose por tarjeta), `recurrence.ts` (fechas), `search.ts` (búsqueda) y `balance.ts` (saldos netos). Las pantallas del rediseño (Resumen, Gastos, Recurrentes) se conectan sobre esa base.

## Estructura

```
src/
  db.ts              Esquema Dexie, migraciones v1→v3 y operaciones (gastos, pagos, medios…)
  backup.ts          Respaldo v3 (con fotos), importación de respaldos v2, compartir/descargar
  recurrentes.ts     Motor de recurrentes (generar, confirmar, saltar)
  hooks.ts           Consultas en vivo y tema claro/oscuro
  lib/               Lógica pura: format, split, balance, resumen, recurrence, search, messages, csv, contacts
  nav.ts             Pestañas y pila de pantallas ("‹ {pantalla anterior}")
  screens/           Resumen, Gastos, NuevoGasto, GastoDetalle, Personas, Person, Pay, Collect, Recurrentes,
                     NuevoRecurrente, Grupos, Categorias, Medios, Onboarding, Ajustes, EditPerson, Archivadas
  ui/                Kit (botones, chips, hojas), íconos, filas (gasto, tarjeta de medio, barra inferior),
                     hojas compartidas (por confirmar, nueva persona, categoría), toast y aviso de versión nueva
  tests/             Pruebas con Vitest
e2e/                 Pruebas de punta a punta con Playwright (y sus datos de ejemplo en fixtures/)
```

## Rutas

Pestañas: `/` (Resumen) · `/gastos` · `/plata` (Mi plata) · `/personas` · `/recurrentes`
Pantallas: `/gasto/nuevo[?p=id]` · `/gasto/:id[/editar]` · `/persona/:id[/editar|/pago|/cobro]` · `/recurrente/nuevo` · `/recurrente/:id` · `/grupos` · `/grupo/:id` · `/categorias` · `/medios` · `/medio/nuevo` · `/medio/:id` · `/ajustes` · `/bienvenida` · `/archivadas` · `/cuenta/nueva` · `/cuenta/:id[/editar]` · `/deposito/nuevo` · `/deposito/:id` · `/correo` · `/correo/conectar`

## Datos y respaldo

- Todo queda en IndexedDB del navegador del teléfono. Al iniciar, la app pide almacenamiento persistente.
- **Exportar** abre el menú de compartir del teléfono (Drive, WhatsApp, correo) con un JSON (`version: 3`, incluye fotos). En computador lo descarga. **Importar** acepta respaldos v2 y v3 y reemplaza los datos actuales.
- Si pasan 7 días sin respaldar, Inicio muestra un recordatorio (se puede apagar en Ajustes).
- Ojo en iPhone: Safari puede borrar los datos de sitios que no se usan en semanas. Instalar la app en la pantalla de inicio y exportar respaldos de vez en cuando evita sorpresas.
