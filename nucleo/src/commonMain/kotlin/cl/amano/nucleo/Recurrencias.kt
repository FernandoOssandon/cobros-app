// Fechas de un recurrente (sueldo, arriendo, Netflix…). Versión Kotlin de src/lib/recurrence.ts.
package cl.amano.nucleo

enum class UnidadFrecuencia(val clave: String) {
    DIA("dia"), SEMANA("semana"), MES("mes"), ANIO("anio");

    companion object {
        fun deClave(clave: String) = entries.first { it.clave == clave }
    }
}

data class Frecuencia(
    val unidad: UnidadFrecuencia,
    /** Cada cuántas unidades (1 = todos los meses, 2 = cada 2 meses…). */
    val cada: Int = 1,
    /** Para mes: día del mes (si el mes es más corto, el último día). */
    val dia: Int? = null,
)

object Recurrencias {
    private fun cada(f: Frecuencia) = maxOf(1, if (f.cada == 0) 1 else f.cada)

    /** n-ésima ocurrencia (0 = la primera, que es `inicio`). */
    fun ocurrencia(f: Frecuencia, inicio: String, n: Int): String {
        val y = Fechas.anio(inicio)
        val m = Fechas.mes(inicio)
        val d = Fechas.dia(inicio)
        val c = cada(f)
        return when (f.unidad) {
            UnidadFrecuencia.DIA -> Fechas.sumarDias(inicio, n * c)
            UnidadFrecuencia.SEMANA -> Fechas.sumarDias(inicio, n * c * 7)
            UnidadFrecuencia.MES -> {
                val total = m - 1 + n * c
                val yy = y + total.floorDiv(12)
                val mm = total.mod(12) + 1
                Fechas.iso(yy, mm, minOf(f.dia ?: d, Fechas.diasDelMes(yy, mm)))
            }
            UnidadFrecuencia.ANIO -> {
                val yy = y + n * c
                Fechas.iso(yy, m, minOf(d, Fechas.diasDelMes(yy, m)))
            }
        }
    }

    /** Fechas en el rango (despues, hasta], respetando `fin`. `limite` evita bucles enormes (máx. 400). */
    fun entre(f: Frecuencia, inicio: String, despues: String?, hasta: String, fin: String? = null, limite: Int = 400): List<String> {
        val tope = if (!fin.isNullOrEmpty() && fin < hasta) fin else hasta
        val out = mutableListOf<String>()
        var n = 0
        while (out.size < limite) {
            val fecha = ocurrencia(f, inicio, n)
            if (fecha > tope) break
            if (despues.isNullOrEmpty() || fecha > despues) out += fecha
            if (n > 20000) break
            n++
        }
        return out
    }

    /** Próxima ocurrencia después de `despues` (o la primera); null si ya terminó. */
    fun proxima(f: Frecuencia, inicio: String, despues: String? = null, fin: String? = null): String? {
        for (n in 0 until 20000) {
            val fecha = ocurrencia(f, inicio, n)
            if (!fin.isNullOrEmpty() && fecha > fin) return null
            if (despues.isNullOrEmpty() || fecha > despues) return fecha
        }
        return null
    }

    /** Equivalente mensual de un monto según su frecuencia. */
    fun montoMensual(monto: Long, f: Frecuencia): Long {
        val factor = when (f.unidad) {
            UnidadFrecuencia.DIA -> 30.4375
            UnidadFrecuencia.SEMANA -> 4.348
            UnidadFrecuencia.MES -> 1.0
            UnidadFrecuencia.ANIO -> 1.0 / 12
        }
        return redondearJs(monto * (factor / cada(f)))
    }
}
