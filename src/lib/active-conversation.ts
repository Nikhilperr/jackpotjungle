/**
 * Messenger-style active conversation + app visibility (client).
 * Suppress notifications only when foreground AND viewing THIS conversation.
 */

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  keysMatch,
  normalizeConversationKey,
  conversationKeyFromPushData,
  shouldSkipPushForRecipient,
  ACTIVE_CONVERSATION_STALE_MS,
} from "@/lib/active-conversation-core";

export {
  keysMatch,
  normalizeConversationKey,
  conversationKeyFromPushData,
  shouldSkipPushForRecipient,
  ACTIVE_CONVERSATION_STALE_MS,
};

const LS_KEY = "jj_active_conversation_key";
const LS_FG = "jj_app_in_foreground";

type Listener = () => void;

let activeKey: string | null = null;
let appInForeground = true;
let myUserId: string | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let listeners = new Set<Listener>();
let lifecycleWired = false;

function notifyListeners() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

function persistLocal() {
  if (typeof window === "undefined") return;
  try {
    if (activeKey) localStorage.setItem(LS_KEY, activeKey);
    else localStorage.removeItem(LS_KEY);
    localStorage.setItem(LS_FG, appInForeground ? "1" : "0");
  } catch {
    /* ignore */
  }

  try {
    const bridge = (window as any).AndroidBridge;
    if (bridge?.setNotificationContext) {
      bridge.setNotificationContext(activeKey ?? "", appInForeground);
    }
  } catch {
    /* ignore */
  }
}

function scheduleServerSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    void flushServerSync();
  }, 80);
}

async function flushServerSync() {
  const uid = myUserId;
  if (!uid) return;
  try {
    await supabase
      .from("profiles")
      .update({
        active_conversation_key: activeKey,
        app_in_foreground: appInForeground,
        active_conversation_at: new Date().toISOString(),
      } as any)
      .eq("id", uid);
  } catch (err) {
    console.warn("[ActiveConversation] Server sync failed:", err);
  }
}

export function getActiveConversationKey(): string | null {
  return activeKey;
}

export function isAppInForeground(): boolean {
  return appInForeground;
}

export function shouldSuppressChatNotification(conversationKey: string | null | undefined): boolean {
  if (!conversationKey) return false;
  if (!appInForeground) return false;
  return keysMatch(activeKey, normalizeConversationKey(conversationKey));
}

export function isViewingConversation(conversationKey: string | null | undefined): boolean {
  return shouldSuppressChatNotification(conversationKey);
}

export function setMyUserId(userId: string | null) {
  myUserId = userId;
}

export function setActiveConversation(key: string | null) {
  const next = normalizeConversationKey(key);
  if (activeKey === next) {
    persistLocal();
    return;
  }
  activeKey = next;
  persistLocal();
  notifyListeners();
  scheduleServerSync();
}

export function clearActiveConversation() {
  setActiveConversation(null);
}

export function setAppInForeground(foreground: boolean) {
  if (appInForeground === foreground) {
    persistLocal();
    return;
  }
  appInForeground = foreground;
  persistLocal();
  notifyListeners();
  if (syncTimer) clearTimeout(syncTimer);
  void flushServerSync();
}

export function subscribeActiveConversation(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function initActiveConversationLifecycle(userId?: string | null) {
  if (userId) myUserId = userId;

  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) activeKey = stored;
      const fg = localStorage.getItem(LS_FG);
      if (fg === "0") appInForeground = false;
      else if (fg === "1") appInForeground = true;
      else appInForeground = document.visibilityState !== "hidden";
    } catch {
      /* ignore */
    }
    persistLocal();
  }

  if (lifecycleWired || typeof window === "undefined") return;
  lifecycleWired = true;

  const syncVisibility = () => {
    setAppInForeground(document.visibilityState === "visible");
  };

  document.addEventListener("visibilitychange", syncVisibility);
  window.addEventListener("focus", () => setAppInForeground(true));
  window.addEventListener("blur", () => {
    if (document.visibilityState === "hidden") setAppInForeground(false);
  });
  window.addEventListener("jj-app-foreground", () => setAppInForeground(true));
  window.addEventListener("jj-app-background", () => setAppInForeground(false));

  syncVisibility();
}

export function useTrackActiveConversation(
  key: string | null | undefined,
  enabled = true,
) {
  const normalized = enabled ? normalizeConversationKey(key ?? null) : null;

  useEffect(() => {
    setActiveConversation(normalized);
    return () => {
      if (keysMatch(getActiveConversationKey(), normalized)) {
        clearActiveConversation();
      }
    };
  }, [normalized]);
}
