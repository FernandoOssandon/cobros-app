# Handoff: Me Debes v2, dirección "Lúdica"

## Resumen
Me Debes pasa de ser una app para saber "quién me debe" a una app para saber "a dónde se va mi plata". La pieza central ahora es el **gasto**: todo lo que pago queda anotado con su monto, fecha, descripción, categoría, medio de pago y las personas que participaron. Las deudas se derivan de los gastos y van en ambos sentidos. Es una PWA móvil (390×844), en CLP sin decimales y en español de Chile. Funciona sin conexión y guarda los datos en el dispositivo.

## Archivos
- `Me Debes v2.dc.html`: el prototipo navegable. La lógica completa (saldos netos, asignación de pagos, reparto, recurrentes y mensajes) está en el `<script data-dc-script>` al final del archivo. La prop `screen` define la pantalla de inicio y la prop `dark` activa el modo oscuro.
- `Me Debes v2 Pantallas.dc.html`: un tablero con las 31 pantallas y estados lado a lado. La prop `dark` cambia todo el tablero entre claro y oscuro.
- `Me Debes C.dc.html`: la versión 1, que queda como referencia de la dirección visual.
- `support.js`: el runtime para abrir los prototipos en el navegador. No forma parte del producto.

Los archivos HTML son **referencias de diseño**, no código de producción. Hay que recrearlos en el stack del proyecto. Si todavía no existe, se recomienda React + Vite + vite-plugin-pwa con IndexedDB. **Fidelidad alta:** los colores, la tipografía, los espaciados, los textos y las interacciones son finales.

Valores posibles de `screen`: `onboarding`, `resumen`, `resumen-vacio`, `atrasado`, `actualizacion`, `por-confirmar`, `gastos`, `gastos-vacio`, `deshacer`, `nuevo-solo`, `nuevo-compartido`, `nuevo-otro`, `gasto`, `gasto-sin-categoria`, `borrar`, `personas`, `personas-vacio`, `nueva-persona`, `persona`, `persona-debo`, `pago`, `whatsapp`, `recurrentes`, `recurrentes-vacio`, `nuevo-recurrente`, `grupos`, `grupo`, `categorias`, `medios`, `medio-form` y `ajustes`.

---

## Dirección visual (se mantiene de la v1)
- **Los números mandan.** Los montos héroe van en 64–72px, peso 800 y tracking −3px.
- **Lima sobre crema.** El lima `#C4F25E` se usa **solo en acciones principales**: CTA, "Actualizar" y switches encendidos. Ya no aparece en avatares ni en chips de saldo.
- **Contornos de 2px** en tinta, con forma de píldora, en botones secundarios, chips, campos y separadores de sección. No hay sombras.
- **El historial se lee como un chat.**
- **Textos con humor chileno.** Los títulos de marca van en minúscula y con punto: `me debes.`, `gastos.`, `personas.`, `recurrentes.`, `ajustes.`. Los títulos de sección dentro de una pantalla siguen la misma regla, por ejemplo `tus medios.` o `próximos pagos.`.

## Tipografía
Usa una sola familia, **Bricolage Grotesque** (`opsz 12..96`, pesos 400–800). Todos los números llevan `tabular-nums`.

| Rol | Tamaño / peso | Tracking |
|---|---|---|
| Monto héroe | 64–72 / 800, lh 0.95–1.05 | −3px |
| Display de estado vacío | 56–60 / 800, lh 0.95 | −2.4 / −2.5px |
| Título de pestaña (`gastos.`) | 30 / 800 | −1px |
| Título de pantalla secundaria (`grupos.`) | 40 / 800 | −1.5px |
| Título de sección (`tus medios.`) | 22 / 800 | −0.6px |
| Pregunta / hoja | 28–32 / 800, lh 1.05 | −1px |
| Monto en tarjeta | 22 / 800 | −0.6px |
| Fila | 16–19 / 700 | 0 / −0.3px |
| Etiqueta de campo | 13 / 700, `muted` | 0 |
| Badge | 11 / 700 | 0 |
| Meta | 12–13 / 600 | 0 |

