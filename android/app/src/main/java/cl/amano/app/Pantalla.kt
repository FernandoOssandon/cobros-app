// La pantalla: bienvenida (cargar un respaldo) o el Resumen, con los mismos colores y textos que la PWA.
package cl.amano.app

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cl.amano.nucleo.AvancePresupuesto
import cl.amano.nucleo.EstadoFijo
import cl.amano.nucleo.EstadoPresupuesto
import cl.amano.nucleo.PeriodoPresupuesto
import cl.amano.nucleo.Presupuestos
import cl.amano.nucleo.Respaldo
import cl.amano.nucleo.TipoCuenta

// ---------- Colores (los de la PWA) ----------

data class Colores(
    val oscuro: Boolean,
    val fondo: Color,
    val tinta: Color,
    val apagado: Color,
    val suave: Color,
    val linea: Color,
    val positivo: Color,
    val debe: Color,
) {
    companion object {
        val CLARO = Colores(false, Color(0xFFF3F0E6), Color(0xFF0E1A12), Color(0xFF585F57), Color(0xFFE8E4D6), Color(0x1A0E1A12), Color(0xFF13874F), Color(0xFFA34A06))
        val OSCURO = Colores(true, Color(0xFF0B110D), Color(0xFFF1F5EE), Color(0xFF9AA59B), Color(0xFF1E2921), Color(0x1AF1F5EE), Color(0xFF7EE2A8), Color(0xFFFFB36B))
    }
}

val LocalColores = staticCompositionLocalOf { Colores.CLARO }

// ---------- Piezas ----------

@Composable
private fun Texto(
    texto: String,
    tam: TextUnit = 16.sp,
    peso: FontWeight = FontWeight.Medium,
    color: Color = LocalColores.current.tinta,
    modifier: Modifier = Modifier,
    unaLinea: Boolean = false,
) {
    Text(
        texto, modifier = modifier, fontSize = tam, fontWeight = peso, color = color, lineHeight = tam * 1.25,
        maxLines = if (unaLinea) 1 else Int.MAX_VALUE, overflow = if (unaLinea) TextOverflow.Ellipsis else TextOverflow.Clip,
    )
}

@Composable
private fun Caja(borde: Boolean = false, contenido: @Composable ColumnScope.() -> Unit) {
    val c = LocalColores.current
    val forma = RoundedCornerShape(22.dp)
    val base = Modifier.fillMaxWidth().clip(forma)
    Column(
        (if (borde) base.border(2.dp, c.tinta, forma) else base.background(c.suave)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        content = contenido,
    )
}

@Composable
private fun Boton(texto: String, lleno: Boolean = true, alTocar: () -> Unit) {
    val c = LocalColores.current
    val forma = RoundedCornerShape(50)
    val base = Modifier.clip(forma).clickable(onClick = alTocar)
    Box(
        (if (lleno) base.background(c.tinta) else base.border(2.dp, c.tinta, forma)).padding(horizontal = 18.dp, vertical = 10.dp),
    ) {
        Texto(texto, 14.sp, FontWeight.ExtraBold, if (lleno) c.fondo else c.tinta)
    }
}

/** Barra de avance (0 a 1). */
@Composable
private fun Barra(fraccion: Float, color: Color) {
    val c = LocalColores.current
    Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(c.linea)) {
        Box(Modifier.fillMaxWidth(fraccion.coerceIn(0f, 1f)).fillMaxHeight().background(color))
    }
}

@Composable
private fun Fila(izquierda: String, derecha: String, sub: String? = null, colorDerecha: Color = LocalColores.current.tinta) {
    val c = LocalColores.current
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Texto(izquierda, 16.sp, FontWeight.Bold, unaLinea = true)
            if (sub != null) Texto(sub, 13.sp, FontWeight.Medium, c.apagado, unaLinea = true)
        }
        Spacer(Modifier.width(12.dp))
        Texto(derecha, 16.sp, FontWeight.ExtraBold, colorDerecha)
    }
}

@Composable
private fun Seccion(titulo: String) {
    Texto(titulo, 22.sp, FontWeight.ExtraBold, modifier = Modifier.padding(top = 10.dp))
}

