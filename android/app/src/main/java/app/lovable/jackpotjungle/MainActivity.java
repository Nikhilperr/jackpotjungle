package app.lovable.jackpotjungle;

import android.app.KeyguardManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import androidx.core.graphics.ColorUtils;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;

/**
 * Product MainActivity for Capacitor shell rebuild.
 * Preserves: Google Auth, AndroidBridge, call audio/PiP, lockscreen, FGS stop, deep-link routing.
 * Removed from prior shell: cold-start Settings launches (overlay/FSI), dead IME/layer experiments.
 */
public class MainActivity extends BridgeActivity {
    private boolean isCallActive = false;
    private boolean userWantsSpeaker = false;
    private android.media.AudioDeviceCallback audioDeviceCallback = null;

    private boolean isBluetoothConnected() {
        try {
            android.media.AudioManager audioManager = (android.media.AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audioManager == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                android.media.AudioDeviceInfo[] devices = audioManager.getDevices(android.media.AudioManager.GET_DEVICES_OUTPUTS);
                for (android.media.AudioDeviceInfo device : devices) {
                    int type = device.getType();
                    if (type == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                        type == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_A2DP) {
                        return true;
                    }
                }
            }
        } catch (Exception e) {
            Log.e("MainActivity", "Failed to check bluetooth connection state", e);
        }
        return false;
    }

    private boolean isWiredHeadsetConnected() {
        try {
            android.media.AudioManager audioManager = (android.media.AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audioManager == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                android.media.AudioDeviceInfo[] devices = audioManager.getDevices(android.media.AudioManager.GET_DEVICES_OUTPUTS);
                for (android.media.AudioDeviceInfo device : devices) {
                    int type = device.getType();
                    if (type == android.media.AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                        type == android.media.AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
                        type == android.media.AudioDeviceInfo.TYPE_USB_HEADSET) {
                        return true;
                    }
                }
            }
        } catch (Exception e) {
            Log.e("MainActivity", "Failed to check wired headset connection state", e);
        }
        return false;
    }

    private void updateAudioRoute() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    android.media.AudioManager audioManager = (android.media.AudioManager) getSystemService(Context.AUDIO_SERVICE);
                    if (audioManager == null) return;

                    if (audioManager.getMode() != android.media.AudioManager.MODE_IN_COMMUNICATION) {
                        audioManager.setMode(android.media.AudioManager.MODE_IN_COMMUNICATION);
                    }

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        java.util.List<android.media.AudioDeviceInfo> devices = audioManager.getAvailableCommunicationDevices();
                        android.media.AudioDeviceInfo targetDevice = null;

                        for (android.media.AudioDeviceInfo device : devices) {
                            if (device.getType() == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO) {
                                targetDevice = device;
                                break;
                            }
                        }

                        if (targetDevice == null) {
                            for (android.media.AudioDeviceInfo device : devices) {
                                int type = device.getType();
                                if (type == android.media.AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                                    type == android.media.AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
                                    type == android.media.AudioDeviceInfo.TYPE_USB_HEADSET) {
                                    targetDevice = device;
                                    break;
                                }
                            }
                        }

                        if (targetDevice == null) {
                            for (android.media.AudioDeviceInfo device : devices) {
                                if (userWantsSpeaker) {
                                    if (device.getType() == android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                                        targetDevice = device;
                                        break;
                                    }
                                } else if (device.getType() == android.media.AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) {
                                    targetDevice = device;
                                    break;
                                }
                            }
                        }

