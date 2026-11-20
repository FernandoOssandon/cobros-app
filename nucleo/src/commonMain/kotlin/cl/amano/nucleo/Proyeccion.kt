// ¿Cómo termino el mes? Tu plata hasta el próximo sueldo. Versión Kotlin de src/lib/proyeccion.ts.
//
// - El ciclo va de un sueldo al siguiente (sin sueldo fijo, el mes calendario).
// - Lo que tienes: el saldo de las cuentas que cuentan para el mes (por defecto vista y efectivo).
// - Las compras con tarjeta de crédito cuentan como ya gastadas; las cuotas futuras, solo en su mes.
// - Te quedan = lo que tienes + lo que entra − tarjetas − lo que viene. Dividido por los días que faltan: cuánto por día.
package cl.amano.nucleo

data class Ciclo(
    /** Primer día (el del último sueldo, o el 1 del mes). */
    val inicio: String,
    /** Día del próximo sueldo (o el 1 del mes siguiente): el ciclo termina el día anterior. */
    val hasta: String,
    val sueldo: Recurrente?,
    /** Días que quedan, contando hoy. */
    val dias: Int,
    /** Días que ya pasaron, contando hoy. */
    val transcurridos: Int,
)

/** Los datos que usa la proyección. `movCuentas` ya incluye los [Flujos]. */
data class FuentesProyeccion(
    val cuentas: List<Cuenta>,
    val movCuentas: List<MovAhorro>,
    val imputados: List<Gasto>,
    val movimientos: List<Movimiento>,
    val medios: List<Medio>,
    val recurrentes: List<Recurrente>,
    val pendientes: List<Pendiente>,
    val pagosTarjeta: List<PagoTarjeta>,
    val ingresos: List<Ingreso>,
)

data class CuentaProyeccion(val cuenta: Cuenta, val saldo: Long)

data class TarjetaProyeccion(
    val medio: Medio,
    /** Lo facturado en el último período cerrado que falta pagar. */
    val porPagar: Long,
    val cierre: String?,
    /** Lo cargado en el período abierto hasta hoy. */
    val abierto: Long,
    val desde: String,
    val total: Long,
)

enum class TipoViene(val clave: String) { RECURRENTE("recurrente"), CUOTA("cuota"), CONFIRMAR("confirmar"), INGRESO("ingreso") }

data class LoQueViene(
    val tipo: TipoViene,
    val fecha: String,
    val label: String,
    /** Negativo: sale · positivo: entra. */
    val monto: Long,
    val medioId: String? = null,
    val cuentaId: String? = null,
    /** Monto estimado (variable, en otra moneda o por confirmar). */
    val estimado: Boolean = false,
    val recurrenteId: String? = null,
)

data class AvisoCuenta(
    val cuenta: Cuenta,
    /** Lo que tendría la cuenta al llegar el sueldo (negativo). */
    val saldoFinal: Long,
    val falta: Long,
    /** Qué la deja corta (ej. "pagar la CMR Falabella"). */
    val motivo: String,
)

data class Proyeccion(
    val ciclo: Ciclo,
    val cuentas: List<CuentaProyeccion>,
    val tienes: Long,
    val tarjetas: List<TarjetaProyeccion>,
    val enTarjetas: Long,
    val viene: List<LoQueViene>,
    val entra: Long,
    val sale: Long,
    /** Lo que te queda para gastar hasta el sueldo. */
    val libre: Long,
    /** Por día (0 si no queda nada). */
    val porDia: Long,
    /** Lo que llevas gastando por día (sin recurrentes, cuotas de compras anteriores ni gastos grandes). */
    val ritmo: Long,
    val grandes: List<Gasto>,
    /** A este ritmo, con cuánto llegas al sueldo (negativo: te falta). */
    val aEsteRitmo: Long,
    val avisos: List<AvisoCuenta>,
    val sinCuentas: Boolean,
    /** Cuentas que podrían contar pero no cuentan (tus ahorros). */
    val fuera: List<CuentaProyeccion>,
    val enAhorros: Long,
)

data class ResumenCiclo(
    val ciclo: Ciclo,
    val ingresos: Long,
    val gastoReal: Long,
    val quedo: Long,
    val nGastos: Int,
    val sinCategoria: Int,
    val gastoAnterior: Long?,
    /** Si empezaste a anotar a mitad del ciclo: desde cuándo hay gastos. */
    val incompletoDesde: String?,
)

object Proyecciones {
    /** Un gasto es "grande" desde $100.000 y si es al menos el 15 % de lo gastado en el ciclo. */
    const val GRANDE_MIN = 100_000L
    private const val GRANDE_PCT = 0.15

    /** Días después del sueldo en que se ofrece cerrar el ciclo anterior. */
    const val DIAS_PARA_CERRAR = 10