## Colores
| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `bg` | `#F3F0E6` | `#0B110D` | Fondo de la app y de las hojas |
| `surface` | `#FFFFFF` | `#161F19` | Tarjetas, listas y hoja de compartir |
| `ink` | `#0E1A12` | `#F1F5EE` | Texto, bordes de 2px, chip activo y lo "tuyo" en la barra apilada |
| `muted` | `#585F57` | `#9AA59B` | Texto secundario |
| `line` | `rgba(14,26,18,.10)` | `rgba(241,245,238,.10)` | Separadores entre filas |
| `track` | `#DCD7C8` | `#2A352D` | Fondo de barras, switch apagado y borde de opciones inactivas |
| `soft` | `#E8E4D6` | `#1E2921` | Banner de respaldo, avisos del chat, avatar "Yo" y ayuda |
| `accent` | `#C4F25E` | `#C4F25E` | Solo acciones principales (texto `#0E1A12` encima) |
| `pos` | `#13874F` | `#7EE2A8` | **Te deben**, pagos recibidos, recuperado y anillo de selección |
| `owe` (nuevo) | `#A34A06` | `#FFB36B` | **Debes**, "pagó por ti", pendiente y quién pagó |
| `danger` | `#B23A26` | `#FF8E7A` | Borrar, errores y "sin categoría" |
| `scrim` | `rgba(14,26,18,.45)` | `rgba(0,0,0,.6)` | Fondo detrás de las hojas |

- **Avatares:** `#7FD9A8`, `#FFD36E`, `#9EC9FF`, `#FF9E8A`, `#D9B8FF`, `#BDE7E0`, siempre con texto `#0E1A12`.
- **Categorías:** cada una tiene un color pastel de la misma paleta. El ícono va con trazo `#0E1A12` en ambos modos.
- **Regla de sentido:** "te deben" siempre va en `pos` y "debes" siempre va en `owe`. Cada uno usa además un texto distinto ("te debe" / "le debes"), así que no depende solo del color.

---

## Navegación
```
Barra inferior: Resumen | Gastos | Personas | Recurrentes      (+ "Nuevo gasto" flotante en las 4)

Resumen ─┬─ Ajustes ─┬─ Medios de pago ── Nuevo/editar medio
         │           └─ Categorías
         ├─ chips Te deben / Debes → Personas (pestaña correspondiente)
         ├─ tarjeta de medio → Medios de pago
         ├─ Por confirmar → hoja Por confirmar
         └─ atajos: Por categoría · Grupos y eventos · Medios de pago
Gastos ──┬─ fila → Detalle de gasto ─┬─ Editar → Nuevo gasto (precargado)
         │                           ├─ Grupo → Detalle de grupo
         │                           └─ Borrar → hoja de confirmación → toast "Deshacer"
         ├─ filtros → hoja de opciones
         └─ Grupos → Detalle de grupo → fila → Detalle de gasto
Personas ┬─ + Persona → hoja Nueva persona (Elegir de contactos)
         └─ tarjeta → Detalle de persona ─┬─ [+] → Nuevo gasto (persona preseleccionada)
                                          ├─ Pagó / Le pagué → Registrar pago
                                          └─ Cobrar por WhatsApp → Cobro
Recurrentes ┬─ + Nuevo → Nuevo recurrente
            └─ fila variable pendiente → hoja Por confirmar
Primer uso: Agrega tus tarjetas → Nuevo medio → Resumen
```
- La navegación usa una **pila**. Cambiar de pestaña la vacía. El botón "‹ {pantalla anterior}" vuelve un nivel.
- Las pantallas de tarea (Nuevo gasto, Nuevo recurrente, Nuevo medio, Registrar pago) se cierran con **×**. Las de lectura se cierran con "‹ Volver".
- Las hojas inferiores tienen radio superior de 32px, borde superior de 2px en `ink`, un tirador de 40×5 y `scrim`. Se cierran al tocar fuera.

---

## Componentes nuevos

### Barra inferior
- Grilla de 4 columnas, `padding 8 8 26`, `border-top 2px ink` y fondo `bg`.
- Cada pestaña tiene un indicador de 56×32 con radio 16 y el ícono de 22px (trazo 2.2), seguido de la etiqueta en 12px.
- **Activa:** indicador relleno en `ink`, ícono en `bg` y etiqueta en 800. **Inactiva:** indicador transparente y etiqueta en 600.
- Íconos: Resumen (mosaico), Gastos (boleta), Personas (dos personas) y Recurrentes (flechas en ciclo). Equivalentes en Lucide: `layout-dashboard`, `receipt`, `users` y `repeat`.

