type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

export function createAudioContext(): AudioContext | null {
  const webkit = (window as WindowWithWebkitAudio).webkitAudioContext;
  const Ctx = window.AudioContext ?? webkit;
  return Ctx ? new Ctx() : null;
}

// Custom synthesizer for premium feedback sounds (100% web-native)
export const playBeep = (type: "success" | "error" | "click") => {
  try {
    const ctx = createAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === "success") {
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      osc.start();
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.stop(ctx.currentTime + 0.28);
    } else if (type === "error") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(90, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.stop(ctx.currentTime + 0.42);
    } else if (type === "click") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.stop(ctx.currentTime + 0.04);
    }
  } catch {
    // Browser blocked AudioContext until user interaction
  }
};
