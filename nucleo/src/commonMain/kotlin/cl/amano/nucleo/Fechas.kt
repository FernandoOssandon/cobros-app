// Fechas como texto ISO ("YYYY-MM-DD"), igual que en la PWA: calendario civil, sin horas ni zonas horarias.
// Versión Kotlin de las funciones de fecha de src/lib/format.ts y src/lib/recurrence.ts.
package cl.amano.nucleo

object Fechas {
    private fun dos(n: Int) = n.toString().padStart(2, '0')

    /** "2026-11-05" con año, mes (1–12) y día. */
    fun iso(anio: Int, mes: Int, dia: Int): String = "$anio-${dos(mes)}-${dos(dia)}"

    fun anio(iso: String) = iso.substring(0, 4).toInt()
    fun mes(iso: String) = iso.substring(5, 7).toInt()
    fun dia(iso: String) = iso.substring(8, 10).toInt()

    fun esBisiesto(anio: Int) = (anio % 4 == 0 && anio % 100 != 0) || anio % 400 == 0

    /** Días del mes (mes 1–12). */
    fun diasDelMes(anio: Int, mes: Int): Int = when (mes) {
        2 -> if (esBisiesto(anio)) 29 else 28
        4, 6, 9, 11 -> 30
        else -> 31
    }

    /** Días desde el 1970-01-01. El día puede pasarse del mes (32 = el 1 del mes siguiente), como en JavaScript. */
    fun aDias(anio: Int, mes: Int, dia: Int): Long {
        // Algoritmo de Howard Hinnant (days_from_civil), lineal en el día.
        val y = (if (mes <= 2) anio - 1 else anio).toLong()
        val era = y.floorDiv(400L)
        val yoe = y - era * 400
        val mp = (mes + 9) % 12
        val doy = (153 * mp + 2) / 5 + dia - 1
        val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146097 + doe - 719468
    }

    fun aDias(iso: String): Long = aDias(anio(iso), mes(iso), dia(iso))

    /** Días desde el 1970-01-01 → "YYYY-MM-DD". */
    fun deDias(z0: Long): String {
        val z = z0 + 719468
        val era = z.floorDiv(146097L)
        val doe = z - era * 146097
        val yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
        val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        val mp = (5 * doy + 2) / 153
        val d = (doy - (153 * mp + 2) / 5 + 1).toInt()
        val m = (if (mp < 10) mp + 3 else mp - 9).toInt()
        val y = (yoe + era * 400 + if (m <= 2) 1 else 0).toInt()
        return iso(y, m, d)
    }

    /** `n` días después (o antes, si es negativo). */
    fun sumarDias(iso: String, n: Int): String = deDias(aDias(iso) + n)

    /** Días de `desde` a `hasta` (negativo si `hasta` es antes). */
    fun diasEntre(desde: String, hasta: String): Int = (aDias(hasta) - aDias(desde)).toInt()

    /** Mes anterior o siguiente de "YYYY-MM". */
    fun sumarMes(mes: String, n: Int): String {
        val total = mes.substring(0, 4).toInt() * 12 + (mes.substring(5, 7).toInt() - 1) + n
        return "${total.floorDiv(12)}-${dos(total.mod(12) + 1)}"
    }

    /** Último día de un mes "YYYY-MM". */
    fun ultimoDia(mes: String): String = sumarDias("${sumarMes(mes, 1)}-01", -1)

    /** Día de la semana como en JavaScript: 0 = domingo … 6 = sábado. */
    fun diaSemana(iso: String): Int = (aDias(iso) + 4).mod(7L).toInt()

    /** Mismo día, `n` meses después (si ese mes es más corto, el último día). */
    fun masMeses(fecha: String, n: Int): String {
        val m = sumarMes(fecha.substring(0, 7), n)
        val ultimo = diasDelMes(m.substring(0, 4).toInt(), m.substring(5, 7).toInt())
        return "$m-${dos(minOf(dia(fecha), ultimo))}"
    }
}
