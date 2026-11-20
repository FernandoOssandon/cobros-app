// Resumen de un mes o período: gasto real, lo que salió de cada medio de pago y cuánto de eso es de otros.
// Versión Kotlin de src/lib/resumen.ts.
package cl.amano.nucleo

data class ResumenMedio(
    /** null = gastos sin medio. */
    val medioId: String?,
    /** Lo que pagué con ese medio. */
    val total: Long,
    val mio: Long,
    /** Parte de otros que ya me devolvieron. */
    val otrosCobrado: Long,
    /** Parte de otros que aún me deben. */
    val otrosPendiente: Long,
)

data class MontoCategoria(val categoriaId: String?, val monto: Long)

data class Resumen(
    val mes: String,
    /** Suma de mis partes (incluye lo que otros pagaron por mí). */
    val gastoReal: Long,
    /** Lo que pagué yo en total. */
    val salio: Long,
    /** Lo que adelanté por otros. */
    val adelantado: Long,
    val porMedio: List<ResumenMedio>,
    val porCategoria: List<MontoCategoria>,
    /** Saldos con personas a la fecha (no solo del período). */
    val teDeben: Long,
    val debes: Long,
)

object Resumenes {
    fun mesDe(fecha: String) = fecha.substring(0, 7)

    /** Período de facturación que cierra el `dia` del mes `mes` (YYYY-MM). Ambos extremos incluidos. */
    fun periodoFacturacion(mes: String, dia: Int): Pair<String, String> {
        fun cierre(m: String) = "$m-${minOf(dia, Fechas.diasDelMes(m.substring(0, 4).toInt(), m.substring(5, 7).toInt())).toString().padStart(2, '0')}"
        return Fechas.sumarDias(cierre(Fechas.sumarMes(mes, -1)), 1) to cierre(mes)
    }

    fun resumenMes(mes: String, gastos: List<Gasto>, movimientos: List<Movimiento>, medios: List<Medio> = emptyList()): Resumen =
        resumenDe(mes, gastos.filter { mesDe(it.fecha) == mes }, movimientos, medios)

    /** Resumen de un conjunto de gastos ya filtrado (un mes, el período de una tarjeta…). `mes` es una etiqueta. */
    fun resumenDe(mes: String, delMes: List<Gasto>, movimientos: List<Movimiento>, medios: List<Medio> = emptyList()): Resumen {
        val porPersona = movimientos.groupBy { it.personaId }
        val pendienteCargo = HashMap<String, Long>()
        for (movs in porPersona.values) for ((id, e) in Saldos.estadosCargos(movs)) pendienteCargo[id] = e.pendiente
        val cargosDeGasto = movimientos.filter { it.gastoId != null && it.tipo == TipoMovimiento.CARGO }.groupBy { it.gastoId!! }

        class Acum(val medioId: String?) {
            var total = 0L; var mio = 0L; var otrosCobrado = 0L; var otrosPendiente = 0L
        }
        val porMedio = LinkedHashMap<String?, Acum>()
        val porCategoria = LinkedHashMap<String?, Long>()
        var gastoReal = 0L
        var salio = 0L
        var miParteDeLoQuePague = 0L
        for (g in delMes) {
            gastoReal += g.miParte
            porCategoria[g.categoriaId] = (porCategoria[g.categoriaId] ?: 0L) + g.miParte
            if (g.pagador != "yo") continue
            salio += g.total
            miParteDeLoQuePague += g.miParte
            val r = porMedio.getOrPut(g.medioId) { Acum(g.medioId) }
            r.total += g.total
            r.mio += g.miParte
            // Una cuota lleva su parte proporcional de lo que otros deben de la compra.
            val factor = g.cuota?.let { g.total.toDouble() / it.totalCompra } ?: 1.0
            for (c in cargosDeGasto[g.cuota?.origenId ?: g.id].orEmpty()) {
                val pend = pendienteCargo[c.id] ?: c.monto
                r.otrosPendiente += redondearJs(pend * factor)
                r.otrosCobrado += redondearJs((c.monto - pend) * factor)
            }
        }
        val orden = medios.associate { it.id to it.orden }
        var teDeben = 0L
        var debes = 0L
        for (movs in porPersona.values) {
            val s = Saldos.saldo(movs)
            if (s > 0) teDeben += s else debes -= s
        }
        return Resumen(
            mes = mes,
            gastoReal = gastoReal,
            salio = salio,
            adelantado = salio - miParteDeLoQuePague,
            porMedio = porMedio.values
                .sortedBy { orden[it.medioId ?: ""] ?: 999 }
                .map { ResumenMedio(it.medioId, it.total, it.mio, it.otrosCobrado, it.otrosPendiente) },
            porCategoria = porCategoria.map { (k, v) -> MontoCategoria(k, v) }.sortedByDescending { it.monto },
            teDeben = teDeben,
            debes = debes,
        )
    }
}
