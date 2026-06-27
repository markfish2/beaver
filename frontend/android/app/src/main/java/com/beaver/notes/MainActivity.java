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

        // 更新桌面小组件数据
        updateWidget();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
        updateWidget();
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

    private void updateWidget() {
        // 触发小组件更新
        Intent updateIntent = new Intent(this, MemoWidget.class);
        updateIntent.setAction("com.beaver.notes.UPDATE_WIDGET");
        sendBroadcast(updateIntent);
    }
}
