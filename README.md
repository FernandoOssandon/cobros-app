# a mano.

PWA para llevar tu plata a mano: tus gastos (solos, compartidos o en cuotas), lo que te deben y lo que debes, dónde está tu plata y cuánto puedes gastar hasta el sueldo. Funciona sin conexión y guarda todo en el teléfono (IndexedDB). Va en la **versión 3.3**, camino a una app nativa en Kotlin para Android (primera versión de prueba en `android/`, con el núcleo compartido en `nucleo/`) y la PWA para iPhone; el detalle de cada versión está en [CHANGELOG.md](CHANGELOG.md).

> Antes se llamaba **Me Debes**. Por dentro se mantienen algunos nombres antiguos a propósito: la base de datos (`me-debes`), el formato de respaldo (`app: 'me-debes'`) y la carpeta del proyecto. Cambiarlos haría perder los datos guardados o dejaría de leer los respaldos.

**Stack:** React 19 + Vite + TypeScript, `vite-plugin-pwa` (Workbox) y Dexie (IndexedDB). La fuente Bricolage Grotesque viene incluida, así que también funciona offline. Se publica en Netlify.

## Qué hace

| Área | Qué hay |
|---|---|
| **Gastos** | Solo tuyos, compartidos (partes iguales, montos exactos o por partes) o pagados por otra persona. Cuotas, montos en UF/dólar/euro, categorías, medios de pago, grupos y eventos, foto de la boleta, búsqueda y filtros. |
| **Personas** | Quién te debe y a quién le debes, pagos (ligados a la cuenta donde llegó o de donde salió la plata) y cobros por WhatsApp con el detalle. |
| **Recurrentes** | Fijos (se anotan solos), variables (quedan por confirmar) y atrasados; cobros recurrentes a otras personas; sugerencias de lo que se repite cada mes. |
| **Mi plata** | Cuentas (vista, remuneradas con interés estimado, efectivo, inversiones, en dólares o euros), depósitos a plazo, metas de ahorro, tarjetas de crédito con cupo, períodos de facturación y pagos. |
| **Cuadrar con el banco** | Cartolas en Excel (Santander cuenta corriente y CMR Falabella), cobros leídos de los correos del banco (Gmail) y comparación de saldos. |
| **Entender** | Resumen del mes o del período de cada tarjeta, ingresos y "te quedan", presupuestos por categorías, tendencias, **cuánto puedes gastar por día hasta el sueldo** y el cierre de cada ciclo. |
| **No perder nada** | Respaldo automático diario en Google Drive, exportar/importar un JSON y planillas Excel (CSV). |
| **SII (en preparación)** | Base para emprendedores: contribuyentes, documentos tributarios, lectores de XML y de listados del SII, y cálculos (IVA, honorarios, resumen tipo F29). Ver [docs/sii.md](docs/sii.md). |

## Cómo correrla

```bash
npm install
npm run dev        # desarrollo en http://localhost:5173
npm test           # pruebas de la lógica (Vitest)
npm run lint       # oxlint (sin advertencias)
npm run e2e        # compila y prueba la app completa en un Chrome de celular (Playwright)
npm run build      # versión de producción en dist/
npm run preview    # sirve dist/ para probar la PWA (con service worker)
cd nucleo && ./gradlew check   # núcleo en Kotlin (necesita Java 17+)
```

### Pruebas

- **Unitarias** (`src/tests/`): la lógica pura de `src/lib/` y las operaciones sobre la base (con `fake-indexeddb`), incluidas las migraciones y el respaldo.
- **De punta a punta** (`e2e/`): abren la app compilada con la fecha congelada en el 25 de noviembre de 2026, cargan datos inventados de `e2e/fixtures/` y recorren los flujos importantes. Google (inicio de sesión, Drive y Gmail) se simula en `e2e/google-falso.ts`. Si la app tira un error en la consola, la prueba falla.
- La primera vez: `npx playwright install chromium`. Para correr solo algunas: `npx playwright test grupos`. Si algo falla: `npx playwright show-report`.

## Publicar versiones nuevas

Netlify está conectado al repo y `netlify.toml` define cómo compilar: **cada `git push` a `main` publica una versión nueva** (si fallan las pruebas unitarias, no se publica).

1. Sube el número en `package.json` (se muestra en Ajustes) y anota los cambios en `CHANGELOG.md`.
2. `npm test`, `npm run e2e` y `git push`. GitHub Actions vuelve a correr todo (`.github/workflows/pruebas.yml`).
3. En el teléfono aparece **"Hay una versión nueva · Actualizar"**: la app revisa cada hora y cada vez que vuelves a abrirla.

**Los datos no se pierden al actualizar.** Viven en el teléfono asociados a la dirección del sitio, y cada cambio de estructura trae una migración probada. Solo se pierden si cambia la dirección del sitio, si se desinstala la app o si se borran los datos del navegador: para eso está el respaldo en Drive.

## Google (Drive y Gmail)

Una sola conexión con la cuenta de Google sirve para el respaldo en Drive (`drive.file`: la app solo ve la carpeta que ella crea) y para leer los correos del banco (`gmail.readonly`: solo busca remitentes de bancos). Todo pasa en el teléfono, sin servidor; por eso el permiso dura una hora y se renueva con un toque.

