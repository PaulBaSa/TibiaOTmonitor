package com.tibiaotmonitor.widget;

import android.content.Context;
import android.content.SharedPreferences;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * Native module exposed to React Native as "TibiaPrefs".
 * Writes backend URL and session ID into a SharedPreferences file that
 * TibiaWidgetProvider reads when refreshing the home-screen widget.
 */
public class TibiaPrefsModule extends ReactContextBaseJavaModule {

    TibiaPrefsModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "TibiaPrefs";
    }

    @ReactMethod
    public void setValues(String backendUrl, String sessionId) {
        getReactApplicationContext()
                .getSharedPreferences(TibiaWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString("backendUrl", backendUrl)
                .putString("sessionId",  sessionId)
                .apply();
    }

    @ReactMethod
    public void clearValues() {
        getReactApplicationContext()
                .getSharedPreferences(TibiaWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .remove("backendUrl")
                .remove("sessionId")
                .apply();
    }
}
