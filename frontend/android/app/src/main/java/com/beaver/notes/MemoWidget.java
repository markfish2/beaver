package com.beaver.notes;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * MemoWidget - 桌面小组件
 * 显示待办和日记，点击 + 按钮弹出 memo 输入浮窗
 */
public class MemoWidget extends AppWidgetProvider {

    private static ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        // 先更新 UI，然后异步获取数据
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
        // 异步获取数据并更新
        fetchAndUpdateWidget(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if ("com.beaver.notes.UPDATE_WIDGET".equals(intent.getAction())) {
            fetchAndUpdateWidget(context);
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.memo_widget);

        // 从 SharedPreferences 读取缓存数据
        SharedPreferences prefs = context.getSharedPreferences("widget_data", Context.MODE_PRIVATE);
        String todosJson = prefs.getString("todos", "[]");
        String diaryContent = prefs.getString("diary", "");

        // 更新待办列表
        try {
            JSONArray todos = new JSONArray(todosJson);
            views.removeAllViews(R.id.todos_container);

            if (todos.length() > 0) {
                views.setViewVisibility(R.id.todos_title, View.VISIBLE);
                views.setViewVisibility(R.id.empty_text, View.GONE);

                int maxShow = Math.min(todos.length(), 5);
                for (int i = 0; i < maxShow; i++) {
                    JSONObject todo = todos.getJSONObject(i);
                    String content = todo.getString("content");
                    boolean completed = todo.getBoolean("is_completed");

                    RemoteViews todoView = new RemoteViews(context.getPackageName(), R.layout.widget_todo_item);
                    todoView.setTextViewText(R.id.todo_text, content);
                    if (completed) {
                        todoView.setInt(R.id.todo_text, "setPaintFlags", android.graphics.Paint.STRIKE_THRU_TEXT_FLAG);
                        todoView.setTextColor(R.id.todo_text, 0xFF9CA3AF);
                    } else {
                        todoView.setInt(R.id.todo_text, "setPaintFlags", 0);
                        todoView.setTextColor(R.id.todo_text, 0xFF1F2937);
                    }
                    views.addView(R.id.todos_container, todoView);
                }

                if (todos.length() > 5) {
                    RemoteViews moreView = new RemoteViews(context.getPackageName(), R.layout.widget_todo_item);
                    moreView.setTextViewText(R.id.todo_text, "还有 " + (todos.length() - 5) + " 项...");
                    moreView.setTextColor(R.id.todo_text, 0xFF9CA3AF);
                    views.addView(R.id.todos_container, moreView);
                }
            } else {
                views.setViewVisibility(R.id.todos_title, View.GONE);
            }
        } catch (Exception e) {
            views.setViewVisibility(R.id.todos_title, View.GONE);
        }

        // 更新日记
        if (diaryContent != null && !diaryContent.isEmpty()) {
            views.setViewVisibility(R.id.diary_title, View.VISIBLE);
            views.setViewVisibility(R.id.diary_content, View.VISIBLE);
            views.setTextViewText(R.id.diary_content, diaryContent);
            views.setViewVisibility(R.id.empty_text, View.GONE);
        } else {
            views.setViewVisibility(R.id.diary_title, View.GONE);
            views.setViewVisibility(R.id.diary_content, View.GONE);
        }

        // 如果既没有待办也没有日记，显示空状态
        try {
            JSONArray todos = new JSONArray(todosJson);
            if (todos.length() == 0 && (diaryContent == null || diaryContent.isEmpty())) {
                views.setViewVisibility(R.id.empty_text, View.VISIBLE);
            }
        } catch (Exception e) {
            // ignore
        }

        // 点击 + 按钮打开浮窗
        Intent addIntent = new Intent(context, MemoInputActivity.class);
        PendingIntent addPendingIntent = PendingIntent.getActivity(
            context, 0, addIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.btn_add_memo, addPendingIntent);

        // 点击整个小组件打开 APP
        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
            context, 1, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_root, openPendingIntent);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    /**
     * 异步获取待办和日记数据
     */
    static void fetchAndUpdateWidget(Context context) {
        executor.execute(() -> {
            try {
                String serverUrl = null;
                String token = null;

                // 方式1: 从 capacitor_storage 读取
                try {
                    SharedPreferences prefs = context.getSharedPreferences("capacitor_storage", Context.MODE_PRIVATE);
                    serverUrl = prefs.getString("beaver_server_url", "");
                    token = prefs.getString("token", "");
                } catch (Exception e) {
                    // ignore
                }

                // 方式2: 从 webview localStorage 读取
                if (serverUrl == null || serverUrl.isEmpty() || token == null || token.isEmpty()) {
                    try {
                        SharedPreferences prefs = context.getSharedPreferences("webview_localStorage", Context.MODE_PRIVATE);
                        if (serverUrl == null || serverUrl.isEmpty()) {
                            serverUrl = prefs.getString("beaver_server_url", "");
                        }
                        if (token == null || token.isEmpty()) {
                            token = prefs.getString("token", "");
                        }
                    } catch (Exception e) {
                        // ignore
                    }
                }

                if (serverUrl == null || serverUrl.isEmpty() || token == null || token.isEmpty()) {
                    return;
                }

                // 获取待办
                String todosJson = fetchUrl(serverUrl + "/api/todos/?completed=false", token);
                // 获取日记摘要
                String diarySummary = fetchDiarySummary(serverUrl, token);

                // 保存到 SharedPreferences
                SharedPreferences widgetPrefs = context.getSharedPreferences("widget_data", Context.MODE_PRIVATE);
                SharedPreferences.Editor editor = widgetPrefs.edit();
                editor.putString("todos", todosJson != null ? todosJson : "[]");
                editor.putString("diary", diarySummary != null ? diarySummary : "");
                editor.apply();

                // 更新所有小组件
                AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
                ComponentName widget = new ComponentName(context, MemoWidget.class);
                int[] appWidgetIds = appWidgetManager.getAppWidgetIds(widget);
                for (int appWidgetId : appWidgetIds) {
                    updateAppWidget(context, appWidgetManager, appWidgetId);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    private static String fetchUrl(String urlStr, String token) {
        try {
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                conn.disconnect();
                return null;
            }

            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            reader.close();
            conn.disconnect();

            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private static String fetchDiarySummary(String serverUrl, String token) {
        try {
            // 获取今天的日记
            java.util.Calendar cal = java.util.Calendar.getInstance();
            int year = cal.get(java.util.Calendar.YEAR);
            int month = cal.get(java.util.Calendar.MONTH) + 1;
            int day = cal.get(java.util.Calendar.DAY_OF_MONTH);

            String urlStr = serverUrl + "/api/diary/" + year + "/" + month;
            String diaryJson = fetchUrl(urlStr, token);
            if (diaryJson == null) return null;

            JSONObject diary = new JSONObject(diaryJson);
            JSONObject document = diary.getJSONObject("document");
            String title = document.getString("title");

            // 返回简短摘要
            return title + " · " + day + "日";
        } catch (Exception e) {
            return null;
        }
    }
}
