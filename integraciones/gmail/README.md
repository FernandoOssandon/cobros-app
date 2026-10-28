# Conectar Gmail con Me Debes

La app puede leer los correos que te manda el banco cuando pagas o transfieres ("Se realizó una compra por $12.990 en…") y dejarlos **por confirmar**. Nada se anota solo: tú decides si es un gasto, si ya lo tenías anotado o si lo descartas.

## Cómo funciona

```
Gmail ──► script en tu cuenta de Google ──► app en tu teléfono
          (solo correos de bancos,          (interpreta monto, comercio
           pide una clave)                   y tarjeta; todo queda local)
```

- El script vive en **tu** cuenta de Google (Apps Script). No hay ningún servidor de terceros.
- Solo entrega correos de los remitentes listados en `BUSQUEDA`, y solo si la app manda la clave correcta.
- La app guarda la dirección y la clave en el teléfono. **No viajan en los respaldos**: si restauras en otro teléfono, hay que volver a conectar.

## Instalación (una vez, unos 5 minutos)

1. Entra a [script.google.com](https://script.google.com) con la cuenta de Gmail donde te llegan los avisos del banco → **Nuevo proyecto**.
2. Borra lo que trae y pega el contenido de [`Codigo.gs`](Codigo.gs). Ponle nombre al proyecto, por ejemplo "Me Debes correo".
3. Cambia `CLAVE` por una frase larga que solo tú sepas, como `mi-perro-come-sopaipillas-2026`. Si tu banco no está en `BUSQUEDA`, agrega su dominio.
4. Elige la función `probar` y aprieta ▶ **Ejecutar**. Google te pide permiso para leer tu correo. Es tu propio script, así que aparece el aviso "Google no verificó esta app": entra a *Configuración avanzada* → *Ir a Me Debes correo*. En el registro vas a ver cuántos correos de bancos encontró.
5. **Implementar → Nueva implementación** → tipo **Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario** (la clave es la que protege el acceso)
6. Copia la **URL de la aplicación web** (termina en `/exec`).
7. En la app: **Mi plata → Conectar Gmail → Conectar Gmail**. Pega la URL y la clave y toca **Probar y conectar**. Desde esa misma hoja puedes copiar el script (paso 1), así no necesitas este archivo en el teléfono.

Si después cambias el script, haz **Implementar → Gestionar implementaciones → Editar → Nueva versión**. Así la URL sigue siendo la misma.

## Para que reconozca tu tarjeta

En la app, en Medios de pago, anota los **últimos 4 dígitos** de cada tarjeta. Así cada compra detectada queda asociada a la tarjeta correcta.

## Si algo no calza

Cada banco escribe sus correos distinto. Si un correo no se lee bien (monto o comercio equivocado), copia su texto **tapando tus datos personales** y agrégalo como caso de prueba en `src/tests/correo.test.ts`. Después se ajusta `src/lib/correo.ts`.

## Desconectar

- En la app: Conectar Gmail → Desconectar.
- En Google: script.google.com → el proyecto → Implementar → Gestionar implementaciones → Archivar. También puedes quitar el permiso en [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
