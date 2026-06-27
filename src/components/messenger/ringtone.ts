let ctx: AudioContext | null = null;
let nodes: { osc: OscillatorNode; gain: GainNode }[] = [];
let intervalId: ReturnType<typeof setInterval> | null = null;
let audio: HTMLAudioElement | null = null;

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

function beepDual(f1: number, f2: number, duration: number, when = 0) {
  const c = ensureCtx();
  const osc1 = c.createOscillator();
  const osc2 = c.createOscillator();
  const gain = c.createGain();
  
  osc1.type = "sine";
  osc2.type = "sine";
  osc1.frequency.value = f1;
  osc2.frequency.value = f2;
  gain.gain.value = 0;
  
  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(c.destination);
  
  const t = c.currentTime + when;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.08, t + 0.05);
  gain.gain.linearRampToValueAtTime(0.08, t + duration - 0.05);
  gain.gain.linearRampToValueAtTime(0, t + duration);
  
  osc1.start(t);
  osc2.start(t);
  osc1.stop(t + duration + 0.05);
  osc2.stop(t + duration + 0.05);
  
  nodes.push({ osc: osc1, gain });
  nodes.push({ osc: osc2, gain });
}

function playFallbackChime() {
  const loop = () => {
    beep(660, 0.25, 0);
    beep(520, 0.25, 0.28);
    beep(660, 0.25, 0.7);
    beep(520, 0.25, 0.98);
  };
  loop();
  intervalId = setInterval(loop, 2000);
}

function playRingbackTone() {
  const loop = () => {
    // 440Hz + 480Hz dual frequency ringback beep for 1.8 seconds, repeating
    beepDual(440, 480, 1.8, 0);
  };
  loop();
  intervalId = setInterval(loop, 4000);
}

export function playRingtone(variant: "incoming" | "outgoing" = "incoming") {
  stopRingtone();
  if (variant === "incoming") {
    audio = new Audio("/ringtone.mp3");
    audio.loop = true;
    audio.play().catch((err) => {
      console.warn("[Ringtone] MP3 playback failed, falling back to synthesized chime:", err);
      playFallbackChime();
    });
  } else {
    // Outgoing phone dial ringback tone
    playRingbackTone();
  }
}

export function stopRingtone() {
  if (audio) {
    try {
      audio.pause();
    } catch {}
    audio = null;
  }
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  nodes.forEach(({ osc }) => { try { osc.stop(); } catch {} });
  nodes = [];
}
