// Reparto de un gasto entre personas (iguales, montos exactos o por partes).
// Versión Kotlin de src/lib/split.ts: tiene que dar exactamente lo mismo, peso por peso (ver los vectores de prueba).
package cl.amano.nucleo

import kotlin.math.floor

enum class ModoReparto(val clave: String) {
    IGUALES("equal"),
    EXACTOS("exact"),
    PARTES("shares");

    companion object {
        fun deClave(clave: String): ModoReparto = entries.first { it.clave == clave }
    }
}

data class EntradaReparto(
    val monto: Long,
    /** Personas seleccionadas, en el orden en que se muestran. */
    val ids: List<String>,
    /** ¿Estoy incluido en el gasto? */
    val yo: Boolean,
    val modo: ModoReparto,
    /** Montos escritos a mano (modo exactos). */
    val exactos: Map<String, Long> = emptyMap(),
    /** Partes por persona (modo partes); si falta o es 0, vale 1. */
    val partes: Map<String, Int> = emptyMap(),
    /** Mis partes (modo partes). */
    val misPartes: Int = 1,
)

data class FilaReparto(val id: String, val monto: Long, val partes: Int)

data class Reparto(
    val monto: Long,
    val filas: List<FilaReparto>,
    /** Mi parte. */
    val mio: Long,
    /** Solo modo exactos: monto − lo asignado. */
    val restante: Long,
    val ok: Boolean,
)

/** Redondeo como Math.round de JavaScript (las mitades hacia arriba), no el redondeo bancario de Kotlin. */
internal fun redondearJs(x: Double): Long = floor(x + 0.5).toLong()

fun calcularReparto(e: EntradaReparto): Reparto {
    val monto = e.monto
    val ids = e.ids
    var ok = monto > 0 && ids.isNotEmpty()
    return when (e.modo) {
        ModoReparto.IGUALES -> {
            val n = ids.size + if (e.yo) 1 else 0
            val base = if (n > 0) monto.floorDiv(n.toLong()) else 0L
            val resto = monto - base * n
            val filas = ids.mapIndexed { i, id -> FilaReparto(id, base + if (!e.yo && i < resto) 1 else 0, 1) }
            Reparto(monto, filas, if (e.yo) base + resto else 0L, 0L, ok)
        }
        ModoReparto.EXACTOS -> {
            val filas = ids.map { FilaReparto(it, e.exactos[it] ?: 0L, 1) }
            val restante = monto - filas.sumOf { it.monto }
            val mio = if (e.yo) maxOf(restante, 0L) else 0L
            ok = ok && (if (e.yo) restante >= 0 else restante == 0L)
            Reparto(monto, filas, mio, restante, ok)
        }
        ModoReparto.PARTES -> {
            fun k(id: String) = e.partes[id]?.takeIf { it != 0 } ?: 1
            val total = ids.sumOf { k(it) } + if (e.yo) e.misPartes else 0
            val filas = ids.map { FilaReparto(it, if (total != 0) redondearJs(monto.toDouble() * k(it) / total) else 0L, k(it)) }.toMutableList()
            var mio = monto - filas.sumOf { it.monto }
            if (!e.yo) {
                if (filas.isNotEmpty()) filas[0] = filas[0].copy(monto = filas[0].monto + mio)
                mio = 0L
            }
            // Con montos muy chicos el redondeo podría dejar mi parte en negativo.
            ok = ok && mio >= 0 && filas.all { it.monto >= 0 }
            Reparto(monto, filas, mio, 0L, ok)
        }
    }
}
