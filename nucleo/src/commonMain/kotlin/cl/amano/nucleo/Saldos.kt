// Saldos con cada persona, % pagado y estado de cada cargo y deuda (lo más antiguo se paga primero).
// Versión Kotlin de src/lib/balance.ts.
package cl.amano.nucleo

enum class EstadoCargo(val clave: String) { PENDIENTE("pendiente"), PARCIAL("parcial"), PAGADO("pagado") }

data class EstadoMovimiento(val estado: EstadoCargo, val pendiente: Long)

object Saldos {
    /** Orden cronológico: por fecha y, si empatan, por momento de registro. */
    val porFecha: Comparator<Movimiento> = compareBy<Movimiento> { it.fecha }.thenBy { it.creado }

    /** Saldo neto = cargos − pagos − deudas + abonos. Positivo: te debe. Negativo: le debes. */
    fun saldo(movs: List<Movimiento>): Long = movs.sumOf { it.tipo.signo * it.monto }

    private fun suma(movs: List<Movimiento>, tipo: TipoMovimiento) = movs.filter { it.tipo == tipo }.sumOf { it.monto }

    fun cargado(movs: List<Movimiento>): Long = suma(movs, TipoMovimiento.CARGO)

    /** % pagado de lo que te deben, de 0 a 100. */
    fun pctPagado(movs: List<Movimiento>): Long {
        val c = cargado(movs)
        if (c == 0L) return 0
        return redondearJs((c - saldo(movs)).toDouble() / c * 100).coerceIn(0, 100)
    }

    private fun aplicar(movs: List<Movimiento>, tipo: TipoMovimiento, cubreInicial: Long): Map<String, EstadoMovimiento> {
        var cubre = cubreInicial
        val out = LinkedHashMap<String, EstadoMovimiento>()
        for (m in movs.filter { it.tipo == tipo }.sortedWith(porFecha)) {
            val aplicado = minOf(cubre, m.monto)
            cubre -= aplicado
            val pendiente = m.monto - aplicado
            val estado = if (pendiente == 0L) EstadoCargo.PAGADO else if (aplicado > 0) EstadoCargo.PARCIAL else EstadoCargo.PENDIENTE
            out[m.id] = EstadoMovimiento(estado, pendiente)
        }
        return out
    }

    /** Estado de cada cargo: lo cubre lo que te pagó más lo que tú le debes, menos lo que le abonaste. */
    fun estadosCargos(movs: List<Movimiento>): Map<String, EstadoMovimiento> =
        aplicar(movs, TipoMovimiento.CARGO, maxOf(0L, suma(movs, TipoMovimiento.PAGO) + suma(movs, TipoMovimiento.DEUDA) - suma(movs, TipoMovimiento.ABONO)))

    /** Estado de lo que tú le debes ("pagó por ti"). */
    fun estadosDeudas(movs: List<Movimiento>): Map<String, EstadoMovimiento> {
        val debo = suma(movs, TipoMovimiento.DEUDA)
        return aplicar(movs, TipoMovimiento.DEUDA, maxOf(0L, debo - maxOf(-saldo(movs), 0L)))
    }
}
