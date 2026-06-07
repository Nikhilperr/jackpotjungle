// Lightweight synthesized ringtone (no asset). Loops until stopped.
let ctx: AudioContext | null = null;
let nodes: { osc: OscillatorNode; gain: GainNode }[] = [];
let intervalId: ReturnType<typeof setInterval> | null = null;

function ensureCtx() {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function beep(freq: number, duration: number, when = 0) {
  const c = ensureCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.value = 0;
  osc.connect(gain).connect(c.destination);
  const t = c.currentTime + when;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.15, t + 0.02);
  gain.gain.linearRampToValueAtTime(0.15, t + duration - 0.05);
  gain.gain.linearRampToValueAtTime(0, t + duration);
  osc.start(t);
  osc.stop(t + duration + 0.05);
  nodes.push({ osc, gain });
}

export function playRingtone(variant: "incoming" | "outgoing" = "incoming") {
  stopRingtone();
  const loop = () => {
    if (variant === "incoming") {
      // Messenger-like: two-tone chime pair
      beep(660, 0.25, 0);
      beep(520, 0.25, 0.28);
      beep(660, 0.25, 0.7);
      beep(520, 0.25, 0.98);
    } else {
      // Outgoing dial: long tone
      beep(440, 0.4, 0);
    }
  };
  loop();
  intervalId = setInterval(loop, variant === "incoming" ? 2000 : 1200);
}

export function stopRingtone() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  nodes.forEach(({ osc }) => { try { osc.stop(); } catch {} });
  nodes = [];
}
