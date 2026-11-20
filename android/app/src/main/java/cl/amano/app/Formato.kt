// Montos y fechas como los muestra la PWA: "$1.234.567", "25 dic", "25 de diciembre".
package cl.amano.app

private val MESES = listOf("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre")

object Formato {
    /** "$1.234.567" o "-$12.000". */
    fun pesos(n: Long): String {
        val digitos = kotlin.math.abs(n).toString()
        val conPuntos = digitos.reversed().chunked(3).joinToString(".").reversed()
        return (if (n < 0) "-$" else "$") + conPuntos
    }

    /** "25 dic" de "2026-12-25". */
    fun fechaCorta(iso: String): String = "${iso.substring(8, 10).toInt()} ${MESES[iso.substring(5, 7).toInt() - 1].take(3)}"

    /** "25 de diciembre". */
    fun fechaLarga(iso: String): String = "${iso.substring(8, 10).toInt()} de ${MESES[iso.substring(5, 7).toInt() - 1]}"

    /** "noviembre" de "2026-11". */
    fun nombreMes(mes: String): String = MESES[mes.substring(5, 7).toInt() - 1]

    /** "1 día", "12 días". */
    fun plural(n: Int, uno: String, varios: String) = "$n ${if (n == 1) uno else varios}"

    /** "20 nov, 12:00" de "2026-11-20T15:00:00.000Z", en la hora del teléfono. */
    fun momento(iso: String): String = try {
        val local = java.time.Instant.parse(iso).atZone(java.time.ZoneId.systemDefault())
        "${local.dayOfMonth} ${MESES[local.monthValue - 1].take(3)}, ${local.hour.toString().padStart(2, '0')}:${local.minute.toString().padStart(2, '0')}"
    } catch (e: Exception) {
        iso.take(10)
    }
}
