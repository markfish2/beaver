package com.beaver.notes;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * MemoInputActivity - 浮窗输入 memo 笔记
 */
public class MemoInputActivity extends Activity {

    private static final String TAG = "MemoInputActivity";
    private EditText etMemoContent;
    private Button btnCancel;
    private Button btnSubmit;
    private ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        setContentView(R.layout.activity_memo_input);

        // 设置窗口大小和位置
        Window window = getWindow();
        if (window != null) {
            WindowManager.LayoutParams params = window.getAttributes();
            params.width = WindowManager.LayoutParams.MATCH_PARENT;
            params.height = WindowManager.LayoutParams.WRAP_CONTENT;
            params.gravity = android.view.Gravity.CENTER;
            window.setAttributes(params);
        }

        etMemoContent = findViewById(R.id.et_memo_content);
        btnCancel = findViewById(R.id.btn_cancel);
        btnSubmit = findViewById(R.id.btn_submit);

        btnCancel.setOnClickListener(v -> finish());
        btnSubmit.setOnClickListener(v -> submitMemo());
    }

    private void submitMemo() {
        String content = etMemoContent.getText().toString().trim();
        if (content.isEmpty()) {
            Toast.makeText(this, "请输入内容", Toast.LENGTH_SHORT).show();
            return;
        }

        // 从 SharedPreferences 读取服务器地址和 token
        SharedPreferences prefs = getSharedPreferences("BeaverData", Context.MODE_PRIVATE);
        String serverUrl = prefs.getString("serverUrl", "");
        String token = prefs.getString("token", "");

        Log.d(TAG, "serverUrl=" + serverUrl + ", token=" + (token != null && !token.isEmpty() ? "exists" : "empty"));

        if (serverUrl == null || serverUrl.isEmpty() || token == null || token.isEmpty()) {
            Toast.makeText(this, "请先在 APP 中登录", Toast.LENGTH_LONG).show();
            return;
        }

        // 禁用按钮
        btnSubmit.setEnabled(false);
        btnSubmit.setText("提交中...");

        // 异步提交
        String finalServerUrl = serverUrl;
        String finalToken = token;
        executor.execute(() -> {
            try {
                boolean success = postMemo(finalServerUrl, finalToken, content);
                Log.d(TAG, "Post memo result: " + success);
                runOnUiThread(() -> {
                    if (success) {
                        Toast.makeText(MemoInputActivity.this, "已发布", Toast.LENGTH_SHORT).show();
                        // 通知小组件更新
                        Intent updateIntent = new Intent(MemoInputActivity.this, MemoWidget.class);
                        updateIntent.setAction("com.beaver.notes.UPDATE_WIDGET");
                        sendBroadcast(updateIntent);
                        finish();
                    } else {
                        Toast.makeText(MemoInputActivity.this, "发布失败", Toast.LENGTH_SHORT).show();
                        btnSubmit.setEnabled(true);
                        btnSubmit.setText("发布");
                    }
                });
            } catch (Exception e) {
                Log.e(TAG, "Post memo error", e);
                runOnUiThread(() -> {
                    Toast.makeText(MemoInputActivity.this, "网络错误", Toast.LENGTH_SHORT).show();
                    btnSubmit.setEnabled(true);
                    btnSubmit.setText("发布");
                });
            }
        });
    }

    private boolean postMemo(String serverUrl, String token, String content) {
        HttpURLConnection conn = null;
        try {
            // 确保 URL 格式正确
            if (!serverUrl.startsWith("http")) {
                serverUrl = "https://" + serverUrl;
            }
            String urlStr = serverUrl + "/api/memos/";
            Log.d(TAG, "Posting to: " + urlStr);

            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setDoOutput(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setInstanceFollowRedirects(true);

            // 构建 JSON
            String escapedContent = content
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
            String json = "{\"content\":\"" + escapedContent + "\"}";

            OutputStream os = conn.getOutputStream();
            os.write(json.getBytes("UTF-8"));
            os.flush();
            os.close();

            int responseCode = conn.getResponseCode();
            Log.d(TAG, "Response code: " + responseCode);

            if (responseCode >= 200 && responseCode < 300) {
                return true;
            } else {
                // 读取错误响应
                try {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getErrorStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    reader.close();
                    Log.e(TAG, "Error response: " + sb.toString());
                } catch (Exception e) {
                    // ignore
                }
                return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "HTTP error", e);
            return false;
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdown();
    }
}
