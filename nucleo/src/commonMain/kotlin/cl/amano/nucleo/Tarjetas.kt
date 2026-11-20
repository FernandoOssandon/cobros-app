// Tarjetas de crédito: cupo, lo usado, lo disponible y lo que toca pagar. Versión Kotlin de src/lib/tarjetas.ts.
// Lo usado parte del último cuadre con el banco, suma las compras desde ahí (completas: una compra en cuotas
// bloquea todo el cupo) y resta los pagos. Sin cuadre, parte de cero con todo lo anotado.
package cl.amano.nucleo

data class UsoTarjeta(
    val usado: Long,
    val cupo: Long?,
    val disponible: Long?,
    /** 0 a 1 (sin cupo: null). */
    val pct: Double?,
    /** ¿Parte de un cuadre con el banco? */
    val cuadrado: Boolean,
    /** Pagos desde el cuadre (o desde siempre). */
    val pagado: Long,
)

data class PorPagar(val facturado: Long, val pagado: Long, val queda: Long, val cierre: String)

object Tarjetas {
    private fun despues(fecha: String, creado: String, base: UsoCuadrado?) =
        base == null || fecha > base.fecha || (fecha == base.fecha && creado > base.creado)

    /** `gastos`: los originales (no imputados). */
    fun uso(m: Medio, gastos: List<Gasto>, pagos: List<PagoTarjeta>, hoy: String): UsoTarjeta {
        val base = m.usoCuadrado
        val compras = gastos.filter { it.medioId == m.id && it.pagador == "yo" && it.fecha <= hoy && despues(it.fecha, it.creado, base) }.sumOf { it.total }
        val pagado = pagos.filter { it.medioId == m.id && it.fecha <= hoy && despues(it.fecha, it.creado, base) }.sumOf { it.monto }
        val usado = maxOf(0L, (base?.monto ?: 0L) + compras - pagado)
        val cupo = m.cupo?.takeIf { it > 0 }
        return UsoTarjeta(usado, cupo, cupo?.let { it - usado }, cupo?.let { minOf(1.0, usado.toDouble() / it) }, base != null, pagado)
    }

    /** Lo usado de cada tarjeta cuadrada con el banco (o con pagos anotados), para el patrimonio. */
    fun usadas(medios: List<Medio>, gastos: List<Gasto>, pagos: List<PagoTarjeta>, hoy: String): Map<String, Long> {
        val out = LinkedHashMap<String, Long>()
        for (m in medios) {
            if (m.tipo != TipoMedio.CREDITO || m.archivado) continue
            if (m.usoCuadrado == null && pagos.none { it.medioId == m.id }) continue
            out[m.id] = uso(m, gastos, pagos, hoy).usado
        }
        return out
    }

    /** Lo facturado en el último período cerrado menos lo pagado desde el cierre. Sin día de facturación: null. */
    fun porPagar(m: Medio, imputados: List<Gasto>, movimientos: List<Movimiento>, pagos: List<PagoTarjeta>, hoy: String): PorPagar? {
        if (!Periodos.tienePeriodo(m)) return null
        val actual = Periodos.en(hoy, m)
        if (actual.tipo != "tarjeta") return null
        val cerrado = Periodos.tarjeta(m, Fechas.sumarMes(actual.cierreMes!!, -1))
        val facturado = Periodos.resumenTarjeta(cerrado, imputados, movimientos, hoy).facturado
        val pagado = pagos.filter { it.medioId == m.id && it.fecha > cerrado.hasta && it.fecha <= hoy }.sumOf { it.monto }
        return PorPagar(facturado, pagado, maxOf(0L, facturado - pagado), cerrado.hasta)
    }
}
