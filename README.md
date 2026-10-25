# Me Debes · MVP

PWA móvil para llevar la cuenta de quién te debe plata. Está construida a partir del handoff de diseño "Lúdica" (`design_handoff_me_debes`). Funciona sin conexión y guarda los datos solo en el teléfono, en IndexedDB.

**Stack:** React 19 + Vite + TypeScript, `vite-plugin-pwa` (Workbox) y Dexie (IndexedDB). La fuente Bricolage Grotesque viene incluida en la app, así que también funciona offline.

## Cómo correrla

```bash
npm install
npm run dev        # desarrollo en http://localhost:5173
npm test           # pruebas de la lógica (reparto, saldos, respaldo, CSV)
npm run build      # genera la versión de producción en dist/
npm run preview    # sirve dist/ para probar la PWA (service worker incluido)
```

## Publicarla para instalarla en el teléfono

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

## Estructura

```
src/
  db.ts              Esquema Dexie (Persona, Cargo, Movimiento, Cobro, Ajustes) y operaciones
  hooks.ts           Consultas en vivo y tema claro/oscuro
  lib/               Lógica pura: format, split (reparto), balance (saldos/FIFO), messages (WhatsApp), csv
  screens/           Home, Person, ChargeForm, ChargeDetail, Pay, Collect, Settings, EditPerson, Archived
  ui/                Kit (botones, avatar, switch, teclado, hojas) y toast
  tests/             Pruebas con Vitest
```

## Rutas

`/` · `/persona/:id` · `/persona/:id/editar` · `/persona/:id/pago[/:movId]` · `/persona/:id/cobro` · `/cargo/nuevo[?p=id]` · `/cargo/:id` · `/cargo/:id/editar` · `/ajustes` · `/archivadas`

## Datos y respaldo

- Todo queda en IndexedDB del navegador del teléfono. Al iniciar, la app pide almacenamiento persistente.
- **Exportar** descarga un JSON (`version: 2`) con todo. **Importar** lo restaura y reemplaza los datos actuales.
- Ojo en iPhone: Safari puede borrar los datos de sitios que no se usan en semanas. Instalar la app en la pantalla de inicio y exportar respaldos de vez en cuando evita sorpresas.
