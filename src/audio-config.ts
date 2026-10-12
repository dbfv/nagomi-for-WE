// Audio tuning. Volumes use the Web Audio gain scale: 0 is silent and 1 is full.
// Where the loop is loaded from lives in ambient-audio.ts, whose source differs
// per build (web bundle vs. the self-contained Wallpaper Engine bundle).
export const AUDIO = {
  defaultEnabled: false,
  toggleFadeSeconds: 0.45,
  ambient: {
    volume: 0.3,
  },
} as const;