                        if (targetDevice != null) {
                            audioManager.setCommunicationDevice(targetDevice);
                            Log.d("MainActivity", "setCommunicationDevice: " + targetDevice.getType());
                        } else {
                            audioManager.setSpeakerphoneOn(userWantsSpeaker);
                        }
                    } else {
                        if (isBluetoothConnected()) {
                            audioManager.startBluetoothSco();
                            audioManager.setBluetoothScoOn(true);
                            audioManager.setSpeakerphoneOn(false);
                        } else if (isWiredHeadsetConnected()) {
                            audioManager.stopBluetoothSco();
                            audioManager.setBluetoothScoOn(false);
                            audioManager.setSpeakerphoneOn(false);
                        } else {
                            audioManager.stopBluetoothSco();
                            audioManager.setBluetoothScoOn(false);
                            audioManager.setSpeakerphoneOn(userWantsSpeaker);
                        }
                    }
                } catch (Exception e) {
                    Log.e("MainActivity", "Error in updateAudioRoute", e);
                }
            }
        });
    }

    private void registerAudioDeviceListener() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                android.media.AudioManager audioManager = (android.media.AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (audioManager != null && audioDeviceCallback == null) {
                    audioDeviceCallback = new android.media.AudioDeviceCallback() {
                        @Override
                        public void onAudioDevicesAdded(android.media.AudioDeviceInfo[] addedDevices) {
                            updateAudioRoute();
                        }

                        @Override
                        public void onAudioDevicesRemoved(android.media.AudioDeviceInfo[] removedDevices) {
                            updateAudioRoute();
                        }
                    };
                    audioManager.registerAudioDeviceCallback(audioDeviceCallback, null);
                }
            } catch (Exception e) {
                Log.e("MainActivity", "Failed to register audio device callback", e);
            }
        }
    }

    private void unregisterAudioDeviceListener() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                android.media.AudioManager audioManager = (android.media.AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (audioManager != null && audioDeviceCallback != null) {
                    audioManager.unregisterAudioDeviceCallback(audioDeviceCallback);
                    audioDeviceCallback = null;
                }
            } catch (Exception e) {
                Log.e("MainActivity", "Failed to unregister audio device callback", e);
            }
        }
    }

    private void ensureCallsNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) return;
        if (notificationManager.getNotificationChannel("calls_ringtone_v3") != null) return;

        NotificationChannel channel = new NotificationChannel(
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
    }

    /** Default phone notification sound (new id — Android won't update sound on existing channels). */
    private void ensureChatNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) return;

        // Remove silent/legacy channel so FCM doesn't keep targeting a muted id from old installs.
        try {
            notificationManager.deleteNotificationChannel("chat_messages");
        } catch (Exception ignored) {}

        if (notificationManager.getNotificationChannel("chat_messages_v2") != null) return;

        NotificationChannel channel = new NotificationChannel(
            "chat_messages_v2",
            "Messages",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Chat and support message alerts");
        channel.enableLights(true);
        channel.enableVibration(true);
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        channel.setShowBadge(true);

        Uri notifUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();
        channel.setSound(notifUri, audioAttributes);
        notificationManager.createNotificationChannel(channel);
    }

    /** Strip absolute/broken hosts so we only ever deep-link inside the Capacitor app. */
    private String normalizeAppPath(String raw) {
        if (raw == null) return null;
        String path = raw.trim();
        if (path.isEmpty()) return null;
        try {
            if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("capacitor://")) {
                java.net.URI uri = new java.net.URI(path);
                String p = uri.getRawPath();
                if (p == null || p.isEmpty()) p = "/";
                if (uri.getRawQuery() != null) p += "?" + uri.getRawQuery();
                if (uri.getRawFragment() != null) p += "#" + uri.getRawFragment();
                path = p;
            }
        } catch (Exception ignored) {}
        if (!path.startsWith("/")) path = "/" + path;
        // Guard against accidental "null/..." string concat bugs.
        if (path.startsWith("/null/") || path.equals("/null")) {
            path = path.replaceFirst("^/null", "");
            if (path.isEmpty()) path = "/";
        }
        return path;
    }

    private void dispatchAppRoute(final String appPath, final int attempt) {
        if (appPath == null || appPath.isEmpty()) return;
        if (getBridge() == null || getBridge().getWebView() == null) {
            if (attempt < 40) {
                getWindow().getDecorView().postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        dispatchAppRoute(appPath, attempt + 1);
                    }
                }, 50);
            }
            return;
        }

        final String escaped = appPath
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", "")
            .replace("\r", "");

        // Persist immediately so JS can open the chat even if the bridge callback races.
        String stashJs =
            "try{localStorage.setItem('jj_pending_push_route','" + escaped + "');}catch(e){}"
            + "if(window.onNativeRouteReceived){window.onNativeRouteReceived('" + escaped + "');'called';}"
            + "else{'not_called';}";

        getBridge().getWebView().post(new Runnable() {
            @Override
            public void run() {
                getBridge().getWebView().evaluateJavascript(stashJs, new android.webkit.ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        boolean ok = value != null && value.contains("called");
                        if (ok) {
                            Log.d("MainActivity", "Deep link delivered via onNativeRouteReceived: " + appPath);
                            return;
                        }
                        // Never loadUrl("http://null/...") — that shows ERR_CLEARTEXT_NOT_PERMITTED.
                        // Keep retrying until the SPA router callback is ready.
                        if (attempt < 60) {
                            getBridge().getWebView().postDelayed(new Runnable() {
                                @Override
                                public void run() {
                                    dispatchAppRoute(appPath, attempt + 1);
                                }
                            }, 50);
                        } else {
                            Log.e("MainActivity", "Deep link timed out waiting for JS router: " + appPath);
                        }
                    }
                });
            }
        });
    }

    private void attachAndroidBridge() {
        if (getBridge() == null || getBridge().getWebView() == null) return;

        android.webkit.WebView webView = getBridge().getWebView();
        webView.getSettings().setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);
        webView.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public void requestUnlock() {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                            KeyguardManager keyguardManager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                            if (keyguardManager == null) return;
                            if (keyguardManager.isKeyguardLocked()) {
                                keyguardManager.requestDismissKeyguard(MainActivity.this, new KeyguardManager.KeyguardDismissCallback() {
                                    @Override
                                    public void onDismissSucceeded() {
                                        super.onDismissSucceeded();
                                        if (getBridge() != null && getBridge().getWebView() != null) {
                                            getBridge().getWebView().evaluateJavascript(
                                                "if (window.onUnlockSucceeded) { window.onUnlockSucceeded(); }", null);
                                        }
                                    }
                                });
                            } else if (getBridge() != null && getBridge().getWebView() != null) {
                                getBridge().getWebView().evaluateJavascript(
                                    "if (window.onUnlockSucceeded) { window.onUnlockSucceeded(); }", null);
                            }
                        } else {
                            getWindow().addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
                            if (getBridge() != null && getBridge().getWebView() != null) {
                                getBridge().getWebView().evaluateJavascript(
                                    "if (window.onUnlockSucceeded) { window.onUnlockSucceeded(); }", null);
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
                    }
                });
            }

            @android.webkit.JavascriptInterface
            public void setSpeakerphoneOn(boolean on) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        userWantsSpeaker = on;
                        updateAudioRoute();
                    }
                });
            }

            @android.webkit.JavascriptInterface
            public void resetAudio() {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            userWantsSpeaker = false;
                            android.media.AudioManager audioManager = (android.media.AudioManager) getSystemService(Context.AUDIO_SERVICE);
                            if (audioManager != null) {
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                    audioManager.clearCommunicationDevice();
                                }
                                audioManager.stopBluetoothSco();
                                audioManager.setBluetoothScoOn(false);
                                audioManager.setSpeakerphoneOn(false);
                                audioManager.setMode(android.media.AudioManager.MODE_NORMAL);
                            }
                        } catch (Exception e) {
                            Log.e("MainActivity", "Failed to reset audio mode", e);
                        }
                    }
                });
            }

            @android.webkit.JavascriptInterface
            public void setCallActive(boolean active) {
                isCallActive = active;
                if (active) {
                    registerAudioDeviceListener();
                    updateAudioRoute();
                } else {
                    unregisterAudioDeviceListener();
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                userWantsSpeaker = false;
                                android.media.AudioManager audioManager = (android.media.AudioManager) getSystemService(Context.AUDIO_SERVICE);
                                if (audioManager != null) {
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                        audioManager.clearCommunicationDevice();
                                    }
                                    audioManager.stopBluetoothSco();
                                    audioManager.setBluetoothScoOn(false);
                                    audioManager.setSpeakerphoneOn(false);
                                    audioManager.setMode(android.media.AudioManager.MODE_NORMAL);
                                }
                            } catch (Exception e) {
                                Log.e("MainActivity", "Failed to reset audio on call end", e);
                            }
                        }
                    });
                }
            }

            /**
             * Sync status/nav bar with in-app theme.
             * @param lightIcons true = dark (black) clock/battery for light backgrounds;
             *                   false = white clock/battery for dark/amoled backgrounds.
             * @param colorHex   e.g. "#000000" or "#ffffff"
             */
            @android.webkit.JavascriptInterface
            public void setSystemBars(final boolean lightIcons, final String colorHex) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        applySystemBars(lightIcons, colorHex);
                    }
                });
            }

            /** True when an active network has VPN transport (Discord/VPN apps). */
            @android.webkit.JavascriptInterface
            public boolean isVpnActive() {
                return MainActivity.this.isVpnNetworkActive();
            }
        }, "AndroidBridge");
    }

    private boolean isVpnNetworkActive() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network[] networks = cm.getAllNetworks();
                if (networks != null) {
                    for (Network network : networks) {
                        NetworkCapabilities caps = cm.getNetworkCapabilities(network);
                        if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                            return true;
                        }
                    }
                }
                Network active = cm.getActiveNetwork();
                if (active != null) {
                    NetworkCapabilities caps = cm.getNetworkCapabilities(active);
                    if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                        return true;
                    }
                }
            }
        } catch (Exception e) {
            Log.e("MainActivity", "Failed to detect VPN", e);
        }
        return false;
    }

    private void applySystemBars(boolean lightIcons, String colorHex) {
        try {
            int color = 0xFF000000;
            if (colorHex != null && colorHex.startsWith("#")) {
                try {
                    color = ColorUtils.setAlphaComponent(android.graphics.Color.parseColor(colorHex), 255);
                } catch (Exception ignored) {}
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                getWindow().setStatusBarColor(color);
                getWindow().setNavigationBarColor(color);
            }
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            if (controller != null) {
                controller.setAppearanceLightStatusBars(lightIcons);
                controller.setAppearanceLightNavigationBars(lightIcons);
            }
            Log.d("MainActivity", "System bars lightIcons=" + lightIcons + " color=" + colorHex);
        } catch (Exception e) {
            Log.e("MainActivity", "Failed to apply system bars", e);
        }
    }

    private void stopCallForegroundService() {
        try {
            stopService(new Intent(this, CallForegroundService.class));
        } catch (Exception e) {
            Log.e("MainActivity", "Failed to stop CallForegroundService", e);
        }
    }

    private int statusBarHeightPx() {
        try {
            int resId = getResources().getIdentifier("status_bar_height", "dimen", "android");
            if (resId > 0) return getResources().getDimensionPixelSize(resId);
        } catch (Exception ignored) {}
        return Math.round(24f * getResources().getDisplayMetrics().density);
    }

    private void publishInsetCss(final int topPx, final int bottomPx) {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        final android.webkit.WebView webView = getBridge().getWebView();
        float density = getResources().getDisplayMetrics().density;
        final int topCss = Math.max(0, Math.round(topPx / density));
        final int bottomCss = Math.max(0, Math.round(bottomPx / density));
        final String js =
            "(function(){var r=document.documentElement;" +
            "r.style.setProperty('--jj-sat','" + topCss + "px');" +
            "r.style.setProperty('--jj-sab','" + bottomCss + "px');" +
            "r.setAttribute('data-jj-insets','1');" +
            "})();";
        webView.post(new Runnable() {
            @Override
            public void run() {
                try {
                    webView.evaluateJavascript(js, null);
                    Log.d("MainActivity", "Published insets sat=" + topCss + "dp sab=" + bottomCss + "dp");
                } catch (Exception e) {
                    Log.e("MainActivity", "Failed to inject inset CSS vars", e);
                }
            }
        });
    }

    /**
     * Keep chrome out from under the clock/battery (Messenger-style).
     * MIUI often forces edge-to-edge even with theme opt-out, so we always
     * publish status/nav bar heights into CSS (--jj-sat / --jj-sab).
     * IME is never padded here — windowSoftInputMode=adjustResize handles it.
     */
    private void setupSystemBarInsets() {
        try {
            // true = WebView laid out below system bars when the OEM respects it.
            WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
            // Default dark chrome + white icons; JS ThemeToggle syncs light/dark later.
            applySystemBars(false, "#000000");
        } catch (Exception e) {
            Log.e("MainActivity", "Failed to set decorFitsSystemWindows", e);
        }

        // Immediate provisional top inset so first paint never covers the clock.
        publishInsetCss(statusBarHeightPx(), 0);

        View root = findViewById(android.R.id.content);
        if (root == null && getBridge() != null) {
            root = getBridge().getWebView();
        }
        if (root == null) return;

        ViewCompat.setOnApplyWindowInsetsListener(root, new androidx.core.view.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsetsCompat onApplyWindowInsets(View v, WindowInsetsCompat insets) {
                Insets status = insets.getInsets(WindowInsetsCompat.Type.statusBars());
                Insets nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
                int topPx = status.top > 0 ? status.top : statusBarHeightPx();
                int bottomPx = Math.max(0, nav.bottom);
                // When decor-fits works, the WebView content origin is already below the
                // status bar — padding with the full status height would double-gap.
                // Detect that: if the WebView's top on screen is already past the status bar, pad 0.
                int padTop = topPx;
                try {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        int[] loc = new int[2];
                        getBridge().getWebView().getLocationOnScreen(loc);
                        if (loc[1] >= statusBarHeightPx() - 2) {
                            padTop = 0; // already laid out below status bar
                        }
                    }
                } catch (Exception ignored) {}
                publishInsetCss(padTop, bottomPx);
                return insets;
            }
        });
        ViewCompat.requestApplyInsets(root);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(GoogleAuth.class);
        setupLockscreenFlags();
        ensureCallsNotificationChannel();
        ensureChatNotificationChannel();
        attachAndroidBridge();
        // After bridge exists — pad/fit system bars so header never covers clock/battery.
        getWindow().getDecorView().post(new Runnable() {
            @Override
            public void run() {
                setupSystemBarInsets();
            }
        });
        stopCallForegroundService();
        handleIncomingIntent(getIntent());
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;

        String path = null;
        if (intent.hasExtra("routePath")) path = intent.getStringExtra("routePath");
        if ((path == null || path.isEmpty()) && intent.hasExtra("url")) path = intent.getStringExtra("url");

        // FCM / Capacitor also put data keys in the launch extras bundle.
        Bundle extras = intent.getExtras();
        if ((path == null || path.isEmpty()) && extras != null) {
            if (extras.containsKey("routePath")) path = String.valueOf(extras.get("routePath"));
            else if (extras.containsKey("url")) path = String.valueOf(extras.get("url"));
        }

        path = normalizeAppPath(path);
        if (path == null || path.isEmpty() || path.equals("/")) return;

        Log.d("MainActivity", "Handling notification/deep-link route: " + path);
        dispatchAppRoute(path, 0);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        setupLockscreenFlags();
        handleIncomingIntent(intent);
        stopCallForegroundService();
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

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (!isCallActive) return;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return;
        try {
            android.app.PictureInPictureParams.Builder builder = new android.app.PictureInPictureParams.Builder();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder.setAspectRatio(new android.util.Rational(9, 16));
            }
            enterPictureInPictureMode(builder.build());
        } catch (Exception e) {
            Log.e("MainActivity", "Failed to enter Picture-in-Picture mode", e);
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, android.content.res.Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(
                        "if (window.onPictureInPictureModeChanged) { window.onPictureInPictureModeChanged(" + isInPictureInPictureMode + "); }",
                        null
                    );
                }
            }
        });
    }
}
