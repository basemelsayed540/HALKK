package com.halkk.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/** Minimal Supabase REST client (framework APIs only). */
final class Net {
    private Net() {}

    static String enc(String s) {
        try {
            return URLEncoder.encode(s, "UTF-8");
        } catch (Exception e) {
            return s;
        }
    }

    static String req(Context c, String method, String path, String body, String prefer) throws IOException {
        SharedPreferences p = Store.p(c);
        String base = p.getString("url", "");
        String key = p.getString("key", "");
        if (base.isEmpty() || key.isEmpty()) throw new IOException("not configured");
        if (!base.endsWith("/")) base = base + "/";
        HttpURLConnection h = (HttpURLConnection) new URL(base + "rest/v1/" + path).openConnection();
        try {
            h.setConnectTimeout(15000);
            h.setReadTimeout(25000);
            h.setRequestMethod(method);
            h.setRequestProperty("apikey", key);
            h.setRequestProperty("Authorization", "Bearer " + key);
            h.setRequestProperty("Accept", "application/json");
            if (prefer != null) h.setRequestProperty("Prefer", prefer);
            if (body != null) {
                h.setDoOutput(true);
                h.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                OutputStream o = h.getOutputStream();
                o.write(body.getBytes("UTF-8"));
                o.close();
            }
            int code = h.getResponseCode();
            InputStream is = code >= 400 ? h.getErrorStream() : h.getInputStream();
            String res = readAll(is);
            if (code >= 400) throw new IOException("HTTP " + code + " " + res);
            return res;
        } finally {
            h.disconnect();
        }
    }

    private static String readAll(InputStream is) throws IOException {
        if (is == null) return "";
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
        is.close();
        return bo.toString("UTF-8");
    }
}
