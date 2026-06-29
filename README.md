# Jackpot Jungle - Google Authentication Integration Guide

This guide describes how to configure Google Sign-in for the Jackpot Jungle Messenger application using Supabase OAuth.

---

## Prerequisites

Before configuring the application, ensure you have:
1. A **Google Cloud Platform (GCP)** account.
2. A **Supabase** project dashboard.
3. Access to change environment variables in the local `.env` and production VPS host.

---

## Google Cloud Console Configuration

1. **Create a GCP Project**:
   - Visit the [Google Cloud Console](https://console.cloud.google.com/).
   - Click the project dropdown at the top and select **New Project**. Assign a name like `Jackpot Jungle Auth` and click **Create**.

2. **Configure OAuth Consent Screen**:
   - Navigate to **APIs & Services** > **OAuth consent screen**.
   - Choose **External** user type and click **Create**.
   - Fill in the required fields:
     - **App name**: `Jackpot Jungle Messenger`
     - **User support email**: Your support or admin email.
     - **Developer contact information**: Your developer email.
   - Click **Save and Continue** through the scopes and test users sections. Publish the app if moving to production.

3. **Create OAuth Client ID Credentials**:
   - Go to **APIs & Services** > **Credentials**.
   - Click **+ Create Credentials** at the top and select **OAuth client ID**.
   - Set **Application type** to **Web application**.
   - Set the name (e.g. `Jackpot Jungle Messenger Web`).
   - Add **Authorized JavaScript origins**:
     - Local: `http://localhost:8080`
     - Production: `https://playjackpotjungle.com` (old: `https://chancerealm.casino` — 301 redirects here)
   - Add **Authorized Redirect URIs**:
     - Retrieve this from your Supabase Dashboard: **Authentication** > **Providers** > **Google** (e.g. `https://<project-id>.supabase.co/auth/v1/callback`).
     - Paste this callback URL into the Google Cloud authorized redirect field.
   - Click **Create**. Copy the **Client ID** and **Client Secret** displayed.

---

## Supabase Dashboard Setup

1. Open your Supabase Project dashboard.
2. Navigate to **Authentication** > **Providers** > **Google**.
3. Toggle Google Sign-in to **Enabled**.
4. Paste the **Client ID** and **Client Secret** copied from the GCP console.
5. Click **Save**.

---

## Environment Variables

Ensure your `.env` file (local and VPS) contains the required Supabase variables. Supplying the variables locally or in production allows Supabase to route the OAuth handshake.

```env
# Existing Supabase keys
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Google OAuth Credentials (configured in Supabase Dashboard)
GOOGLE_CLIENT_ID=your-google-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
GOOGLE_REDIRECT_URI=https://your-project.supabase.co/auth/v1/callback
```

---

## Troubleshooting

### 1. Redirect URI Mismatch (`redirect_uri_mismatch`)
- **Cause**: The redirect URL configured in the Google Cloud Console does not match the callback URL that Supabase is sending.
- **Fix**: Check your Supabase project callback URI at **Authentication** > **Providers** > **Google**. Copy this URL and paste it exactly into the **Authorized Redirect URIs** list under your Client ID credentials in Google Cloud Console.

### 2. Provider Disabled (`provider_disabled` / `OAuth provider not enabled`)
- **Cause**: Google OAuth provider is not enabled in your Supabase project authentication settings.
- **Fix**: Log into the Supabase Dashboard, go to **Authentication** > **Providers**, choose **Google**, check **Enabled**, and save changes.

### 3. Invalid Client ID / Client Secret
- **Cause**: Typo or mismatched credentials pasted into the Supabase console.
- **Fix**: Re-copy the Client ID and Secret from the GCP Console Credentials page and paste them carefully into Supabase.

### 4. Consent Screen Missing Error
- **Cause**: GCP requires configuring the OAuth consent screen before letting you configure web clients.
- **Fix**: Ensure the consent screen is completed, and if testing in production, publish the consent app from "Testing" to "In Production".
