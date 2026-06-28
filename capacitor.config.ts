import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.jackpotjungle",
  appName: "Jackpot Jungle",
  webDir: "dist",
  server: {
    // Points directly to the production VPS web server.
    url: "https://chancerealm.casino",
    cleartext: false,
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
      // IMPORTANT: Replace this clientId with your Web Client ID from the Firebase Auth Console
      clientId: "1083478957294-xxxxxxxxxxxxxxxx.apps.googleusercontent.com",
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
