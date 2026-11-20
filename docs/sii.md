# SII para emprendedores: cómo leer y escribir

Objetivo del apartado: que un emprendedor que usa **a mano** entienda sus ingresos y lo que emite en el SII y, más adelante, que la app emita boletas y le haga más fácil el trabajo de cada mes.

Este documento ordena las alternativas para **leer** información del SII y para **escribir** en él (emitir documentos y declarar), con lo que exige cada una. Es la base para decidir; no es asesoría tributaria ni legal.

## El trabajo de cada mes, según el caso

| Caso | Qué emite | Qué declara | Qué ayuda puede dar la app |
|---|---|---|---|
| **Persona con boletas de honorarios** (segunda categoría) | Boletas de honorarios electrónicas (BHE). Retención 15,25 % en 2026 (sube a 17 % en 2028). | Nada mensual en el caso típico; en abril, el F22 (la retención se devuelve o se usa para las cotizaciones). Si le emite a una persona natural, nadie le retiene: puede pagar PPM voluntario. | Calcular bruto ↔ líquido, llevar lo emitido y lo cobrado, estimar la devolución de abril. |
| **Negocio con IVA** (persona o empresa con inicio de actividades en primera categoría, ej. Pro Pyme) | Facturas y boletas electrónicas (DTE), notas de crédito y débito. | F29 mensual: IVA (débito − crédito), PPM y retenciones de honorarios que pagó. El SII arma la propuesta a partir del Registro de Compras y Ventas (RCV). En abril, el F22. | Ver ventas, compras e IVA del mes; avisar lo que falta (facturas por aceptar, notas pendientes); tener los números del F29 listos y recordar la fecha. |

## Leer del SII

| | Cómo funciona | Qué se obtiene | Requiere | Riesgos y costos |
|---|---|---|---|---|
| **L1. Archivos del SII** *(ya está la base)* | La persona descarga de sii.cl el detalle del RCV (CSV) o el informe de boletas de honorarios y lo comparte con la app. | Ventas, compras, notas y BHE emitidas o recibidas. | Nada nuevo: todo en el teléfono. | Paso manual cada mes. Cero riesgo con la clave. |
| **L2. XML de los documentos por correo** | Las facturas recibidas llegan como XML adjunto al correo de intercambio; la app ya lee Gmail. | DTE emitidos y recibidos, con detalle y referencias, apenas llegan. | Leer adjuntos con la conexión de Gmail que ya existe (sin servidor). | No trae las BHE ni lo que no llega por correo. Depende de que el correo de intercambio sea el Gmail conectado. |
| **L3. Agregador** (ej. Fintoc Fiscal Links) | La persona conecta su cuenta del SII en el widget del agregador; la app consulta su API. | Documentos del RCV y BHE, F29 y F22. | Un servidor (claves de API secretas, webhooks) y cuentas de usuario. | Costo por conexión. La clave tributaria la recibe el agregador. |
| **L4. Leer sii.cl con la clave (scraping propio)** | Un servidor entra al portal con la clave de la persona. | Todo lo que se ve en el portal. | Servidor, guardar claves cifradas. | Frágil (se rompe si el SII cambia su sitio), responsabilidad alta por las claves. **No recomendado.** |

## Escribir en el SII

| | Cómo funciona | Sirve para | Requiere | Riesgos y costos |
|---|---|---|---|---|
| **E1. Asistido** | La app prepara todo (boleta con bruto y líquido, datos del cliente, números del F29, fecha límite) y abre la página exacta del SII. La persona entra con su clave y confirma. | BHE, F29 y cualquier trámite. | Nada nuevo. | Sigue habiendo un paso manual, pero guiado. Sin riesgo con la clave. |
| **E2. Proveedor de facturación con API** (ej. OpenFactura, Facto, LibreDTE, Bsale) | El emprendedor contrata un plan; la app llama a la API del proveedor, que firma con el certificado digital, usa los folios (CAF) y envía al SII. | Facturas, boletas y notas (DTE). | Un servidor delgado para guardar la clave de API (o llamadas directas si el proveedor lo permite) y elegir un proveedor. | Costo mensual o por documento para el emprendedor. Es la vía más robusta para emitir DTE. |
| **E3. API de terceros para BHE** (ej. API Gateway, del equipo de LibreDTE: listar, emitir, anular, PDF y correo de BHE) | El servicio opera el portal del SII con las credenciales de la persona. | Emitir y anular boletas de honorarios. | Servidor y entregar la clave tributaria al tercero. | Costo, dependencia de un tercero y la clave fuera del teléfono. |
| **E4. Sistema propio de facturación** | La app (con un servidor) firma y envía los DTE directo al SII: certificado digital de cada contribuyente, folios CAF, firma XML, token del SII y certificación del sistema. | DTE sin intermediarios. | Proyecto grande: servidor seguro para certificados, certificación ante el SII, mantención continua. | Solo tiene sentido si la app se convierte en un negocio de facturación. |
| **E5. Automatizar el portal con la clave** | Un robot llena los formularios del portal (BHE, F29). | BHE y F29. | Servidor y claves. | Frágil y riesgoso; el F29 además se paga en el banco. **No recomendado.** |

