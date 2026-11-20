// Lector de JSON mínimo (sin dependencias) para los vectores de prueba: objetos → Map, listas → List,
// enteros → Long, decimales → Double, textos, booleanos y null.
package cl.amano.nucleo

internal class LectorJson(private val s: String) {
    private var i = 0

    fun leer(): Any? {
        val v = valor()
        espacios()
        require(i == s.length) { "JSON: sobra texto en la posición $i" }
        return v
    }

    private fun espacios() {
        while (i < s.length && s[i].isWhitespace()) i++
    }

    private fun valor(): Any? {
        espacios()
        return when (val c = s[i]) {
            '{' -> objeto()
            '[' -> lista()
            '"' -> texto()
            't' -> { i += 4; true }
            'f' -> { i += 5; false }
            'n' -> { i += 4; null }
            else -> if (c == '-' || c.isDigit()) numero() else error("JSON: carácter inesperado '$c' en $i")
        }
    }

    private fun objeto(): Map<String, Any?> {
        val out = LinkedHashMap<String, Any?>()
        i++
        espacios()
        if (s[i] == '}') { i++; return out }
        while (true) {
            espacios()
            val k = texto()
            espacios()
            require(s[i] == ':'); i++
            out[k] = valor()
            espacios()
            if (s[i] == ',') { i++; continue }
            require(s[i] == '}'); i++
            return out
        }
    }

    private fun lista(): List<Any?> {
        val out = mutableListOf<Any?>()
        i++
        espacios()
        if (s[i] == ']') { i++; return out }
        while (true) {
            out += valor()
            espacios()
            if (s[i] == ',') { i++; continue }
            require(s[i] == ']'); i++
            return out
        }
    }

    private fun texto(): String {
        require(s[i] == '"'); i++
        val sb = StringBuilder()
        while (s[i] != '"') {
            if (s[i] == '\\') {
                i++
                when (val e = s[i]) {
                    'n' -> sb.append('\n'); 't' -> sb.append('\t'); 'r' -> sb.append('\r'); 'b' -> sb.append('\b')
                    'f' -> sb.append('\u000C')
                    'u' -> { sb.append(s.substring(i + 1, i + 5).toInt(16).toChar()); i += 4 }
                    else -> sb.append(e)
                }
                i++
            } else sb.append(s[i++])
        }
        i++
        return sb.toString()
    }

    private fun numero(): Any {
        val ini = i
        while (i < s.length && (s[i].isDigit() || s[i] in "+-.eE")) i++
        val t = s.substring(ini, i)
        return if (t.any { it in ".eE" }) t.toDouble() else t.toLong()
    }
}

internal fun json(s: String): Any? = LectorJson(s).leer()

@Suppress("UNCHECKED_CAST")
internal fun Any?.obj() = this as Map<String, Any?>
@Suppress("UNCHECKED_CAST")
internal fun Any?.lista() = this as List<Any?>
internal fun Any?.txt() = this as String
internal fun Any?.txtONull() = this as String?
internal fun Any?.largo() = (this as Number).toLong()
internal fun Any?.ent() = (this as Number).toInt()
