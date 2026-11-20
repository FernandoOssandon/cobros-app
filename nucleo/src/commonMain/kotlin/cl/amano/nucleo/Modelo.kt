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
)

enum class TipoMedio(val clave: String) {
    CREDITO("credito"), DEBITO("debito"), EFECTIVO("efectivo"), TRANSFERENCIA("transferencia");

    companion object {
        fun deClave(clave: String) = entries.first { it.clave == clave }
    }
}

data class Medio(
    val id: String,
    val tipo: TipoMedio,
    /** Día de facturación de una tarjeta de crédito (1–31). */
    val diaFacturacion: Int? = null,
    val archivado: Boolean = false,
    val orden: Int = 0,
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