### Botón "Nuevo gasto"
- Posición absoluta: `right 16`, `bottom 100` (sobre la barra).
- Alto 56, radio 28 y padding `0 22 0 18`. Fondo `accent`, texto `accentInk` en 17/800, ícono + de 20px.
- Lleva un **borde de 2px en `ink`** para separarse del contenido sin usar sombra.
- Las listas de las pestañas dejan 96px de padding inferior para que el botón no tape la última fila.

### Fila de gasto
- Grilla `40px 1fr auto`, gap 12 y padding `12 14`. Entre filas hay `border-top 1px line`. Las filas se agrupan en una tarjeta `surface` de radio 24, por día.
- **Ícono de categoría:** círculo de 40px con el color de la categoría y el ícono de 20px. Si el gasto no tiene categoría, el círculo es transparente con borde punteado de 2px en `muted` y un "?".
- **Línea 1:** descripción en 16/700, con ellipsis.
- **Línea 2:** el medio de pago (o la categoría, si pagó otra persona) en 13/600 `muted`, más un badge opcional de 20px de alto con borde de 1.5px:
  - `compartido · N` en `muted`
  - `pagó {nombre}` en `owe`
  - `sin categoría` en `danger`
- **Columna derecha:** tu parte en 16/800 y debajo "de $36.000" (12/600 `muted`) cuando el gasto es compartido o lo pagó otra persona.
- **Encabezado de día:** "Hoy", "Ayer" o "Lunes 23" a la izquierda y la suma de tus partes del día a la derecha, en 14/700 `muted`.

### Barra apilada (tarjeta de medio de pago)
- Flex con `gap 3px` y alto 14. Cada segmento tiene radio 7 y `flex-grow` igual a su monto en CLP.
- Orden de los segmentos: **tuyo** (`ink`), **de otros ya recuperado** (`pos`) y **de otros pendiente** (`owe`). Los segmentos en 0 se ocultan con `display:none` para que no quede un gap suelto.
- La leyenda va en una grilla de 3 columnas. Cada columna tiene un punto de 8px, la etiqueta (12/600 `muted`) y el monto (15/800).
- Debajo va la línea "$X fueron de otros: $Y recuperados, $Z pendientes".
- Si todo el monto es tuyo, se omite la leyenda y aparece "Todo tuyo, nadie te debe nada de acá."

### Tarjeta de medio de pago
- Fondo `surface`, radio 24, padding 16 y gap 12.
- Fila superior en grilla `38px 1fr auto`:
  - Miniatura de tarjeta de 38×26 con radio 6, el color del medio y borde de 2px `#0E1A12`.
  - Nombre en 18/700 y meta en 12/600: tipo y, si es crédito con día de facturación, "período 26 oct – 25 nov".
  - Total pagado en 22/800.
- Debajo van la barra apilada y su leyenda.

### Chips de categoría
- Píldora de 40px de alto, borde 2px `ink` y padding `0 14 0 5`.
- Dentro lleva un círculo de 28px con el color de la categoría, el ícono de 16px y el nombre en 14/700.
- Seleccionado: fondo `ink` y texto `bg`. El círculo de color se mantiene igual.
- La fila hace scroll horizontal y sangra hasta el borde de la pantalla (`margin 0 −16px; padding 0 16px`).
- Los chips de medio de pago siguen el mismo patrón, con una miniatura de tarjeta de 20×14 en lugar del círculo.

### Hoja "Por confirmar"
- Título en 30/800 con dos líneas: "Luz de noviembre:" y "¿cuánto llegó?".
- Monto en 64/800 (en `muted` mientras está en 0).
- Fila con la referencia "En octubre llegaron $28.450" y el chip "Usar ese monto", que copia el valor anterior.
- Teclado de 3×4 con teclas de 46px.
- Botones en grilla `1fr 1.3fr`: **Saltar este mes** (contorno) y **Confirmar** (lima, al 40% de opacidad si el monto es 0).
- **Confirmar** crea un gasto "Luz de noviembre" en la fecha del recurrente, marca el recurrente como confirmado y guarda el monto como nueva referencia. **Saltar** solo lo marca como confirmado.

