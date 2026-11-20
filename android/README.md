# a mano. · Android (Kotlin + Jetpack Compose)

Primera versión nativa para Android. Por ahora **solo lectura**: abre un respaldo de la app web y muestra el Resumen
(gasto real del mes, "hoy puedes gastar", ingresos, presupuestos, tarjetas, cuentas y personas), calculado con las
mismas reglas que la PWA. Sirve para comparar números y tiempos de arranque antes de rehacer los formularios.

## Cómo instalarla

1. En GitHub → **Actions** → la última ejecución de **Pruebas** en verde → sección **Artifacts** → `a-mano-android`.
2. Descomprime el zip: adentro está `app-debug.apk`.
3. Pásalo al teléfono (Drive, correo o cable) y ábrelo. Android pedirá permitir "instalar apps desconocidas" para la app
   con que lo abriste (Drive, Archivos…): es lo normal para una app que no viene de Play.
4. En la app: **Cargar respaldo** → elige el JSON (Drive → carpeta "a mano · respaldos", o el que exportaste desde
   Ajustes → Exportar en la PWA).

Cada APK nuevo se instala encima del anterior (misma llave de depuración, `app/debug.keystore`, que no es secreta),
así que no hay que desinstalar ni volver a cargar el respaldo.

## Cómo está armada

- `app/src/main/java/cl/amano/app/`: la pantalla (`Pantalla.kt`), el inicio (`MainActivity.kt`), el respaldo guardado
  en el teléfono (`Almacen.kt`) y los formatos de montos y fechas (`Formato.kt`).
- Las reglas de la plata vienen del núcleo: `app/build.gradle.kts` agrega `../nucleo/src/commonMain/kotlin` como
  código de la app (es Kotlin puro, sin dependencias). `Respaldos.leer` lee el JSON y `Tableros.calcular` arma todo lo
  del Resumen; ambos se prueban contra la versión TypeScript en `nucleo/`.
- El pie de la pantalla muestra cuánto tardó en abrir, leer y calcular.

## Compilar en tu computador (opcional)

Con Android Studio: abre la carpeta `android/`. O por consola, con Java 17 y el SDK de Android:

```bash
cd android
./gradlew assembleDebug     # deja el APK en app/build/outputs/apk/debug/
```
