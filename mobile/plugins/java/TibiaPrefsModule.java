package com.tibiaotmonitor.widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * Native module exposed to React Native as "TibiaPrefs".
 *
 * Writes backend URL and session ID into a SharedPreferences file that
 * TibiaWidgetProvider reads when refreshing the home-screen widget, then
 * immediately broadcasts ACTION_APPWIDGET_UPDATE so every placed widget
 * refreshes automatically — no manual ↻ tap required after connecting.
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
        ReactApplicationContext ctx = getReactApplicationContext();

        // 1. Persist credentials for the widget
        ctx.getSharedPreferences(TibiaWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString("backendUrl", backendUrl)
                .putString("sessionId",  sessionId)
                .apply();

        // 2. Broadcast an immediate update to every placed widget instance
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        int[] ids = manager.getAppWidgetIds(
                new ComponentName(ctx, TibiaWidgetProvider.class));
        if (ids.length > 0) {
            Intent intent = new Intent(ctx, TibiaWidgetProvider.class);
            intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            ctx.sendBroadcast(intent);
        }
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
