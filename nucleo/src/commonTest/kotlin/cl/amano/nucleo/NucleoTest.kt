package cl.amano.nucleo

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class NucleoTest {
    @Test
    fun rutIgualQueTypeScript() {
        assertTrue(VECTORES_RUT.size > 20)
        assertEquals(emptyList(), diferenciasRut().take(20))
    }

    @Test
    fun repartosIgualQueTypeScript() {
        assertTrue(VECTORES_REPARTO.size > 300)
        assertEquals(emptyList(), diferenciasReparto().take(20))
    }

    @Test
    fun fechasYRecurrenciasIgualQueTypeScript() {
        assertEquals(emptyList(), diferenciasFechas().take(20))
    }

    @Test
    fun cuotasSaldosResumenesPeriodosYPresupuestosIgualQueTypeScript() {
        assertTrue(VECTORES_DATOS.size >= 8)
        assertEquals(emptyList(), diferenciasDatos().take(20))
    }

    @Test
    fun cuentasTarjetasIngresosYProyeccionIgualQueTypeScript() {
        assertTrue(VECTORES_PLATA.size >= 6)
        assertEquals(emptyList(), diferenciasPlata().take(20))
    }

    @Test
    fun respaldoCompletoDaElMismoTableroQueTypeScript() {
        assertTrue(VECTORES_RESPALDO.size >= 3)
        assertEquals(emptyList(), diferenciasRespaldo().take(20))
    }

    @Test
    fun respaldoInvalidoDaUnMensajeClaro() {
        for (texto in listOf("", "hola", "{}", """{"app":"otra","version":9}""", """{"app":"me-debes","version":12}""")) {
            val e = assertFailsWith<RespaldoInvalido> { Respaldos.leer(texto) }
            assertEquals("El archivo no es un respaldo de a mano", e.message)
        }
        assertFailsWith<RespaldoInvalido> { Respaldos.leer("""{"app":"me-debes","version":9,"personas":[],"gastos":[]}""") }
        assertFailsWith<RespaldoInvalido> {
            Respaldos.leer("""{"app":"me-debes","version":9,"personas":[],"gastos":[],"cobros":[],"movimientos":[{"id":"m","tipo":"otro","monto":1,"personaId":"p"}]}""")
        }
    }

    @Test
    fun respaldoDeLaVersion1SeConvierte() {
        // v2: los gastos se llamaban "cargos" (siempre los pagaba yo) y los movimientos apuntaban a "cargoId".
        val r = Respaldos.leer(
            """{"app":"me-debes","version":2,"exportado":"2025-01-01","personas":[{"id":"p1","nombre":"Camila Rojas"}],
            "cargos":[{"id":"c1","descripcion":"Pizza","total":12000,"fecha":"2025-01-10","creado":"x"}],
            "movimientos":[{"id":"m1","personaId":"p1","tipo":"cargo","monto":6000,"fecha":"2025-01-10","cargoId":"c1","creado":"x"}],"cobros":[]}""",
        )
        assertEquals(1, r.gastos.size)
        assertEquals("yo", r.gastos[0].pagador)
        assertEquals(mapOf("p1" to 6000L), r.gastos[0].montos)
        assertEquals("c1", r.movimientos[0].gastoId)
        assertEquals("Camila", r.personas[0].primerNombre)
        assertEquals(6000L, Tableros.calcular(r, "2025-01-31").resumen.teDeben)
    }

    @Test
    fun redondeoComoJavaScript() {
        // Kotlin redondea 2.5 a 2 (bancario); JavaScript, a 3. El núcleo usa el de JavaScript.
        assertEquals(3L, redondearJs(2.5))
        assertEquals(-2L, redondearJs(-2.5))
    }
}
