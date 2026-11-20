// Lo que la PWA puede importar desde JavaScript/TypeScript (con tipos generados en el .d.ts).
// Se exporta una fachada simple (textos, números y booleanos) en vez de las clases de Kotlin.
@file:OptIn(ExperimentalJsExport::class)

package cl.amano.nucleo

import kotlin.js.ExperimentalJsExport
import kotlin.js.JsExport

@JsExport
fun rutValidar(s: String): Boolean = Rut.validar(s)

@JsExport
fun rutNormalizar(s: String?): String? = Rut.normalizar(s)

@JsExport
fun rutFormatear(s: String): String = Rut.formatear(s)

@JsExport
fun rutDv(cuerpo: String): String = Rut.dv(cuerpo)
