// Mi plata: saldos estimados de las cuentas, depósitos a plazo y patrimonio. Versión Kotlin de src/lib/ahorro.ts.
//
// El saldo de una cuenta parte del último cuadre (el saldo real que anotaste), suma depósitos y resta retiros;
// entre cada evento crece con interés compuesto diario según la tasa.
package cl.amano.nucleo

import kotlin.math.pow

data class ResumenCuenta(
    val cuenta: Cuenta,
    /** En la moneda de la cuenta. */
    val saldo: Double,
    /** En pesos (convertido con el valor del día si la cuenta es en otra moneda; 0 si no se conoce). */
    val saldoPesos: Long,
    val valorMoneda: Double?,
    /** Rendimiento estimado desde el 1 del mes. */
    val ganadoMes: Double,
    /** Rendimiento desde el primer registro (o desde el inicio del depósito). */
    val ganadoTotal: Double,
    val ultimoCuadre: MovAhorro?,
    val diasDesdeCuadre: Int?,
    /** Solo depósitos a plazo. */
    val alVencer: Long? = null,
    val diasParaVencer: Int? = null,
)

data class Patrimonio(
    /** Remuneradas, inversiones y depósitos a plazo vigentes (por su capital). */
    val ahorros: Long,
    val vista: Long,
    val efectivo: Long,
    val teDeben: Long,
    val debes: Long,
    /** Lo usado de las tarjetas de crédito (estimado). */
    val tarjetas: Long,
    val activos: Long,
    val pasivos: Long,
    val total: Long,
    val nTeDeben: Int,
    val nDebes: Int,
    val tarjetasCredito: List<Medio>,
    val cuentas: List<ResumenCuenta>,
)

enum class TipoFila(val clave: String) { INICIAL("inicial"), DEPOSITO("deposito"), RETIRO("retiro"), AJUSTE("ajuste"), INTERES("interes") }

data class FilaMovimiento(
    /** Id del movimiento guardado (no lo tienen los intereses ni los que vienen de otra parte). */
    val id: String?,
    val fecha: String,
    val label: String,
    /** Con signo: + entra, − sale. */
    val monto: Double,
    val tipo: TipoFila,
    val origen: OrigenMov? = null,
)

data class PuntoHistorial(val fecha: String, val label: String, val saldo: Double)

object Cuentas {
    private val MESES_LARGOS = listOf("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre")
    private val MESES_CORTOS = listOf("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")

    /** Orden de los movimientos: por fecha y, dentro del día, por orden de registro. */
    val porFecha: Comparator<MovAhorro> = compareBy<MovAhorro> { it.fecha }.thenBy { it.creado }

    /** Al peso, o al centavo si la cuenta es en dólares o euros. */
    fun redondear(c: Cuenta, n: Double): Double = if (c.moneda != null) redondearJs(n * 100) / 100.0 else redondearJs(n).toDouble()

    /** Tasa diaria equivalente (compuesta). */
    fun tasaDiaria(c: Cuenta): Double {
        val t = (c.tasa ?: 0.0) / 100
        if (t <= 0) return 0.0
        return if (c.tasaMensual) (1 + t).pow(12.0 / 365) - 1 else (1 + t).pow(1.0 / 365) - 1
    }

    private fun crecer(monto: Double, r: Double, dias: Int) = if (dias > 0 && r > 0) monto * (1 + r).pow(dias) else monto

    /** Saldo al final del día `fecha`, sin redondear. `movs` ya ordenados. */
    private fun saldoExacto(c: Cuenta, movs: List<MovAhorro>, fecha: String): Double {
        val r = tasaDiaria(c)
        var s = 0.0
        var desde: String? = null
        for (m in movs) {
            if (m.fecha > fecha) break
            if (desde != null) s = crecer(s, r, Fechas.diasEntre(desde, m.fecha))
            when (m.tipo) {
                TipoMovAhorro.CUADRE -> s = m.monto
                TipoMovAhorro.DEPOSITO -> s += m.monto
                TipoMovAhorro.RETIRO -> s -= m.monto
            }
            desde = m.fecha
        }
        if (desde != null) s = crecer(s, r, Fechas.diasEntre(desde, fecha))
        return s
    }