### Banner de respaldo
- Fondo `soft`, radio 22 y padding `12 12 12 16`.
- A la izquierda, el texto "Hace N días que no respaldas" en 15/700. A la derecha, el botón "Respaldar ahora" (38px, fondo `ink`, texto `bg`, 13/800), que abre el menú de compartir.
- Se muestra en el Resumen cuando el recordatorio está encendido, hay datos y pasaron **más de 7 días** desde el último respaldo.

### Otros componentes
- **Banner de recurrente atrasado:** borde 2px `ink`, radio 22. Título "Tienes 2 meses de Netflix por anotar", una explicación y los botones "Anotar los 2" (fondo `ink`) y "Revisar".
- **Aviso de actualización:**
  - En Ajustes es un banner con fondo `ink`: "Hay una versión nueva" y el botón lima "Actualizar".
  - En el resto de la app es un toast superior (`top 58`) con "Actualizar" y ×.
- **Toast:** fondo `ink`, radio 22. Se ubica a 166px del fondo en las pestañas y a 104px en las demás pantallas. Opcionalmente lleva el botón "Deshacer" con borde y texto en `accent`. Dura 2,4 s, o 4 s si tiene "Deshacer".
- **Selector de persona:** avatar de 48px con anillo de 3px (`pos` para participantes, `owe` para quien pagó). Sin seleccionar queda al 45% de opacidad.

---

## Pantallas

1. **Resumen**
   - Contenido de arriba hacia abajo:
     - `me debes.` y el botón Ajustes.
     - Selector de mes ‹ noviembre 2026 ›. La flecha › queda al 30% de opacidad en el mes actual.
     - Banners de atrasado y de respaldo, si corresponden.
     - Héroe con "Gasto real del mes", "Salió de tus medios $X" y "adelantaste $Y por otros".
     - Chips Te deben / Debes con contorno de su color.
     - `tus medios.`, `por confirmar.` y `próximos pagos.` (los recurrentes de los próximos 30 días).
     - Atajos.
   - Si el mes no tiene gastos aparece "Mes en blanco." Si es un mes pasado sin datos aparece "Nada en {mes}."
2. **Gastos**
   - Buscador tipo píldora de 48px que busca en la descripción y en los nombres de las personas.
   - Filtros Categoría / Medio / Persona / Grupo. Cada uno abre una hoja con una opción "Todos". Un filtro activo se rellena en `ink` y muestra el valor elegido.
   - Vacío: "Ni un peso." Sin resultados: "Nada por aquí…"
3. **Nuevo gasto**
   - Botón × y título. Monto de 64px; tocarlo abre el teclado propio, y "Listo" lo oculta. Descripción en 22/700 sin borde.
   - Un separador de 2px y después el formulario con scroll:
     - Fecha: Hoy / Ayer / Otro día.
     - Categoría y medio de pago, con chips.
     - ¿Quién pagó?: Yo / Otra persona. Si es otra persona, aparece el selector de quién pagó y se oculta el medio de pago.
     - ¿Cómo se reparte?: Solo yo / Iguales / Exactos / Partes. Con un modo distinto de "Solo yo" aparecen el selector de participantes, el desglose, "Tu parte" y los mensajes de validación.
     - Chips "Grupo o evento" (abre una hoja) y "Foto de la boleta".
     - Interruptor **Repetir**, que crea un recurrente con el mismo monto el mismo día de cada mes.
   - Pie: un resumen en vivo y el CTA "Guardar gasto".
     - Solo mío: "100% gasto tuyo".
     - Compartido: "Tu parte $12.000 · por cobrar $24.000".
     - Pagó otra persona: "Le debes $8.000 a Diego", en `owe`.
   - Casos de referencia: `nuevo-solo` (formulario corto, con teclado), `nuevo-compartido` y `nuevo-otro`.
4. **Detalle de gasto**
   - Botón "‹ Volver" y "Editar". Arriba, la categoría, la descripción en 32/800 y el total en 64/800, con la meta "25 nov · Visa BCI".
   - Foto de la boleta (placeholder rayado de 150px con borde de 2px).
   - "Tu parte" y el desglose por persona. Cada persona tiene un estado: `pagado` (pos), `quedan $X` (owe), `le debes $X`, `pagó el total` o `entre ellos`.
   - Filas de grupo y de recurrencia. Abajo, el botón "Borrar gasto" con contorno `danger`.
   - **Sin categoría:** aparece una caja con borde punteado `danger` que dice "Este gasto anda sin categoría." y los chips para asignarle una con un toque.
