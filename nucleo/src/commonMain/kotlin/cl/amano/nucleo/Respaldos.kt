// Leer el respaldo de la PWA (el JSON de "Exportar" o de Drive, formatos v2 a v9) y llevarlo al modelo del núcleo.
// Solo se toma lo que usan los cálculos; las fotos, los cobros detectados, las cartolas y el SII se saltan.
package cl.amano.nucleo

class RespaldoInvalido(mensaje: String) : Exception(mensaje)

data class Respaldo(
    val version: Int,
    /** Fecha y hora en que se exportó (ISO). */
    val exportado: String,
    val personas: List<Persona>,
    val categorias: List<Categoria>,
    val gastos: List<Gasto>,
    val movimientos: List<Movimiento>,
    val medios: List<Medio>,
    val recurrentes: List<Recurrente>,
    val pendientes: List<Pendiente>,
    val cuentas: List<Cuenta>,
    val movAhorro: List<MovAhorro>,
    val ingresos: List<Ingreso>,
    val presupuestos: List<Presupuesto>,
    val pagosTarjeta: List<PagoTarjeta>,
    /** Pesos por unidad de cada moneda, del último valor que guardó la app ("USD" → 950,37). */
    val valores: Map<String, Double>,
    /** Último ciclo cerrado (inicio del ciclo). */
    val ultimoCierre: String?,
)

object Respaldos {
    private val TIPOS_MOV = setOf("cargo", "pago", "deuda", "abono")

