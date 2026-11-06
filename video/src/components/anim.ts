import { Easing, interpolate, spring } from 'remotion';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Progreso 0→1 con muelle suave a partir de `delay` frames. */
export const enter = (frame: number, fps: number, delay = 0, damping = 200) =>
  spring({ frame: frame - delay, fps, config: { damping } });

/** Aparición desde abajo con fundido. */
export const fadeUp = (frame: number, fps: number, delay = 0, distance = 40) => {
  const p = enter(frame, fps, delay);
  return { opacity: p, translate: `0px ${(1 - p) * distance}px` };
};

/** Interpolación lineal limitada con curva de salida suave. */
export const ease = (frame: number, input: [number, number], output: [number, number]) =>
  interpolate(frame, input, output, { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });

export const lerp = (frame: number, input: number[], output: number[]) =>
  interpolate(frame, input, output, clamp);

export const formatClock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const r = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${r}`;
};
