// A group must be at least as wide as the viewport, with one extra full unit.
// The two identical groups form a seamless cycle at exactly -50% translation.
export function marqueeCopies(viewportWidth, unitWidth) {
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(unitWidth) || viewportWidth <= 0 || unitWidth <= 0) return 2;
  return Math.max(2, Math.min(128, Math.ceil(viewportWidth / unitWidth) + 1));
}
export function marqueeDurationSeconds(copies, unitWidth) {
  if (!Number.isFinite(unitWidth) || unitWidth <= 0) return 32;
  const pixels = copies * unitWidth;
  return Math.round(Math.min(120, Math.max(14, pixels / 58)) * 10) / 10;
}
