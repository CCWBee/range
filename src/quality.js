// RANGE adaptive resolution, the decision only. Kept out of main.js because main.js top-level-awaits
// the library and node cannot import it, and because a pure decision belongs where a test reaches it.
// Spec: docs/specs/2026-09-10-range-touch-cockpit.md section 10.4.
//
// The vsync interval is the median of the window, not a constant: 16.7 ms on a 60 Hz phone, 11.1 on
// a 90 Hz one and 8.3 on a 120 Hz one, and no absolute threshold serves all three. A frame worse
// than one and a half medians is the definition of a slow frame that window.range.metrics() already
// reports, so the number read on the phone is the number this function acts on.
export const SLOW_MS = 22;

export function nextPixelRatio(times, ratio, base, floor = 1) {
  if (times.length < 60) return ratio;
  const sorted = times.slice().sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const median = at(0.5), p95 = at(0.95);
  // Round every step: 2 - 0.1 is 1.9000000000000001, and an unrounded ladder never lands on its base.
  const step = (value) => Math.round(value * 10) / 10;
  // A median over SLOW_MS is load rather than a refresh rate: every panel a phone ships with is
  // faster than 22 ms, so a flat slow window, whose p95 equals its median, still steps down.
  if ((p95 > median * 1.5 || median > SLOW_MS) && ratio > floor) return Math.max(floor, step(ratio - 0.1));
  if (p95 < median * 1.15 && median <= SLOW_MS && ratio < base) return Math.min(base, step(ratio + 0.1));
  return ratio;
}
