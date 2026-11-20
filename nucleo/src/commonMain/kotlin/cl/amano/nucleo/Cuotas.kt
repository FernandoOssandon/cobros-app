// Compras en cuotas: $300.000 en 3 cuotas cuentan $100.000 en cada mes, partiendo por el de la compra.
// Versión Kotlin de src/lib/cuotas.ts.
package cl.amano.nucleo

object Cuotas {
    /** Parte `i` (0…n−1) de un monto repartido en `n`: partes iguales y el resto en la primera. */
    fun parte(monto: Long, n: Int, i: Int): Long {
        val base = monto.floorDiv(n.toLong())
        return if (i == 0) monto - base * (n - 1) else base
    }

    fun esEnCuotas(g: Gasto) = (g.cuotas ?: 0) > 1 && g.pagador == "yo"

    /** Las cuotas de una compra (o la compra misma si no es en cuotas). */
    fun de(g: Gasto): List<Gasto> {
        if (!esEnCuotas(g)) return listOf(g)
        val n = g.cuotas!!
        return List(n) { i ->
            g.copy(
                id = "${g.id}#${i + 1}",
                fecha = Fechas.masMeses(g.fecha, i),
                total = parte(g.total, n, i),
                miParte = parte(g.miParte, n, i),
                montos = g.montos?.mapValues { (_, v) -> parte(v, n, i) },
                cuota = InfoCuota(i + 1, n, g.id, g.total, g.fecha),
            )
        }
    }

    /** Todos los gastos tal como cuentan en el tiempo: las compras en cuotas se reparten en sus meses. */
    fun imputar(gastos: List<Gasto>): List<Gasto> = gastos.flatMap(::de)

    /** Id del gasto real (para abrir el detalle desde una cuota). */
    fun idOrigen(g: Gasto) = g.cuota?.origenId ?: g.id
}
