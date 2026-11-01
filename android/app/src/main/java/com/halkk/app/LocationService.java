package com.halkk.app;

import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

/** Foreground service that records the rep's location for the whole shift. */
public class LocationService extends Service implements LocationListener {
    private static final String TAG = "HalkLoc";
    static final String ACTION_STOP = "com.halkk.app.STOP";
    private static final int NID = 4101;
    private static final long POLL_EVERY_MS = 60000L;

    private LocationManager lm;
    private Handler handler;
    private ExecutorService ex;
    private Location lastSent;
    private long lastSentAt = 0;
    private String status = "idle";
    private boolean stopping = false;

    static void start(Context c) {
        Intent i = new Intent(c, LocationService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
        else c.startService(i);
    }

    static void stop(Context c) {
        Intent i = new Intent(c, LocationService.class);
        i.setAction(ACTION_STOP);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
        else c.startService(i);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        handler = new Handler(Looper.getMainLooper());
        ex = Executors.newSingleThreadExecutor();
    }

    private Notification buildNotification() {
        Notification.Builder b = Notifier.builder(this, Notifier.CH_TRACK);
        b.setContentTitle("الوردية شغالة");
        b.setContentText("بنسجل موقعك أثناء الوردية");
        b.setOngoing(true);
        return b.build();
    }

    private void goForeground() {
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NID, n);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        goForeground();
        SharedPreferences p = Store.p(this);
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            endShift();
            return START_NOT_STICKY;
        }
        if (intent == null && !p.getBoolean("shiftActive", false)) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        p.edit().putBoolean("shiftActive", true).apply();
        registerUpdates();
        handler.removeCallbacks(pollLoop);
        handler.post(pollLoop);
        return START_STICKY;
    }

    private final Runnable pollLoop = new Runnable() {
        @Override
        public void run() {
            if (stopping) return;
            ex.execute(new Runnable() {
                @Override
                public void run() {
                    Poller.run(LocationService.this);
                    flush();
                }
            });
            handler.postDelayed(this, POLL_EVERY_MS);
        }
    };

    private void registerUpdates() {
        try {
            lm.removeUpdates(this);
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 20000L, 10f, this);
            }
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 30000L, 25f, this);
            }
        } catch (SecurityException e) {
            Log.w(TAG, "no location permission");
        } catch (Exception e) {
            Log.w(TAG, "register: " + e.getMessage());
        }
    }

    @Override
    public void onLocationChanged(Location l) {
        if (stopping || l == null) return;
        long now = System.currentTimeMillis();
        status = (l.hasSpeed() && l.getSpeed() > 1f) ? "online" : "idle";
        boolean send;
        if (lastSent == null) {
            send = true;
        } else if (l.hasAccuracy() && l.getAccuracy() > 150f) {
            send = false;
        } else {
            long wait = "online".equals(status) ? 5 * 60000L : 10 * 60000L;
            send = l.distanceTo(lastSent) >= 100f || now - lastSentAt >= wait;
        }
        if (!send) return;
        lastSent = new Location(l);
        lastSentAt = now;
        final JSONObject rec = record(l.getLatitude(), l.getLongitude(), status);
        ex.execute(new Runnable() {
            @Override
            public void run() {
                enqueue(rec);
                flush();
            }
        });
    }

    @Override
    public void onStatusChanged(String provider, int s, Bundle extras) {}

    @Override
    public void onProviderEnabled(String provider) {}

    @Override
    public void onProviderDisabled(String provider) {}

    private JSONObject record(double lat, double lng, String st) {
        SharedPreferences p = Store.p(this);
        JSONObject o = new JSONObject();
        try {
            Object id;
            try {
                id = new JSONTokener(p.getString("userIdJson", "null")).nextValue();
            } catch (Exception e) {
                id = JSONObject.NULL;
            }
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            o.put("rep_id", id);
            o.put("rep_name", p.getString("trackName", ""));
            o.put("lat", lat);
            o.put("lng", lng);
            o.put("status", st);
            o.put("timestamp", f.format(new Date()));
        } catch (Exception ignored) {
            // JSON put cannot realistically fail here
        }
        return o;
    }

    /** Runs on the executor thread only. */
    private void enqueue(JSONObject rec) {
        SharedPreferences p = Store.p(this);
        try {
            JSONArray q = new JSONArray(p.getString("locQueue", "[]"));
            q.put(rec);
            JSONArray trimmed = new JSONArray();
            int from = Math.max(0, q.length() - 500);
            for (int i = from; i < q.length(); i++) trimmed.put(q.get(i));
            p.edit().putString("locQueue", trimmed.toString()).apply();
        } catch (Exception e) {
            Log.w(TAG, "enqueue: " + e.getMessage());
        }
    }

    /** Runs on the executor thread only. */
    private void flush() {
        SharedPreferences p = Store.p(this);
        try {
            JSONArray q = new JSONArray(p.getString("locQueue", "[]"));
            int n = q.length();
            if (n == 0) return;
            Net.req(this, "POST", "rep_locations", q.toString(), "return=minimal");
            JSONArray cur = new JSONArray(p.getString("locQueue", "[]"));
            JSONArray rest = new JSONArray();
            for (int i = n; i < cur.length(); i++) rest.put(cur.get(i));
            p.edit().putString("locQueue", rest.toString()).apply();
        } catch (Exception e) {
            Log.w(TAG, "flush (will retry): " + e.getMessage());
        }
    }

    private void endShift() {
        stopping = true;
        handler.removeCallbacks(pollLoop);
        try { lm.removeUpdates(this); } catch (Exception ignored) { }
        Store.p(this).edit().putBoolean("shiftActive", false).apply();
        Location last = lastSent;
        if (last == null) {
            try {
                last = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                if (last == null) last = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            } catch (Exception ignored) { }
        }
        final JSONObject rec = last == null ? null : record(last.getLatitude(), last.getLongitude(), "offline");
        ex.execute(new Runnable() {
            @Override
            public void run() {
                if (rec != null) enqueue(rec);
                flush();
            }
        });
        ex.shutdown();
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopping = true;
        try { lm.removeUpdates(this); } catch (Exception ignored) { }
        handler.removeCallbacks(pollLoop);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
