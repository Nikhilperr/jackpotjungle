import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.jackpotjungle",
  appName: "Jackpot Jungle",
  webDir: "dist",
  server: {
    // Live-reload from the Lovable preview while developing on device.
    // After exporting to your VPS, change this to your published URL or remove the `server` block.
    url: "https://184112d1-7f2d-450d-a0f6-d432b45a9e94.lovableproject.com?forceHideBadge=true",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
