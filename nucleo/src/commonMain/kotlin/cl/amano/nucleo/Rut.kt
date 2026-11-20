// RUT chileno: limpiar, validar el dígito verificador (módulo 11) y dar formato.
// Versión Kotlin de src/lib/rut.ts: tiene que dar exactamente lo mismo (ver los vectores de prueba).
package cl.amano.nucleo

object Rut {
    /** Solo dígitos y la K final, en mayúscula: "12.345.678-k" → "12345678K". */
    fun limpiar(s: String): String = s.filter { it in '0'..'9' || it == 'k' || it == 'K' }.uppercase()

    /** Dígito verificador de un RUT (sin el dígito): módulo 11. */
    fun dv(cuerpo: String): String {
        val digitos = cuerpo.filter { it in '0'..'9' }
        var suma = 0
        var factor = 2
        for (i in digitos.indices.reversed()) {
            suma += (digitos[i] - '0') * factor
            factor = if (factor == 7) 2 else factor + 1
        }
        val r = 11 - (suma % 11)
        return when (r) {
            11 -> "0"
            10 -> "K"
            else -> r.toString()
        }
    }

    /** ¿Es un RUT válido? Acepta puntos, guion y la K en minúscula. */
    fun validar(s: String): Boolean {
        val l = limpiar(s)
        if (l.length < 2 || !Regex("^\\d+[\\dK]$").matches(l)) return false
        val cuerpo = l.dropLast(1)
        return (cuerpo.trimStart('0').isNotEmpty()) && dv(cuerpo) == l.takeLast(1)
    }

    /** Forma en que se guarda: "12345678-5" (sin puntos, con guion). `null` si no es válido. */
    fun normalizar(s: String?): String? {
        if (s == null || !validar(s)) return null
        val l = limpiar(s)
        return "${l.dropLast(1).trimStart('0')}-${l.takeLast(1)}"
    }

    /** Para mostrar: "12.345.678-5". Si no es válido, devuelve el texto tal cual. */
    fun formatear(s: String): String {
        val n = normalizar(s) ?: return s
        val (cuerpo, dv) = n.split('-')
        return "${conPuntos(cuerpo)}-$dv"
    }

    private fun conPuntos(digitos: String): String =
        digitos.reversed().chunked(3).joinToString(".").reversed()
}
