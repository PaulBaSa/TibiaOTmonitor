# ── React Native core ─────────────────────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# ── Expo Modules core + all SDK modules (splash, font, secure-store, etc.) ────
-keep class expo.modules.** { *; }
-keepclassmembers class expo.modules.** { *; }

# ── Gesture Handler ───────────────────────────────────────────────────────────
-keep class com.swmansion.gesturehandler.** { *; }

# ── React Native Screens ──────────────────────────────────────────────────────
-keep class com.swmansion.rnscreens.** { *; }

# ── AsyncStorage ──────────────────────────────────────────────────────────────
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# ── Picker ────────────────────────────────────────────────────────────────────
-keep class com.reactnativecommunity.picker.** { *; }

# ── Socket.io / OkHttp ────────────────────────────────────────────────────────
-keep class io.socket.** { *; }
-keep class okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# ── Kotlin (companion objects and metadata used by Expo Modules API) ──────────
-keep class kotlin.Metadata { *; }
-keepclassmembers class **$Companion { *; }
-dontwarn kotlin.**
