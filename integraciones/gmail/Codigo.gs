/**
 * Me Debes · lector de correos del banco (Google Apps Script)
 *
 * Corre en TU cuenta de Google y solo entrega a la app los correos de los remitentes de BUSQUEDA.
 * La app interpreta cada correo en el teléfono; este script no guarda nada.
 *
 * Instalación (detalle en integraciones/gmail/README.md):
 *   1. script.google.com → Nuevo proyecto → pega este archivo.
 *   2. Cambia CLAVE por una frase larga que solo tú sepas (la misma irá en la app).
 *   3. Implementar → Nueva implementación → Aplicación web.
 *      Ejecutar como: "Yo". Quién tiene acceso: "Cualquier usuario".
 *   4. Copia la URL que termina en /exec y pégala en la app junto con la clave.
 */

// Una frase larga y difícil de adivinar. Sin esta clave, el script no entrega nada.
const CLAVE = 'CAMBIA-ESTA-CLAVE';

// Remitentes de bancos y billeteras. Agrega o quita los tuyos.
const BUSQUEDA =
  'from:(bancoestado.cl OR bci.cl OR santander.cl OR bancochile.cl OR bancoedwards.cl OR itau.cl OR ' +
  'scotiabank.cl OR bancofalabella.cl OR bancoripley.cl OR bice.cl OR security.cl OR coopeuch.cl OR ' +
  'somosmach.com OR mach.cl OR tenpo.cl OR mercadopago.cl OR mercadopago.com OR tapp.cl)';

// Máximo de conversaciones por lectura y largo máximo de cada correo.
const MAX_HILOS = 100;
const MAX_TEXTO = 4000;

function doPost(e) {
  let pedido = {};
  try {
    pedido = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ ok: false, error: 'pedido' });
  }
  if (CLAVE === 'CAMBIA-ESTA-CLAVE' || pedido.clave !== CLAVE) return responder({ ok: false, error: 'clave' });
  return responder({ ok: true, cuenta: Session.getEffectiveUser().getEmail(), mensajes: leer(pedido.desde) });
}

/** Para revisar que la URL funciona desde el navegador (no entrega correos). */
function doGet() {
  return responder({ ok: true, app: 'me-debes', version: 1 });
}

function leer(desdeIso) {
  const desde = desdeIso ? new Date(desdeIso) : new Date(Date.now() - 30 * 86400000);
  const consulta = BUSQUEDA + ' after:' + Math.floor(desde.getTime() / 1000);
  const mensajes = [];
  GmailApp.search(consulta, 0, MAX_HILOS).forEach(function (hilo) {
    hilo.getMessages().forEach(function (m) {
      if (m.getDate() <= desde) return;
      mensajes.push({
        id: m.getId(),
        fecha: m.getDate().toISOString(),
        de: m.getFrom(),
        asunto: m.getSubject(),
        texto: m.getPlainBody().slice(0, MAX_TEXTO),
      });
    });
  });
  return mensajes;
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Ejecútala desde el editor (botón ▶) para dar los permisos y ver cuántos correos encuentra. */
function probar() {
  const ms = leer(new Date(Date.now() - 7 * 86400000).toISOString());
  Logger.log('Correos de los últimos 7 días: ' + ms.length);
  ms.slice(0, 5).forEach(function (m) {
    Logger.log(m.fecha + ' · ' + m.de + ' · ' + m.asunto);
  });
}
