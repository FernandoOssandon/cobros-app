# Cambios

## 2.1.0 · 27 oct 2026

**Nuevo**
- **Cuotas de cobros recurrentes editables.** En el historial de una persona, al tocar una cuota (por ejemplo "Cuota mensual") se abre una hoja para cambiar el monto, la fecha o el detalle, ir al recurrente o borrarla con Deshacer. Las cuotas muestran "se repite".
- **Foto de la boleta desde el detalle.** Los gastos sin foto muestran "Agregar foto de la boleta". Los que ya tienen una pueden cambiarla o quitarla (con Deshacer).
- **Grupos editables.** Se crean desde la pantalla de grupos, se renombran, se marcan como terminados (dejan de aparecer al anotar gastos y se ven aparte en "terminados") y se borran. Al borrar un grupo, los gastos se quedan y solo salen del grupo.
- **Del gasto a su recurrente.** El detalle de un gasto recurrente tiene "Editar el recurrente", que lleva a la plantilla.

**Arreglado**
- A veces "Listo, a anotar" en la bienvenida devolvía a la misma pantalla.

**Por dentro**
- Pruebas de punta a punta con Playwright en `e2e/` (`npm run e2e`), con 12 flujos.
- Hay 3 pruebas nuevas de la base de datos, 47 en total.
- No cambia la estructura de datos, así que no hay migración.

## 2.0.0 · 25 oct 2026

Rediseño completo, "a dónde se va mi plata": gastos diarios, medios de pago, recurrentes (fijos, variables y cobros), deudas en ambos sentidos, grupos, categorías y onboarding.

## 1.1.0

Recordatorio de respaldo, versión visible en Ajustes, aviso de versión nueva y modelo de gastos.

## 1.0.0

MVP: quién me debe, cargos divididos, cobros por WhatsApp y respaldo.
