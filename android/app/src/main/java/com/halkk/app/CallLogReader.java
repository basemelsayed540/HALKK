package com.halkk.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.os.Build;
import android.provider.CallLog;
import org.json.JSONArray;
import org.json.JSONObject;

/** Reads ONLY calls whose number matches a customer number from the system. */
final class CallLogReader {
    private CallLogReader() {}

    static String key(String num) {
        if (num == null) return null;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < num.length(); i++) {
            char ch = num.charAt(i);
            if (ch >= '0' && ch <= '9') sb.append(ch);
            else if (ch >= '٠' && ch <= '٩') sb.append((char) ('0' + (ch - '٠')));
        }
        if (sb.length() < 7) return null;
        String d = sb.toString();
        return d.length() > 10 ? d.substring(d.length() - 10) : d;
    }

    static boolean allowed(Context c) {
        return Build.VERSION.SDK_INT < 23
                || c.checkSelfPermission(Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED;
    }

    static String typeName(int t) {
        switch (t) {
            case 1: return "incoming";
            case 2: return "outgoing";
            case 3: return "missed";
            case 5: return "rejected";
            default: return "other";
        }
    }

    /** phones: key(last 10 digits) -> "customer name|shipment code". */
    static JSONArray read(Context c, long sinceMs, JSONObject phones) {
        JSONArray out = new JSONArray();
        if (!allowed(c) || phones == null || phones.length() == 0) return out;
        Cursor cur = null;
        try {
            cur = c.getContentResolver().query(
                    CallLog.Calls.CONTENT_URI,
                    new String[]{CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE, CallLog.Calls.DURATION},
                    CallLog.Calls.DATE + ">=?",
                    new String[]{String.valueOf(sinceMs)},
                    CallLog.Calls.DATE + " DESC");
            if (cur == null) return out;
            while (cur.moveToNext() && out.length() < 1000) {
                String num = cur.getString(0);
                String k = key(num);
                if (k == null || !phones.has(k)) continue;
                String info = phones.optString(k, "");
                String name = info;
                String code = "";
                int bar = info.indexOf('|');
                if (bar >= 0) {
                    name = info.substring(0, bar);
                    code = info.substring(bar + 1);
                }
                JSONObject o = new JSONObject();
                o.put("number", num);
                o.put("customer", name);
                o.put("code", code);
                o.put("type", typeName(cur.getInt(1)));
                o.put("date", cur.getLong(2));
                o.put("duration", cur.getInt(3));
                out.put(o);
            }
        } catch (Exception ignored) {
            // permission revoked or provider unavailable
        } finally {
            if (cur != null) cur.close();
        }
        return out;
    }
}
