// Períodos para mirar los gastos: el mes calendario o el período de facturación de cada tarjeta de crédito.
// Versión Kotlin de src/lib/periodos.ts (sin los textos de pantalla).
package cl.amano.nucleo

data class Periodo(
    /** "mes" o "tarjeta". */
    val tipo: String,
    val desde: String,
    val hasta: String,
    /** Período de mes: YYYY-MM. */
    val mes: String? = null,
    /** Período de tarjeta: la tarjeta y el mes en que cierra. */
    val medioId: String? = null,
    val cierreMes: String? = null,
)

data class ResumenTarjeta(
    /** Lo que llegará en el estado de cuenta. */
    val facturado: Long,
    val tuyo: Long,
    val deOtros: Long,
    val recuperado: Long,
    val pendiente: Long,
    val nGastos: Int,
    /** Días que faltan para el cierre (0 = hoy; negativo = ya cerró). */
    val diasAlCierre: Int,
    val cerrado: Boolean,
)

object Periodos {
    fun mes(mes: String) = Periodo("mes", "$mes-01", Fechas.ultimoDia(mes), mes = mes)

    /** Solo las tarjetas de crédito con día de facturación tienen período propio. */
    fun tienePeriodo(m: Medio) = m.tipo == TipoMedio.CREDITO && (m.diaFacturacion ?: 0) != 0 && !m.archivado

    fun tarjeta(m: Medio, cierreMes: String): Periodo {
        val (desde, hasta) = Resumenes.periodoFacturacion(cierreMes, m.diaFacturacion ?: 31)
        return Periodo("tarjeta", desde, hasta, medioId = m.id, cierreMes = cierreMes)
    }

    /** Período (de la tarjeta, o el mes) que contiene una fecha. */
    fun en(fecha: String, m: Medio? = null): Periodo {
        if (m == null || !tienePeriodo(m)) return mes(fecha.substring(0, 7))
        val actual = tarjeta(m, fecha.substring(0, 7))
        return if (fecha <= actual.hasta) actual else tarjeta(m, Fechas.sumarMes(fecha.substring(0, 7), 1))
    }

    /** El período anterior (n = −1) o siguiente (n = 1). */
    fun mover(p: Periodo, n: Int, medios: List<Medio>): Periodo {
        if (p.tipo == "mes") return mes(Fechas.sumarMes(p.mes!!, n))
        val m = medios.find { it.id == p.medioId }
        return if (m != null) tarjeta(m, Fechas.sumarMes(p.cierreMes!!, n)) else mes(Fechas.sumarMes(p.cierreMes!!, n))
    }

    /** "mes:2026-11" o "tarjeta:<id>:2026-12". */
    fun clave(p: Periodo) = if (p.tipo == "mes") "mes:${p.mes}" else "tarjeta:${p.medioId}:${p.cierreMes}"

    fun esActual(p: Periodo, hoy: String) = p.hasta >= hoy

    /** En el mes: todos sus gastos. En el período de una tarjeta: solo los pagados con ella. */
    fun gastos(p: Periodo, gastos: List<Gasto>): List<Gasto> =
        gastos.filter { it.fecha >= p.desde && it.fecha <= p.hasta && (p.tipo == "mes" || (it.medioId == p.medioId && it.pagador == "yo")) }

    fun resumenTarjeta(p: Periodo, gastos: List<Gasto>, movimientos: List<Movimiento>, hoy: String): ResumenTarjeta {
        val del = gastos(p, gastos)
        val r = Resumenes.resumenDe(clave(p), del, movimientos)
        val m = r.porMedio.find { it.medioId == p.medioId }
        val diasAlCierre = Fechas.diasEntre(hoy, p.hasta)
        return ResumenTarjeta(
            facturado = m?.total ?: 0,
            tuyo = m?.mio ?: 0,
            deOtros = (m?.otrosCobrado ?: 0) + (m?.otrosPendiente ?: 0),
            recuperado = m?.otrosCobrado ?: 0,
            pendiente = m?.otrosPendiente ?: 0,
            nGastos = del.size,
            diasAlCierre = diasAlCierre,
            cerrado = diasAlCierre < 0,
        )
    }
}
