package app.lovable.jackpotjungle;

import android.app.KeyguardManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Log;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(GoogleAuth.class);
        
        // Ensure the activity shows over the lockscreen and wakes up the screen
        setupLockscreenFlags();

        // Natively register the high-priority calls channel with system ringtone
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null) {
                NotificationChannel channel = notificationManager.getNotificationChannel("calls_ringtone_v3");
                if (channel == null) {
                    channel = new NotificationChannel(
                        "calls_ringtone_v3",
                        "Phone Calls (Ringtone)",
                        NotificationManager.IMPORTANCE_HIGH
                    );
                    channel.setDescription("Alerts for incoming voice and video calls");
                    channel.enableLights(true);
                    channel.enableVibration(true);
                    channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
                    
                    Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                    AudioAttributes audioAttributes = new AudioAttributes.Builder()
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .build();
                    channel.setSound(ringtoneUri, audioAttributes);
                    
                    notificationManager.createNotificationChannel(channel);
                    Log.d("MainActivity", "Natively created 'calls_ringtone_v3' channel with system ringtone.");
                }
            }
        }

        // Request "Draw over other apps" (overlay) permission if not granted (needed to launch call overlay from background)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(this)) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            }
        }

        // On Android 14+ (API 34), verify and request Full Screen Intent capability
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null && !notificationManager.canUseFullScreenIntent()) {
                Intent fsiIntent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                fsiIntent.setData(Uri.fromParts("package", getPackageName(), null));
                fsiIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(fsiIntent);
            }
        }

        // Add Javascript interface to allow webview to request keyguard unlock when call is approved
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(new Object() {
                @android.webkit.JavascriptInterface
                public void requestUnlock() {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                                KeyguardManager keyguardManager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                                if (keyguardManager != null) {
                                    if (keyguardManager.isKeyguardLocked()) {
                                        keyguardManager.requestDismissKeyguard(MainActivity.this, new KeyguardManager.KeyguardDismissCallback() {
                                            @Override
                                            public void onDismissSucceeded() {
                                                super.onDismissSucceeded();
                                                Log.d("MainActivity", "Keyguard unlock succeeded.");
                                                runOnUiThread(new Runnable() {
                                                    @Override
                                                    public void run() {
                                                        if (getBridge() != null && getBridge().getWebView() != null) {
                                                            getBridge().getWebView().evaluateJavascript("if (window.onUnlockSucceeded) { window.onUnlockSucceeded(); }", null);
                                                        }
                                                    }
                                                });
                                            }

                                            @Override
                                            public void onDismissCancelled() {
                                                super.onDismissCancelled();
                                                Log.d("MainActivity", "Keyguard unlock cancelled.");
                                            }

                                            @Override
                                            public void onDismissError() {
                                                super.onDismissError();
                                                Log.d("MainActivity", "Keyguard unlock error.");
                                            }
                                        });
                                        Log.d("MainActivity", "Keyguard unlock requested from WebApp.");
                                    } else {
                                        Log.d("MainActivity", "Keyguard is not locked. Triggering unlock callback directly.");
                                        if (getBridge() != null && getBridge().getWebView() != null) {
                                            getBridge().getWebView().evaluateJavascript("if (window.onUnlockSucceeded) { window.onUnlockSucceeded(); }", null);
                                        }
                                    }
                                }
                            } else {
                                getWindow().addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
                                if (getBridge() != null && getBridge().getWebView() != null) {
                                    getBridge().getWebView().evaluateJavascript("if (window.onUnlockSucceeded) { window.onUnlockSucceeded(); }", null);
                                }
                            }
                        }
                    });
                }

                @android.webkit.JavascriptInterface
                public void closeApp() {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            finishAndRemoveTask();
                            Log.d("MainActivity", "App closed via closeApp bridge call.");
                        }
                    });
                }

                @android.webkit.JavascriptInterface
                public void setSpeakerphoneOn(boolean on) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                android.media.AudioManager audioManager = (android.media.AudioManager) getSystemService(Context.AUDIO_SERVICE);
                                if (audioManager != null) {
                                    audioManager.setMode(android.media.AudioManager.MODE_IN_COMMUNICATION);
                                    
                                    // Check if wired or bluetooth headset is connected
                                    boolean hasHeadset = false;
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                        android.media.AudioDeviceInfo[] devicesArr = audioManager.getDevices(android.media.AudioManager.GET_DEVICES_OUTPUTS);
                                        for (android.media.AudioDeviceInfo device : devicesArr) {
                                            int type = device.getType();
                                            if (type == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
                                                type == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                                                type == android.media.AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
                                                type == android.media.AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                                                type == android.media.AudioDeviceInfo.TYPE_USB_HEADSET) {
                                                hasHeadset = true;
                                                break;
                                            }
                                        }
                                    } else {
                                        hasHeadset = audioManager.isWiredHeadsetOn() || audioManager.isBluetoothA2dpOn();
                                    }
                                    
                                    Log.d("MainActivity", "setSpeakerphoneOn(" + on + ") - Headset detected: " + hasHeadset);

                                    if (hasHeadset) {
                                        // Let Android handle headset routing natively by clearing overrides
                                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                            audioManager.clearCommunicationDevice();
                                        }
                                        audioManager.setSpeakerphoneOn(false);
                                    } else {
                                        // Explicitly route to speaker or earpiece
                                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) { // API 31+
                                            java.util.List<android.media.AudioDeviceInfo> devices = audioManager.getAvailableCommunicationDevices();
                                            android.media.AudioDeviceInfo targetDevice = null;
                                            int targetType = on ? android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER : android.media.AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
                                            
                                            for (android.media.AudioDeviceInfo device : devices) {
                                                if (device.getType() == targetType) {
                                                    targetDevice = device;
                                                    break;
                                                }
                                            }
                                            
                                            if (targetDevice != null) {
                                                audioManager.clearCommunicationDevice();
                                                boolean success = audioManager.setCommunicationDevice(targetDevice);
                                                Log.d("MainActivity", "setCommunicationDevice type " + targetType + " success: " + success);
                                            } else {
                                                audioManager.setSpeakerphoneOn(on);
                                                Log.w("MainActivity", "Target communication device not found, falling back to setSpeakerphoneOn");
                                            }
                                        } else {
                                            // Legacy fallback
                                            audioManager.setSpeakerphoneOn(on);
                                        }
                                    }
                                }
                            } catch (Exception e) {
                                Log.e("MainActivity", "Failed to toggle speakerphone natively", e);
                            }
                        }
                    });
                }

                @android.webkit.JavascriptInterface
                public void resetAudio() {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                android.media.AudioManager audioManager = (android.media.AudioManager) getSystemService(Context.AUDIO_SERVICE);
                                if (audioManager != null) {
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                        audioManager.clearCommunicationDevice();
                                    }
                                    audioManager.setSpeakerphoneOn(false);
                                    audioManager.setMode(android.media.AudioManager.MODE_NORMAL);
                                    Log.d("MainActivity", "Audio mode reset to MODE_NORMAL");
                                }
                            } catch (Exception e) {
                                Log.e("MainActivity", "Failed to reset audio mode", e);
                            }
                        }
                    });
                }
            }, "AndroidBridge");
        }

        // Stop the calling foreground service once the user opens the app (either answered/declined or launched)
        try {
            Intent serviceIntent = new Intent(this, CallForegroundService.class);
            stopService(serviceIntent);
        } catch (Exception e) {
            Log.e("MainActivity", "Failed to stop CallForegroundService", e);
        }

        handleIncomingIntent(getIntent());
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent != null && (intent.hasExtra("routePath") || intent.hasExtra("url"))) {
            String path = intent.hasExtra("routePath") ? intent.getStringExtra("routePath") : intent.getStringExtra("url");
            if (path != null && !path.isEmpty()) {
                Log.d("MainActivity", "Found path extra in intent: " + path);
                if (getBridge() != null && getBridge().getWebView() != null) {
                    final String finalPath = path;
                    getBridge().getWebView().post(new Runnable() {
                        @Override
                        public void run() {
                            String serverUrl = getBridge().getServerUrl();
                            String finalUrl;
                            if (finalPath.startsWith("http://") || finalPath.startsWith("https://")) {
                                finalUrl = finalPath;
                            } else {
                                try {
                                    java.net.URI uri = new java.net.URI(serverUrl);
                                    String origin = uri.getScheme() + "://" + uri.getHost();
                                    if (uri.getPort() != -1) {
                                        origin += ":" + uri.getPort();
                                    }
                                    finalUrl = origin + (finalPath.startsWith("/") ? finalPath : "/" + finalPath);
                                } catch (Exception e) {
                                    finalUrl = serverUrl + finalPath;
                                }
                            }
                            Log.d("MainActivity", "Loading URL in webview: " + finalUrl);
                            getBridge().getWebView().loadUrl(finalUrl);
                        }
                    });
                }
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        setupLockscreenFlags();
        handleIncomingIntent(intent);
        
        // Stop the calling foreground service when activity is resumed via notification intent
        try {
            Intent serviceIntent = new Intent(this, CallForegroundService.class);
            stopService(serviceIntent);
        } catch (Exception e) {
            Log.e("MainActivity", "Failed to stop CallForegroundService in onNewIntent", e);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        setupLockscreenFlags();
    }

    private void setupLockscreenFlags() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            );
        }
    }
}
