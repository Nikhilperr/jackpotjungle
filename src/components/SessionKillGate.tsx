import { useSessionKillListener } from "@/hooks/useSessionKillListener";

/** Mount once under authenticated routes — Messenger-style remote logout. */
export function SessionKillGate() {
  useSessionKillListener(true);
  return null;
}