    // ---------- El ciclo ----------

    /** El sueldo: el ingreso fijo mensual activo más grande. */
    fun sueldoPrincipal(recurrentes: List<Recurrente>): Recurrente? = recurrentes
        .filter { it.tipo == TipoRecurrente.INGRESO && it.activo && it.frecuencia.unidad == UnidadFrecuencia.MES }
        .sortedWith(compareByDescending<Recurrente> { it.monto }.thenBy { it.creado })
        .firstOrNull()

    private fun ciclo(inicio: String, hasta: String, hoy: String, sueldo: Recurrente? = null) =
        Ciclo(inicio, hasta, sueldo, maxOf(1, Fechas.diasEntre(hoy, hasta)), maxOf(1, Fechas.diasEntre(inicio, hoy) + 1))

    /** Desde cuándo contar un recurrente: lo ya generado no se vuelve a contar. */
    private fun desde(r: Recurrente, hoy: String) = maxOf(r.generadoHasta ?: "", Fechas.sumarDias(hoy, -1))

    fun cicloActual(recurrentes: List<Recurrente>, hoy: String): Ciclo {
        val s = sueldoPrincipal(recurrentes)
        val hasta = s?.let { Recurrencias.proxima(it.frecuencia, it.inicio, desde(it, hoy), it.fin) }
        if (s == null || hasta == null) {
            val mes = hoy.substring(0, 7)
            return ciclo("$mes-01", "${Fechas.sumarMes(mes, 1)}-01", hoy)
        }
        return ciclo(anteriorA(s, hasta), hasta, hoy, s)
    }

    /** La ocurrencia del sueldo anterior a `fecha` (un mes antes si no hay). Puede no ser una fecha real (ej. 31 de febrero), como en la PWA. */
    private fun anteriorA(s: Recurrente, fecha: String): String =
        Recurrencias.entre(s.frecuencia, s.inicio, Fechas.sumarDias(fecha, -100), Fechas.sumarDias(fecha, -1)).lastOrNull()
            ?: "${Fechas.sumarMes(fecha.substring(0, 7), -1)}-${fecha.substring(8, 10)}"

    fun cicloAnterior(recurrentes: List<Recurrente>, hoy: String): Ciclo {
        val actual = cicloActual(recurrentes, hoy)
        val fin = Fechas.sumarDias(actual.inicio, -1)
        val s = actual.sueldo ?: return ciclo("${fin.substring(0, 7)}-01", actual.inicio, fin)
        return ciclo(anteriorA(s, actual.inicio), actual.inicio, fin, s)
    }

    // ---------- Cuentas que cuentan ----------

    /** En pesos, sin depósitos a plazo ni archivadas. */
    fun puedeContar(c: Cuenta) = !c.archivada && c.moneda == null && c.tipo != TipoCuenta.DAP

    fun cuentaParaElMes(c: Cuenta) = puedeContar(c) && (c.paraElMes ?: (c.tipo == TipoCuenta.VISTA || c.tipo == TipoCuenta.EFECTIVO))

    // ---------- La proyección ----------

    private fun tarjeta(m: Medio, f: FuentesProyeccion, hoy: String): TarjetaProyeccion {
        fun suma(desde: String, hasta: String) = f.imputados.filter { it.medioId == m.id && it.pagador == "yo" && it.fecha >= desde && it.fecha <= hasta }.sumOf { it.total }
        if (!Periodos.tienePeriodo(m)) {
            val desde = "${hoy.substring(0, 7)}-01"
            val abierto = suma(desde, hoy)
            return TarjetaProyeccion(m, 0, null, abierto, desde, abierto)
        }
        val actual = Periodos.en(hoy, m)
        val cierreMes = if (actual.tipo == "tarjeta") actual.cierreMes!! else hoy.substring(0, 7)
        val cerrado = Periodos.tarjeta(m, Fechas.sumarMes(cierreMes, -1))
        val facturado = suma(cerrado.desde, cerrado.hasta)
        // Si se pagó más que lo facturado, el resto no se descuenta del período abierto (la proyección peca de prudente).
        val pagado = f.pagosTarjeta.filter { it.medioId == m.id && it.fecha > cerrado.hasta && it.fecha <= hoy }.sumOf { it.monto }
        val porPagar = maxOf(0L, facturado - pagado)
        val abierto = suma(actual.desde, hoy)
        return TarjetaProyeccion(m, porPagar, cerrado.hasta, abierto, actual.desde, porPagar + abierto)
    }

