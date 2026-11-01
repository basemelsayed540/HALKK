package com.halkk.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/** Server polling: shipment status changes, broadcast messages, call-log sync. */
final class Poller {
    private static final String TAG = "HalkPoller";

    private Poller() {}

    static synchronized void run(Context ctx) {
        Context c = ctx.getApplicationContext();
        SharedPreferences p = Store.p(c);
        if (!p.getBoolean("configured", false)) return;
        String rep = p.getString("repName", "");
        if (rep.isEmpty()) return;
        try { pollShipments(c, p, rep); } catch (Exception e) { Log.w(TAG, "shipments: " + e.getMessage()); }
        try { pollMessages(c, p, rep); } catch (Exception e) { Log.w(TAG, "messages: " + e.getMessage()); }
        try { syncCalls(c, p, rep); } catch (Exception e) { Log.w(TAG, "calls: " + e.getMessage()); }
    }

    private static void pollShipments(Context c, SharedPreferences p, String rep) throws Exception {
        String sel = "id,\"الحالة\",\"اسم العميل\",\"كود الشحنة\",\"الهاتف\",\"هاتف بديل\"";
        String path = "invoices?select=" + Net.enc(sel) + "&" + Net.enc("المندوب") + "=eq." + Net.enc(rep) + "&limit=3000";
        JSONArray rows = new JSONArray(Net.req(c, "GET", path, null, null));

        JSONObject snap = new JSONObject();
        JSONObject phones = new JSONObject();
        JSONObject old = null;
        String oldRaw = p.getString("snap", "");
        if (!oldRaw.isEmpty()) {
            try { old = new JSONObject(oldRaw); } catch (Exception ignored) { old = null; }
        }
        List<String> lines = new ArrayList<>();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject r = rows.getJSONObject(i);
            String id = String.valueOf(r.opt("id"));
            String st = r.optString("الحالة", "");
            String name = r.optString("اسم العميل", "");
            String code = r.optString("كود الشحنة", "");
            snap.put(id, st);
            String label = name.isEmpty() ? (code.isEmpty() ? id : code) : name;
            String info = name + "|" + code;
            String k1 = CallLogReader.key(r.optString("الهاتف", ""));
            String k2 = CallLogReader.key(r.optString("هاتف بديل", ""));
            if (k1 != null) phones.put(k1, info);
            if (k2 != null) phones.put(k2, info);
            if (old != null) {
                if (old.has(id)) {
                    String was = old.optString(id, "");
                    if (!was.equals(st) && !st.isEmpty()) lines.add("تحديث حالة: " + label + " (" + was + " ← " + st + ")");
                } else if (!st.isEmpty()) {
                    lines.add("شحنة جديدة: " + label + " (" + st + ")");
                }
            }
        }
        p.edit().putString("snap", snap.toString()).putString("phones", phones.toString()).apply();

        if (lines.isEmpty()) return;
        if (lines.size() <= 3) {
            for (int i = 0; i < lines.size(); i++) {
                Notifier.alert(c, 5000 + (int) ((System.currentTimeMillis() / 1000 + i) % 100000), "HALKK", lines.get(i));
            }
        } else {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < lines.size() && i < 12; i++) sb.append(lines.get(i)).append('\n');
            Notifier.alert(c, 4999, lines.size() + " تحديثات على شحناتك", sb.toString().trim());
        }
    }

    private static void pollMessages(Context c, SharedPreferences p, String rep) throws Exception {
        long last = p.getLong("msgLast", -1);
        if (last < 0) {
            String r = Net.req(c, "GET", "push_messages?select=id&order=id.desc&limit=1", null, null);
            JSONArray a = new JSONArray(r);
            p.edit().putLong("msgLast", a.length() > 0 ? a.getJSONObject(0).getLong("id") : 0).apply();
            return;
        }
        JSONArray a = new JSONArray(Net.req(c, "GET",
                "push_messages?select=id,title,body,target_rep&id=gt." + last + "&order=id.asc&limit=20", null, null));
        long max = last;
        for (int i = 0; i < a.length(); i++) {
            JSONObject m = a.getJSONObject(i);
            long id = m.getLong("id");
            if (id > max) max = id;
            String t = m.isNull("target_rep") ? "" : m.optString("target_rep", "");
            if (!t.isEmpty() && !t.equals("all") && !t.equals(rep)) continue;
            String title = m.isNull("title") ? "HALKK" : m.optString("title", "HALKK");
            String body = m.isNull("body") ? "" : m.optString("body", "");
            Notifier.alert(c, 6000 + (int) (id % 90000), title, body);
        }
        if (max != last) p.edit().putLong("msgLast", max).apply();
    }

    private static void syncCalls(Context c, SharedPreferences p, String rep) throws Exception {
        if (!CallLogReader.allowed(c)) return;
        String raw = p.getString("phones", "");
        if (raw.isEmpty()) return;
        long since = p.getLong("callSince", System.currentTimeMillis() - 7L * 86400000L);
        JSONArray calls = CallLogReader.read(c, since, new JSONObject(raw));
        if (calls.length() == 0) {
            p.edit().putLong("callSince", Math.max(since, System.currentTimeMillis() - 60000L)).apply();
            return;
        }
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        JSONArray out = new JSONArray();
        long max = since;
        for (int i = 0; i < calls.length(); i++) {
            JSONObject o = calls.getJSONObject(i);
            long d = o.getLong("date");
            if (d > max) max = d;
            JSONObject r = new JSONObject();
            r.put("rep_name", rep);
            r.put("number", o.getString("number"));
            r.put("customer_name", o.getString("customer"));
            r.put("shipment_code", o.getString("code"));
            r.put("call_type", o.getString("type"));
            r.put("call_time", f.format(new Date(d)));
            r.put("duration_sec", o.getInt("duration"));
            out.put(r);
        }
        Net.req(c, "POST", "call_logs?on_conflict=rep_name,number,call_time", out.toString(),
                "resolution=ignore-duplicates,return=minimal");
        p.edit().putLong("callSince", max + 1).apply();
    }
}
