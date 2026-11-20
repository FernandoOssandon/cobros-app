// Avance de los presupuestos (semanales o mensuales, de todo o de algunas categorías).
// Versión Kotlin de src/lib/presupuestos.ts.
package cl.amano.nucleo

enum class EstadoPresupuesto(val clave: String, val orden: Int) { EXCEDIDO("excedido", 0), CERCA("cerca", 1), BIEN("bien", 2) }

data class AvancePresupuesto(
    val presupuesto: Presupuesto,
    val desde: String,
    val hasta: String,
    /** Tu gasto real en el período. */
    val gastado: Long,
    /** Lo que queda (negativo si te pasaste). */
    val restante: Long,
    /** 0 a 1+ (infinito si el límite es 0 y gastaste). */
    val pct: Double,
    val diasTotales: Int,
    val diasTranscurridos: Int,
    val diasRestantes: Int,
    /** Lo que puedes gastar por día lo que queda del período. */
    val porDia: Long,
    /** A este ritmo, cuánto gastarías en todo el período. */
    val proyeccion: Long,
    val excesoProyectado: Long,
    val estado: EstadoPresupuesto,
)

object Presupuestos {
    /** Categorías que cuenta (vacío: todas). Lee también el formato de hasta la 2.7 (una sola). */
    fun categoriasDe(p: Presupuesto): List<String> = when {
        !p.categoriaIds.isNullOrEmpty() -> p.categoriaIds
        !p.categoriaId.isNullOrEmpty() -> listOf(p.categoriaId)
        else -> emptyList()
    }

    /** Lunes de la semana de `fecha` (la semana va de lunes a domingo). */
    fun lunesDe(fecha: String): String = Fechas.sumarDias(fecha, -((Fechas.diaSemana(fecha) + 6) % 7))

    /** Rango del período que contiene `hoy`. */
    fun rango(periodo: PeriodoPresupuesto, hoy: String): Pair<String, String> = when (periodo) {
        PeriodoPresupuesto.SEMANA -> lunesDe(hoy).let { it to Fechas.sumarDias(it, 6) }
        PeriodoPresupuesto.MES -> hoy.substring(0, 7).let { "$it-01" to Fechas.ultimoDia(it) }
    }

    fun avance(p: Presupuesto, gastos: List<Gasto>, hoy: String): AvancePresupuesto {
        val (desde, hasta) = rango(p.periodo, hoy)
        val cats = categoriasDe(p)
        val gastado = gastos
            .filter { it.fecha >= desde && it.fecha <= hasta && (cats.isEmpty() || (!it.categoriaId.isNullOrEmpty() && it.categoriaId in cats)) }
            .sumOf { it.miParte }
        val diasTotales = Fechas.diasEntre(desde, hasta) + 1
        val diasTranscurridos = minOf(diasTotales, maxOf(1, Fechas.diasEntre(desde, hoy) + 1))
        val diasRestantes = diasTotales - diasTranscurridos + 1
        val restante = p.monto - gastado
        val proyeccion = redondearJs(gastado.toDouble() / diasTranscurridos * diasTotales)
        val pct = if (p.monto > 0) gastado.toDouble() / p.monto else if (gastado > 0) Double.POSITIVE_INFINITY else 0.0
        val estado = if (gastado > p.monto) EstadoPresupuesto.EXCEDIDO else if (pct >= 0.8) EstadoPresupuesto.CERCA else EstadoPresupuesto.BIEN
        return AvancePresupuesto(
            presupuesto = p,
            desde = desde,
            hasta = hasta,
            gastado = gastado,
            restante = restante,
            pct = pct,
            diasTotales = diasTotales,
            diasTranscurridos = diasTranscurridos,
            diasRestantes = diasRestantes,
            porDia = if (restante > 0) restante.floorDiv(diasRestantes.toLong()) else 0,
            proyeccion = proyeccion,
            excesoProyectado = maxOf(0L, proyeccion - p.monto),
            estado = estado,
        )
    }

    /** Todos los presupuestos activos con su avance; los en riesgo primero. */
    fun avances(presupuestos: List<Presupuesto>, gastos: List<Gasto>, hoy: String): List<AvancePresupuesto> =
        presupuestos.filter { !it.archivado }
            .map { avance(it, gastos, hoy) }
            .sortedWith(compareBy<AvancePresupuesto> { it.estado.orden }.thenBy { it.presupuesto.orden })
}
