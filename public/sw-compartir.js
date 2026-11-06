// "Compartir → a mano." desde otra app (la del banco, Descargas, el correo): Android manda el archivo con un POST
// a /compartir. El service worker lo guarda un momento y abre la pantalla de importar, que lo lee y lo borra.
const CACHE_COMPARTIDO = 'a-mano-compartido';
const CLAVE_COMPARTIDO = '/__compartido__';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/compartir')) return;
  event.respondWith(
    (async () => {
      try {
        const datos = await event.request.formData();
        const archivo = datos.getAll('archivo').find((x) => typeof x !== 'string');
        if (archivo) {
          const cache = await caches.open(CACHE_COMPARTIDO);
          await cache.put(
            CLAVE_COMPARTIDO,
            new Response(archivo, { headers: { 'content-type': archivo.type || 'application/octet-stream', 'x-nombre': encodeURIComponent(archivo.name || 'cartola.xlsx') } }),
          );
        }
      } catch {
        // Si no llegó el archivo, la pantalla de importar lo dice y deja elegirlo a mano.
      }
      return Response.redirect(new URL('./#/importar?compartido=1', self.registration.scope).href, 303);
    })(),
  );
});
