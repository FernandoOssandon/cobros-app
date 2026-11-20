// Los datos que usan las reglas de la plata, con los mismos nombres que en la PWA (src/db.ts).
// Solo los campos que importan para los cálculos; montos en pesos enteros (Long).
package cl.amano.nucleo

data class InfoCuota(
    /** Número de esta cuota (1…de). */
    val n: Int,
    val de: Int,
    /** Id de la compra original. */
    val origenId: String,
    val totalCompra: Long,
    val fechaCompra: String,
)

data class Gasto(
    val id: String,
    val total: Long,
    /** YYYY-MM-DD */
    val fecha: String,
    /** "yo" o el id de la persona que pagó. */
    val pagador: String = "yo",
    val miParte: Long = total,
    val medioId: String? = null,
    val categoriaId: String? = null,
    /** Parte de cada persona (incluida la de quien pagó, si no fui yo). */
    val montos: Map<String, Long>? = null,
    /** Compra en cuotas (2 o más) con tarjeta de crédito. */
    val cuotas: Int? = null,
    val recurrenteId: String? = null,
    val descripcion: String = "",
    val creado: String = "",
    /** Solo en los gastos imputados: la cuota que representa. */
    val cuota: InfoCuota? = null,
)

enum class TipoMovimiento(val clave: String, val signo: Int) {
    /** Me debe. */
    CARGO("cargo", 1),
    /** Me pagó. */
    PAGO("pago", -1),
    /** Le debo (pagó por mí). */
    DEUDA("deuda", -1),
    /** Le pagué. */
    ABONO("abono", 1);

    companion object {
        fun deClave(clave: String) = entries.first { it.clave == clave }
    }
}

data class Movimiento(
    val id: String,
    val personaId: String,
    val tipo: TipoMovimiento,
    val monto: Long,
    val fecha: String,
    val creado: String = "",
    val detalle: String = "",
    val gastoId: String? = null,
    /** Pago o abono por transferencia: la cuenta por la que entró o salió. */
    val cuentaId: String? = null,
)

enum class TipoMedio(val clave: String) {
    CREDITO("credito"), DEBITO("debito"), EFECTIVO("efectivo"), TRANSFERENCIA("transferencia");

    companion object {
        fun deClave(clave: String) = entries.first { it.clave == clave }
    }
}

/** Lo usado de una tarjeta según el banco en una fecha (desde ahí se suman compras y se restan pagos). */
data class UsoCuadrado(val monto: Long, val fecha: String, val creado: String)

data class Medio(
    val id: String,
    val tipo: TipoMedio,
    /** Día de facturación de una tarjeta de crédito (1–31). */
    val diaFacturacion: Int? = null,
    val archivado: Boolean = false,
    val orden: Int = 0,
    val nombre: String = "",
    /**
     * Cuenta ligada: en débito, transferencia o efectivo, de donde sale la plata;
     * en crédito, desde donde se suele pagar la tarjeta.
     */
    val cuentaId: String? = null,
    /** Solo crédito: cupo total. */
    val cupo: Long? = null,
    val usoCuadrado: UsoCuadrado? = null,
)

enum class PeriodoPresupuesto(val clave: String) {
    SEMANA("semana"), MES("mes");

    companion object {
        fun deClave(clave: String) = entries.first { it.clave == clave }
    }
}

data class Presupuesto(
    val id: String,
    val periodo: PeriodoPresupuesto,
    val monto: Long,
    /** Categorías que cuenta (vacío: todas). */
    val categoriaIds: List<String>? = null,
    /** Hasta la 2.7: una sola categoría. */
    val categoriaId: String? = null,
    val nombre: String = "",
    val archivado: Boolean = false,
    val orden: Int = 0,
)

// ---------- Recurrentes e ingresos ----------

enum class TipoRecurrente(val clave: String) {
    MIO("mio"), COMPARTIDO("compartido"), COBRO("cobro"), INGRESO("ingreso");

    companion object {
        fun deClave(clave: String) = entries.first { it.clave == clave }
    }
}

