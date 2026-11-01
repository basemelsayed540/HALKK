package com.halkk.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

final class Notifier {
    static final String CH_TRACK = "tracking";
    static final String CH_ALERT = "alerts";

    private Notifier() {}

    static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CH_TRACK, "تتبع الوردية", NotificationManager.IMPORTANCE_LOW));
        NotificationChannel a = new NotificationChannel(CH_ALERT, "إشعارات الشحنات", NotificationManager.IMPORTANCE_HIGH);
        nm.createNotificationChannel(a);
    }

    static PendingIntent openApp(Context c) {
        Intent i = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (i == null) i = new Intent();
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static Notification.Builder builder(Context c, String channel) {
        ensureChannels(c);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, channel) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_halk);
        b.setContentIntent(openApp(c));
        return b;
    }

    static void alert(Context c, int id, String title, String text) {
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            Notification.Builder b = builder(c, CH_ALERT);
            b.setContentTitle(title);
            b.setContentText(text);
            b.setStyle(new Notification.BigTextStyle().bigText(text));
            b.setAutoCancel(true);
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH);
            nm.notify(id, b.build());
        } catch (Exception ignored) {
            // notification permission not granted etc.
        }
    }
}
