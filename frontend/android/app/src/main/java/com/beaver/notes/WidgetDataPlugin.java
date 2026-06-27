package com.beaver.notes;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * WidgetDataPlugin - 同步数据到小组件
 * 前端调用此插件将服务器地址和 token 保存到原生 SharedPreferences
 */
@CapacitorPlugin(name = "WidgetData")
public class WidgetDataPlugin extends Plugin {

    private static final String TAG = "WidgetDataPlugin";

    @PluginMethod
    public void syncForWidget(PluginCall call) {
        String serverUrl = call.getString("serverUrl", "");
        String token = call.getString("token", "");
        String todos = call.getString("todos", "[]");
        String diary = call.getString("diary", "");

        Log.d(TAG, "syncForWidget: serverUrl=" + serverUrl + ", token=" + (token.isEmpty() ? "empty" : "exists"));

        // 保存到 SharedPreferences
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences("capacitor_storage", Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString("beaver_server_url", serverUrl);
        editor.putString("token", token);
        editor.apply();

        // 保存小组件数据
        SharedPreferences widgetPrefs = context.getSharedPreferences("widget_data", Context.MODE_PRIVATE);
        SharedPreferences.Editor widgetEditor = widgetPrefs.edit();
        widgetEditor.putString("todos", todos);
        widgetEditor.putString("diary", diary);
        widgetEditor.apply();

        // 触发小组件更新
        android.content.Intent updateIntent = new android.content.Intent(context, MemoWidget.class);
        updateIntent.setAction("com.beaver.notes.UPDATE_WIDGET");
        context.sendBroadcast(updateIntent);

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }
}
