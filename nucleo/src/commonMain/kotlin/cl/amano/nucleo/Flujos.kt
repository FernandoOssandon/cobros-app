// Lo que mueve el saldo de tus cuentas sin que lo anotes en Mi plata. Versión Kotlin de src/lib/flujos.ts.
// - un gasto con un medio ligado a una cuenta (débito, transferencia, efectivo) sale de esa cuenta;
// - un pago de una persona por transferencia entra (o sale, si le pagaste tú) por la cuenta elegida;
// - el pago de una tarjeta de crédito sale de la cuenta desde la que pagaste.
// Solo cuentan desde el primer registro de la cuenta: lo anterior ya está en ese saldo.
package cl.amano.nucleo

object Flujos {
    /**
     * Los movimientos de las cuentas más los que vienen de otras partes de la app.
     * `gastos`: los originales (una compra en cuotas con débito sale entera ese día).
     * `nombres`: id de persona → nombre, para escribir "Te pagó Camila".
     */
    fun deCuentas(
        cuentas: List<Cuenta>, movAhorro: List<MovAhorro>, gastos: List<Gasto>, medios: List<Medio>, movimientos: List<Movimiento>,
        pagosTarjeta: List<PagoTarjeta>, nombres: Map<String, String> = emptyMap(),
    ): List<MovAhorro> {
        val inicio = HashMap<String, MovAhorro>()
        for (m in movAhorro) {
            val prev = inicio[m.cuentaId]
            if (prev == null || Cuentas.porFecha.compare(m, prev) < 0) inicio[m.cuentaId] = m
        }
        // Gastos, pagos e ingresos van en pesos: no mueven cuentas en dólares o euros.
        val validas = cuentas.filter { it.tipo != TipoCuenta.DAP && it.moneda == null }.map { it.id }.toSet()
        val cuentaDeMedio = medios.filter { it.cuentaId != null && it.tipo != TipoMedio.CREDITO }.associate { it.id to it.cuentaId!! }
        val nombreMedio = medios.associate { it.id to it.nombre }
        val persona = nombres.mapValues { (_, n) -> n.split(' ')[0] }
        val out = movAhorro.toMutableList()
        fun agregar(x: MovAhorro) {
            val desde = inicio[x.cuentaId]
            if (x.cuentaId !in validas || desde == null || Cuentas.porFecha.compare(x, desde) < 0 || x.monto <= 0) return
            out += x
        }
        for (g in gastos) {
            if (g.pagador != "yo" || g.medioId == null) continue
            val cuentaId = cuentaDeMedio[g.medioId] ?: continue
            agregar(MovAhorro("g:${g.id}", cuentaId, TipoMovAhorro.RETIRO, g.total.toDouble(), g.fecha, g.creado, g.descripcion, OrigenMov("gasto", g.id)))
        }
        for (m in movimientos) {
            val cuentaId = m.cuentaId
            if (cuentaId.isNullOrEmpty() || (m.tipo != TipoMovimiento.PAGO && m.tipo != TipoMovimiento.ABONO)) continue
            val pago = m.tipo == TipoMovimiento.PAGO
            val quien = persona[m.personaId] ?: "alguien"
            agregar(
                MovAhorro(
                    "m:${m.id}", cuentaId, if (pago) TipoMovAhorro.DEPOSITO else TipoMovAhorro.RETIRO, m.monto.toDouble(), m.fecha, m.creado,
                    if (pago) "Te pagó $quien" else "Le pagaste a $quien", OrigenMov("pago", m.id, m.personaId),
                ),
            )
        }
        for (p in pagosTarjeta) {
            val cuentaId = p.cuentaId
            if (cuentaId.isNullOrEmpty()) continue
            agregar(MovAhorro("t:${p.id}", cuentaId, TipoMovAhorro.RETIRO, p.monto.toDouble(), p.fecha, p.creado, "Pago ${nombreMedio[p.medioId] ?: "tarjeta"}", OrigenMov("pagoTarjeta", p.id)))
        }
        return out
    }
}