5. **Personas**
   - Pestañas Te deben / Debes / Al día, cada una con su contador.
   - Héroe con el total de la pestaña, en `pos` o en `owe`.
   - Tarjetas con avatar, nombre, una línea de sentido ("te debe" / "le debes" / "a mano · último mov. 21 nov") y el monto en el color del sentido.
   - "+ Persona" abre una hoja con **Elegir de contactos** (en Android usa la Contact Picker API, `navigator.contacts.select(['name','tel'])`; si no está disponible, se oculta), el nombre y el teléfono.
   - Vacío: "Sin cuentas."
6. **Detalle de persona**
   - El saldo neto va en una píldora con contorno: "te debe $20.475" en `pos`, "le debes $8.000" en `owe`, o "a mano, sin deudas".
   - Burbujas del chat:
     - **Cargo** (derecha, fondo `ink`): "+$12.000", "de $36.000 · 25 nov".
     - **Le pagaste** (derecha, contorno `ink`).
     - **Te pagó** (izquierda, `surface` con borde `pos`): "−$50.000".
     - **Pagó por ti** (izquierda, `surface` con borde `owe`): "Pagó por ti · Uber a la casa", "$8.000".
     - **Aviso de cobro** (centrado, píldora `soft`): "Le cobraste por WhatsApp · 23 nov".
   - Acciones: [+] · **Pagó** (o **Le pagué** si el saldo es negativo) · **Cobrar por WhatsApp**. Este último queda al 40% si la persona no te debe.
7. **Registrar pago**: muestra "¿Cuánto te pagó X?" o "¿Cuánto le pagaste a X?", según el sentido. El resto es igual que en la v1.
8. **Cobro por WhatsApp**: igual que en la v1. Al enviar, agrega una burbuja de aviso en el chat.
9. **Recurrentes**
   - Héroe "Comprometido al mes" con la suma de los fijos que salen de tus medios. Debajo: "más Luz, que es variable · te entran $20.000 en cobros".
   - Tres secciones: `gastos fijos tuyos.`, `compartidos.` (con "Con Camila, Javiera y Fernanda · tu parte $3.475") y `cobros a personas.` (con avatar y monto en `pos`).
   - Cada fila muestra el monto o el badge `variable`, y debajo "próx. 5 dic", "por confirmar" (owe) o "2 por anotar" (danger).
   - Vacío: "Nada fijo."
10. **Nuevo recurrente**
    - Campo de nombre en 30/800 con un subrayado de 2px.
    - Tipo: 3 tarjetas de opción.
    - Monto fijo (input de 60px) o variable.
    - Frecuencia:
      - Mensual: el día, con − n +.
      - Semanal: chips L a D.
      - Anual.
      - Personalizada: "Cada N días / semanas / meses".
    - Debajo de la frecuencia aparece el resumen en palabras, la fecha de inicio y el switch "Tiene fecha de término".
    - Medio de pago y categoría (salvo en los cobros).
    - Si es compartido: participantes y reparto (Iguales / Exactos / Partes), con la línea "Tu parte $X · se cobra $Y al mes". Si es un cobro: la persona.
    - Caja de ayuda `soft`: "Los fijos se anotan solos; los variables te los pregunto."
11. **Grupos**
    - Lista de tarjetas con el nombre, el total en 36/800, la meta y los avatares superpuestos.
    - **Detalle de grupo:**
      - Total y "tu parte".
      - `cuánto puso cada uno.`: puso / le tocaba y el neto dentro del grupo (le deben / debe / al día).
      - `falta por pagarte.`: lo pendiente contigo, con contorno `owe`. Si no falta nadie: "Todos te pagaron su parte."
      - `gastos del grupo.`
12. **Categorías**
    - Muestra el mes y tu gasto real. Cada fila tiene una barra horizontal de 10px (`ink` sobre `track`, relativa a la categoría mayor), el monto y el %. Tocar una fila abre Gastos filtrado por esa categoría.
    - `tus categorías.`: los chips abren la hoja para editar el nombre, uno de 8 íconos y uno de 6 colores. "+ Nueva" abre la misma hoja vacía.
