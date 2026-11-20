# nucleo · reglas de la plata en Kotlin Multiplatform

Las reglas que no pueden dar resultados distintos entre plataformas (repartos, cuotas, saldos, proyección, SII…),
escritas una vez en Kotlin:

- **JVM → Android** (la app nativa).
- **JavaScript → PWA** (iPhone y web), como librería con tipos de TypeScript.

## Cómo se asegura que da lo mismo que la PWA

Mientras se migra, la versión de verdad sigue siendo la de TypeScript (`src/lib/`). La prueba
`src/tests/vectoresNucleo.test.ts` genera `src/commonTest/kotlin/cl/amano/nucleo/Vectores.kt` con cientos de
entradas y los resultados que da TypeScript. Las pruebas de Kotlin recorren esos vectores en JVM y en JavaScript y
exigen el mismo resultado, peso por peso.

- Al correr `npm test` en tu computador, si la lógica cambió, los vectores se regeneran solos (súbelos con el commit).
- En GitHub Actions solo se comparan: si no están al día, la prueba falla.

## Correr las pruebas

Necesitas Java 17 o más nuevo (por ejemplo, el que trae Android Studio):

```bash
cd nucleo
./gradlew check        # pruebas en JVM y en JavaScript (Node)
./gradlew build        # además arma la librería JS (con su .d.ts) dentro de build/
```

En Windows: `.\gradlew.bat check`.

## Módulos

| Kotlin | TypeScript | Estado |
|---|---|---|
| `Rut.kt` | `src/lib/rut.ts` | Portado, igual en los vectores |
| `Repartos.kt` | `src/lib/split.ts` | Portado, igual en los vectores |
| — | `cuotas`, `balance`, `resumen`, `periodos`, `presupuestos`, `proyeccion`, `sii/*`… | Pendiente |

Notas de la migración:

- Montos en `Long` (pesos enteros). El redondeo usa `redondearJs` (como `Math.round` de JavaScript: las mitades hacia
  arriba), no el redondeo bancario de Kotlin.
- La PWA todavía usa la versión TypeScript. Cuando un módulo pase a usarse desde Kotlin en la PWA, su archivo `.ts`
  se reemplaza por el paquete de este núcleo y sus pruebas actuales se corren contra él.
