// Kotlin Multiplatform: el mismo código común compila para
// - JVM (después: Android) y
// - JavaScript, como librería con tipos (.d.ts) que la PWA podrá importar.
// `./gradlew check` corre las pruebas en las dos plataformas contra los vectores generados desde TypeScript.
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    kotlin("multiplatform") version "2.2.21"
}

group = "cl.amano"
version = "0.1.0"

kotlin {
    jvm {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }

    js(IR) {
        nodejs()
        // Módulos ES: la PWA (Vite) importa las funciones exportadas directo, con sus tipos.
        useEsModules()
        binaries.library()
        generateTypeScriptDefinitions()
    }

    sourceSets {
        commonTest.dependencies {
            implementation(kotlin("test"))
        }
    }
}