13. **Medios de pago**
    - Lista con miniatura de tarjeta de 48×32, nombre, tipo, "factura el N" y el total del mes.
    - **Formulario:**
      - Vista previa de la tarjeta (130px, con su color y borde de 2px).
      - Nombre, tipo (Crédito / Débito / Efectivo / Transferencia) y 6 colores.
      - Solo para crédito: el switch "Día de facturación" y el selector − n +.
    - **Primer uso:** "Agrega tus tarjetas." Efectivo viene incluido, cada tarjeta se puede quitar con × y hay un botón "Agregar tarjeta" con borde punteado. Abajo: "Listo, a anotar" y "Lo hago después".
14. **Ajustes**
    - Aviso de actualización, modo oscuro, firma, datos de transferencia, Medios de pago ›, Categorías ›.
    - Respaldo: último respaldo, **Exportar** (abre el menú de compartir del sistema), Importar y el switch "Recordarme respaldar cada 7 días".
    - Borrar todo, que pide confirmación, y la versión: "Me Debes 2.0.3 · funciona sin conexión".

## Estados
| Estado | Dónde | Texto |
|---|---|---|
| Vacío | Resumen | "Mes en blanco." |
| Vacío | Gastos | "Ni un peso." |
| Vacío | Personas | "Sin cuentas." |
| Vacío | Recurrentes | "Nada fijo." |
| Primer uso | Onboarding | "Agrega tus tarjetas." |
| Gasto sin categoría | Fila y detalle | Badge `sin categoría` y caja para asignarla |
| Recurrente atrasado | Resumen y Recurrentes | "Tienes 2 meses de Netflix por anotar" |
| Confirmar borrado | Hoja | "¿Borramos este gasto?" + "Se ajustan los saldos con Camila y Javiera." |
| Deshacer | Toast | "Gasto borrado" + **Deshacer**, que restaura el gasto en su posición |
| Actualización | Toast superior y Ajustes | "Hay una versión nueva · Actualizar" |

---

## Reglas de negocio
- **Moneda:** `$` + `toLocaleString('es-CL')`. Los negativos usan `−`. Las entradas tienen máximo 9 dígitos.
- **Gasto real del mes** = Σ de mis partes (`sh.me`) de los gastos del mes, incluidos los que pagó otra persona.
- **Salió de tus medios** = Σ de los totales de los gastos que pagué yo.
- **Adelantaste por otros** = Salió de tus medios − Σ de mis partes en esos mismos gastos.
- **Saldo neto con una persona** = (Σ de su parte en los gastos que pagué yo) − (Σ de mi parte en los gastos que pagó ella) − (pagos que me hizo) + (pagos que le hice).
  - Si es > 0, "te debe". Si es < 0, "le debes". Si es 0, "al día".
  - Los cobros recurrentes (por ejemplo, la cuota de Diego) cuentan como un cargo a esa persona, pero no son gasto mío.
- **Asignación FIFO**, para saber qué está recuperado y qué sigue pendiente:
  - Lo cubierto con una persona = lo que se le cargó − max(saldo, 0).
  - Ese monto se aplica a sus partes desde la más antigua hasta la más nueva. Lo que no alcanza a cubrirse queda como "quedan $X".
  - Lo mismo se hace en sentido inverso para lo que yo debo.
  - Con esto se calculan el estado por persona en el detalle de gasto, el recuperado y el pendiente de cada medio de pago, y la sección "falta por pagarte" del grupo.
- **Reparto** (igual que en la v1):
  - *Iguales:* `floor(monto/n)`, y el resto va a mi parte.
  - *Exactos:* cada monto se escribe a mano, y lo no asignado queda como mi parte.
  - *Partes:* `round(monto × partes_i / Σ)`.
  - Con "Solo yo", mi parte es el monto completo.
- **Pagó otra persona:**
  - Yo participo siempre.
  - Solo se registran mi parte (que es lo que le debo) y la parte de quien pagó. Las partes de terceros se ignoran y se muestra "Lo demás es entre ellos".
  - El gasto no tiene medio de pago mío.
- **Guardar gasto:** vuelve a la pantalla anterior con uno de estos toasts: "Gasto guardado · $X por cobrar", "Gasto guardado · le debes $X a Diego", "Gasto guardado · se repetirá cada mes" o "Gasto guardado".
- **Recurrentes:**
  - Los **fijos** se anotan solos en su fecha.
  - Los **variables** quedan "por confirmar" y aparecen en el Resumen hasta que se confirman o se saltan.
  - Si al abrir la app hay ocurrencias vencidas de meses anteriores, se agrupan en el banner de atrasado. "Anotar los N" crea todos esos gastos.
  - Los compartidos generan un gasto con un reparto igual entre los participantes y yo.
  - "Próximos pagos" muestra los que vencen en los próximos 30 días, ordenados por fecha.
