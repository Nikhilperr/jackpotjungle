package app.lovable.jackpotjungle;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import android.util.Log;
import java.util.Map;

public class MyFirebaseMessagingService extends MessagingService {
    private static final String TAG = "MyFirebaseService";
    private static final String PREFS = "jj_notification_context";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        Log.d(TAG, "onMessageReceived triggered: " + (data != null ? data.toString() : "null"));

        if (data != null && "call".equals(data.get("type"))) {
            android.app.ActivityManager.RunningAppProcessInfo appProcessInfo = new android.app.ActivityManager.RunningAppProcessInfo();
            android.app.ActivityManager.getMyMemoryState(appProcessInfo);
            boolean isForeground = (appProcessInfo.importance == android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND);

            if (isForeground) {
                Log.d(TAG, "App is in foreground. Skipping call notification/foreground service, letting webview handle it.");
                super.onMessageReceived(remoteMessage);
                return;
            }

            Log.d(TAG, "Incoming call push detected and app is not in foreground. Starting foreground calling service...");
            
            Intent serviceIntent = new Intent(this, CallForegroundService.class);
            for (Map.Entry<String, String> entry : data.entrySet()) {
                serviceIntent.putExtra(entry.getKey(), entry.getValue());
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
            return; // Intercept: do not delegate to Capacitor's default background handler
        }

        // Messenger-style: suppress chat notification when user is already reading this conversation.
        if (shouldSuppressChatNotification(data)) {
            Log.d(TAG, "Suppressing chat notification — user is viewing this conversation in foreground.");
            return;
        }

        // Delegate standard notifications (chats, etc.) to Capacitor's standard handler
        super.onMessageReceived(remoteMessage);
    }

    private boolean shouldSuppressChatNotification(Map<String, String> data) {
        if (data == null) return false;
        String type = data.get("type");
        if (type == null || "call".equals(type)) return false;

        SharedPreferences prefs = getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean inForeground = prefs.getBoolean("app_in_foreground", false);
        if (!inForeground) return false;

        String activeKey = prefs.getString("active_conversation_key", "");
        if (activeKey == null || activeKey.isEmpty()) return false;

        String msgKey = conversationKeyFromData(data);
        if (msgKey == null || msgKey.isEmpty()) return false;

        return keysMatch(activeKey, msgKey);
    }

    private static String conversationKeyFromData(Map<String, String> data) {
        String type = data.get("type");
        if ("chat".equals(type) && data.get("sender_id") != null) {
            return data.get("sender_id");
        }
        if ("group_chat".equals(type) && data.get("group_id") != null) {
            return "group-" + data.get("group_id");
        }
        if (("page_chat".equals(type) || "admin_support".equals(type)) && data.get("conversation_id") != null) {
            return "page:" + data.get("conversation_id");
        }
        String path = data.get("routePath");
        if (path == null) path = data.get("url");
        if (path == null) return null;
        if (path.contains("/app/chat/page")) return "page";
        int cIdx = path.indexOf("c=");
        if (path.contains("/app/admin") && cIdx >= 0) {
            String rest = path.substring(cIdx + 2);
            int amp = rest.indexOf('&');
            String id = amp >= 0 ? rest.substring(0, amp) : rest;
            if (!id.isEmpty()) return "page:" + id;
        }
        String marker = "/app/chat/";
        int idx = path.indexOf(marker);
        if (idx >= 0) {
            String id = path.substring(idx + marker.length());
            int q = id.indexOf('?');
            if (q >= 0) id = id.substring(0, q);
            int h = id.indexOf('#');
            if (h >= 0) id = id.substring(0, h);
            if (!id.isEmpty() && !"page".equals(id)) return id;
        }
        return null;
    }

    private static boolean keysMatch(String a, String b) {
        if (a == null || b == null) return false;
        if (a.equals(b)) return true;
        if (("group-" + b).equals(a) || ("group-" + a).equals(b)) return true;
        if ("page".equals(a) && b.startsWith("page:")) return true;
        if ("page".equals(b) && a.startsWith("page:")) return true;
        return false;
    }
}
