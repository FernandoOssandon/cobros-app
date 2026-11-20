// Recorre los vectores JSON (fechas, recurrencias, cuotas, saldos, resúmenes, períodos y presupuestos)
// y devuelve las diferencias con lo que dio TypeScript (vacío = todo igual).
package cl.amano.nucleo

internal val MEDIOS = listOf(
    Medio("visa", TipoMedio.CREDITO, 25, orden = 2, nombre = "Visa", cuentaId = "cv", cupo = 1_500_000),
    Medio(
        "cmr", TipoMedio.CREDITO, 14, orden = 1, nombre = "CMR Falabella", cuentaId = "cm", cupo = 800_000,
        usoCuadrado = UsoCuadrado(350_000, "2026-03-10", "2026-01-01T12:00:00Z"),
    ),
    Medio("fin", TipoMedio.CREDITO, 31, orden = 4, nombre = "Fin de mes"),
    Medio("vieja", TipoMedio.CREDITO, 10, archivado = true, orden = 5, nombre = "Archivada"),
    Medio("deb", TipoMedio.DEBITO, orden = 3, nombre = "Débito", cuentaId = "cv"),
    Medio("cash", TipoMedio.EFECTIVO, orden = 6, nombre = "Efectivo", cuentaId = "ce"),
    Medio("sin", TipoMedio.CREDITO, orden = 7, nombre = "Crédito sin día", cuentaId = "cv"),
)

internal fun frecuencia(o: Any?): Frecuencia {
    val m = o.obj()
    return Frecuencia(UnidadFrecuencia.deClave(m["unidad"].txt()), m["cada"]?.ent() ?: 1, m["dia"]?.ent())
}

internal class Diferencias {
    val lista = mutableListOf<String>()
    fun igual(que: String, esperado: Any?, dio: Any?) {
        if (esperado != dio && lista.size < 200) lista += "$que: esperaba $esperado, dio $dio"
    }
}

fun diferenciasFechas(): List<String> {
    val d = Diferencias()
    val v = json(VECTORES_FECHAS.single()).obj()
    for (x in v["sumarDias"].lista()) x.lista().let { d.igual("sumarDias(${it[0]}, ${it[1]})", it[2], Fechas.sumarDias(it[0].txt(), it[1].ent())) }
    for (x in v["diasEntre"].lista()) x.lista().let { d.igual("diasEntre(${it[0]}, ${it[1]})", it[2].largo(), Fechas.diasEntre(it[0].txt(), it[1].txt()).toLong()) }
    for (x in v["sumarMes"].lista()) x.lista().let { d.igual("sumarMes(${it[0]}, ${it[1]})", it[2], Fechas.sumarMes(it[0].txt(), it[1].ent())) }
    for (x in v["masMeses"].lista()) x.lista().let { d.igual("masMeses(${it[0]}, ${it[1]})", it[2], Fechas.masMeses(it[0].txt(), it[1].ent())) }
    for (x in v["lunes"].lista()) x.lista().let { d.igual("lunesDe(${it[0]})", it[1], Presupuestos.lunesDe(it[0].txt())) }
    for (x in v["ocurrencia"].lista()) x.obj().let {
        d.igual("ocurrencia($it)", it["r"], Recurrencias.ocurrencia(frecuencia(it["f"]), it["inicio"].txt(), it["n"].ent()))
    }
    for (x in v["ocurrencias"].lista()) x.obj().let {
        d.igual("ocurrenciasEntre($it)", it["r"], Recurrencias.entre(frecuencia(it["f"]), it["inicio"].txt(), it["despues"].txtONull(), it["hasta"].txt(), it["fin"].txtONull(), 50))
    }
    for (x in v["proximas"].lista()) x.obj().let {
        d.igual("proxima($it)", it["r"], Recurrencias.proxima(frecuencia(it["f"]), it["inicio"].txt(), it["despues"].txtONull(), it["fin"].txtONull()))
    }
    for (x in v["montoMensual"].lista()) x.obj().let { d.igual("montoMensual($it)", it["r"].largo(), Recurrencias.montoMensual(it["m"].largo(), frecuencia(it["f"]))) }
    for (x in v["periodoFacturacion"].lista()) x.lista().let {
        val (desde, hasta) = Resumenes.periodoFacturacion(it[0].txt(), it[1].ent())
        d.igual("periodoFacturacion(${it[0]}, ${it[1]})", it[2], mapOf("desde" to desde, "hasta" to hasta))
    }
    for (x in v["parteCuota"].lista()) x.lista().let { d.igual("parteCuota($it)", it[3].largo(), Cuotas.parte(it[0].largo(), it[1].ent(), it[2].ent())) }
    return d.lista
}

internal fun gasto(o: Any?): Gasto {
    val m = o.obj()
    return Gasto(
        id = m["id"].txt(), total = m["total"].largo(), fecha = m["fecha"].txt(), pagador = m["pagador"].txt(), miParte = m["miParte"].largo(),
        medioId = m["medioId"].txtONull(), categoriaId = m["categoriaId"].txtONull(),
        montos = m["montos"]?.obj()?.mapValues { (_, v) -> v.largo() }, cuotas = m["cuotas"]?.ent(),
        recurrenteId = m["recurrenteId"].txtONull(), creado = m["creado"].txt(), descripcion = (m["descripcion"] as String?) ?: "",
    )
}

