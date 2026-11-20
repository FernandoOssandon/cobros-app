// Recorre los vectores de Mi plata (cuentas, flujos, tarjetas, ingresos, proyección y cierre del ciclo)
// y devuelve las diferencias con lo que dio TypeScript (vacío = todo igual).
package cl.amano.nucleo

private val NOMBRES = mapOf("p1" to "Camila Rojas", "p2" to "Diego", "p3" to "Ana María Pérez", "p4" to "Tomás")
private val VALORES = mapOf("USD" to 950.37)
private val PERSONAS = listOf("p1", "p2", "p3", "p4")

private fun Any?.dbl() = (this as Number).toDouble()
private fun Any?.dblONull() = (this as Number?)?.toDouble()
private fun Int.l() = toLong()
private fun Int?.l() = this?.toLong()

private fun cuenta(o: Any?): Cuenta {
    val m = o.obj()
    val dap = m["dap"]?.lista()?.let { DatosDap(it[0].largo(), it[1].dbl(), it[2].txt(), it[3].txt(), (it[4] as Number?)?.toLong(), it[5] as Boolean) }
    return Cuenta(
        id = m["id"].txt(), tipo = TipoCuenta.deClave(m["tipo"].txt()), nombre = m["nombre"].txt(), tasa = m["tasa"].dblONull(), tasaMensual = m["mensual"] as Boolean,
        moneda = m["moneda"].txtONull(), dap = dap, paraElMes = m["paraElMes"] as Boolean?, archivada = m["archivada"] as Boolean, orden = m["orden"].ent(),
    )
}

private fun recurrente(o: Any?): Recurrente {
    val m = o.obj()
    return Recurrente(
        id = m["id"].txt(), tipo = TipoRecurrente.deClave(m["tipo"].txt()), monto = m["monto"].largo(), frecuencia = frecuencia(m["f"]), inicio = m["inicio"].txt(),
        fin = m["fin"].txtONull(), nombre = m["id"].txt(), variable = m["variable"] as Boolean, medioId = m["medioId"].txtONull(), cuentaId = m["cuentaId"].txtONull(),
        moneda = m["moneda"].txtONull(), generadoHasta = m["generadoHasta"].txtONull(), activo = m["activo"] as Boolean, creado = m["creado"].txt(),
    )
}

private fun jsonCiclo(c: Ciclo) = listOf(c.inicio, c.hasta, c.sueldo?.id, c.dias.l(), c.transcurridos.l())

