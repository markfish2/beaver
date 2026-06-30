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
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
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

        // 从 Capacitor Preferences 读取缓存数据
        SharedPreferences prefs = getAppPreferences(context);
        String todosJson = prefs.getString("widget_todos", "[]");
        String diaryContent = prefs.getString("widget_diary", "");

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
                    boolean completed = todo.optBoolean("is_completed", false);

                    RemoteViews todoView = new RemoteViews(context.getPackageName(), R.layout.widget_todo_item);
                    todoView.setTextViewText(R.id.todo_text, (completed ? "✓ " : "· ") + content);
                    if (completed) {
                        todoView.setTextColor(R.id.todo_text, 0xFF9CA3AF);
                    } else {
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
     * 获取 SharedPreferences
     */
    static SharedPreferences getAppPreferences(Context context) {
        return context.getSharedPreferences("BeaverData", Context.MODE_PRIVATE);
    }

    /**
     * 异步获取待办和日记数据
     */
    static void fetchAndUpdateWidget(Context context) {
        executor.execute(() -> {
            try {
                SharedPreferences prefs = getAppPreferences(context);
                String serverUrl = prefs.getString("beaver_server_url", "");
                String token = prefs.getString("token", "");

                if (serverUrl == null || serverUrl.isEmpty() || token == null || token.isEmpty()) {
                    return;
                }

                // 获取待办
                String todosJson = fetchUrl(serverUrl + "/api/todos/?completed=false", token);
                // 获取日记摘要
                String diarySummary = fetchDiarySummary(serverUrl, token);

                // 保存到 Preferences
                SharedPreferences.Editor editor = prefs.edit();
                if (todosJson != null) {
                    editor.putString("widget_todos", todosJson);
                }
                if (diarySummary != null) {
                    editor.putString("widget_diary", diarySummary);
                }
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
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.setInstanceFollowRedirects(true);

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                return null;
            }

            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            reader.close();

            return sb.toString();
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private static String fetchDiarySummary(String serverUrl, String token) {
        try {
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

            return title + " · " + day + "日";
        } catch (Exception e) {
            return null;
        }
    }
}
