# ── React Native core ─────────────────────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# ── Reanimated ────────────────────────────────────────────────────────────────
-keep class com.swmansion.reanimated.** { *; }

# ── Gesture Handler ───────────────────────────────────────────────────────────
-keep class com.swmansion.gesturehandler.** { *; }

# ── React Native Screens ──────────────────────────────────────────────────────
-keep class com.swmansion.rnscreens.** { *; }

# ── AsyncStorage ──────────────────────────────────────────────────────────────
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# ── Expo SecureStore ──────────────────────────────────────────────────────────
-keep class expo.modules.securestore.** { *; }

# ── Socket.io / OkHttp ────────────────────────────────────────────────────────
-keep class io.socket.** { *; }
-keep class okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
