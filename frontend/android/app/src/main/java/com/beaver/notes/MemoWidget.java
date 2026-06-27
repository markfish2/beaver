package com.beaver.notes;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * MemoWidget - 桌面小组件
 * 点击后打开 APP 并跳转到 memo 输入页面
 */
public class MemoWidget extends AppWidgetProvider {

    private static final String ACTION_OPEN_MEMO = "com.beaver.notes.OPEN_MEMO";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        // 创建 RemoteViews
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.memo_widget);

        // 创建点击 Intent - 打开 APP 并传递参数
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("com.beaver.notes://memo"), context, MainActivity.class);
        intent.putExtra("openMemo", true);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // 设置点击事件
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);

        // 更新小组件
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
    }
}
