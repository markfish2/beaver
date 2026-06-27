package com.beaver.notes;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "BeaverMainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
}