Notas:

- **Usuario autorizado:** el SII permite que un contribuyente autorice a otra persona a emitir sus boletas de honorarios. Sirve para un contador o un socio, pero sigue siendo desde el portal.
- El SII también tiene su **sistema de facturación gratuito** (portal y app). Quien ya lo usa puede seguir haciéndolo; la app lee el resultado por L1 o L2.
- **Todo lo que pase de L1, L2 y E1 necesita un servidor.** Eso cambia la promesa de hoy ("todo queda en tu teléfono"): habría cuentas de usuario, secretos que custodiar, una política de privacidad y cumplir la nueva ley de datos personales (la Ley 21.719 estaba fijada para el 1 de diciembre de 2026 y un proyecto en el Congreso la posterga a octubre de 2027: revisar su estado antes de la etapa 5).

## Plan por etapas

1. **Base** *(3.3, hecho)*: contribuyentes y documentos en la base, lectores de XML y de listados del SII, IVA, honorarios y resumen tipo F29.
2. **Mi negocio** (pantallas): crear el contribuyente, importar archivos, ver el mes (ventas, compras, IVA, honorarios) y ligar cada documento con su ingreso o gasto (una BHE emitida queda "por cobrar" hasta que llega la transferencia).
3. **Correo**: leer automáticamente los XML adjuntos de Gmail (L2).
4. **Asistido** (E1): borrador de boleta de honorarios con la calculadora bruto ↔ líquido y los clientes guardados, "Abrir en el SII", calendario del mes (F29) con los números listos.
5. **Emitir de verdad** (decisión de negocio): elegir un proveedor (E2 para DTE, E3 para BHE), probarlo en su ambiente de pruebas y agregar un servidor delgado (Netlify Functions). Antes de esto conviene definir precio, cuentas de usuario y privacidad.

E4 y E5 quedan fuera salvo que la app se vuelva un negocio de facturación.

## Lo que falta confirmar con archivos reales

Los lectores reconocen las columnas por nombre (alias en `src/lib/sii/tablas.ts`). Antes de la etapa 2 hay que probarlos con un detalle real del RCV (compras y ventas) y un informe real de boletas de honorarios (emitidas y recibidas), con los datos personales tapados, y ajustar los alias si hace falta. El XML de los DTE sigue el formato oficial del SII y no debería cambiar.

## Fuentes

- SII, [Emitir boletas de honorarios](https://www.sii.cl/boleta_honorarios/emitir.htm) (incluye la emisión por usuario autorizado).
- SII, [Retención de boletas de honorarios](https://www.sii.cl/destacados/boletas_honorarios/index.html) (15,25 % en 2026; 16 % en 2027; 17 % en 2028).
- SII, [Boleta electrónica desde un sistema propio](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_6564.htm) (certificación y formatos, Res. 74 de 2020).
- Fintoc, [Fiscal Links](https://docs.fintoc.com/guides/movements/fiscal-links) (documentos, F29 y F22; solo lectura).
- Garrigues, [Senado aprueba postergar la Ley 21.719 a octubre de 2027](https://www.garrigues.com/es_ES/noticia/senado-chileno-aprueba-proyecto-ley-busca-postergar-15-octubre-2027-entrada-vigencia-nueva).
- API Gateway, [cliente PHP: BHE emitidas](https://scrutinizer-ci.com/g/apigatewaycl/apigateway-api-client-php/code-structure/master/class/apigatewaycl%5Capi_client%5Csii%5CBheEmitidas) (listar, emitir, anular, PDF y correo).
