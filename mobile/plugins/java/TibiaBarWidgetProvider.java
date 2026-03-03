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
 * 4 × 2 bar-style home-screen widget.
 *
 * Shows CPU, RAM, DISK, and PING each as a labelled horizontal progress bar
 * with a colour-coded percentage / millisecond value beside it.
 *
 * Inspired by Samsung's compact battery bar widget design.
 *
 * Configuration is read from @react-native-async-storage's SQLite database
 * ("RKStorage") — no native module registration required.
 */
public class TibiaBarWidgetProvider extends AppWidgetProvider {

    static final String ACTION_REFRESH = "com.tibiaotmonitor.BAR_WIDGET_REFRESH";

    private static final String AS_DB_NAME     = "RKStorage";
    private static final String AS_BACKEND_URL = "tibia_backend_url";
    private static final String AS_SESSION_ID  = "tibia_session_id";
    private static final String AS_DB_PARAMS   = "tibia_widget_db_params";

    // -------------------------------------------------------------------------

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateWidget(context, mgr, id);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,
                    AppWidgetManager.INVALID_APPWIDGET_ID);
            if (id != AppWidgetManager.INVALID_APPWIDGET_ID)
                updateWidget(context, AppWidgetManager.getInstance(context), id);
        }
    }

    // -------------------------------------------------------------------------

    static void updateWidget(Context context, AppWidgetManager mgr, int widgetId) {
        RemoteViews loading = buildBase(context, widgetId);
        loading.setTextViewText(R.id.last_updated, "Refreshing\u2026");
        mgr.updateAppWidget(widgetId, loading);

        new Thread(() -> {
            String[] cfg        = readAsyncStorage(context);
            String backendUrl   = cfg[0];
            String sessionId    = cfg[1];
            String dbParamsJson = cfg[2];

            Result result;
            if (backendUrl == null || sessionId == null) {
                result = new Result();
                result.notConfigured = true;
            } else {
                result = fetch(backendUrl, sessionId, dbParamsJson);
            }
            new Handler(Looper.getMainLooper()).post(
                    () -> apply(context, mgr, widgetId, result));
        }).start();
    }

    // -------------------------------------------------------------------------
    // AsyncStorage reader (same approach as TibiaWidgetProvider)
    // -------------------------------------------------------------------------

    private static String[] readAsyncStorage(Context context) {
        File dbFile = context.getDatabasePath(AS_DB_NAME);
        if (!dbFile.exists()) return new String[]{null, null, null};

        String backendUrl = null, sessionId = null, dbParams = null;
        SQLiteDatabase db = null;
        try {
            db = SQLiteDatabase.openDatabase(dbFile.getAbsolutePath(), null,
                    SQLiteDatabase.OPEN_READONLY);
            Cursor c = db.rawQuery(
                    "SELECT key, value FROM catalystLocalStorage WHERE key IN (?,?,?)",
                    new String[]{AS_BACKEND_URL, AS_SESSION_ID, AS_DB_PARAMS});
            while (c.moveToNext()) {
                String k = c.getString(0), v = c.getString(1);
                if (AS_BACKEND_URL.equals(k))  backendUrl = v;
                else if (AS_SESSION_ID.equals(k))   sessionId  = v;
                else if (AS_DB_PARAMS.equals(k))    dbParams   = v;
            }
            c.close();
        } catch (Exception ignored) {
        } finally {
            if (db != null) try { db.close(); } catch (Exception ignored2) {}
        }
        return new String[]{backendUrl, sessionId, dbParams};
    }

    // -------------------------------------------------------------------------
    // Network (background thread)
    // -------------------------------------------------------------------------

    private static Result fetch(String backendUrl, String sessionId, String dbParamsJson) {
        Result r = new Result();
        try {
            // Metrics
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
            HttpURLConnection conn = openGET(urlStr.toString());
            int code = conn.getResponseCode();
            if (code == 401 || code == 404) { r.sessionExpired = true; return r; }
            if (code == 200) r.metrics = new JSONObject(readBody(conn));

            // Latency: mirror the mobile app's fetchPing() — time 3 /health round-trips
            // from this device to the backend (NOT an ICMP ping from backend to SSH host,
            // which would always show ~0ms when both are on the same machine/LAN).
            r.ping = measureLatency(backendUrl);

        } catch (Exception e) {
            r.networkError = true;
        }
        return r;
    }

    /**
     * Measures round-trip latency from this device to the backend by timing
     * three GET /health requests — identical to the mobile app's fetchPing().
     * Returns a JSONObject with { alive, latencyMs, min, max } or null on error.
     */
    private static JSONObject measureLatency(String backendUrl) {
        final int PROBES = 3;
        long total = 0;
        long min   = Long.MAX_VALUE;
        long max   = Long.MIN_VALUE;
        int  count = 0;
        for (int i = 0; i < PROBES; i++) {
            try {
                long t0 = System.currentTimeMillis();
                HttpURLConnection hc = openGET(backendUrl + "/health");
                hc.setConnectTimeout(5_000);
                hc.setReadTimeout(5_000);
                if (hc.getResponseCode() == 200) {
                    long ms = System.currentTimeMillis() - t0;
                    total += ms;
                    min    = Math.min(min, ms);
                    max    = Math.max(max, ms);
                    count++;
                }
                hc.disconnect();
            } catch (Exception ignored) {}
        }
        if (count == 0) return null;
        try {
            double avg = (double) total / count;
            JSONObject j = new JSONObject();
            j.put("alive",     true);
            j.put("latencyMs", Math.round(avg * 10.0) / 10.0);
            j.put("min",       (double) min);
            j.put("max",       (double) max);
            return j;
        } catch (Exception e) {
            return null;
        }
    }

    private static HttpURLConnection openGET(String urlStr) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(urlStr).openConnection();
        c.setRequestMethod("GET");
        c.setConnectTimeout(10_000);
        c.setReadTimeout(10_000);
        return c;
    }

    private static String readBody(HttpURLConnection conn) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) sb.append(line);
        br.close();
        return sb.toString();
    }

    // -------------------------------------------------------------------------
    // UI
    // -------------------------------------------------------------------------

    private static RemoteViews buildBase(Context context, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(),
                R.layout.tibia_bar_widget_layout);

        Intent launch = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
        if (launch != null) {
            views.setOnClickPendingIntent(R.id.widget_container,
                    PendingIntent.getActivity(context, 0, launch,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }

        Intent refreshIntent = new Intent(context, TibiaBarWidgetProvider.class);
        refreshIntent.setAction(ACTION_REFRESH);
        refreshIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        views.setOnClickPendingIntent(R.id.refresh_btn,
                PendingIntent.getBroadcast(context, widgetId, refreshIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return views;
    }

    private static void apply(Context context, AppWidgetManager mgr,
                              int widgetId, Result r) {
        RemoteViews views = buildBase(context, widgetId);
        String time = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date());

        if (r.notConfigured) {
            views.setTextViewText(R.id.status_text, "Not configured");
            views.setTextColor(R.id.status_dot, 0xFF666666);
            views.setTextViewText(R.id.players_text, "");
            setDash(views, R.id.cpu_text);  views.setProgressBar(R.id.bar_cpu,  100, 0, false);
            setDash(views, R.id.ram_text);  views.setProgressBar(R.id.bar_ram,  100, 0, false);
            setDash(views, R.id.disk_text); views.setProgressBar(R.id.bar_disk, 100, 0, false);
            setDash(views, R.id.ping_text); views.setProgressBar(R.id.bar_ping, 200, 0, false);
            views.setTextViewText(R.id.last_updated, "Open app to connect");
            mgr.updateAppWidget(widgetId, views);
            return;
        }

        if (r.sessionExpired) {
            views.setTextViewText(R.id.status_text, "Session expired");
            views.setTextColor(R.id.status_dot, 0xFFF44336);
            views.setTextViewText(R.id.players_text, "");
            setDash(views, R.id.cpu_text);  views.setProgressBar(R.id.bar_cpu,  100, 0, false);
            setDash(views, R.id.ram_text);  views.setProgressBar(R.id.bar_ram,  100, 0, false);
            setDash(views, R.id.disk_text); views.setProgressBar(R.id.bar_disk, 100, 0, false);
            setDash(views, R.id.ping_text); views.setProgressBar(R.id.bar_ping, 200, 0, false);
            views.setTextViewText(R.id.last_updated, "Open app to reconnect");
            mgr.updateAppWidget(widgetId, views);
            return;
        }

        if (r.networkError || r.metrics == null) {
            views.setTextViewText(R.id.status_text, "Unreachable");
            views.setTextColor(R.id.status_dot, 0xFFF44336);
            views.setTextViewText(R.id.players_text, "");
            setDash(views, R.id.cpu_text);  views.setProgressBar(R.id.bar_cpu,  100, 0, false);
            setDash(views, R.id.ram_text);  views.setProgressBar(R.id.bar_ram,  100, 0, false);
            setDash(views, R.id.disk_text); views.setProgressBar(R.id.bar_disk, 100, 0, false);
            setDash(views, R.id.ping_text); views.setProgressBar(R.id.bar_ping, 200, 0, false);
            views.setTextViewText(R.id.last_updated, "Updated " + time);
            mgr.updateAppWidget(widgetId, views);
            return;
        }

        try {
            JSONObject data   = r.metrics;
            JSONObject tibia  = data.optJSONObject("tibia");
            JSONObject cpu    = data.optJSONObject("cpu");
            JSONObject memory = data.optJSONObject("memory");
            JSONObject disk   = data.optJSONObject("disk");

            String  status  = tibia != null ? tibia.optString("serverStatus", "unknown") : "unknown";
            boolean running = "running".equals(status);
            boolean hasPlayers = tibia != null && !tibia.isNull("playerCount");
            int     players    = hasPlayers ? tibia.optInt("playerCount", 0) : -1;

            views.setTextViewText(R.id.status_text, running ? "Running" : "Stopped");
            views.setTextColor(R.id.status_dot, running ? 0xFF4CAF50 : 0xFFF44336);
            views.setTextViewText(R.id.players_text,
                    players >= 0 ? players + " online" : "");

            double cpuPct  = cpu    != null ? cpu.optDouble("usagePercent",    0) : 0;
            double memPct  = memory != null ? memory.optDouble("usagePercent", 0) : 0;
            double diskPct = disk   != null ? disk.optDouble("usagePercent",   0) : 0;

            views.setProgressBar(R.id.bar_cpu,  100, (int) cpuPct,  false);
            views.setProgressBar(R.id.bar_ram,  100, (int) memPct,  false);
            views.setProgressBar(R.id.bar_disk, 100, (int) diskPct, false);

            views.setTextViewText(R.id.cpu_text,  fmt(cpuPct)  + "%");
            views.setTextColor(R.id.cpu_text,  usageColor(cpuPct));
            views.setTextViewText(R.id.ram_text,  fmt(memPct)  + "%");
            views.setTextColor(R.id.ram_text,  usageColor(memPct));
            views.setTextViewText(R.id.disk_text, fmt(diskPct) + "%");
            views.setTextColor(R.id.disk_text, usageColor(diskPct));

            if (r.ping != null && r.ping.optBoolean("alive", false)) {
                double latency = r.ping.optDouble("latencyMs", 0);
                int latencyMs  = (int) Math.round(latency);
                views.setProgressBar(R.id.bar_ping, 200, Math.min(latencyMs, 200), false);
                // Show "< 1ms" for sub-millisecond LAN/localhost latency
                String pingLabel = latencyMs < 1 ? "<1ms" : latencyMs + "ms";
                views.setTextViewText(R.id.ping_text, pingLabel);
                views.setTextColor(R.id.ping_text, pingColor(latency));
            } else {
                views.setProgressBar(R.id.bar_ping, 200, 0, false);
                views.setTextViewText(R.id.ping_text, "N/A");
                views.setTextColor(R.id.ping_text, 0xFFF44336);
            }

            views.setTextViewText(R.id.last_updated, "Updated " + time);

        } catch (Exception e) {
            views.setTextViewText(R.id.status_text, "Parse error");
            views.setTextViewText(R.id.last_updated, "Updated " + time);
        }

        mgr.updateAppWidget(widgetId, views);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static void setDash(RemoteViews v, int id) {
        v.setTextViewText(id, "\u2014");
        v.setTextColor(id, 0xFF666666);
    }

    private static String fmt(double d) {
        return String.format(Locale.US, "%.0f", d);
    }

    private static int usageColor(double pct) {
        if (pct >= 90) return 0xFFF44336;
        if (pct >= 75) return 0xFFFF9800;
        return 0xFF4CAF50;
    }

    private static int pingColor(double ms) {
        if (ms >= 100) return 0xFFF44336;
        if (ms >= 50)  return 0xFFFF9800;
        return 0xFF4CAF50;
    }

    // -------------------------------------------------------------------------

    static class Result {
        JSONObject metrics       = null;
        JSONObject ping          = null;
        boolean    notConfigured = false;
        boolean    sessionExpired = false;
        boolean    networkError   = false;
    }
}
