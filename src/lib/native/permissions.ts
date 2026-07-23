/**
 * Just-in-time Android permission helpers (Messenger / WhatsApp style).
 * Never redirect to Settings on launch. Never chain prompts.
 */

import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";

const PUSH_SOFT_ASK_KEY = "jj_push_soft_asked_v1";

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** True if we already showed the one soft notification ask this install. */
export function hasSoftAskedPush(): boolean {
  try {
    return localStorage.getItem(PUSH_SOFT_ASK_KEY) === "1";
  } catch {
    return true;
  }
}

export function markSoftAskedPush(): void {
  try {
    localStorage.setItem(PUSH_SOFT_ASK_KEY, "1");
  } catch {
    /* ignore */
  }
}

export type PushPermissionState = "granted" | "denied" | "prompt" | "unavailable";

export async function checkPushPermission(): Promise<PushPermissionState> {
  if (!isNativeApp()) return "unavailable";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const status = await PushNotifications.checkPermissions();
    if (status.receive === "granted") return "granted";
    if (status.receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "unavailable";
  }
}

/**
 * Shows the standard Android POST_NOTIFICATIONS dialog (Android 13+).
 * Does NOT open app Settings. Caller decides when (home soft-ask or Settings toggle).
 */
export async function requestPushPermission(): Promise<PushPermissionState> {
  if (!isNativeApp()) return "unavailable";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const status = await PushNotifications.requestPermissions();
    if (status.receive === "granted") return "granted";
    if (status.receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "unavailable";
  }
}

export async function ensureAndroidNotificationChannels(): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.createChannel({
      id: "calls_ringtone_v3",
      name: "Phone Calls (Ringtone)",
      description: "Alerts for incoming voice and video calls",
      importance: 5,
      visibility: 1,
      sound: "default",
      vibration: true,
    });
    await PushNotifications.createChannel({
      id: "chat_messages_v2",
      name: "Messages",
      description: "Chat and support message alerts",
      importance: 5,
      visibility: 1,
      sound: "default",
      vibration: true,
    });
    try {
      await PushNotifications.deleteChannel({ id: "chat_messages" });
    } catch {
      /* ignore */
    }
    try {
      await PushNotifications.deleteChannel({ id: "calls_v2" });
    } catch {
      /* ignore */
    }
  } catch (err) {
    console.warn("[Permissions] Failed to create notification channels:", err);
  }
}

/** Soft toast when mic/camera denied — never force Settings. */
export function toastPermissionDenied(kind: "microphone" | "camera" | "notifications") {
  const copy =
    kind === "microphone"
      ? "Microphone access is needed for voice messages and calls. You can enable it later in system settings."
      : kind === "camera"
        ? "Camera access is needed for video calls. You can enable it later in system settings."
        : "Notifications stay off. You can turn them on anytime in Settings.";
  toast.message(copy);
}