data class Recurrente(
    val id: String,
    val tipo: TipoRecurrente,
    /** Monto fijo o, si es variable, el último como referencia. */
    val monto: Long,
    val frecuencia: Frecuencia,
    /** Primera ocurrencia. */
    val inicio: String,
    /** Última fecha posible (incluida). */
    val fin: String? = null,
    val nombre: String = "",
    /** El variable queda "por confirmar" para anotar el monto real. */
    val variable: Boolean = false,
    val medioId: String? = null,
    /** Solo ingresos: la cuenta donde llega. */
    val cuentaId: String? = null,
    /** Monto en otra moneda (UF, USD, EUR): el monto en pesos es estimado. */
    val moneda: String? = null,
    /** Última fecha ya generada (anotada, confirmada o saltada). */
    val generadoHasta: String? = null,
    val activo: Boolean = true,
    val creado: String = "",
)

/** Ocurrencia de un recurrente que espera una acción: "confirmar" (falta el monto real) o "anotar" (un fijo atrasado). */
data class Pendiente(val id: String, val recurrenteId: String, val fecha: String, val creado: String = "", val tipo: String = "confirmar")

data class Ingreso(
    val id: String,
    val monto: Long,
    val fecha: String,
    val descripcion: String = "",
    val cuentaId: String? = null,
    val recurrenteId: String? = null,
    val creado: String = "",
)

data class PagoTarjeta(val id: String, val medioId: String, val monto: Long, val fecha: String, val cuentaId: String? = null, val creado: String = "")

// ---------- Mi plata: cuentas ----------

enum class TipoCuenta(val clave: String) {
    /** Paga interés a diario (Mach, Tenpo, Mercado Pago…). */
    REMUNERADA("remunerada"),
    /** Corriente, vista o RUT. */
    VISTA("vista"),
    EFECTIVO("efectivo"),
    /** Depósito a plazo. */
    DAP("dap"),
    /** Fondos, acciones… */
    INVERSION("inversion");

    companion object {
        fun deClave(clave: String) = entries.first { it.clave == clave }
    }
}

data class DatosDap(
    val monto: Long,
    /** Tasa a 30 días, en %. */
    val tasa30: Double,
    val inicio: String,
    val vencimiento: String,
    /** Si el banco informa el monto final, manda sobre el cálculo. */
    val montoFinal: Long? = null,
    val vigente: Boolean = true,
    val renovar: Boolean = false,
)

data class Cuenta(
    val id: String,
    val tipo: TipoCuenta,
    val nombre: String = "",
    /** Rentabilidad en %. */
    val tasa: Double? = null,
    val tasaMensual: Boolean = false,
    /** "USD" o "EUR": saldos con decimales, en esa moneda. */
    val moneda: String? = null,
    val dap: DatosDap? = null,
    /** ¿Cuenta para "cómo termino el mes"? null: sí las vista y efectivo. */
    val paraElMes: Boolean? = null,
    val archivada: Boolean = false,
    val orden: Int = 0,
    val creado: String = "",
)

enum class TipoMovAhorro(val clave: String) {
    /** El saldo real en esa fecha. */
    CUADRE("cuadre"), DEPOSITO("deposito"), RETIRO("retiro");

    companion object {
        fun deClave(clave: String) = entries.first { it.clave == clave }
    }
}

/** De dónde viene un movimiento calculado: "gasto", "pago" o "pagoTarjeta". */
data class OrigenMov(val tipo: String, val id: String, val personaId: String? = null)

data class MovAhorro(
    val id: String,
    val cuentaId: String,
    val tipo: TipoMovAhorro,
    /** En la moneda de la cuenta (con decimales si es en dólares o euros). */
    val monto: Double,
    val fecha: String,
    val creado: String = "",
    val nota: String = "",
    /** Solo los calculados (no se guardan). */
    val origen: OrigenMov? = null,
)

// ---------- Personas y categorías ----------

data class Persona(val id: String, val nombre: String, val archivada: Boolean = false, val creado: String = "") {
    /** Primer nombre ("Camila" de "Camila Rojas"). */
    val primerNombre get() = nombre.trim().split(' ').first()
}

data class Categoria(val id: String, val nombre: String, val color: String = "", val icono: String = "", val orden: Int = 0, val archivada: Boolean = false)
