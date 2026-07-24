/**
 * Messenger-style keyboard layout for Capacitor Android.
 *
 * AndroidManifest uses windowSoftInputMode=adjustResize. On OEMs that honor it,
 * window.innerHeight already excludes the IME — do NOT also shrink to
 * visualViewport.height (that double-counts and leaves a black gap above the
 * keyboard). On edge-to-edge OEMs where layout height does not shrink, fall
 * back to visualViewport height.
 */

import { Capacitor } from "@capacitor/core";

let started = false;
let focusLoop = 0;
let inputFocused = false;
let baselineH = 0;

function pinScroll() {
  if (typeof window === "undefined") return;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function readHeights() {
  const vv = window.visualViewport;
  const layoutH = Math.round(window.innerHeight || document.documentElement.clientHeight || 0);
  const visibleH = Math.round(vv?.height ?? layoutH);
  return { layoutH, visibleH };
}

function rememberBaseline(layoutH: number, visibleH: number) {
  if (inputFocused) return;
  const candidate = Math.max(layoutH, visibleH);
  if (candidate > baselineH + 2) baselineH = candidate;
}

export function applyViewportHeight() {
  if (typeof window === "undefined") return;
  const { layoutH, visibleH } = readHeights();
  rememberBaseline(layoutH, visibleH);

  const fullH = Math.max(baselineH, layoutH, visibleH, 200);
  const layoutAlreadyResized = baselineH > 0 && layoutH < baselineH - 60;
  const vvShrunk = fullH > 0 && visibleH > 0 && visibleH < fullH - 80;
  const keyboardOpen = inputFocused && (layoutAlreadyResized || vvShrunk);

  // Prefer the layout height when adjustResize already shrank the WebView.
  // Only use visualViewport when the layout did not shrink (edge-to-edge).
  let height = fullH;
  if (keyboardOpen) {
    height = layoutAlreadyResized
      ? Math.max(200, layoutH)
      : Math.max(200, Math.min(layoutH, visibleH));
  } else {
    height = Math.max(200, layoutH, visibleH);
  }

  const root = document.documentElement;
  root.style.setProperty("--jj-app-height", `${height}px`);
  root.classList.toggle("jj-keyboard-open", keyboardOpen);

  const el = document.getElementById("root");
  if (el) {
    el.style.height = `${height}px`;
    el.style.maxHeight = `${height}px`;
    el.style.minHeight = `${height}px`;
  }

  if (keyboardOpen) pinScroll();
}

function startFocusViewportLoop() {
  window.clearInterval(focusLoop);
  let ticks = 0;
  focusLoop = window.setInterval(() => {
    applyViewportHeight();
    ticks += 1;
    if (ticks >= 30 || !inputFocused) window.clearInterval(focusLoop);
  }, 50);
}

export function initViewportHeightLock() {
  if (started || typeof window === "undefined") return;
  if (!Capacitor.isNativePlatform()) return;
  started = true;

  document.documentElement.classList.add("native-android");
  const { layoutH, visibleH } = readHeights();
  baselineH = Math.max(layoutH, visibleH, 200);
  applyViewportHeight();

  const vv = window.visualViewport;
  vv?.addEventListener("resize", applyViewportHeight);
  vv?.addEventListener("scroll", () => {
    if (inputFocused) {
      pinScroll();
      applyViewportHeight();
    }
  });
  window.addEventListener("resize", applyViewportHeight);
  window.addEventListener("orientationchange", () => {
    baselineH = 0;
    window.setTimeout(applyViewportHeight, 120);
  });

  document.addEventListener(
    "focusin",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (tag !== "INPUT" && tag !== "TEXTAREA" && !t.isContentEditable) return;
      inputFocused = true;
      applyViewportHeight();
      requestAnimationFrame(applyViewportHeight);
      startFocusViewportLoop();
    },
    true,
  );

  document.addEventListener(
    "focusout",
    () => {
      window.setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        const still =
          !!active &&
          (active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            active.isContentEditable);
        if (still) return;
        inputFocused = false;
        window.clearInterval(focusLoop);
        baselineH = 0;
        applyViewportHeight();
        window.setTimeout(applyViewportHeight, 80);
        window.setTimeout(applyViewportHeight, 300);
      }, 50);
    },
    true,
  );
}
