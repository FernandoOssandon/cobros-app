// Ingresos de un mes: los fijos (y si ya llegaron) y los sueltos. Versión Kotlin de src/lib/ingresosMes.ts.
package cl.amano.nucleo

enum class EstadoFijo(val clave: String) {
    /** Ya se anotó este mes. */
    LLEGO("llego"),
    /** Es variable y espera el monto. */
    CONFIRMAR("confirmar"),
    /** Todavía no llega. */
    LLEGA("llega"),
    TERMINADO("terminado"),
}

data class FijoDelMes(
    val recurrente: Recurrente,
    val estado: EstadoFijo,
    val fecha: String? = null,
    /** Lo que llegó (si llegó). */
    val monto: Long? = null,
    val pendienteId: String? = null,
)

data class IngresosMes(
    /** Fijos ya llegados + sueltos del mes. */
    val total: Long,
    val fijos: List<FijoDelMes>,
    /** Ingresos sin recurrente, del más nuevo al más antiguo. */
    val sueltos: List<Ingreso>,
)

object Ingresos {
    /** `mes`: YYYY-MM. */
    fun delMes(mes: String, ingresos: List<Ingreso>, recurrentes: List<Recurrente>, pendientes: List<Pendiente>, hoy: String): IngresosMes {
        val desde = "$mes-01"
        val hasta = Fechas.ultimoDia(mes)
        val delMes = ingresos.filter { it.fecha >= desde && it.fecha <= hasta }
        val fijos = recurrentes
            .filter { it.tipo == TipoRecurrente.INGRESO && it.activo }
            .sortedBy { it.creado }
            .map { r ->
                val llegados = delMes.filter { it.recurrenteId == r.id }.sortedByDescending { it.fecha }
                if (llegados.isNotEmpty()) return@map FijoDelMes(r, EstadoFijo.LLEGO, llegados[0].fecha, llegados.sumOf { it.monto })
                val p = pendientes.find { it.recurrenteId == r.id && it.fecha >= desde && it.fecha <= hasta }
                if (p != null) return@map FijoDelMes(r, EstadoFijo.CONFIRMAR, p.fecha, pendienteId = p.id)
                val sig = Recurrencias.proxima(r.frecuencia, r.inicio, maxOf(r.generadoHasta ?: "", Fechas.sumarDias(hoy, -1)), r.fin)
                if (sig != null) FijoDelMes(r, EstadoFijo.LLEGA, sig) else FijoDelMes(r, EstadoFijo.TERMINADO)
            }
        return IngresosMes(
            total = delMes.sumOf { it.monto },
            fijos = fijos,
            sueltos = delMes.filter { it.recurrenteId.isNullOrEmpty() }.sortedWith(compareByDescending<Ingreso> { it.fecha }.thenByDescending { it.creado }),
        )
    }

    /** Día del mes en que llega un ingreso fijo mensual. */
    fun dia(r: Recurrente) = r.frecuencia.dia ?: Fechas.dia(r.inicio)
}
