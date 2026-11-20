// App Android de "a mano." (Kotlin + Jetpack Compose). Usa las reglas de la plata del núcleo (../nucleo).
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "a-mano-android"
include(":app")
