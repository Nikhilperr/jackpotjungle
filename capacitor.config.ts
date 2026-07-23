import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Controlled Android shell rebuild (2026-07-23):
 * One IME strategy only — no SystemBars CSS padding + Keyboard inset listeners + adjustResize stacking.
 * - Platform soft-input: adjustResize (manifest)
 * - Edge-to-edge: opted out in theme (API 35)
 * - SystemBars: disabled (do not inject inset CSS / parent padding)
 * - Keyboard plugin: not used (removed from deps)
 */
const config: CapacitorConfig = {
  appId: "app.lovable.jackpotjungle",
  appName: "Jackpot Jungle",
  webDir: "dist-client",
  server: {
    // Native-first: UI must load from APK assets (webDir). Do NOT uncomment server.url
    // in production — that forces the WebView to download UI from the VPS and breaks
    // offline/instant shell. Emergency remote-UI rollback only:
    // url: "https://chat.playjackpotjungle.com/app/auth",
    cleartext: false,
    allowNavigation: ["chat.playjackpotjungle.com", "admin.playjackpotjungle.com", "*.playjackpotjungle.com"],
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    // Native HTTP so serverFn RPCs to the VPS are not blocked by WebView CORS
    // (origin is https://localhost in Capacitor).
    CapacitorHttp: {
      enabled: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      // Keep until jj-app-ready (chat/auth painted under logo).
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: "#121212",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    GoogleAuth: {
      scopes: ["profile", "email"],
      clientId: "877420815591-feisfm6hjc1n8omdhrbv9li9tdk1v63t.apps.googleusercontent.com",
      serverClientId: "877420815591-feisfm6hjc1n8omdhrbv9li9tdk1v63t.apps.googleusercontent.com",
      forceCodeForRefreshToken: true,
    },
    SystemBars: {
      // Keep insetsHandling disabled — padding via env(safe-area-inset-*) only.
      // LIGHT = light status/nav icons for dark app chrome (Messenger-style).
      insetsHandling: "disable",
      style: "LIGHT",
    },
  },
};

export default config;
