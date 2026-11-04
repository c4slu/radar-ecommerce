export const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Desvio-padrão populacional. */
export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Coeficiente de variação (desvio / média). */
export function coefficientOfVariation(xs: number[]): number {
  const m = mean(xs);
  return m > 0 ? stdDev(xs) / m : 0;
}

/** Inclinação da regressão linear de y sobre x (mínimos quadrados). */
export function linearSlope(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0;
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Interpolação linear por partes. `stops` ordenados por x crescente. */
export function piecewise(x: number, stops: [number, number][]): number {
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < stops.length; i++) {
    const [x1, y1] = stops[i]!;
    const [x0, y0] = stops[i - 1]!;
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
}
