plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.fala.app"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.fala.app"
        minSdk = 26
        targetSdk = 36
        val releaseCode = providers.environmentVariable("FALA_VERSION_CODE").orNull
        versionCode = if (releaseCode == null) 4 else {
            requireNotNull(releaseCode.toIntOrNull()?.takeIf { it in 1..2100000000 }) {
                "FALA_VERSION_CODE must be an integer between 1 and 2100000000"
            }
        }
        versionName = "0.4.0"
        buildConfigField("String", "API_BASE_URL", "\"https://legendary-florentine-6b3c1f.netlify.app\"")
    }
    signingConfigs {
        create("upload") {
            val keystore = System.getenv("FALA_UPLOAD_KEYSTORE")
            if (!keystore.isNullOrBlank()) {
                storeFile = file(keystore)
                storePassword = System.getenv("FALA_UPLOAD_STORE_PASSWORD")
                keyAlias = System.getenv("FALA_UPLOAD_KEY_ALIAS")
                keyPassword = System.getenv("FALA_UPLOAD_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        getByName("release") {
            if (!System.getenv("FALA_UPLOAD_KEYSTORE").isNullOrBlank()) signingConfig = signingConfigs.getByName("upload")
        }
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint { abortOnError = true }
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

dependencies {
    testImplementation("junit:junit:4.13.2")
    implementation("androidx.credentials:credentials:1.6.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.6.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.2.1")
    implementation(platform("androidx.compose:compose-bom:2025.08.01"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.9.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
