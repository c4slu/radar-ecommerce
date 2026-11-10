/** Mini-gráfico da posição no ranking (1 em cima). Sem biblioteca: SVG puro, renderizado no servidor. */
export function Sparkline({ points, days = 14 }: { points: { day: number; position: number }[]; days?: number }) {
  const w = 96;
  const h = 28;
  if (points.length < 2) return <span className="text-xs text-zinc-400">{points.length ? "1 dia" : "-"}</span>;
  const x = (d: number) => (d / (days - 1)) * (w - 4) + 2;
  const y = (p: number) => ((p - 1) / 19) * (h - 4) + 2;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.position).toFixed(1)}`).join(" ");
  const last = points.at(-1)!;
  const up = points[0]!.position >= last.position;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label="posição nos últimos 14 dias">
      <line x1="0" x2={w} y1={y(10)} y2={y(10)} stroke="currentColor" strokeOpacity="0.1" />
      <path d={path} fill="none" stroke={up ? "#10b981" : "#f59e0b"} strokeWidth="1.5" />
      <circle cx={x(last.day)} cy={y(last.position)} r="2" fill={up ? "#10b981" : "#f59e0b"} />
    </svg>
  );
}
