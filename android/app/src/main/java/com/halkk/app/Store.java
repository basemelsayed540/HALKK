package com.halkk.app;

import android.content.Context;
import android.content.SharedPreferences;

final class Store {
    private Store() {}

    static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences("halk", Context.MODE_PRIVATE);
    }
}
