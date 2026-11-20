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
| `Modelo.kt` | `src/db.ts` | Gastos, movimientos, medios, presupuestos, recurrentes, ingresos, cuentas… (solo los campos de los cálculos) |
| `Cuotas.kt` | `src/lib/cuotas.ts` | Compras en cuotas repartidas en sus meses |
| `Saldos.kt` | `src/lib/balance.ts` | Saldo con cada persona, % pagado, estado de cada cargo y deuda |
| `Resumenes.kt` | `src/lib/resumen.ts` | Gasto real, lo que salió de cada medio y lo de otros; período de facturación |
| `Periodos.kt` | `src/lib/periodos.ts` | Mes o período de cada tarjeta, moverse entre períodos, resumen de la tarjeta |
| `Presupuestos.kt` | `src/lib/presupuestos.ts` | Avance de cada presupuesto (por día, proyección, estado) |
| `Cuentas.kt` | `src/lib/ahorro.ts` | Saldo estimado de cada cuenta (con interés diario), depósitos a plazo, rendimiento, patrimonio, movimientos e historial |
| `Flujos.kt` | `src/lib/flujos.ts` | Lo que mueve tus cuentas sin anotarlo ahí: gastos con débito, pagos por transferencia, pagos de tarjetas |
| `Tarjetas.kt` | `src/lib/tarjetas.ts`, `usadoTarjetas` | Cupo, usado y disponible; lo que toca pagar del último estado de cuenta |
| `Ingresos.kt` | `src/lib/ingresosMes.ts` | Ingresos del mes: los fijos (llegó, por confirmar, llega) y los sueltos |
| `Proyeccion.kt` | `src/lib/proyeccion.ts` | Ciclo de sueldo a sueldo, "hoy puedes gastar $X", ritmo, avisos de cuentas y cierre del ciclo |
| `Respaldos.kt` | `src/backup.ts` | Leer el respaldo JSON de la PWA (v2 a v9) y llevarlo al modelo |
| `Tablero.kt` | `src/hooks.ts` + Resumen | Todo lo del Resumen de un día, de una vez (lo usa la app Android) |
| `Json.kt` | — | Lector de JSON mínimo, sin dependencias |

Todos dan exactamente lo mismo que TypeScript en los vectores (JVM y JavaScript). Pendientes: `metas`, `tendencias`,
`importar`/`bancos` y `sii/*`.

### Cómo son los vectores

- RUT y repartos: una línea por caso.
- Lo demás: documentos JSON (`VECTORES_FECHAS`, `VECTORES_DATOS`) que se leen con un lector mínimo propio (`Json.kt`,
  sin dependencias). `VECTORES_DATOS` son 8 conjuntos de gastos, cuotas, pagos y presupuestos simulados con una semilla
  fija, con los resultados de TypeScript para cuotas, saldos, resúmenes de 5 meses, períodos de cada tarjeta y avances
  de presupuestos en 5 fechas distintas. `VECTORES_PLATA` son 6 conjuntos con cuentas (vista, efectivo, remuneradas,
  inversión, en dólares, depósitos a plazo), recurrentes, ingresos y pagos de tarjetas, con los resultados de TypeScript
  en 6 fechas: saldos, patrimonio, tarjetas, proyección completa y cierre del ciclo. `VECTORES_RESPALDO` son 3 respaldos
  completos tal como los exporta la PWA (con fotos, escapes y campos que el núcleo no usa) y el Resumen que calcula
  TypeScript con ellos.

## Quién lo usa

- **App Android** (`../android`): compila `src/commonMain/kotlin` dentro de la app.
- **PWA**: todavía no (sigue con la versión TypeScript).

Notas de la migración:

- Montos en `Long` (pesos enteros). Los saldos de las cuentas van en `Double`, porque una cuenta en dólares tiene
  centavos; los decimales se comparan en millonésimas. El redondeo usa `redondearJs` (como `Math.round` de JavaScript: las mitades hacia
  arriba), no el redondeo bancario de Kotlin.
- La PWA todavía usa la versión TypeScript. Cuando un módulo pase a usarse desde Kotlin en la PWA, su archivo `.ts`
  se reemplaza por el paquete de este núcleo y sus pruebas actuales se corren contra él.
