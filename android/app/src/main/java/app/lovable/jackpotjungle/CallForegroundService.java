package app.lovable.jackpotjungle;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;
import android.os.PowerManager;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.app.ServiceCompat;
import java.util.Map;

public class CallForegroundService extends Service {
    private static final String TAG = "CallForegroundService";
    private static final String CHANNEL_ID = "calls_ringtone";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "onStartCommand triggered");
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        Bundle extras = intent.getExtras();
        if (extras == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        showCallNotification(extras);
        return START_NOT_STICKY;
    }

    private void showCallNotification(Bundle extras) {
        // 1. Acquire a temporary WakeLock to wake up the screen immediately
        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                PowerManager.WakeLock wakeLock = powerManager.newWakeLock(
                    PowerManager.FULL_WAKE_LOCK |
                    PowerManager.ACQUIRE_CAUSES_WAKEUP |
                    PowerManager.ON_AFTER_RELEASE,
                    "JackpotJungle:CallWakeLock"
                );
                wakeLock.acquire(10000); // 10 seconds
                Log.d(TAG, "WakeLock acquired successfully to turn the screen on.");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to acquire wake lock", e);
        }

        String title = extras.getString("title");
        if (title == null || title.isEmpty()) {
            title = "Incoming Call";
        }
        String body = extras.getString("body");
        if (body == null || body.isEmpty()) {
            body = "Someone is calling you";
        }
        String url = extras.getString("url");

        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        // 2. Create the high-priority calls channel programmatically if it doesn't exist
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = notificationManager.getNotificationChannel(CHANNEL_ID);
            if (channel == null) {
                channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Phone Calls (Ringtone)",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Alerts for incoming voice and video calls");
                channel.enableLights(true);
                channel.enableVibration(true);
                channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
                
                Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .build();
                channel.setSound(ringtoneUri, audioAttributes);
                
                notificationManager.createNotificationChannel(channel);
            }
        }

        int pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingIntentFlags |= PendingIntent.FLAG_MUTABLE;
        }

        // Generate a unique ID to prevent Android from caching and reusing old intents
        int requestID = (int) System.currentTimeMillis();

        // 1. Build the main intent to open the MainActivity when body tapped
        Intent mainIntent = new Intent(this, MainActivity.class);
        mainIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        mainIntent.putExtras(extras);
        mainIntent.putExtra("google.message_id", "call_" + System.currentTimeMillis());
        if (url != null) {
            mainIntent.putExtra("url", url);
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(this, requestID, mainIntent, pendingIntentFlags);

        // 2. Build the ANSWER intent (taps "Answer" button)
        Intent answerIntent = new Intent(this, MainActivity.class);
        answerIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        answerIntent.putExtras(extras);
        answerIntent.putExtra("google.message_id", "call_answer_" + System.currentTimeMillis());
        answerIntent.putExtra("action", "accept");
        if (url != null) {
            answerIntent.putExtra("url", url);
        }
        PendingIntent answerPendingIntent = PendingIntent.getActivity(this, requestID + 1, answerIntent, pendingIntentFlags);

        // 3. Build the DECLINE intent (taps "Decline" button)
        Intent declineIntent = new Intent(this, MainActivity.class);
        declineIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        declineIntent.putExtras(extras);
        declineIntent.putExtra("google.message_id", "call_decline_" + System.currentTimeMillis());
        declineIntent.putExtra("action", "decline");
        if (url != null) {
            declineIntent.putExtra("url", url);
        }
        PendingIntent declinePendingIntent = PendingIntent.getActivity(this, requestID + 2, declineIntent, pendingIntentFlags);

        // 4. Create the Caller Person object
        Person caller = new Person.Builder()
            .setName(title)
            .setImportant(true)
            .build();

        Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setSound(ringtoneUri)
            .setVibrate(new long[] { 0, 1000, 1000, 1000, 1000 })
            .setStyle(
                NotificationCompat.CallStyle.forIncomingCall(
                    caller,
                    declinePendingIntent,
                    answerPendingIntent
                )
            )
            .setFullScreenIntent(pendingIntent, true);

        // Build notification and apply FLAG_INSISTENT to force continuous sound looping
        android.app.Notification notification = builder.build();
        notification.flags |= android.app.Notification.FLAG_INSISTENT;

        int notificationId = 1001;
        String callId = extras.getString("call_id");
        if (callId != null) {
            notificationId = callId.hashCode();
        }

        // Start service in foreground with PHONE_CALL type
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(
                this,
                notificationId,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
            );
        } else {
            startForeground(notificationId, notification);
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
