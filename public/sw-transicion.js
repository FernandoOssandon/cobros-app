// Transición de "se actualiza sola" (v1.0) a "avisa antes de actualizar" (v1.1 en adelante).
// La v1.0 no sabe pedirle al service worker nuevo que se active, así que la primera vez que llega
// una versión con aviso se activa sola. Desde ahí, cada versión nueva espera a que toques "Actualizar".
const MARCA = 'me-debes-actualiza-con-aviso';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.has(MARCA).then((yaTieneAviso) => {
      if (!yaTieneAviso) return self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.open(MARCA));
});
