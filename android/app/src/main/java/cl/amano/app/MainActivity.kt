package cl.amano.app

import android.os.Bundle
import android.os.Process
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch
import java.time.LocalDate

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val almacen = Almacen(applicationContext)
        setContent { App(almacen) }
    }
}

/** Hoy en el calendario del teléfono, "YYYY-MM-DD". */
private fun hoy(): String = LocalDate.now().toString()

@Composable
fun App(almacen: Almacen) {
    val colores = if (isSystemInDarkTheme()) Colores.OSCURO else Colores.CLARO
    var estado by remember { mutableStateOf<Estado>(Estado.Cargando) }
    /** Desde que partió el proceso hasta tener el Resumen listo (solo al abrir la app). */
    var arranque by remember { mutableStateOf<Long?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        estado = almacen.abrir(hoy())
        if (estado is Estado.Listo) arranque = SystemClock.uptimeMillis() - Process.getStartUptimeMillis()
    }
    val elegir = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            scope.launch {
                estado = Estado.Cargando
                estado = almacen.importar(uri, hoy())
            }
        }
    }

    CompositionLocalProvider(LocalColores provides colores) {
        Pantalla(estado, arranque, onCargar = { elegir.launch(arrayOf("*/*")) })
    }
}