    fun plazoDap(d: DatosDap) = maxOf(0, Fechas.diasEntre(d.inicio, d.vencimiento))

    /** Lo que recibes al vencer: el monto que informó el banco o el cálculo con la tasa a 30 días (interés simple). */
    fun alVencerDap(d: DatosDap): Long = d.montoFinal ?: redondearJs(d.monto * (1 + ((d.tasa30 / 100) * plazoDap(d)) / 30))

    /** Valor de un depósito en una fecha: el monto más el interés devengado hasta ese día (lineal). */
    fun valorDap(d: DatosDap, fecha: String): Double {
        if (fecha < d.inicio) return 0.0
        val plazo = plazoDap(d)
        if (plazo == 0 || fecha >= d.vencimiento) return alVencerDap(d).toDouble()
        val final = alVencerDap(d)
        return d.monto + ((final - d.monto).toDouble() * Fechas.diasEntre(d.inicio, fecha)) / plazo
    }

    /** Saldo de una cuenta en una fecha, redondeado. Un depósito ya cobrado vale 0. */
    fun saldo(c: Cuenta, movs: List<MovAhorro>, fecha: String): Double {
        if (c.tipo == TipoCuenta.DAP) return if (c.dap != null && c.dap.vigente) redondearJs(valorDap(c.dap, fecha)).toDouble() else 0.0
        return redondear(c, saldoExacto(c, movs.sortedWith(porFecha), fecha))
    }

    /** Cuánto cambió el saldo entre dos fechas sin contar tus depósitos ni retiros (incluye los ajustes al cuadrar). */
    fun rendimiento(c: Cuenta, movs: List<MovAhorro>, desde: String, hasta: String): Double {
        if (c.tipo == TipoCuenta.DAP) {
            val d = c.dap ?: return 0.0
            return redondearJs(valorDap(d, hasta) - valorDap(d, if (desde > d.inicio) desde else d.inicio)).toDouble()
        }
        val ord = movs.sortedWith(porFecha)
        val inicio = ord.firstOrNull()?.fecha
        if (inicio == null || hasta < inicio) return 0.0
        val base = if (desde < inicio) inicio else desde
        val aportes = ord.filter { it.fecha > base && it.fecha <= hasta }.fold(0.0) { s, m ->
            s + when (m.tipo) { TipoMovAhorro.DEPOSITO -> m.monto; TipoMovAhorro.RETIRO -> -m.monto; else -> 0.0 }
        }
        return redondear(c, saldoExacto(c, ord, hasta) - saldoExacto(c, ord, base) - aportes)
    }

    private fun finMesAnterior(fecha: String) = Fechas.sumarDias("${fecha.substring(0, 7)}-01", -1)

    /** `valores`: pesos por unidad de cada moneda ("USD" → 950.5). */
    fun resumen(c: Cuenta, todos: List<MovAhorro>, hoy: String, valores: Map<String, Double>? = null): ResumenCuenta {
        val movs = todos.filter { it.cuentaId == c.id }.sortedWith(porFecha)
        val ultimoCuadre = movs.lastOrNull { it.tipo == TipoMovAhorro.CUADRE && it.fecha <= hoy }
        val primera = if (c.tipo == TipoCuenta.DAP) c.dap?.inicio else movs.firstOrNull()?.fecha
        val saldo = saldo(c, movs, hoy)
        val valor = c.moneda?.let { valores?.get(it) }
        val esDap = c.tipo == TipoCuenta.DAP && c.dap != null
        return ResumenCuenta(
            cuenta = c,
            saldo = saldo,
            saldoPesos = if (c.moneda != null) (if (valor != null && valor != 0.0) redondearJs(saldo * valor) else 0L) else saldo.toLong(),
            valorMoneda = valor,
            ganadoMes = rendimiento(c, movs, finMesAnterior(hoy), hoy),
            ganadoTotal = if (primera != null) rendimiento(c, movs, primera, hoy) else 0.0,
            ultimoCuadre = ultimoCuadre,
            diasDesdeCuadre = ultimoCuadre?.let { Fechas.diasEntre(it.fecha, hoy) },
            alVencer = if (esDap) alVencerDap(c.dap!!) else null,
            diasParaVencer = if (esDap) Fechas.diasEntre(hoy, c.dap!!.vencimiento) else null,
        )
    }

