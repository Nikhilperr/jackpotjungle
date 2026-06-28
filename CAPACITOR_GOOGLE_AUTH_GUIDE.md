# Capacitor Native Google Sign-In Configuration Guide

This guide describes how to configure **Native Google Sign-In** inside your Capacitor app using your existing Firebase project. 

> [!IMPORTANT]
> **This will NOT affect or break your push notifications.** Both Push Notifications (FCM) and Google Sign-In run on the same Firebase project and use the same credential configs. They coexist perfectly.

---

## Step 1: Enable Google Sign-In in Firebase Console

1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select your project.
3. In the left sidebar, click **Build** > **Authentication**.
4. Go to the **Sign-in method** tab.
5. Click **Add new provider** and select **Google**.
6. Toggle the **Enable** switch.
7. Enter a project support email (e.g., your admin email).
8. Copy the **Web client ID** (this will be used in your configuration files) and click **Save**.

---

## Step 2: Download Updated Configuration Files

Since you enabled a new service (Google Auth), you need to download the updated config files that contain the new client credentials:

### For Android:
1. In Firebase Console, go to **Project Settings** (gear icon next to Project Overview).
2. Scroll down to your **Android App** under "Your apps".
3. Download the updated `google-services.json` file.
4. Replace the old file located at: `android/app/google-services.json`.

---

## Step 3: Configure Capacitor config (`capacitor.config.ts`)

Open your `capacitor.config.ts` file in the root of your project and add the `GoogleAuth` configuration under `plugins`. 

Example configuration:
```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'casino.chancerealm.messenger', // Replace with your actual bundle/package ID
  appName: 'Jackpot Jungle',
  webDir: 'dist',
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
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
```

---

## Step 4: Run the Client Build and Sync

We will build the frontend assets and synchronize them with your native Android project. Run:
```bash
npm run build
npx cap sync
```

---

## Step 5: Android Native Project Registration

1. Open the **`android`** folder in Android Studio.
2. In your `android/app/src/main/java/.../MainActivity.java`, ensure the Google Auth plugin is registered (usually handled automatically by Capacitor 3+ but good to verify).
3. Open `android/app/src/main/res/values/strings.xml` and ensure your Google client ID is registered if required:
   ```xml
   <resources>
       <string name="title_activity_main">Jackpot Jungle</string>
       <string name="package_name">casino.chancerealm.messenger</string>
       <string name="custom_url_scheme">YOUR_REVERSED_CLIENT_ID</string>
   </resources>
   ```
   *(Note: The reversed client ID is your Google Client ID with the fields reversed, e.g. `com.googleusercontent.apps.xxxx`).*

4. Build your signed APK/Bundle in Android Studio.

Now, tapping "Continue with Google" inside the mobile app will launch the native Google account selector sheet!
