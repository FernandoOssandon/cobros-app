# Cambios

## 2.2.0 · 27 oct 2026 · "Mi plata"

**Nuevo**
- **Pestaña Mi plata** (la barra inferior pasa a 5 pestañas):
  - Muestra tu patrimonio: lo que tienes (ahorros, cuentas vista, efectivo y lo que te deben) menos lo que debes (a personas y en tarjetas de crédito durante el período actual), con barras y desglose.
  - Tocar "Cuentas vista" o "Efectivo" abre la hoja para cuadrar el saldo. "Te deben" y "Debes" llevan a Personas, y "Tarjetas por pagar" a Medios de pago.
- **Cuentas de ahorro** (Mach, Tenpo, Mercado Pago o la que quieras):
  - Saldo estimado con la tasa, a interés diario, y "ganaste $X este mes".
  - Detalle con el gráfico de los últimos 6 meses, depositar y retirar (desde o hacia la cuenta vista, el efectivo u otra parte) y cuadrar con el saldo real. Los movimientos incluyen los intereses estimados de cada mes.
- **Depósitos a plazo:**
  - Monto, banco, tasa cada 30 días con su equivalente anual, plazo y fecha de inicio. Muestran los días que faltan y "al vencer recibes".
  - Si eliges "Renovar al vencer", se renuevan solos con capital + intereses. Si no, los pasas a tu cuenta con "Ya lo cobré".
- **Detectados en tu correo:**
  - Los cobros que te avisa el banco por correo quedan por confirmar.
  - Las acciones son Anotar, Editar (abre Nuevo gasto precargado) o Descartar (con Deshacer). Si ya anotaste el mismo gasto, se ofrece "Es el mismo".
  - Las transferencias recibidas se anotan como pago de la persona.
  - La categoría se sugiere a partir del comercio.
- **Conectar Gmail:** guía en la app para publicar el script de Google (se copia desde la misma pantalla) y probar la conexión. Además, la app revisa el correo cada vez que se abre.

**Por dentro**
- La base pasa a v5 (solo agrega tablas) y el respaldo a v4. La conexión con el correo no viaja en el respaldo.
- Hay 86 pruebas de lógica y 18 pruebas de punta a punta, 5 de ellas de Mi plata con un script de Gmail simulado.

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
