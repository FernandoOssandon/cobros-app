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

| Kotlin | TypeScript | Qué hace |
|---|---|---|
| `Rut.kt` | `src/lib/rut.ts` | Dígito verificador, validar y dar formato |
| `Repartos.kt` | `src/lib/split.ts` | Repartir un gasto (iguales, exactos, partes) |
| `Fechas.kt` | `src/lib/format.ts`, `recurrence.ts` | Sumar días y meses, días entre fechas, día de la semana, "mismo día n meses después" |
| `Recurrencias.kt` | `src/lib/recurrence.ts` | Fechas de un recurrente, próxima ocurrencia, equivalente mensual |
| `Modelo.kt` | `src/db.ts` | Gasto, Movimiento, Medio y Presupuesto (solo los campos de los cálculos) |
| `Cuotas.kt` | `src/lib/cuotas.ts` | Compras en cuotas repartidas en sus meses |
| `Saldos.kt` | `src/lib/balance.ts` | Saldo con cada persona, % pagado, estado de cada cargo y deuda |
| `Resumenes.kt` | `src/lib/resumen.ts` | Gasto real, lo que salió de cada medio y lo de otros; período de facturación |
| `Periodos.kt` | `src/lib/periodos.ts` | Mes o período de cada tarjeta, moverse entre períodos, resumen de la tarjeta |
| `Presupuestos.kt` | `src/lib/presupuestos.ts` | Avance de cada presupuesto (por día, proyección, estado) |

Todos dan exactamente lo mismo que TypeScript en los vectores (JVM y JavaScript). Pendientes: `ingresosMes`, `tarjetas`
(cupo y por pagar), `flujos` y `ahorro` (saldos de cuentas), `proyeccion`, `metas`, `tendencias`, `importar`/`bancos` y `sii/*`.

### Cómo son los vectores

- RUT y repartos: una línea por caso.
- Lo demás: documentos JSON (`VECTORES_FECHAS`, `VECTORES_DATOS`) que se leen con un lector mínimo propio (`Json.kt`,
  sin dependencias). `VECTORES_DATOS` son 8 conjuntos de gastos, cuotas, pagos y presupuestos simulados con una semilla
  fija, con los resultados de TypeScript para cuotas, saldos, resúmenes de 5 meses, períodos de cada tarjeta y avances
  de presupuestos en 5 fechas distintas.

Notas de la migración:

- Montos en `Long` (pesos enteros). El redondeo usa `redondearJs` (como `Math.round` de JavaScript: las mitades hacia
  arriba), no el redondeo bancario de Kotlin.
- La PWA todavía usa la versión TypeScript. Cuando un módulo pase a usarse desde Kotlin en la PWA, su archivo `.ts`
  se reemplaza por el paquete de este núcleo y sus pruebas actuales se corren contra él.
