// Recorre los vectores generados desde TypeScript y devuelve las diferencias (vacío = todo igual).
// Lo usan las pruebas (NucleoTest) y se puede correr sin framework de pruebas.
package cl.amano.nucleo

private const val S = '␟'

private fun mapaLong(s: String): Map<String, Long> =
    if (s.isEmpty()) emptyMap() else s.split(',').associate { it.substringBefore('=') to it.substringAfter('=').toLong() }

private fun mapaInt(s: String): Map<String, Int> =
    if (s.isEmpty()) emptyMap() else s.split(',').associate { it.substringBefore('=') to it.substringAfter('=').toInt() }

fun diferenciasRut(): List<String> {
    val out = mutableListOf<String>()
    for (l in VECTORES_DV) {
        val (cuerpo, dv) = l.split(S)
        if (Rut.dv(cuerpo) != dv) out += "dv($cuerpo): esperaba $dv, dio ${Rut.dv(cuerpo)}"
    }
    for (l in VECTORES_RUT) {
        val (entrada, valido, normalizado, formateado) = l.split(S)
        val v = if (Rut.validar(entrada)) "1" else "0"
        val n = Rut.normalizar(entrada) ?: ""
        val f = Rut.formatear(entrada)
        if (v != valido || n != normalizado || f != formateado) out += "rut('$entrada'): esperaba $valido/$normalizado/$formateado, dio $v/$n/$f"
    }
    return out
}

fun diferenciasReparto(): List<String> {
    val out = mutableListOf<String>()
    for (l in VECTORES_REPARTO) {
        val c = l.split(S)
        val e = EntradaReparto(
            monto = c[0].toLong(),
            ids = if (c[1].isEmpty()) emptyList() else c[1].split(','),
            yo = c[2] == "1",
            modo = ModoReparto.deClave(c[3]),
            exactos = mapaLong(c[4]),
            partes = mapaInt(c[5]),
            misPartes = c[6].toInt(),
        )
        val r = calcularReparto(e)
        val filas = r.filas.joinToString(",") { "${it.id}:${it.monto}:${it.partes}" }
        val dio = listOf(r.mio.toString(), r.restante.toString(), if (r.ok) "1" else "0", filas)
        val esperaba = c.subList(7, 11)
        if (dio != esperaba) out += "reparto(${c.subList(0, 7).joinToString(S.toString())}): esperaba $esperaba, dio $dio"
    }
    return out
}
