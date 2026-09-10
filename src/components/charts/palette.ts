/**
 * Chart colours.
 *
 * Deliberately not the brand palette. Ink, sand, stone, clay and gold are
 * beautiful and nearly the same colour: run through the categorical checks
 * they fail on chroma (they read as grey), on colourblind separation at
 * ΔE 1.5 against a floor of 8, and on normal-vision separation at 7.4
 * against a floor of 15. A reader with protanopia would see one series.
 *
 * These are the validated slots, checked on this app's white card surface:
 *
 *   3 slots, all pairs (donut)  CVD ΔE 9.2 · normal ΔE 24.0   PASS
 *   5 slots, adjacent (bars)    CVD ΔE 9.1 · normal ΔE 19.6   PASS
 *
 * Three of them sit under 3:1 against white, which the checks flag: the relief
 * rule says ship visible labels or a table. Every chart here direct-labels its
 * values, so identity never rests on colour alone.
 *
 * The brand still owns the page — surfaces, type, rules and the ink/gold
 * two-series bars stay exactly as they were. Only categorical identity uses
 * these.
 */
export const SERIES = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#4a3aa7", // violet
] as const;

/** Anything past the sixth slot folds in here rather than inventing a hue. */
export const OTHER = "#8a8578";

/**
 * Colour follows the entity, never its rank — a filter that drops a series
 * must not repaint the survivors. Callers pass a stable key.
 */
export function seriesColor(index: number) {
  return index < SERIES.length ? SERIES[index] : OTHER;
}

/** One hue, light to dark: magnitude, where the categories have an order. */
export const SEQUENTIAL = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
