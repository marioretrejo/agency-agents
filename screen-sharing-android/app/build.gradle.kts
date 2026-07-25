plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.mariotech.screenshare"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.mariotech.screenshare"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        // Default signaling endpoint (the Vercel viewer). Override at build time
        // with -PsignalingServer=... if you self-host.
        val signalingServer =
            (project.findProperty("signalingServer") as String?)
                ?: "https://screen-sharing-viewer.vercel.app"
        buildConfigField("String", "SIGNALING_SERVER", "\"$signalingServer\"")
    }

    buildFeatures {
        viewBinding = true
        buildConfig = true
    }

    // Split by ABI so each APK carries only one architecture's native WebRTC
    // libs (the universal APK is ~48 MB; arm64-v8a alone is ~16 MB). Keep a
    // universal APK too for convenience.
    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a", "x86_64")
            isUniversalApk = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")

    // Maintained WebRTC build for Android (package remains org.webrtc.*)
    implementation("io.getstream:stream-webrtc-android:1.3.8")

    // HTTP + Server-Sent Events client for our SSE/POST signaling
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:okhttp-sse:4.12.0")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("org.json:json:20240303")
}
