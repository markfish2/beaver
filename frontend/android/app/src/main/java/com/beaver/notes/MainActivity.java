package com.beaver.notes;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "BeaverMainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 添加 JavaScript 接口，让 WebView 可以直接调用原生方法
        getBridge().getWebView().addJavascriptInterface(new NativeBridge(), "NativeBridge");

        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;

        boolean openMemo = intent.getBooleanExtra("openMemo", false);
        if (openMemo) {
            Log.d(TAG, "Opening memo input from widget");
            getBridge().getWebView().post(() -> {
                String js = "window.dispatchEvent(new CustomEvent('openMemoInput', { detail: { fromWidget: true } }));";
                getBridge().getWebView().evaluateJavascript(js, null);
            });
        }
    }

    /**
     * JavaScript 接口 - 让前端可以直接保存数据到 SharedPreferences
     */
    public class NativeBridge {
        @JavascriptInterface
        public void saveData(String key, String value) {
            SharedPreferences prefs = getSharedPreferences("BeaverData", Context.MODE_PRIVATE);
            prefs.edit().putString(key, value).apply();
            Log.d(TAG, "Saved to SharedPreferences: " + key + " = " + (value.length() > 50 ? value.substring(0, 50) + "..." : value));

            // 通知小组件更新
            Intent updateIntent = new Intent(MainActivity.this, MemoWidget.class);
            updateIntent.setAction("com.beaver.notes.UPDATE_WIDGET");
            sendBroadcast(updateIntent);
        }

        @JavascriptInterface
        public String getData(String key) {
            SharedPreferences prefs = getSharedPreferences("BeaverData", Context.MODE_PRIVATE);
            return prefs.getString(key, "");
        }

        @JavascriptInterface
        public void notifyWidgetUpdate() {
            Intent updateIntent = new Intent(MainActivity.this, MemoWidget.class);
            updateIntent.setAction("com.beaver.notes.UPDATE_WIDGET");
            sendBroadcast(updateIntent);
        }
    }
}
