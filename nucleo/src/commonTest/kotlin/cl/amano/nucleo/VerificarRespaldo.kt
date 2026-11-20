// Lee respaldos completos (como los exporta la PWA) y compara el Tablero con lo que calcula TypeScript.
package cl.amano.nucleo

private fun cicloJson(c: Ciclo) = listOf(c.inicio, c.hasta, c.sueldo?.id, c.dias.toLong(), c.transcurridos.toLong())

fun diferenciasRespaldo(): List<String> {
    val d = Diferencias()
    for ((n, doc) in VECTORES_RESPALDO.withIndex()) {
        val v = json(doc).obj()
        val e = v["esperado"].obj()
        val r = Respaldos.leer(v["texto"].txt())
        val t = Tableros.calcular(r, v["hoy"].txt())
        val caso = "respaldo $n"
        val res = t.resumen
        d.igual("$caso resumen", e["resumen"], mapOf(
            "mes" to res.mes, "gastoReal" to res.gastoReal, "salio" to res.salio, "adelantado" to res.adelantado, "teDeben" to res.teDeben, "debes" to res.debes,
            "porMedio" to res.porMedio.map { listOf(it.medioId, it.total, it.mio, it.otrosCobrado, it.otrosPendiente) },
            "porCategoria" to res.porCategoria.map { listOf(it.categoriaId, it.monto) },
        ))
        val p = t.proyeccion
        d.igual("$caso proyección", e["proyeccion"], listOf(
            cicloJson(p.ciclo), p.tienes, p.enTarjetas, p.entra, p.sale, p.libre, p.porDia, p.ritmo, p.aEsteRitmo, p.viene.size.toLong(), p.avisos.map { it.motivo },
        ))
        val pat = t.patrimonio
        d.igual("$caso patrimonio", e["patrimonio"], listOf(pat.ahorros, pat.vista, pat.efectivo, pat.teDeben, pat.debes, pat.tarjetas, pat.total))
        d.igual("$caso ingresos", e["ingresos"], listOf(t.ingresos.total, t.ingresos.fijos.map { listOf(it.recurrente.id, it.estado.clave) }, t.ingresos.sueltos.map { it.id }))
        d.igual("$caso presupuestos", e["presupuestos"], t.presupuestos.map { listOf(it.presupuesto.id, it.gastado, it.estado.clave) })
        d.igual("$caso tarjetas", e["tarjetas"], t.tarjetas.map { (m, u) -> listOf(m.id, u.usado) })
        d.igual("$caso personas", e["personas"], t.personas.map { listOf(it.persona.id, it.saldo) })
        d.igual("$caso por confirmar", e["porConfirmar"].largo(), t.porConfirmar.toLong())
        d.igual("$caso cierre", e["cierre"], t.cierre?.let(::cicloJson))
    }
    return d.lista
}