- **Período de facturación:** desde el día de facturación + 1 del mes anterior hasta el día de facturación del mes actual.
- **Respaldo:**
  - Exportar genera `me-debes-respaldo-DD-MM-AAAA.json` y lo comparte con `navigator.share({ files })`. Si el navegador no lo permite, lo descarga.
  - Después de exportar, la fecha del último respaldo se actualiza.
  - El banner aparece cuando pasan **> 7 días** y el recordatorio está encendido.
- **Actualización (PWA):** cuando el service worker detecta una versión nueva (`onNeedRefresh` en vite-plugin-pwa), se muestra el toast. "Actualizar" llama a `updateSW(true)`.

## Modelo de datos
```ts
type Gasto = {
  id: string; descripcion: string; monto: number; fecha: string /* ISO */;
  categoriaId: string | null; medioId: string | null /* null si pagó otra persona */;
  pagador: 'yo' | PersonaId;
  partes: Record<'yo' | PersonaId, number>;   // Σ = monto (salvo terceros si pagó otro)
  tipo: 'gasto' | 'cobro';                     // cobro = cuota que alguien me paga
  grupoId?: string; boleta?: Blob; recurrenteId?: string;
};
type Pago        = { id: string; personaId: string; sentido: 'recibido' | 'enviado'; monto: number; fecha: string; via: 'Transferencia' | 'Efectivo' };
type AvisoCobro  = { personaId: string; fecha: string };
type Persona     = { id: string; nombre: string; telefono: string };
type Medio       = { id: string; nombre: string; tipo: 'Crédito' | 'Débito' | 'Efectivo' | 'Transferencia'; color: string; diaFacturacion?: number };
type Categoria   = { id: string; nombre: string; icono: string; color: string };
type Grupo       = { id: string; nombre: string; fechas?: string };
type Recurrente  = {
  id: string; nombre: string; tipo: 'fijo' | 'compartido' | 'cobro';
  monto: number | null /* null = variable */; ultimoMonto?: number;
  frecuencia: { cada: number; unidad: 'dia' | 'semana' | 'mes' | 'año'; diaMes?: number; diaSemana?: number };
  inicio: string; fin?: string; medioId?: string; categoriaId?: string;
  participantes?: PersonaId[]; reparto?: 'iguales' | 'exactos' | 'partes'; personaId?: string;
  pendientes: string[] /* fechas por confirmar o anotar */;
};
type Ajustes = { miNombre: string; datosBancarios: string; tema: 'claro' | 'oscuro' | 'sistema'; ultimoRespaldo?: string; recordarRespaldo: boolean };
type Respaldo = { version: 2; exportado: string; gastos: Gasto[]; pagos: Pago[]; avisos: AvisoCobro[]; personas: Persona[]; medios: Medio[]; categorias: Categoria[]; grupos: Grupo[]; recurrentes: Recurrente[]; ajustes: Ajustes };
```
**Migración desde la v1:**
- Cada `cargo` de la v1 pasa a ser un `Gasto` con `pagador: 'yo'`, `partes: { [persona]: monto }` y sin parte mía, porque en la v1 mi parte no se guardaba.
- Cada `pago` pasa a ser un `Pago` con `sentido: 'recibido'`.

## Datos de ejemplo (en el prototipo, "hoy" es el 25 nov 2026)
- **Medios:** Visa BCI (crédito, factura el 25), Débito Banco Estado y Efectivo.
- **Recurrentes:**
  - Arriendo, $350.000 el día 5.
  - Luz, variable el día 10 (octubre: $28.450).
  - Gimnasio, $24.990 el día 8.
  - Netflix, $13.900 compartido con Camila, Javiera y Fernanda.
  - Cuota de Diego, $20.000 el día 1.
- **Grupo "Viaje a Pucón" ($480.000):** cabaña y bencina (pagué yo), asado (pagó Camila) y kayak (pagó Matías).
- **Saldos resultantes:**
  - Camila te debe $20.475.
  - Javiera te debe $15.475.
  - Le debes $8.000 a Diego.
  - Matías y Fernanda están al día.
