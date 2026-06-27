package com.beaver.notes;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
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

    private EditText etMemoContent;
    private Button btnCancel;
    private Button btnSubmit;
    private ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 设置浮窗样式
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

        // 初始化控件
        etMemoContent = findViewById(R.id.et_memo_content);
        btnCancel = findViewById(R.id.btn_cancel);
        btnSubmit = findViewById(R.id.btn_submit);

        // 取消按钮
        btnCancel.setOnClickListener(v -> finish());

        // 提交按钮
        btnSubmit.setOnClickListener(v -> submitMemo());
    }

    private void submitMemo() {
        String content = etMemoContent.getText().toString().trim();
        if (content.isEmpty()) {
            Toast.makeText(this, "请输入内容", Toast.LENGTH_SHORT).show();
            return;
        }

        // 获取服务器地址和 token
        SharedPreferences prefs = getSharedPreferences("capacitor_storage", Context.MODE_PRIVATE);
        String serverUrl = prefs.getString("beaver_server_url", "");
        String token = prefs.getString("token", "");

        if (serverUrl.isEmpty() || token.isEmpty()) {
            Toast.makeText(this, "请先登录", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        // 禁用按钮，显示提交中
        btnSubmit.setEnabled(false);
        btnSubmit.setText("提交中...");

        // 异步提交
        executor.execute(() -> {
            try {
                boolean success = postMemo(serverUrl, token, content);
                runOnUiThread(() -> {
                    if (success) {
                        Toast.makeText(MemoInputActivity.this, "已发布", Toast.LENGTH_SHORT).show();
                        finish();
                    } else {
                        Toast.makeText(MemoInputActivity.this, "发布失败", Toast.LENGTH_SHORT).show();
                        btnSubmit.setEnabled(true);
                        btnSubmit.setText("发布");
                    }
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    Toast.makeText(MemoInputActivity.this, "网络错误", Toast.LENGTH_SHORT).show();
                    btnSubmit.setEnabled(true);
                    btnSubmit.setText("发布");
                });
            }
        });
    }

    private boolean postMemo(String serverUrl, String token, String content) {
        try {
            URL url = new URL(serverUrl + "/api/memos/");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setDoOutput(true);
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            // 构建 JSON
            String json = "{\"content\":\"" + content.replace("\"", "\\\"").replace("\n", "\\n") + "\"}";

            OutputStream os = conn.getOutputStream();
            os.write(json.getBytes());
            os.flush();
            os.close();

            int responseCode = conn.getResponseCode();
            conn.disconnect();

            return responseCode >= 200 && responseCode < 300;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdown();
    }
}
