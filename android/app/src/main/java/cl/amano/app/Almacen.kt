// Guarda una copia del último respaldo cargado (en el almacenamiento privado de la app) y lo calcula todo con el núcleo.
package cl.amano.app

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import cl.amano.nucleo.Respaldo
import cl.amano.nucleo.RespaldoInvalido
import cl.amano.nucleo.Respaldos
import cl.amano.nucleo.Tablero
import cl.amano.nucleo.Tableros
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

sealed interface Estado {
    data object Cargando : Estado
    data object SinRespaldo : Estado
    data class Error(val mensaje: String) : Estado
    data class Listo(
        val respaldo: Respaldo,
        val tablero: Tablero,
        /** Milisegundos en leer el archivo y armar los datos. */
        val msLeer: Long,
        /** Milisegundos en calcular el Resumen. */
        val msCalcular: Long,
    ) : Estado
}

class Almacen(private val contexto: Context) {
    private val archivo = File(contexto.filesDir, "respaldo.json")

    /** Al abrir la app: el último respaldo cargado, si hay. */
    suspend fun abrir(hoy: String): Estado = withContext(Dispatchers.IO) {
        if (!archivo.exists()) Estado.SinRespaldo else calcular(archivo.readText(), hoy)
    }

    /** Un respaldo elegido por la persona (desde Drive, Descargas…). Si sirve, reemplaza al anterior. */
    suspend fun importar(uri: Uri, hoy: String): Estado = withContext(Dispatchers.IO) {
        val texto = try {
            contexto.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) }
        } catch (e: Exception) {
            null
        }
        if (texto == null) {
            Estado.Error("No se pudo abrir el archivo.")
        } else {
            val estado = calcular(texto, hoy)
            if (estado is Estado.Listo) archivo.writeText(texto)
            estado
        }
    }

    private fun calcular(texto: String, hoy: String): Estado {
        val t0 = SystemClock.elapsedRealtime()
        return try {
            val r = Respaldos.leer(texto)
            val t1 = SystemClock.elapsedRealtime()
            val tablero = Tableros.calcular(r, hoy)
            Estado.Listo(r, tablero, t1 - t0, SystemClock.elapsedRealtime() - t1)
        } catch (e: RespaldoInvalido) {
            Estado.Error(e.message ?: "El archivo no es un respaldo de a mano")
        } catch (e: Exception) {
            Estado.Error("No se pudo leer el respaldo (${e::class.simpleName}).")
        }
    }
}