    /** Saldo cada `paso` días (y el último día), para el gráfico. */
    fun serie(c: Cuenta, todos: List<MovAhorro>, desde: String, hasta: String, paso: Int = 1): List<Pair<String, Double>> {
        val movs = todos.filter { it.cuentaId == c.id }.sortedWith(porFecha)
        val out = mutableListOf<Pair<String, Double>>()
        var f = desde
        while (f <= hasta) {
            out += f to saldo(c, movs, f)
            f = Fechas.sumarDias(f, paso)
        }
        if (out.lastOrNull()?.first != hasta) out += hasta to saldo(c, movs, hasta)
        return out
    }

    /** Período de facturación abierto de una tarjeta en una fecha. */
    fun periodoAbierto(diaFacturacion: Int, hoy: String): Pair<String, String> {
        val mes = hoy.substring(0, 7)
        val p = Resumenes.periodoFacturacion(mes, diaFacturacion)
        return if (hoy <= p.second) p else Resumenes.periodoFacturacion(Fechas.sumarMes(mes, 1), diaFacturacion)
    }

    /**
     * Lo que tienes y lo que debes. `usadoTarjetas`: lo usado de las tarjetas cuadradas con el banco (ver [Tarjetas.usadas]);
     * las demás cuentan lo cargado en su período abierto.
     */
    fun patrimonio(
        cuentas: List<Cuenta>, movAhorro: List<MovAhorro>, personas: List<String>, movimientos: List<Movimiento>, gastos: List<Gasto>, medios: List<Medio>,
        hoy: String, usadoTarjetas: Map<String, Long>? = null, valores: Map<String, Double>? = null,
    ): Patrimonio {
        val res = cuentas.filter { !it.archivada }.map { resumen(it, movAhorro, hoy, valores) }
        fun suma(vararg ts: TipoCuenta) = res.filter { it.cuenta.tipo in ts }.sumOf { it.saldoPesos }
        val daps = res.filter { it.cuenta.tipo == TipoCuenta.DAP && it.cuenta.dap?.vigente == true }.sumOf { it.cuenta.dap?.monto ?: 0L }
        var teDeben = 0L
        var debes = 0L
        var nTeDeben = 0
        var nDebes = 0
        val porPersona = movimientos.groupBy { it.personaId }
        for (p in personas) {
            val s = Saldos.saldo(porPersona[p].orEmpty())
            if (s > 0) { teDeben += s; nTeDeben++ } else if (s < 0) { debes -= s; nDebes++ }
        }
        val credito = medios.filter { it.tipo == TipoMedio.CREDITO && !it.archivado }
        var tarjetas = 0L
        for (m in credito) {
            val usado = usadoTarjetas?.get(m.id)
            if (usado != null) {
                tarjetas += usado
                continue
            }
            val desde = if ((m.diaFacturacion ?: 0) != 0) periodoAbierto(m.diaFacturacion!!, hoy).first else "${hoy.substring(0, 7)}-01"
            tarjetas += gastos.filter { it.medioId == m.id && it.pagador == "yo" && it.fecha >= desde && it.fecha <= hoy }.sumOf { it.total }
        }
        val ahorros = suma(TipoCuenta.REMUNERADA, TipoCuenta.INVERSION) + daps
        val vista = suma(TipoCuenta.VISTA)
        val efectivo = suma(TipoCuenta.EFECTIVO)
        val activos = ahorros + vista + efectivo + teDeben
        val pasivos = debes + tarjetas
        return Patrimonio(ahorros, vista, efectivo, teDeben, debes, tarjetas, activos, pasivos, activos - pasivos, nTeDeben, nDebes, credito, res)
    }

