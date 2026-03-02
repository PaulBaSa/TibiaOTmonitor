package com.tibiaotmonitor.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class TibiaWidgetProvider extends AppWidgetProvider {

    static final String PREFS_NAME = "TibiaOTMonitor";
    static final String ACTION_REFRESH = "com.tibiaotmonitor.WIDGET_REFRESH";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            int appWidgetId = intent.getIntExtra(
                    AppWidgetManager.EXTRA_APPWIDGET_ID,
                    AppWidgetManager.INVALID_APPWIDGET_ID);
            if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
                updateWidget(context, appWidgetManager, appWidgetId);
            }
        }
    }

    static void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String backendUrl = prefs.getString("backendUrl", null);
        String sessionId  = prefs.getString("sessionId",  null);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.tibia_widget_layout);

        // Tap widget body → open app
        Intent launchIntent = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent != null) {
            PendingIntent openApp = PendingIntent.getActivity(context, 0, launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_container, openApp);
        }

        // Tap ↻ button → manual refresh broadcast
        Intent refreshIntent = new Intent(context, TibiaWidgetProvider.class);
        refreshIntent.setAction(ACTION_REFRESH);
        refreshIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        PendingIntent refreshPi = PendingIntent.getBroadcast(context, appWidgetId, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.refresh_btn, refreshPi);

        if (backendUrl == null || sessionId == null) {
            views.setTextViewText(R.id.status_text, "Not configured");
            views.setTextColor(R.id.status_dot, 0xFF666666);
            views.setTextViewText(R.id.players_text, "\u2014");
            views.setTextViewText(R.id.cpu_text,     "\u2014");
            views.setTextViewText(R.id.ram_text,     "\u2014");
            views.setTextViewText(R.id.disk_text,    "\u2014");
            views.setTextViewText(R.id.last_updated, "Open app to connect");
            appWidgetManager.updateAppWidget(appWidgetId, views);
            return;
        }

        // Show a transient "refreshing" state while the network call runs
        views.setTextViewText(R.id.last_updated, "Refreshing\u2026");
        appWidgetManager.updateAppWidget(appWidgetId, views);

        Handler mainHandler = new Handler(Looper.getMainLooper());
        new Thread(() -> {
            MetricsResult result = fetchMetrics(backendUrl, sessionId);
            mainHandler.post(() -> applyResult(context, appWidgetManager, appWidgetId, result));
        }).start();
    }

    // -------------------------------------------------------------------------
    // Network (runs on background thread)
    // -------------------------------------------------------------------------

    private static MetricsResult fetchMetrics(String backendUrl, String sessionId) {
        MetricsResult result = new MetricsResult();
        try {
            URL url = new URL(backendUrl + "/api/metrics/" + sessionId);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);

            int code = conn.getResponseCode();
            if (code == 401 || code == 404) {
                result.sessionExpired = true;
                return result;
            }
            if (code == 200) {
                BufferedReader br = new BufferedReader(
                        new InputStreamReader(conn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
                br.close();
                result.data = new JSONObject(sb.toString());
            }
        } catch (Exception e) {
            result.networkError = true;
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // UI update (runs on main thread)
    // -------------------------------------------------------------------------

    private static void applyResult(Context context, AppWidgetManager manager,
                                    int appWidgetId, MetricsResult result) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.tibia_widget_layout);

        // Re-attach click intents (RemoteViews are recreated from scratch)
        Intent launchIntent = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent != null) {
            PendingIntent openApp = PendingIntent.getActivity(context, 0, launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_container, openApp);
        }
        Intent refreshIntent = new Intent(context, TibiaWidgetProvider.class);
        refreshIntent.setAction(ACTION_REFRESH);
        refreshIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        PendingIntent refreshPi = PendingIntent.getBroadcast(context, appWidgetId, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.refresh_btn, refreshPi);

        String timeStr = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date());

        if (result.sessionExpired) {
            views.setTextViewText(R.id.status_text, "Session expired");
            views.setTextColor(R.id.status_dot, 0xFFF44336);
            views.setTextViewText(R.id.players_text, "\u2014");
            views.setTextViewText(R.id.cpu_text,     "\u2014");
            views.setTextViewText(R.id.ram_text,     "\u2014");
            views.setTextViewText(R.id.disk_text,    "\u2014");
            views.setTextViewText(R.id.last_updated, "Open app to reconnect");

        } else if (result.networkError || result.data == null) {
            views.setTextViewText(R.id.status_text, "Unreachable");
            views.setTextColor(R.id.status_dot, 0xFFF44336);
            views.setTextViewText(R.id.players_text, "\u2014");
            views.setTextViewText(R.id.cpu_text,     "\u2014");
            views.setTextViewText(R.id.ram_text,     "\u2014");
            views.setTextViewText(R.id.disk_text,    "\u2014");
            views.setTextViewText(R.id.last_updated, "Updated " + timeStr);

        } else {
            try {
                JSONObject data   = result.data;
                JSONObject tibia  = data.optJSONObject("tibia");
                JSONObject cpu    = data.optJSONObject("cpu");
                JSONObject memory = data.optJSONObject("memory");
                JSONObject disk   = data.optJSONObject("disk");

                String serverStatus = tibia  != null ? tibia.optString("serverStatus", "unknown") : "unknown";
                int    playerCount  = tibia  != null ? tibia.optInt("playerCount", 0)    : 0;
                double cpuPct       = cpu    != null ? cpu.optDouble("usagePercent", 0)  : 0;
                double memPct       = memory != null ? memory.optDouble("usagePercent", 0) : 0;
                double diskPct      = disk   != null ? disk.optDouble("usagePercent", 0) : 0;

                boolean running = "running".equals(serverStatus);
                views.setTextViewText(R.id.status_text, running ? "Running" : "Stopped");
                views.setTextColor(R.id.status_dot, running ? 0xFF4CAF50 : 0xFFF44336);
                views.setTextViewText(R.id.players_text, playerCount + " online");
                views.setTextViewText(R.id.cpu_text,  String.format(Locale.US, "%.0f%%", cpuPct));
                views.setTextColor(R.id.cpu_text,  usageColor(cpuPct));
                views.setTextViewText(R.id.ram_text,  String.format(Locale.US, "%.0f%%", memPct));
                views.setTextColor(R.id.ram_text,  usageColor(memPct));
                views.setTextViewText(R.id.disk_text, String.format(Locale.US, "%.0f%%", diskPct));
                views.setTextColor(R.id.disk_text, usageColor(diskPct));
                views.setTextViewText(R.id.last_updated, "Updated " + timeStr);

            } catch (Exception e) {
                views.setTextViewText(R.id.status_text, "Parse error");
                views.setTextViewText(R.id.last_updated, "Updated " + timeStr);
            }
        }

        manager.updateAppWidget(appWidgetId, views);
    }

    private static int usageColor(double pct) {
        if (pct >= 90) return 0xFFF44336; // red
        if (pct >= 75) return 0xFFFF9800; // orange
        return 0xFF4CAF50;                 // green
    }

    // -------------------------------------------------------------------------

    static class MetricsResult {
        JSONObject data        = null;
        boolean    sessionExpired = false;
        boolean    networkError   = false;
    }
}