internal fun movimiento(o: Any?): Movimiento {
    val m = o.obj()
    return Movimiento(
        m["id"].txt(), m["personaId"].txt(), TipoMovimiento.deClave(m["tipo"].txt()), m["monto"].largo(), m["fecha"].txt(), m["creado"].txt(),
        gastoId = m["gastoId"].txtONull(), cuentaId = m["cuentaId"] as String?,
    )
}

private fun presupuesto(o: Any?): Presupuesto {
    val m = o.obj()
    return Presupuesto(
        m["id"].txt(), PeriodoPresupuesto.deClave(m["periodo"].txt()), m["monto"].largo(), m["categoriaIds"]?.lista()?.map { it.txt() },
        m["categoriaId"].txtONull(), archivado = m["archivado"] as Boolean, orden = m["orden"].ent(),
    )
}

private fun jsonResumen(r: Resumen) = mapOf(
    "mes" to r.mes, "gastoReal" to r.gastoReal, "salio" to r.salio, "adelantado" to r.adelantado, "teDeben" to r.teDeben, "debes" to r.debes,
    "porMedio" to r.porMedio.map { listOf(it.medioId, it.total, it.mio, it.otrosCobrado, it.otrosPendiente) },
    "porCategoria" to r.porCategoria.map { listOf(it.categoriaId, it.monto) },
)

private fun jsonPeriodo(p: Periodo) = listOf(p.tipo, p.desde, p.hasta, p.mes, p.medioId, p.cierreMes, Periodos.clave(p))

internal fun micro(x: Double): Any = if (x.isInfinite()) "inf" else redondearJs(x * 1e6)

fun diferenciasDatos(): List<String> {
    val d = Diferencias()
    for ((nCaso, doc) in VECTORES_DATOS.withIndex()) {
        val v = json(doc).obj()
        val gastos = v["gastos"].lista().map(::gasto)
        val movimientos = v["movimientos"].lista().map(::movimiento)
        val presupuestos = v["presupuestos"].lista().map(::presupuesto)
        val e = v["esperado"].obj()
        val imp = Cuotas.imputar(gastos)
        d.igual("caso $nCaso imputados", e["imputados"], imp.map {
            listOf(it.id, it.fecha, it.total, it.miParte, it.montos, it.cuota?.let { c -> listOf(c.n.toLong(), c.de.toLong(), c.origenId, c.totalCompra, c.fechaCompra) })
        })
        for ((p, esperado) in e["personas"].obj()) {
            val movs = movimientos.filter { it.personaId == p }
            fun est(m: Map<String, EstadoMovimiento>) = m.map { (id, x) -> listOf(id, x.estado.clave, x.pendiente) }
            d.igual(
                "caso $nCaso persona $p", esperado,
                mapOf("saldo" to Saldos.saldo(movs), "cargado" to Saldos.cargado(movs), "pct" to Saldos.pctPagado(movs), "cargos" to est(Saldos.estadosCargos(movs)), "deudas" to est(Saldos.estadosDeudas(movs))),
            )
        }
        for (r in e["resumenes"].lista()) {
            val mes = r.obj()["mes"].txt()
            d.igual("caso $nCaso resumen $mes", r, jsonResumen(Resumenes.resumenMes(mes, imp, movimientos, MEDIOS)))
        }
        for (x in e["periodos"].lista()) {
            val c = x.lista()
            val hoy = c[0].txt()
            val m = c[1].txtONull()?.let { id -> MEDIOS.first { it.id == id } }
            val p = Periodos.en(hoy, m)
            d.igual(
                "caso $nCaso período $hoy ${c[1]}", c.subList(2, 7),
                listOf(jsonPeriodo(p), jsonPeriodo(Periodos.mover(p, -1, MEDIOS)), jsonPeriodo(Periodos.mover(p, 1, MEDIOS)), Periodos.esActual(p, hoy), Periodos.gastos(p, imp).map { it.id }),
            )
        }
        for (x in e["tarjetas"].lista()) {
            val c = x.lista()
            val hoy = c[0].txt()
            val m = MEDIOS.first { it.id == c[1] }
            val p = Periodos.mover(Periodos.en(hoy, m), c[2].ent(), MEDIOS)
            val t = Periodos.resumenTarjeta(p, imp, movimientos, hoy)
            d.igual("caso $nCaso tarjeta $hoy ${m.id} ${c[2]}", c[3], listOf(t.facturado, t.tuyo, t.deOtros, t.recuperado, t.pendiente, t.nGastos.toLong(), t.diasAlCierre.toLong(), t.cerrado))
        }
        for (x in e["categorias"].lista()) {
            val c = x.lista()
            d.igual("caso $nCaso categorías ${c[0]}", c[1], Presupuestos.categoriasDe(presupuestos.first { it.id == c[0] }))
        }
        for (x in e["avances"].lista()) {
            val c = x.lista()
            val hoy = c[0].txt()
            d.igual("caso $nCaso avances $hoy", c[1], Presupuestos.avances(presupuestos, imp, hoy).map {
                listOf(
                    it.presupuesto.id, it.desde, it.hasta, it.gastado, it.restante, micro(it.pct), it.diasTotales.toLong(), it.diasTranscurridos.toLong(),
                    it.diasRestantes.toLong(), it.porDia, it.proyeccion, it.excesoProyectado, it.estado.clave,
                )
            })
        }
        for (x in e["rangos"].lista()) {
            val c = x.lista()
            val (desde, hasta) = Presupuestos.rango(PeriodoPresupuesto.deClave(c[1].txt()), c[0].txt())
            d.igual("caso $nCaso rango ${c[0]} ${c[1]}", c[2], mapOf("desde" to desde, "hasta" to hasta))
        }
    }
    return d.lista
}
