"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const shortDay = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
const COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#a855f7", "#ef4444"];
const tooltipStyle = { background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12, color: "#fafafa" };

/** Posição no ranking por categoria (eixo invertido: 1 em cima). */
export function RankChart({ data, series }: { data: Record<string, string | number | null>[]; series: { key: string; name: string }[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
          <XAxis dataKey="day" tickFormatter={shortDay} fontSize={11} stroke="currentColor" strokeOpacity={0.5} />
          <YAxis reversed domain={[1, 20]} ticks={[1, 5, 10, 15, 20]} fontSize={11} width={28} stroke="currentColor" strokeOpacity={0.5} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => shortDay(String(d))} formatter={(v, n) => [`#${v}`, n]} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {series.map((s, i) => (
            <Line key={s.key} dataKey={s.key} name={s.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Anúncios (eixo da esquerda) e preço mediano (eixo da direita) ao longo do tempo. */
export function CompetitionChart({ data }: { data: { day: string; listings: number; median: number | null }[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
          <XAxis dataKey="day" tickFormatter={shortDay} fontSize={11} stroke="currentColor" strokeOpacity={0.5} />
          <YAxis yAxisId="l" allowDecimals={false} fontSize={11} width={32} stroke="currentColor" strokeOpacity={0.5} />
          <YAxis yAxisId="r" orientation="right" tickFormatter={(v: number) => `R$${Math.round(v)}`} fontSize={11} width={52} stroke="currentColor" strokeOpacity={0.5} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(d) => shortDay(String(d))}
            formatter={(v, n) => [n === "Preço mediano" && typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : String(v), n]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line yAxisId="l" dataKey="listings" name="Anúncios" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line yAxisId="r" dataKey="median" name="Preço mediano" stroke="#0ea5e9" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
