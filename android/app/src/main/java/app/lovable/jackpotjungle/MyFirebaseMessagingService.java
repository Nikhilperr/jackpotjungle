package app.lovable.jackpotjungle;

import android.content.Intent;
import android.os.Build;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import android.util.Log;
import java.util.Map;

public class MyFirebaseMessagingService extends MessagingService {
    private static final String TAG = "MyFirebaseService";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        Log.d(TAG, "onMessageReceived triggered: " + (data != null ? data.toString() : "null"));

        if (data != null && "call".equals(data.get("type"))) {
            Log.d(TAG, "Incoming call push detected. Starting foreground calling service...");
            
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

        // Delegate standard notifications (chats, etc.) to Capacitor's standard handler
        super.onMessageReceived(remoteMessage);
    }
}