    /**
     * Movimientos para el detalle, del más nuevo al más antiguo: saldo inicial, depósitos y retiros,
     * el ajuste de cada cuadre y los intereses estimados de cada mes cerrado.
     */
    fun movimientos(c: Cuenta, todos: List<MovAhorro>, hoy: String): List<FilaMovimiento> {
        val ord = todos.filter { it.cuentaId == c.id && it.fecha <= hoy }.sortedWith(porFecha)
        val filas = mutableListOf<FilaMovimiento>()
        ord.forEachIndexed { i, m ->
            val id = if (m.origen != null) null else m.id
            when {
                m.tipo == TipoMovAhorro.DEPOSITO -> filas += FilaMovimiento(id, m.fecha, m.nota.ifEmpty { "Depósito" }, m.monto, TipoFila.DEPOSITO, m.origen)
                m.tipo == TipoMovAhorro.RETIRO -> filas += FilaMovimiento(id, m.fecha, m.nota.ifEmpty { "Retiro" }, -m.monto, TipoFila.RETIRO, m.origen)
                i == 0 -> filas += FilaMovimiento(m.id, m.fecha, "Saldo inicial", m.monto, TipoFila.INICIAL)
                else -> {
                    val dif = redondear(c, m.monto - saldoExacto(c, ord.subList(0, i), m.fecha))
                    if (dif != 0.0) filas += FilaMovimiento(
                        m.id, m.fecha, if (dif > 0 && c.tipo == TipoCuenta.REMUNERADA) "Ajuste al cuadrar · intereses" else "Ajuste al cuadrar", dif, TipoFila.AJUSTE,
                    )
                }
            }
        }
        val r = tasaDiaria(c)
        if (r > 0 && ord.isNotEmpty()) {
            var mes = ord[0].fecha.substring(0, 7)
            while (true) {
                val siguiente = Fechas.sumarMes(mes, 1)
                val primero = "$siguiente-01"
                if (primero > hoy) break
                var interes = 0.0
                var f = "$mes-01"
                while (f < primero) {
                    if (f >= ord[0].fecha) interes += saldoExacto(c, ord, f) * r
                    f = Fechas.sumarDias(f, 1)
                }
                val monto = redondear(c, interes)
                if (monto != 0.0) filas += FilaMovimiento(null, primero, "Intereses de ${MESES_LARGOS[mes.substring(5, 7).toInt() - 1]}", monto, TipoFila.INTERES)
                mes = siguiente
            }
        }
        return filas.reversed().sortedByDescending { it.fecha }
    }

    /** Saldo al cierre de los últimos meses y hoy (desde que la cuenta tiene registros). */
    fun historial(c: Cuenta, todos: List<MovAhorro>, hoy: String, meses: Int = 5): List<PuntoHistorial> {
        val movs = todos.filter { it.cuentaId == c.id }.sortedWith(porFecha)
        val inicio = (if (c.tipo == TipoCuenta.DAP) c.dap?.inicio else movs.firstOrNull()?.fecha) ?: return emptyList()
        val puntos = mutableListOf<PuntoHistorial>()
        for (k in meses downTo 1) {
            val mes = Fechas.sumarMes(hoy.substring(0, 7), -k)
            val fecha = Fechas.ultimoDia(mes)
            if (fecha >= inicio) puntos += PuntoHistorial(fecha, MESES_CORTOS[mes.substring(5, 7).toInt() - 1], saldo(c, movs, fecha))
        }
        if (puntos.isEmpty()) puntos += PuntoHistorial(inicio, MESES_CORTOS[inicio.substring(5, 7).toInt() - 1], saldo(c, movs, inicio))
        puntos += PuntoHistorial(hoy, "hoy", saldo(c, movs, hoy))
        return puntos
    }

    /** Equivalente anual simple de una tasa a 30 días. */
    fun anualDesde30(tasa30: Double) = (tasa30 * 365) / 30
}
