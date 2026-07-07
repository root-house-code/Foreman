plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.foreman.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.foreman.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Debug-signed so a release build is installable without a keystore.
            // Swap in a real signingConfig before any store distribution.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
}

// Bundle the built SPA into the APK. The renderer is the same dist/ the desktop
// app and LAN server use — run `npm run build` in the repo root first.
val webDist: File = rootDir.parentFile.resolve("dist")
val copyWebAssets by tasks.registering(Sync::class) {
    doFirst {
        check(webDist.resolve("index.html").exists()) {
            "dist/index.html not found — run `npm run build` in the repo root before building the Android app."
        }
    }
    from(webDist)
    into(layout.projectDirectory.dir("src/main/assets/www"))
}
tasks.named("preBuild") { dependsOn(copyWebAssets) }

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("com.google.android.material:material:1.12.0")
    // WebViewAssetLoader + addDocumentStartJavaScript
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.core:core-splashscreen:1.0.1")
    // QR scanning for LAN pairing (Preferences → Multi-Device Sharing on the desktop)
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
}
