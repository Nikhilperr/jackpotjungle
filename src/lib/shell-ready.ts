/**
 * Signal that the first real screen has mounted so the *native* splash can hide.
 * No second HTML logo — just hand off to chats (with blur placeholders if needed).
 */

let signaled = false;

export function signalShellReady() {
  if (typeof window === "undefined" || signaled) return;
  signaled = true;
  (window as any).__jjAppReadyFired = true;
  window.dispatchEvent(new Event("jj-app-ready"));
}
