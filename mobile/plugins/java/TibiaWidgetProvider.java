package com.tibiaotmonitor.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.Handler;
import android.os.Looper;
import android.widget.RemoteViews;

import com.tibiaotmonitor.R;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Home-screen widget that shows live TibiaOT server metrics.
 *
 * Configuration is read directly from @react-native-async-storage's SQLite
 * database ("AsyncStorage").  This requires no native module registration in
 * MainApplication — it works out of the box on every build.
 *
 * Keys read (must match STORAGE_KEYS in AppContext.js):
 *   tibia_backend_url  — the backend base URL (e.g. "http://192.168.1.10:3000")
 *   tibia_session_id   — the active SSH session ID
 */
public class TibiaWidgetProvider extends AppWidgetProvider {

    static final String PREFS_NAME     = "TibiaOTMonitor";  // unused, kept for compat
    static final String ACTION_REFRESH = "com.tibiaotmonitor.WIDGET_REFRESH";

    // @react-native-async-storage/async-storage uses "RKStorage" on Android
    // (ReactDatabaseSupplier.DATABASE_NAME = "RKStorage", table = catalystLocalStorage)
    // Keys must match AppContext.js → STORAGE_KEYS
    private static final String AS_DB_NAME     = "RKStorage";
    private static final String AS_BACKEND_URL = "tibia_backend_url";
    private static final String AS_SESSION_ID  = "tibia_session_id";
    private static final String AS_DB_PARAMS   = "tibia_widget_db_params";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            updateWidget(context, appWidgetManager, id);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            int id = intent.getIntExtra(
                    AppWidgetManager.EXTRA_APPWIDGET_ID,
                    AppWidgetManager.INVALID_APPWIDGET_ID);
            if (id != AppWidgetManager.INVALID_APPWIDGET_ID) {
                updateWidget(context, AppWidgetManager.getInstance(context), id);
            }
        }
    }

    // -------------------------------------------------------------------------

    static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        // Show "Refreshing…" immediately so the user always sees button feedback
        RemoteViews loadingViews = buildBaseViews(context, appWidgetId);
        loadingViews.setTextViewText(R.id.last_updated, "Refreshing\u2026");
        manager.updateAppWidget(appWidgetId, loadingViews);

        Handler mainHandler = new Handler(Looper.getMainLooper());
        new Thread(() -> {
            // 1. Read config from AsyncStorage SQLite (no native module needed)
            String[] cfg       = readAsyncStorage(context);
            String backendUrl  = cfg[0];
            String sessionId   = cfg[1];
            String dbParamsJson = cfg[2];

            // 2. Fetch metrics (or report not-configured)
            MetricsResult result;
            if (backendUrl == null || sessionId == null) {
                result = new MetricsResult();
                result.notConfigured = true;
            } else {
                result = fetchMetrics(backendUrl, sessionId, dbParamsJson);
            }

            mainHandler.post(() -> applyResult(context, manager, appWidgetId, result));
        }).start();
    }

    // -------------------------------------------------------------------------
    // Read backendUrl + sessionId from AsyncStorage SQLite
    // -------------------------------------------------------------------------

    private static String[] readAsyncStorage(Context context) {
        File dbFile = context.getDatabasePath(AS_DB_NAME);
        if (!dbFile.exists()) return new String[]{null, null, null};

        String backendUrl   = null;
        String sessionId    = null;
        String dbParamsJson = null;
        SQLiteDatabase db   = null;
        try {
            db = SQLiteDatabase.openDatabase(
                    dbFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
            Cursor cursor = db.rawQuery(
                    "SELECT key, value FROM catalystLocalStorage WHERE key IN (?,?,?)",
                    new String[]{AS_BACKEND_URL, AS_SESSION_ID, AS_DB_PARAMS});
            while (cursor.moveToNext()) {
                String key = cursor.getString(0);
                String val = cursor.getString(1);
                if (AS_BACKEND_URL.equals(key))  backendUrl   = val;
                else if (AS_SESSION_ID.equals(key))   sessionId    = val;
                else if (AS_DB_PARAMS.equals(key))    dbParamsJson = val;
            }
            cursor.close();
        } catch (Exception ignored) {
            // DB may be locked or not yet created; return nulls → "Not configured"
        } finally {
            if (db != null) try { db.close(); } catch (Exception ignored2) {}
        }
        return new String[]{backendUrl, sessionId, dbParamsJson};
    }

    // -------------------------------------------------------------------------
    // Network call (background thread)
    // -------------------------------------------------------------------------

    private static MetricsResult fetchMetrics(String backendUrl, String sessionId,
                                              String dbParamsJson) {
        MetricsResult result = new MetricsResult();
        try {
            // Append DB query params if available so the backend can return playerCount
            StringBuilder urlStr = new StringBuilder(backendUrl)
                    .append("/api/metrics/").append(sessionId);
            if (dbParamsJson != null) {
                try {
                    JSONObject p = new JSONObject(dbParamsJson);
                    String dbName = p.optString("dbName", "");
                    if (!dbName.isEmpty()) {
                        urlStr.append("?dbName=").append(URLEncoder.encode(dbName, "UTF-8"))
                              .append("&dbUser=").append(URLEncoder.encode(p.optString("dbUser", ""), "UTF-8"))
                              .append("&dbPass=").append(URLEncoder.encode(p.optString("dbPass", ""), "UTF-8"));
                    }
                } catch (Exception ignored) {}
            }
            URL url = new URL(urlStr.toString());
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
    // UI helpers
    // -------------------------------------------------------------------------

    /** Build a RemoteViews with click intents already attached. */
    private static RemoteViews buildBaseViews(Context context, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.tibia_widget_layout);

        // Tap widget body → launch app
        Intent launchIntent = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent != null) {
            PendingIntent openApp = PendingIntent.getActivity(context, 0, launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_container, openApp);
        }

        // Tap ↻ → refresh broadcast
        Intent refreshIntent = new Intent(context, TibiaWidgetProvider.class);
        refreshIntent.setAction(ACTION_REFRESH);
        refreshIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        PendingIntent refreshPi = PendingIntent.getBroadcast(context, appWidgetId, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.refresh_btn, refreshPi);

        return views;
    }

    private static void applyResult(Context context, AppWidgetManager manager,
                                    int appWidgetId, MetricsResult result) {
        RemoteViews views = buildBaseViews(context, appWidgetId);
        String time = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date());

        if (result.notConfigured) {
            views.setTextViewText(R.id.status_text, "Not configured");
            views.setTextColor(R.id.status_dot, 0xFF666666);
            views.setTextViewText(R.id.players_text, "\u2014");
            views.setTextViewText(R.id.cpu_text,     "\u2014");
            views.setTextViewText(R.id.ram_text,     "\u2014");
            views.setTextViewText(R.id.disk_text,    "\u2014");
            views.setTextViewText(R.id.last_updated, "Open app to connect");

        } else if (result.sessionExpired) {
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
            views.setTextViewText(R.id.last_updated, "Updated " + time);

        } else {
            try {
                JSONObject data   = result.data;
                JSONObject tibia  = data.optJSONObject("tibia");
                JSONObject cpu    = data.optJSONObject("cpu");
                JSONObject memory = data.optJSONObject("memory");
                JSONObject disk   = data.optJSONObject("disk");

                String status = tibia != null ? tibia.optString("serverStatus", "unknown") : "unknown";
                // playerCount is null when no DB credentials are configured
                boolean hasPlayers = tibia != null && !tibia.isNull("playerCount");
                int     players    = hasPlayers ? tibia.optInt("playerCount", 0) : -1;
                double cpuPct  = cpu    != null ? cpu.optDouble("usagePercent", 0)    : 0;
                double memPct  = memory != null ? memory.optDouble("usagePercent", 0) : 0;
                double diskPct = disk   != null ? disk.optDouble("usagePercent", 0)   : 0;

                boolean running = "running".equals(status);
                views.setTextViewText(R.id.status_text, running ? "Running" : "Stopped");
                views.setTextColor(R.id.status_dot, running ? 0xFF4CAF50 : 0xFFF44336);
                views.setTextViewText(R.id.players_text,
                        players >= 0 ? players + " online" : "\u2014");
                views.setTextViewText(R.id.cpu_text,  String.format(Locale.US, "%.0f%%", cpuPct));
                views.setTextColor(R.id.cpu_text,  usageColor(cpuPct));
                views.setTextViewText(R.id.ram_text,  String.format(Locale.US, "%.0f%%", memPct));
                views.setTextColor(R.id.ram_text,  usageColor(memPct));
                views.setTextViewText(R.id.disk_text, String.format(Locale.US, "%.0f%%", diskPct));
                views.setTextColor(R.id.disk_text, usageColor(diskPct));
                views.setTextViewText(R.id.last_updated, "Updated " + time);

            } catch (Exception e) {
                views.setTextViewText(R.id.status_text, "Parse error");
                views.setTextViewText(R.id.last_updated, "Updated " + time);
            }
        }

        manager.updateAppWidget(appWidgetId, views);
    }

    private static int usageColor(double pct) {
        if (pct >= 90) return 0xFFF44336;
        if (pct >= 75) return 0xFFFF9800;
        return 0xFF4CAF50;
    }

    static class MetricsResult {
        JSONObject data          = null;
        boolean    notConfigured = false;
        boolean    sessionExpired = false;
        boolean    networkError   = false;
    }
}