    fun proyectar(f: FuentesProyeccion, hoy: String): Proyeccion {
        val c = cicloActual(f.recurrentes, hoy)
        val ultimo = Fechas.sumarDias(c.hasta, -1)
        fun conSaldo(cuenta: Cuenta) = CuentaProyeccion(cuenta, Cuentas.resumen(cuenta, f.movCuentas, hoy).saldo.toLong())
        val ordenadas = f.cuentas.filter(::puedeContar).sortedBy { it.orden }
        val cuentas = ordenadas.filter(::cuentaParaElMes).map(::conSaldo)
        val fuera = ordenadas.filterNot(::cuentaParaElMes).map(::conSaldo)
        val cuentaId = cuentas.map { it.cuenta.id }.toSet()
        val tienes = cuentas.sumOf { it.saldo }

        val tarjetas = f.medios
            .filter { it.tipo == TipoMedio.CREDITO && !it.archivado }
            .sortedBy { it.orden }
            .map { tarjeta(it, f, hoy) }
            .filter { it.total > 0 }
        val enTarjetas = tarjetas.sumOf { it.total }

        val viene = mutableListOf<LoQueViene>()
        val porId = f.recurrentes.associateBy { it.id }
        // Un ingreso solo cuenta si llega a una cuenta que cuenta para el mes (o no se sabe a cuál).
        fun llegaAqui(r: Recurrente) = r.cuentaId.isNullOrEmpty() || r.cuentaId in cuentaId
        for (r in f.recurrentes) {
            if (!r.activo || r.tipo == TipoRecurrente.COBRO || r.id == c.sueldo?.id) continue
            for (fecha in Recurrencias.entre(r.frecuencia, r.inicio, desde(r, hoy), ultimo, r.fin)) {
                if (r.tipo == TipoRecurrente.INGRESO) {
                    if (!llegaAqui(r)) continue
                    viene += LoQueViene(TipoViene.INGRESO, fecha, r.nombre, r.monto, cuentaId = r.cuentaId, estimado = r.variable, recurrenteId = r.id)
                } else {
                    viene += LoQueViene(TipoViene.RECURRENTE, fecha, r.nombre, -r.monto, medioId = r.medioId, estimado = r.variable || !r.moneda.isNullOrEmpty(), recurrenteId = r.id)
                }
            }
        }
        for (p in f.pendientes) {
            val r = porId[p.recurrenteId] ?: continue
            if (r.tipo == TipoRecurrente.COBRO) continue
            if (r.tipo == TipoRecurrente.INGRESO) {
                if (!llegaAqui(r)) continue
                viene += LoQueViene(TipoViene.CONFIRMAR, p.fecha, r.nombre, r.monto, cuentaId = r.cuentaId, estimado = true, recurrenteId = r.id)
            } else {
                viene += LoQueViene(TipoViene.CONFIRMAR, p.fecha, r.nombre, -r.monto, medioId = r.medioId, estimado = true, recurrenteId = r.id)
            }
        }
        val credito = f.medios.filter { it.tipo == TipoMedio.CREDITO && !it.archivado }.map { it.id }.toSet()
        for (g in f.imputados) {
            if (g.pagador != "yo" || g.medioId.isNullOrEmpty() || g.medioId !in credito || g.fecha <= hoy || g.fecha > ultimo) continue
            val label = g.cuota?.let { "${g.descripcion} · cuota ${it.n}/${it.de}" } ?: g.descripcion
            viene += LoQueViene(TipoViene.CUOTA, g.fecha, label, -g.total, medioId = g.medioId)
        }
        val vieneOrdenado = viene.sortedWith(compareBy<LoQueViene> { it.fecha }.thenBy { it.monto })
        val entra = vieneOrdenado.filter { it.monto > 0 }.sumOf { it.monto }
        val sale = -vieneOrdenado.filter { it.monto < 0 }.sumOf { it.monto }
        val libre = tienes + entra - enTarjetas - sale
        val porDia = if (libre > 0) libre.floorDiv(c.dias.toLong()) else 0L

        // Ritmo: lo que pagaste en el ciclo, sin recurrentes, cuotas de compras de antes ni gastos grandes.
        val delCiclo = f.imputados.filter {
            it.pagador == "yo" && it.recurrenteId.isNullOrEmpty() && it.fecha >= c.inicio && it.fecha <= hoy && (it.cuota == null || it.cuota.n == 1)
        }
        val totalCiclo = delCiclo.sumOf { it.total }
        val grandes = delCiclo.filter { it.total >= GRANDE_MIN && it.total >= totalCiclo * GRANDE_PCT }.sortedByDescending { it.total }
        val variable = totalCiclo - grandes.sumOf { it.total }
        val ritmo = redondearJs(variable.toDouble() / c.transcurridos)
        // Hoy ya está en lo gastado: a este ritmo se gastan los días que quedan después de hoy.
        val aEsteRitmo = libre - ritmo * maxOf(0, c.dias - 1)

        return Proyeccion(
            ciclo = c, cuentas = cuentas, tienes = tienes, tarjetas = tarjetas, enTarjetas = enTarjetas, viene = vieneOrdenado, entra = entra, sale = sale,
            libre = libre, porDia = porDia, ritmo = ritmo, grandes = grandes, aEsteRitmo = aEsteRitmo,
            avisos = avisos(f, cuentas, tarjetas, vieneOrdenado), sinCuentas = cuentas.isEmpty(), fuera = fuera, enAhorros = fuera.sumOf { maxOf(0L, it.saldo) },
        )
    }