// ---------- Pantalla ----------

@Composable
fun Pantalla(estado: Estado, arranque: Long?, onCargar: () -> Unit) {
    val c = LocalColores.current
    MaterialTheme(colorScheme = if (c.oscuro) darkColorScheme() else lightColorScheme()) {
        Box(Modifier.fillMaxSize().background(c.fondo).safeDrawingPadding()) {
            when (estado) {
                Estado.Cargando -> Texto("Cargando…", 16.sp, FontWeight.Bold, c.apagado, Modifier.align(Alignment.Center))
                Estado.SinRespaldo -> Bienvenida(null, onCargar)
                is Estado.Error -> Bienvenida(estado.mensaje, onCargar)
                is Estado.Listo -> PantallaResumen(estado, arranque, onCargar)
            }
        }
    }
}

@Composable
private fun Bienvenida(error: String?, onCargar: () -> Unit) {
    val c = LocalColores.current
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Spacer(Modifier.height(40.dp))
        Texto("a mano.", 40.sp, FontWeight.ExtraBold)
        Texto("Versión Android de prueba.", 22.sp, FontWeight.Bold)
        Texto(
            "Por ahora solo muestra tu Resumen a partir de un respaldo de la app web: en la PWA, Ajustes → Exportar " +
                "(o el respaldo diario en Drive, carpeta \"a mano · respaldos\"). Tus datos quedan en este teléfono y no se envían a ningún lado.",
            15.sp, FontWeight.Medium, c.apagado,
        )
        if (error != null) Texto(error, 15.sp, FontWeight.Bold, c.debe)
        Boton("Cargar respaldo", alTocar = onCargar)
    }
}

