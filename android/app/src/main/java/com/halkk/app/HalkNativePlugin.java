package com.halkk.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "HalkNative")
public class HalkNativePlugin extends Plugin {
    static final int REQ = 7421;
    private static HalkNativePlugin inst;
    private PluginCall permCall;
    private final List<String[]> steps = new ArrayList<>();

    @Override
    public void load() {
        inst = this;
    }

    static void onPermResult(int code, String[] perms, int[] res) {
        if (inst != null && code == REQ) inst.nextStep();
    }

    private boolean has(String perm) {
        return Build.VERSION.SDK_INT < 23
                || getContext().checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject statusObj() {
        JSObject r = new JSObject();
        r.put("location", has(Manifest.permission.ACCESS_FINE_LOCATION));
        r.put("background", Build.VERSION.SDK_INT < 29 || has(Manifest.permission.ACCESS_BACKGROUND_LOCATION));
        r.put("notifications", Build.VERSION.SDK_INT < 33 || has(Manifest.permission.POST_NOTIFICATIONS));
        r.put("callLog", has(Manifest.permission.READ_CALL_LOG));
        boolean batt = true;
        if (Build.VERSION.SDK_INT >= 23) {
            PowerManager pm = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
            batt = pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        }
        r.put("batteryExempt", batt);
        r.put("shiftActive", Store.p(getContext()).getBoolean("shiftActive", false));
        return r;
    }

    @PluginMethod
    public void configure(PluginCall call) {
        SharedPreferences.Editor e = Store.p(getContext()).edit();
        e.putString("url", call.getString("url", ""));
        e.putString("key", call.getString("key", ""));
        e.putString("userIdJson", call.getString("userIdJson", "null"));
        e.putString("trackName", call.getString("trackName", ""));
        String rep = call.getString("repName", "");
        String prev = Store.p(getContext()).getString("repName", "");
        if (!rep.equals(prev)) {
            e.remove("snap").remove("phones").remove("callSince").remove("msgLast");
        }
        e.putString("repName", rep);
        e.putBoolean("configured", !rep.isEmpty());
        e.apply();
        if (rep.isEmpty()) PollJobService.cancel(getContext());
        else PollJobService.schedule(getContext());
        call.resolve(statusObj());
    }

    @PluginMethod
    public void clearUser(PluginCall call) {
        LocationService.stop(getContext());
        Store.p(getContext()).edit().clear().apply();
        PollJobService.cancel(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(statusObj());
    }

    @PluginMethod
    public void askPermissions(PluginCall call) {
        if (permCall != null) {
            call.reject("busy");
            return;
        }
        permCall = call;
        steps.clear();
        steps.add(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION});
        if (Build.VERSION.SDK_INT >= 29) steps.add(new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION});
        if (Build.VERSION.SDK_INT >= 33) steps.add(new String[]{Manifest.permission.POST_NOTIFICATIONS});
        steps.add(new String[]{Manifest.permission.READ_CALL_LOG});
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                nextStep();
            }
        });
    }

    private void nextStep() {
        if (permCall == null) return;
        Activity a = getActivity();
        while (!steps.isEmpty()) {
            String[] s = steps.remove(0);
            boolean isBg = s.length == 1 && Manifest.permission.ACCESS_BACKGROUND_LOCATION.equals(s[0]);
            if (isBg && !has(Manifest.permission.ACCESS_FINE_LOCATION)) continue;
            boolean need = false;
            for (String x : s) if (!has(x)) need = true;
            if (need && Build.VERSION.SDK_INT >= 23) {
                a.requestPermissions(s, REQ);
                return;
            }
        }
        PluginCall c = permCall;
        permCall = null;
        c.resolve(statusObj());
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 23) {
            try {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                i.setData(Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(i);
            } catch (Exception ignored) {
                // some OEMs block this screen
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        i.setData(Uri.parse("package:" + getContext().getPackageName()));
        getActivity().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void startShift(PluginCall call) {
        if (!has(Manifest.permission.ACCESS_FINE_LOCATION)) {
            call.reject("NO_LOCATION_PERMISSION");
            return;
        }
        LocationService.start(getContext());
        JSObject r = statusObj();
        r.put("shiftActive", true);
        call.resolve(r);
    }

    @PluginMethod
    public void stopShift(PluginCall call) {
        LocationService.stop(getContext());
        JSObject r = statusObj();
        r.put("shiftActive", false);
        call.resolve(r);
    }

    /** Call history limited to numbers of customers that exist in the system. */
    @PluginMethod
    public void getCallLog(PluginCall call) {
        int days = call.getInt("days", 14);
        try {
            String raw = Store.p(getContext()).getString("phones", "");
            JSONObject phones = raw.isEmpty() ? new JSONObject() : new JSONObject(raw);
            long since = System.currentTimeMillis() - days * 86400000L;
            JSONArray arr = CallLogReader.read(getContext(), since, phones);
            JSObject r = new JSObject();
            r.put("calls", new JSArray(arr.toString()));
            r.put("customers", phones.length());
            call.resolve(r);
        } catch (Exception e) {
            call.reject("CALLLOG_ERROR: " + e.getMessage());
        }
    }

    /** Force a poll right now (refresh customer numbers, notifications, call sync). */
    @PluginMethod
    public void pollNow(final PluginCall call) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                Poller.run(getContext());
                call.resolve(statusObj());
            }
        }).start();
    }
}
