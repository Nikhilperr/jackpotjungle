import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.jackpotjungle",
  appName: "Jackpot Jungle",
  webDir: "dist",
  server: {
    // Points directly to the production VPS web server.
    url: "https://chat.playjackpotjungle.com/app/auth",
    cleartext: false,
    allowNavigation: ["chat.playjackpotjungle.com", "admin.playjackpotjungle.com", "*.playjackpotjungle.com"],
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false,
      backgroundColor: "#121212",
    },
    GoogleAuth: {
      scopes: ["profile", "email"],
      clientId: "877420815591-feisfm6hjc1n8omdhrbv9li9tdk1v63t.apps.googleusercontent.com",
      serverClientId: "877420815591-feisfm6hjc1n8omdhrbv9li9tdk1v63t.apps.googleusercontent.com",
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