- En Google Cloud: un proyecto con la **Google Drive API** y la **Gmail API** activadas, la pantalla de consentimiento en modo de prueba con los usuarios de prueba (hasta 100) y un ID de cliente de tipo "Aplicación web" con el origen del sitio.
- En Netlify: la variable `VITE_GOOGLE_CLIENT_ID` con ese ID (no es secreto). Sin ella, la app pide el ID al conectar.
- Gmail es un permiso restringido: para abrirlo a cualquier persona, Google exige una verificación de seguridad. Como alternativa sigue existiendo el script de Apps Script (`integraciones/gmail/`).

## Modelo de datos (base v11, respaldo v9)

| Tabla | Qué guarda |
|---|---|
| `gastos`, `movimientos` | Lo que se paga (total, fecha, pagador, medio, categoría, grupo, reparto, cuotas, moneda) y lo que cambia el saldo con cada persona: `cargo`, `pago`, `deuda` y `abono`. |
| `personas`, `cobros`, `grupos` | Personas (con teléfono), cobros enviados por WhatsApp y grupos o eventos. |
| `medios`, `categorias`, `fotos` | Medios de pago (con su cuenta, cupo, día de facturación y cuadre), categorías con ícono y color, y fotos de boletas. |
| `recurrentes`, `pendientes` | Plantillas (`mio`, `compartido`, `cobro`, `ingreso`), fijas o variables, y las ocurrencias por confirmar o atrasadas. |
| `cuentas`, `movAhorro`, `metas` | Mi plata: cuentas, cuadres, depósitos, retiros y traspasos; metas de ahorro con sus aportes. |
| `ingresos`, `presupuestos`, `pagosTarjeta` | Sueldo e ingresos sueltos (se depositan en su cuenta), presupuestos por categorías y pagos de tarjetas. |
| `detectados`, `importados` | Cobros leídos de los correos del banco y movimientos de cartolas ya importados (para no repetirlos). |
| `contribuyentes`, `docsTributarios` | SII: tú o tu negocio, y los documentos tributarios emitidos y recibidos. |
| `ajustes` | Preferencias, conexión con Google (no viaja en el respaldo), indicadores del día y el último cierre de ciclo. |

La lógica pura vive en `src/lib/` y no toca la base: se prueba sola y las pantallas la usan a través de `src/hooks.ts`.

## Estructura

```
src/
  db.ts              Esquema Dexie, migraciones (v1 → v11) y operaciones básicas
  backup.ts          Respaldo v9 (con fotos); lee respaldos v2 a v8
  hooks.ts           Datos en vivo (useDatos, useAjustes) y derivados (usadoTarjetas, useProyeccion)
  recurrentes.ts · ingresos.ts · presupuestos.ts · metas.ts · ahorros.ts · tarjetas.ts · acciones.ts
  importar.ts        Aplicar una cartola importada · correo.ts: cobros del correo · indicadores.ts: UF, dólar y euro
  google.ts          Conexión con Google (Drive y Gmail) · drive.ts: respaldo automático
  sii.ts             SII: contribuyentes y documentos (leer archivos, guardar sin duplicar)
  lib/               Lógica pura: format, split, balance, resumen, periodos, presupuestos, ingresosMes, cuotas, monedas,
                     metas, tendencias, flujos, tarjetas, proyeccion, sugerencias, recurrence, search, messages, csv,
                     xlsx, bancos, importar, correo, gmail, drive, rut y sii/ (documentos, dte, tablas, impuestos)
  nav.ts · periodo.ts
  screens/           Una pantalla por archivo
  ui/                Kit de componentes, íconos, filas, hojas, toast, aviso de versión nueva y textos compartidos
  tests/             Pruebas unitarias (Vitest)
e2e/                 Pruebas de punta a punta (Playwright) y sus datos de ejemplo
integraciones/gmail/ Script de Apps Script (alternativa a la conexión con Google)
docs/                Notas de diseño (SII)
nucleo/              Núcleo en Kotlin Multiplatform: las reglas de la plata para Android (JVM) y la PWA (JS); ver nucleo/README.md
android/             App Android (Kotlin + Compose), por ahora solo lectura desde un respaldo; ver android/README.md
```

## Rutas

Pestañas: `/` (Resumen) · `/gastos` · `/plata` (Mi plata) · `/personas` · `/recurrentes`

Pantallas: `/gasto/nuevo` · `/gasto/:id[/editar]` · `/persona/:id[/editar|/pago|/cobro]` · `/recurrente/nuevo` · `/recurrente/:id` · `/grupos` · `/grupo/:id` · `/categorias` · `/medios` · `/medio/nuevo` · `/medio/:id` · `/ajustes` · `/cuenta/nueva` · `/cuenta/:id[/editar]` · `/deposito/nuevo` · `/deposito/:id` · `/correo` · `/correo/conectar` · `/presupuestos` · `/presupuesto/nuevo` · `/presupuesto/:id` · `/ingresos` · `/ingreso/nuevo` · `/ingreso/:id` · `/ingreso/fijo/:id` · `/meta/nueva` · `/meta/:id[/editar]` · `/tendencias` · `/proyeccion` · `/cierre` · `/importar` · `/bienvenida` · `/archivadas`

## Datos y respaldo

- Todo queda en IndexedDB del teléfono; al iniciar, la app pide almacenamiento persistente.
- **Respaldo en Drive:** al rato de cada cambio y al salir de la app, un archivo por día (se guardan 30) en la carpeta "a mano · respaldos".
- **Exportar** abre el menú de compartir con el JSON (incluye fotos); en computador lo descarga. **Importar** reemplaza todos los datos (conviene exportar antes).
- Ojo en iPhone: Safari puede borrar los datos de sitios que no se usan en semanas. Instalar la app en la pantalla de inicio y tener el respaldo en Drive evita sorpresas.