fun diferenciasPlata(): List<String> {
    val d = Diferencias()
    for ((nCaso, doc) in VECTORES_PLATA.withIndex()) {
        val v = json(doc).obj()
        val ent = v["entrada"].obj()
        val e = v["esperado"].obj()
        val gastos = ent["gastos"].lista().map(::gasto)
        val movimientos = ent["movimientos"].lista().map(::movimiento)
        val cuentas = ent["cuentas"].lista().map(::cuenta)
        val movAhorro = ent["movAhorro"].lista().map {
            val x = it.lista()
            MovAhorro(x[0].txt(), x[1].txt(), TipoMovAhorro.deClave(x[2].txt()), x[3].dbl(), x[4].txt(), x[5].txt(), x[6].txt())
        }
        val pagos = ent["pagosTarjeta"].lista().map { val x = it.lista(); PagoTarjeta(x[0].txt(), x[1].txt(), x[2].largo(), x[3].txt(), x[4].txtONull(), x[5].txt()) }
        val recurrentes = ent["recurrentes"].lista().map(::recurrente)
        val pendientes = ent["pendientes"].lista().map { val x = it.lista(); Pendiente(x[0].txt(), x[1].txt(), x[2].txt()) }
        val ingresos = ent["ingresos"].lista().map { val x = it.lista(); Ingreso(x[0].txt(), x[1].largo(), x[2].txt(), x[3].txt(), x[4].txtONull(), x[5].txtONull(), x[6].txt()) }
        val imp = Cuotas.imputar(gastos)
        val movCuentas = Flujos.deCuentas(cuentas, movAhorro, gastos, MEDIOS, movimientos, pagos, NOMBRES)
        val fuentes = FuentesProyeccion(cuentas, movCuentas, imp, movimientos, MEDIOS, recurrentes, pendientes, pagos, ingresos)
        val caso = "caso $nCaso"

        d.igual("$caso flujos", e["flujos"], movCuentas.map {
            listOf(it.id, it.cuentaId, it.tipo.clave, micro(it.monto), it.fecha, it.nota, it.origen?.let { o -> listOf(o.tipo, o.id, o.personaId) })
        })
        d.igual("$caso dap", e["dap"], cuentas.filter { it.dap != null }.map { listOf(it.id, Cuentas.alVencerDap(it.dap!!), micro(Cuentas.anualDesde30(it.dap.tasa30))) })
        for (x in e["detalle"].lista()) {
            val c = x.lista()
            val cta = cuentas.first { it.id == c[0] }
            d.igual("$caso movimientos ${cta.id}", c[1], Cuentas.movimientos(cta, movCuentas, "2026-11-25").map { listOf(it.id, it.fecha, it.label, micro(it.monto), it.tipo.clave, it.origen?.id) })
            d.igual("$caso historial ${cta.id}", c[2], Cuentas.historial(cta, movCuentas, "2026-11-25").map { listOf(it.fecha, it.label, micro(it.saldo)) })
            d.igual("$caso serie ${cta.id}", c[3], Cuentas.serie(cta, movCuentas, "2026-09-01", "2026-11-25", 9).map { listOf(it.first, micro(it.second)) })
        }
        for (x in e["ingresos"].lista()) {
            val c = x.lista()
            val r = Ingresos.delMes(c[0].txt(), ingresos, recurrentes, pendientes, c[1].txt())
            d.igual(
                "$caso ingresos ${c[0]} ${c[1]}", c.subList(2, 5),
                listOf(r.total, r.fijos.map { listOf(it.recurrente.id, it.estado.clave, it.fecha, it.monto, it.pendienteId) }, r.sueltos.map { it.id }),
            )
        }
        for (x in e["hoys"].lista()) {
            val h = x.obj()
            val hoy = h["hoy"].txt()
            val donde = "$caso $hoy"
            d.igual("$donde cuentas", h["cuentas"], cuentas.map {
                val r = Cuentas.resumen(it, movCuentas, hoy, VALORES)
                listOf(it.id, micro(r.saldo), r.saldoPesos, micro(r.ganadoMes), micro(r.ganadoTotal), r.ultimoCuadre?.id, r.diasDesdeCuadre.l(), r.alVencer, r.diasParaVencer.l())
            })
            val usadas = Tarjetas.usadas(MEDIOS, gastos, pagos, hoy)
            d.igual("$donde usadas", h["usadas"], usadas.map { (k, u) -> listOf(k, u) })
            val p = Cuentas.patrimonio(cuentas, movCuentas, PERSONAS, movimientos, imp, MEDIOS, hoy, usadas, VALORES)
            d.igual(
                "$donde patrimonio", h["patrimonio"],
                listOf(p.ahorros, p.vista, p.efectivo, p.teDeben, p.debes, p.tarjetas, p.activos, p.pasivos, p.total, p.nTeDeben.l(), p.nDebes.l(), p.tarjetasCredito.map { it.id }),
            )
            d.igual("$donde tarjetas", h["tarjetas"], MEDIOS.filter { it.tipo == TipoMedio.CREDITO }.map { m ->
                val u = Tarjetas.uso(m, gastos, pagos, hoy)
                val pp = Tarjetas.porPagar(m, imp, movimientos, pagos, hoy)
                listOf(m.id, u.usado, u.cupo, u.disponible, u.pct?.let(::micro), u.cuadrado, u.pagado, pp?.let { listOf(it.facturado, it.pagado, it.queda, it.cierre) })
            })
            val pr = Proyecciones.proyectar(fuentes, hoy)
            d.igual("$donde proyección", h["proyeccion"], mapOf(
                "ciclo" to jsonCiclo(pr.ciclo),
                "cuentas" to pr.cuentas.map { listOf(it.cuenta.id, it.saldo) },
                "tienes" to pr.tienes,
                "tarjetas" to pr.tarjetas.map { listOf(it.medio.id, it.porPagar, it.cierre, it.abierto, it.desde, it.total) },
                "enTarjetas" to pr.enTarjetas,
                "viene" to pr.viene.map { listOf(it.tipo.clave, it.fecha, it.label, it.monto, it.medioId, it.cuentaId, it.estimado, it.recurrenteId) },
                "numeros" to listOf(pr.entra, pr.sale, pr.libre, pr.porDia, pr.ritmo, pr.aEsteRitmo, pr.sinCuentas, pr.enAhorros),
                "grandes" to pr.grandes.map { it.id },
                "avisos" to pr.avisos.map { listOf(it.cuenta.id, it.saldoFinal, it.falta, it.motivo) },
                "fuera" to pr.fuera.map { listOf(it.cuenta.id, it.saldo) },
            ))
            val ant = Proyecciones.cicloAnterior(recurrentes, hoy)
            d.igual("$donde ciclo anterior", h["cicloAnterior"], jsonCiclo(ant))
            d.igual("$donde resúmenes de ciclo", h["resumenes"], listOf(Proyecciones.cicloActual(recurrentes, hoy), ant).map {
                val r = Proyecciones.resumenCiclo(it, imp, movimientos, ingresos)
                listOf(jsonCiclo(r.ciclo), r.ingresos, r.gastoReal, r.quedo, r.nGastos.l(), r.sinCategoria.l(), r.gastoAnterior, r.incompletoDesde)
            })
            d.igual("$donde cierre", h["cierre"], listOf(null, "2026-01-01", "2026-10-30").map { u ->
                Proyecciones.tocaCierre(recurrentes, gastos.map { it.fecha }, u, hoy)?.let(::jsonCiclo)
            })
        }
    }
    return d.lista
}