    /** Lee el texto del archivo. Lanza [RespaldoInvalido] con un mensaje para mostrar si no sirve. */
    fun leer(texto: String): Respaldo {
        val raiz = try {
            json(texto.trimStart('﻿'))
        } catch (e: Exception) {
            throw RespaldoInvalido("El archivo no es un respaldo de a mano")
        }
        val r = raiz as? Map<*, *> ?: throw RespaldoInvalido("El archivo no es un respaldo de a mano")
        val version = (r["version"] as? Number)?.toInt()
        if (r["app"] != "me-debes" || version == null || version !in 2..9) throw RespaldoInvalido("El archivo no es un respaldo de a mano")

        fun lista(k: String): List<Map<*, *>> = when (val x = r[k]) {
            null -> emptyList()
            is List<*> -> x.map { it as? Map<*, *> ?: throw RespaldoInvalido("El respaldo está incompleto") }
            else -> throw RespaldoInvalido("El respaldo está incompleto")
        }
        val v2 = version == 2
        for (k in if (v2) listOf("personas", "cargos", "movimientos") else listOf("personas", "gastos", "movimientos", "cobros")) {
            if (r[k] !is List<*>) throw RespaldoInvalido("El respaldo está incompleto")
        }

        val movimientos = lista("movimientos").map { m ->
            val tipo = m["tipo"] as? String
            val monto = m["monto"] as? Number
            val personaId = m["personaId"] as? String
            if (monto == null || personaId.isNullOrEmpty() || tipo !in TIPOS_MOV) throw RespaldoInvalido("El respaldo tiene movimientos dañados")
            Movimiento(
                id = m.t("id"), personaId = personaId, tipo = TipoMovimiento.deClave(tipo!!), monto = monto.toLong(), fecha = m.t("fecha"),
                creado = m.t("creado"), detalle = m.t("detalle"), gastoId = m.o("gastoId") ?: m.o("cargoId"), cuentaId = m.o("cuentaId"),
            )
        }
        // Hasta la 1.x un gasto no guardaba la parte de cada uno: se saca de sus cargos.
        val cargosDe = movimientos.filter { it.tipo == TipoMovimiento.CARGO && it.gastoId != null }.groupBy { it.gastoId!! }
        val gastos = lista(if (v2) "cargos" else "gastos").map { g ->
            val total = g.n("total")
            val id = g.t("id")
            Gasto(
                id = id, total = total, fecha = g.t("fecha"), pagador = if (v2) "yo" else g.o("pagador") ?: "yo", miParte = (g["miParte"] as? Number)?.toLong() ?: total,
                medioId = g.o("medioId"), categoriaId = g.o("categoriaId"),
                montos = (g["montos"] as? Map<*, *>)?.entries?.associate { (k, v) -> k as String to (v as Number).toLong() }
                    ?: cargosDe[id]?.associate { it.personaId to it.monto },
                cuotas = (g["cuotas"] as? Number)?.toInt(), recurrenteId = g.o("recurrenteId"), descripcion = g.t("descripcion"), creado = g.t("creado"),
            )
        }
        val medios = lista("medios").mapNotNull { m ->
            val tipo = TipoMedio.entries.find { it.clave == m["tipo"] } ?: return@mapNotNull null
            val uso = (m["usoCuadrado"] as? Map<*, *>)?.let { UsoCuadrado(it.n("monto"), it.t("fecha"), it.t("creado")) }
            Medio(
                id = m.t("id"), tipo = tipo, diaFacturacion = (m["diaFacturacion"] as? Number)?.toInt(), archivado = m.b("archivado"),
                orden = m.i("orden"), nombre = m.t("nombre"), cuentaId = m.o("cuentaId"), cupo = (m["cupo"] as? Number)?.toLong(), usoCuadrado = uso,
            )
        }
        val recurrentes = lista("recurrentes").mapNotNull { x ->
            val tipo = TipoRecurrente.entries.find { it.clave == x["tipo"] } ?: return@mapNotNull null
            val f = x["frecuencia"] as? Map<*, *> ?: return@mapNotNull null
            val unidad = UnidadFrecuencia.entries.find { it.clave == f["unidad"] } ?: return@mapNotNull null
            Recurrente(
                id = x.t("id"), tipo = tipo, monto = x.n("monto"), frecuencia = Frecuencia(unidad, (f["cada"] as? Number)?.toInt() ?: 1, (f["dia"] as? Number)?.toInt()),
                inicio = x.t("inicio"), fin = x.o("fin"), nombre = x.t("nombre"), variable = x["montoTipo"] == "variable", medioId = x.o("medioId"),
                cuentaId = x.o("cuentaId"), moneda = x.o("moneda"), generadoHasta = x.o("generadoHasta"), activo = x["activo"] != false, creado = x.t("creado"),
            )
        }
        val cuentas = lista("cuentas").mapNotNull { c ->
            val tipo = TipoCuenta.entries.find { it.clave == c["tipo"] } ?: return@mapNotNull null
            val dap = (c["dap"] as? Map<*, *>)?.let { d ->
                DatosDap(
                    d.n("monto"), (d["tasa30"] as? Number)?.toDouble() ?: 0.0, d.t("inicio"), d.t("vencimiento"), (d["montoFinal"] as? Number)?.toLong(),
                    vigente = d["estado"] != "cobrado", renovar = d.b("renovar"),
                )
            }
            Cuenta(
                id = c.t("id"), tipo = tipo, nombre = c.t("nombre"), tasa = (c["tasa"] as? Number)?.toDouble(), tasaMensual = c["tasaUnidad"] == "mensual",
                moneda = c.o("moneda"), dap = dap, paraElMes = c["paraElMes"] as? Boolean, archivada = c.b("archivada"), orden = c.i("orden"), creado = c.t("creado"),
            )
        }
        val movAhorro = lista("movAhorro").mapNotNull { m ->
            val tipo = TipoMovAhorro.entries.find { it.clave == m["tipo"] } ?: return@mapNotNull null
            MovAhorro(m.t("id"), m.t("cuentaId"), tipo, (m["monto"] as? Number)?.toDouble() ?: 0.0, m.t("fecha"), m.t("creado"), m.t("nota"))
        }
        val presupuestos = lista("presupuestos").mapNotNull { p ->
            val periodo = PeriodoPresupuesto.entries.find { it.clave == p["periodo"] } ?: return@mapNotNull null
            Presupuesto(
                id = p.t("id"), periodo = periodo, monto = p.n("monto"), categoriaIds = (p["categoriaIds"] as? List<*>)?.map { it as String },
                categoriaId = p.o("categoriaId"), nombre = p.t("nombre"), archivado = p.b("archivado"), orden = p.i("orden"),
            )
        }
        val ajustes = r["ajustes"] as? Map<*, *>
        val valores = (ajustes?.get("indicadores") as? Map<*, *>)?.entries
            ?.mapNotNull { (k, v) -> ((v as? Map<*, *>)?.get("valor") as? Number)?.let { k as String to it.toDouble() } }
            ?.toMap() ?: emptyMap()

        return Respaldo(
            version = version,
            exportado = r.t("exportado"),
            personas = lista("personas").map { Persona(it.t("id"), it.t("nombre"), it.b("archivada"), it.t("creado")) },
            categorias = lista("categorias").map { Categoria(it.t("id"), it.t("nombre"), it.t("color"), it.t("icono"), it.i("orden"), it.b("archivada")) },
            gastos = gastos,
            movimientos = movimientos,
            medios = medios,
            recurrentes = recurrentes,
            pendientes = lista("pendientes").map { Pendiente(it.t("id"), it.t("recurrenteId"), it.t("fecha"), it.t("creado"), it.o("tipo") ?: "confirmar") },
            cuentas = cuentas,
            movAhorro = movAhorro,
            ingresos = lista("ingresos").map { Ingreso(it.t("id"), it.n("monto"), it.t("fecha"), it.t("descripcion"), it.o("cuentaId"), it.o("recurrenteId"), it.t("creado")) },
            presupuestos = presupuestos,
            pagosTarjeta = lista("pagosTarjeta").map { PagoTarjeta(it.t("id"), it.t("medioId"), it.n("monto"), it.t("fecha"), it.o("cuentaId"), it.t("creado")) },
            valores = valores,
            ultimoCierre = ajustes?.o("ultimoCierre"),
        )
    }

    // Lectura tolerante: un campo que falta o viene con otro tipo toma su valor por defecto.
    private fun Map<*, *>.t(k: String) = this[k] as? String ?: ""
    private fun Map<*, *>.o(k: String) = (this[k] as? String)?.takeIf { it.isNotEmpty() }
    private fun Map<*, *>.n(k: String) = (this[k] as? Number)?.toLong() ?: 0L
    private fun Map<*, *>.i(k: String) = (this[k] as? Number)?.toInt() ?: 0
    private fun Map<*, *>.b(k: String) = this[k] == true
}