@Composable
private fun PantallaResumen(e: Estado.Listo, arranque: Long?, onCargar: () -> Unit) {
    val c = LocalColores.current
    val t = e.tablero
    val r = t.resumen
    val p = t.proyeccion
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Texto("a mano.", 32.sp, FontWeight.ExtraBold, modifier = Modifier.weight(1f))
                Boton("Cargar respaldo", lleno = false, alTocar = onCargar)
            }
        }
        item {
            Texto("Solo lectura · respaldo del ${Formato.momento(e.respaldo.exportado)}. Lo nuevo se anota en la app web.", 13.sp, FontWeight.Medium, c.apagado)
        }

        t.cierre?.let { ciclo ->
            item {
                Caja(borde = true) {
                    Texto(if (ciclo.sueldo != null) "Llegó el sueldo: cierra el ciclo anterior" else "Empezó el mes: cierra el anterior", 17.sp, FontWeight.ExtraBold)
                    Texto("Del ${Formato.fechaCorta(ciclo.inicio)} al ${Formato.fechaCorta(cl.amano.nucleo.Fechas.sumarDias(ciclo.hasta, -1))} · se hace en la app web.", 14.sp, FontWeight.Medium, c.apagado)
                }
            }
        }

        item {
            Column(Modifier.padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Texto("Gasto real de ${Formato.nombreMes(t.mes)}", 16.sp, FontWeight.SemiBold, c.apagado)
                Texto(Formato.pesos(r.gastoReal), 46.sp, FontWeight.ExtraBold)
                Texto("Salió de tus medios ${Formato.pesos(r.salio)}", 16.sp, FontWeight.SemiBold)
                if (r.adelantado > 0) Texto("adelantaste ${Formato.pesos(r.adelantado)} por otros", 15.sp, FontWeight.Medium, c.apagado)
            }
        }

        if (r.teDeben > 0 || r.debes > 0) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (r.teDeben > 0) Pildora("Te deben ${Formato.pesos(r.teDeben)}", c.positivo)
                    if (r.debes > 0) Pildora("Debes ${Formato.pesos(r.debes)}", c.debe)
                }
            }
        }

        if (!p.sinCuentas) {
            item {
                val ciclo = p.ciclo
                val falta = p.libre < 0
                Caja(borde = true) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        Texto(if (ciclo.sueldo != null) "Hasta el sueldo" else "Hasta fin de mes", 16.sp, FontWeight.Bold, modifier = Modifier.weight(1f))
                        Texto(
                            Formato.plural(ciclo.dias, "día", "días") + " · " +
                                (ciclo.sueldo?.let { "${it.nombre} llega el ${Formato.fechaCorta(ciclo.hasta)}" }
                                    ?: "el mes cierra el ${Formato.fechaCorta(cl.amano.nucleo.Fechas.sumarDias(ciclo.hasta, -1))}"),
                            13.sp, FontWeight.SemiBold, c.apagado,
                        )
                    }
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Texto(Formato.pesos(if (falta) -p.libre else p.porDia), 40.sp, FontWeight.ExtraBold, if (falta) c.debe else c.tinta)
                        Texto(if (falta) "te faltan" else "por día", 17.sp, FontWeight.Bold, modifier = Modifier.padding(bottom = 6.dp))
                    }
                    val detalle = buildString {
                        append(if (falta) (if (p.enAhorros > 0) "Tus ahorros tienen ${Formato.pesos(p.enAhorros)}" else "Revisa lo que viene antes del sueldo")
                        else "Te quedan ${Formato.pesos(p.libre)} para ${Formato.plural(ciclo.dias, "día", "días")}")
                        if (p.ritmo > 0 && !falta) append(" · llevas ${Formato.pesos(p.ritmo)} por día")
                        if (p.avisos.isNotEmpty()) append(" · ${if (p.avisos.size == 1) "una cuenta no alcanza" else "${p.avisos.size} cuentas no alcanzan"}")
                    }
                    Texto(detalle, 14.sp, FontWeight.SemiBold, c.apagado)
                    for (a in p.avisos) Texto("${a.cuenta.nombre}: le faltan ${Formato.pesos(a.falta)} para ${a.motivo}.", 14.sp, FontWeight.SemiBold, c.debe)
                }
            }
            item {
                Caja {
                    Fila("Tienes en tus cuentas", Formato.pesos(p.tienes))
                    if (p.entra > 0) Fila("Entra antes del sueldo", "+" + Formato.pesos(p.entra), colorDerecha = c.positivo)
                    if (p.enTarjetas > 0) Fila("Tarjetas (ya gastado)", "-" + Formato.pesos(p.enTarjetas))
                    if (p.sale > 0) Fila("Viene", "-" + Formato.pesos(p.sale), Formato.plural(p.viene.count { it.monto < 0 }, "pago", "pagos"))
                }
            }
        }

        val ing = t.ingresos
        if (ing.total > 0 || ing.fijos.isNotEmpty()) {
            item { Seccion("ingresos.") }
            item {
                Caja {
                    Fila("Llegó en ${Formato.nombreMes(t.mes)}", Formato.pesos(ing.total), colorDerecha = c.positivo)
                    for (f in ing.fijos) {
                        val sub = when (f.estado) {
                            EstadoFijo.LLEGO -> "Llegó el ${Formato.fechaCorta(f.fecha!!)}"
                            EstadoFijo.CONFIRMAR -> "Por confirmar · ${Formato.fechaCorta(f.fecha!!)}"
                            EstadoFijo.LLEGA -> "Llega el ${Formato.fechaCorta(f.fecha!!)}"
                            EstadoFijo.TERMINADO -> "Terminó"
                        }
                        Fila(f.recurrente.nombre, Formato.pesos(f.monto ?: f.recurrente.monto), sub, if (f.estado == EstadoFijo.LLEGO) c.positivo else c.apagado)
                    }
                }
            }
        }

        val presupuestos = t.presupuestos.filter { !it.presupuesto.archivado }
        if (presupuestos.isNotEmpty()) {
            item { Seccion("presupuestos.") }
            for (a in presupuestos) item { TarjetaPresupuesto(a, e.respaldo) }
        }

        if (t.tarjetas.isNotEmpty()) {
            item { Seccion("tarjetas.") }
            item {
                Caja {
                    for ((m, u) in t.tarjetas) {
                        Fila(
                            m.nombre, Formato.pesos(u.usado),
                            u.disponible?.let { "Quedan ${Formato.pesos(it)} de ${Formato.pesos(u.cupo!!)}" } ?: if (u.cuadrado) "Cuadrada con el banco" else "Usado (lo anotado)",
                        )
                        u.pct?.let { Barra(it.toFloat(), if (it >= 0.9) c.debe else c.tinta) }
                    }
                }
            }
        }

        val cuentas = t.patrimonio.cuentas.filter { it.cuenta.tipo != TipoCuenta.DAP || it.cuenta.dap?.vigente == true }
        if (cuentas.isNotEmpty()) {
            item { Seccion("mi plata.") }
            item {
                Caja {
                    for (x in cuentas.sortedBy { it.cuenta.orden }) {
                        val sub = when {
                            x.cuenta.moneda != null -> "${x.cuenta.moneda} ${"%.2f".format(x.saldo)}"
                            x.ganadoMes > 0 -> "+${Formato.pesos(x.ganadoMes.toLong())} este mes"
                            x.diasDesdeCuadre != null && x.diasDesdeCuadre!! > 30 -> "Sin cuadrar hace ${x.diasDesdeCuadre} días"
                            else -> null
                        }
                        Fila(x.cuenta.nombre, Formato.pesos(x.saldoPesos), sub)
                    }
                    Spacer(Modifier.height(4.dp))
                    Fila("Patrimonio", Formato.pesos(t.patrimonio.total), "Lo que tienes y te deben, menos lo que debes y las tarjetas")
                }
            }
        }

        if (t.personas.isNotEmpty()) {
            item { Seccion("personas.") }
            item {
                Caja {
                    for (s in t.personas.take(10)) {
                        val teDebe = s.saldo > 0
                        Fila(s.persona.nombre, Formato.pesos(kotlin.math.abs(s.saldo)), if (teDebe) "te debe" else "le debes", if (teDebe) c.positivo else c.debe)
                    }
                    if (t.personas.size > 10) Texto("y ${t.personas.size - 10} más", 13.sp, FontWeight.Medium, c.apagado)
                }
            }
        }

        if (t.porConfirmar > 0) {
            item {
                Texto(
                    "${Formato.plural(t.porConfirmar, "recurrente", "recurrentes")} por confirmar en la app web.",
                    14.sp, FontWeight.SemiBold, c.apagado,
                )
            }
        }

        item {
            val tiempos = buildString {
                if (arranque != null) append("Abrió en $arranque ms · ")
                append("leer ${e.msLeer} ms · calcular ${e.msCalcular} ms")
                append(" · ${e.respaldo.gastos.size} gastos")
            }
            Texto(tiempos, 12.sp, FontWeight.Medium, c.apagado, Modifier.padding(top = 12.dp, bottom = 24.dp))
        }
    }
}

