package cl.amano.nucleo

import kotlin.test.Test
import kotlin.test.assertEquals
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
    fun redondeoComoJavaScript() {
        // Kotlin redondea 2.5 a 2 (bancario); JavaScript, a 3. El núcleo usa el de JavaScript.
        assertEquals(3L, redondearJs(2.5))
        assertEquals(-2L, redondearJs(-2.5))
    }
}
