// Núcleo compartido de "a mano.": las reglas de la plata escritas una vez en Kotlin,
// para la app Android (JVM) y para la PWA (JavaScript con tipos de TypeScript).
pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        mavenCentral()
    }
}

rootProject.name = "nucleo"