    /** Cuentas que no alcanzan antes del sueldo: su saldo, más lo que llega, menos lo que se paga desde ella. */
    private fun avisos(f: FuentesProyeccion, cuentas: List<CuentaProyeccion>, tarjetas: List<TarjetaProyeccion>, viene: List<LoQueViene>): List<AvisoCuenta> {
        val cuentaDeMedio = f.medios.filter { !it.cuentaId.isNullOrEmpty() && it.tipo != TipoMedio.CREDITO }.associate { it.id to it.cuentaId!! }
        val out = mutableListOf<AvisoCuenta>()
        for ((cuenta, saldo) in cuentas) {
            val entra = viene.filter { it.monto > 0 && it.cuentaId == cuenta.id }.sumOf { it.monto }
            val recurrentes = viene.filter { it.monto < 0 && !it.medioId.isNullOrEmpty() && cuentaDeMedio[it.medioId] == cuenta.id }
            val deTarjetas = tarjetas.filter { it.porPagar > 0 && it.medio.cuentaId == cuenta.id }
            val final = saldo + entra + recurrentes.sumOf { it.monto } - deTarjetas.sumOf { it.porPagar }
            if (final >= 0) continue
            val motivos = deTarjetas.map { "pagar la ${it.medio.nombre}" } +
                (if (recurrentes.isEmpty()) emptyList() else listOf(if (recurrentes.size == 1) recurrentes[0].label else "${recurrentes.size} recurrentes"))
            out += AvisoCuenta(cuenta, final, -final, if (motivos.isEmpty()) "lo que tiene anotado" else juntar(motivos))
        }
        return out
    }

    private fun juntar(xs: List<String>) = if (xs.size <= 1) xs.firstOrNull() ?: "" else "${xs.dropLast(1).joinToString(", ")} y ${xs.last()}"

    // ---------- El cierre del ciclo ----------

    fun resumenCiclo(c: Ciclo, imputados: List<Gasto>, movimientos: List<Movimiento>, ingresos: List<Ingreso>): ResumenCiclo {
        val ultimo = Fechas.sumarDias(c.hasta, -1)
        val del = imputados.filter { it.fecha >= c.inicio && it.fecha <= ultimo }
        val r = Resumenes.resumenDe(c.inicio, del, movimientos)
        val totalIngresos = ingresos.filter { it.fecha >= c.inicio && it.fecha <= ultimo }.sumOf { it.monto }
        // Ciclo anterior: solo si hay gastos desde su inicio (si no, la comparación engaña).
        val ant = c.sueldo?.let { anteriorA(it, c.inicio) } ?: "${Fechas.sumarMes(c.inicio.substring(0, 7), -1)}-01"
        val primero = imputados.fold("9999") { m, g -> if (g.fecha < m) g.fecha else m }
        val delAnt = imputados.filter { it.fecha >= ant && it.fecha < c.inicio }
        val primeraCuota = { g: Gasto -> g.cuota == null || g.cuota.n == 1 }
        return ResumenCiclo(
            ciclo = c,
            ingresos = totalIngresos,
            gastoReal = r.gastoReal,
            quedo = totalIngresos - r.gastoReal,
            nGastos = del.count(primeraCuota),
            sinCategoria = del.count { it.categoriaId.isNullOrEmpty() && primeraCuota(it) },
            gastoAnterior = if (primero <= ant && delAnt.isNotEmpty()) Resumenes.resumenDe(ant, delAnt, movimientos).gastoReal else null,
            incompletoDesde = if (primero > c.inicio && primero <= ultimo) primero else null,
        )
    }

    /** ¿Toca cerrar el ciclo anterior? Recién llegó el sueldo, no se ha cerrado y hay gastos desde su comienzo. */
    fun tocaCierre(recurrentes: List<Recurrente>, fechasGastos: List<String>, ultimoCierre: String?, hoy: String): Ciclo? {
        val actual = cicloActual(recurrentes, hoy)
        if (Fechas.diasEntre(actual.inicio, hoy) > DIAS_PARA_CERRAR) return null
        val ant = cicloAnterior(recurrentes, hoy)
        if (!ultimoCierre.isNullOrEmpty() && ultimoCierre >= ant.inicio) return null
        val primero = fechasGastos.fold("9999") { m, f -> if (f < m) f else m }
        if (primero > Fechas.sumarDias(ant.inicio, 7)) return null
        return ant
    }
}