@Composable
private fun Pildora(texto: String, color: Color) {
    Box(Modifier.clip(RoundedCornerShape(50)).border(2.dp, color, RoundedCornerShape(50)).padding(horizontal = 14.dp, vertical = 8.dp)) {
        Texto(texto, 15.sp, FontWeight.ExtraBold, color)
    }
}

@Composable
private fun TarjetaPresupuesto(a: AvancePresupuesto, r: Respaldo) {
    val c = LocalColores.current
    val p = a.presupuesto
    val categorias = Presupuestos.categoriasDe(p).mapNotNull { id -> r.categorias.find { it.id == id }?.nombre }
    val nombre = p.nombre.ifEmpty {
        categorias.joinToString(", ").ifEmpty { if (p.periodo == PeriodoPresupuesto.SEMANA) "Total semanal" else "Total mensual" }
    }
    val color = when (a.estado) {
        EstadoPresupuesto.EXCEDIDO -> c.debe
        EstadoPresupuesto.CERCA -> c.debe
        EstadoPresupuesto.BIEN -> c.positivo
    }
    Caja {
        Fila(
            nombre, "${Formato.pesos(a.gastado)} de ${Formato.pesos(p.monto)}",
            if (a.restante >= 0) "Quedan ${Formato.pesos(a.restante)} · ${Formato.pesos(a.porDia)} por día" else "Te pasaste ${Formato.pesos(-a.restante)}",
        )
        Barra(if (a.pct.isInfinite()) 1f else a.pct.toFloat(), color)
    }
}
