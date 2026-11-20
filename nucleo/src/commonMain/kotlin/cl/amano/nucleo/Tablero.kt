// Todo lo que muestra el Resumen de un día, calculado de una vez a partir de los datos (como `useDatos` + Resumen en la PWA).
package cl.amano.nucleo

data class SaldoPersona(val persona: Persona, val saldo: Long)

data class Tablero(
    val hoy: String,
    /** YYYY-MM */
    val mes: String,
    /** Gastos imputados (las cuotas repartidas en sus meses). */
    val imputados: List<Gasto>,
    /** Movimientos de las cuentas, con los que vienen de gastos, pagos y pagos de tarjetas. */
    val movCuentas: List<MovAhorro>,
    val resumen: Resumen,
    val proyeccion: Proyeccion,
    val patrimonio: Patrimonio,
    val ingresos: IngresosMes,
    val presupuestos: List<AvancePresupuesto>,
    /** Tarjetas de crédito activas con su uso (orden de la app). */
    val tarjetas: List<Pair<Medio, UsoTarjeta>>,
    /** Saldos con cada persona (sin los en cero), de mayor a menor. */
    val personas: List<SaldoPersona>,
    val porConfirmar: Int,
    /** Ciclo anterior por cerrar, si toca. */
    val cierre: Ciclo?,
)

object Tableros {
    fun calcular(r: Respaldo, hoy: String): Tablero {
        val imp = Cuotas.imputar(r.gastos)
        val movCuentas = Flujos.deCuentas(r.cuentas, r.movAhorro, r.gastos, r.medios, r.movimientos, r.pagosTarjeta, r.personas.associate { it.id to it.nombre })
        val mes = hoy.substring(0, 7)
        val usadas = Tarjetas.usadas(r.medios, r.gastos, r.pagosTarjeta, hoy)
        val porPersona = r.movimientos.groupBy { it.personaId }
        return Tablero(
            hoy = hoy,
            mes = mes,
            imputados = imp,
            movCuentas = movCuentas,
            resumen = Resumenes.resumenMes(mes, imp, r.movimientos, r.medios),
            proyeccion = Proyecciones.proyectar(
                FuentesProyeccion(r.cuentas, movCuentas, imp, r.movimientos, r.medios, r.recurrentes, r.pendientes, r.pagosTarjeta, r.ingresos), hoy,
            ),
            patrimonio = Cuentas.patrimonio(r.cuentas, movCuentas, r.personas.map { it.id }, r.movimientos, imp, r.medios, hoy, usadas, r.valores),
            ingresos = Ingresos.delMes(mes, r.ingresos, r.recurrentes, r.pendientes, hoy),
            presupuestos = Presupuestos.avances(r.presupuestos, imp, hoy),
            tarjetas = r.medios.filter { it.tipo == TipoMedio.CREDITO && !it.archivado }.sortedBy { it.orden }.map { it to Tarjetas.uso(it, r.gastos, r.pagosTarjeta, hoy) },
            personas = r.personas.map { SaldoPersona(it, Saldos.saldo(porPersona[it.id].orEmpty())) }.filter { it.saldo != 0L }.sortedByDescending { it.saldo },
            porConfirmar = r.pendientes.count { p -> p.tipo == "confirmar" && r.recurrentes.any { it.id == p.recurrenteId } },
            cierre = Proyecciones.tocaCierre(r.recurrentes, r.gastos.map { it.fecha }, r.ultimoCierre, hoy),
        )
    }
}
