"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/*
 * Gráficos do dashboard. Cores vêm das variáveis CSS do tema (--chart-*), então trocam
 * junto com claro/escuro sem recarregar. Cada gráfico tem rótulo acessível e legenda/tooltip
 * em texto: a informação nunca depende só da cor (regra de acessibilidade da skill).
 */

const axis = { fontSize: 12, stroke: "var(--chart-axis)", tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />;

interface TipProps {
  active?: boolean;
  payload?: { dataKey?: string | number; name?: string; value?: number | string; color?: string }[];
  label?: string | number;
  format?: (v: number) => string;
}

function ChartTooltip({ active, payload, label, format }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--tooltip-bg)", color: "var(--tooltip-fg)", borderColor: "var(--border)" }}
    >
      {label != null && <div className="mb-1 font-medium">{label}</div>}
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          <span className="muted">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums">{typeof p.value === "number" ? (format ? format(p.value) : p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

const legendStyle = { fontSize: 12, color: "var(--fg-muted)" };

/** Linhas ao longo do tempo (ex.: cotação do dólar e do yuan). */
export function TrendLines({
  data,
  series,
  label,
  format,
  height = 220,
}: {
  data: Record<string, string | number | null>[];
  series: { key: string; name: string; color: string; axis?: "left" | "right" }[];
  label: string;
  format?: (v: number) => string;
  height?: number;
}) {
  const hasRight = series.some((s) => s.axis === "right");
  return (
    <div role="img" aria-label={label} style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: hasRight ? 4 : 12, bottom: 0, left: -8 }}>
          {grid}
          <XAxis dataKey="label" {...axis} minTickGap={24} />
          <YAxis yAxisId="left" {...axis} width={48} domain={["auto", "auto"]} tickFormatter={(v: number) => (format ? format(v) : String(v))} />
          {hasRight && <YAxis yAxisId="right" orientation="right" {...axis} width={48} domain={["auto", "auto"]} tickFormatter={(v: number) => (format ? format(v) : String(v))} />}
          <Tooltip content={<ChartTooltip format={format} />} cursor={{ stroke: "var(--chart-grid)" }} />
          <Legend wrapperStyle={legendStyle} iconType="plainline" />
          {series.map((s) => (
            <Line
              key={s.key}
              yAxisId={s.axis ?? "left"}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras horizontais empilhadas por categoria (ex.: oportunidades fortes x boas). */
export function CategoryBars({
  data,
  series,
  label,
  height,
}: {
  data: { name: string; [k: string]: string | number }[];
  series: { key: string; name: string; color: string }[];
  label: string;
  height?: number;
}) {
  return (
    <div role="img" aria-label={label} style={{ height: height ?? Math.max(160, data.length * 34 + 40) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap={8}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
          <XAxis type="number" {...axis} allowDecimals={false} />
          <YAxis type="category" dataKey="name" {...axis} width={150} tick={{ fontSize: 12, fill: "var(--fg)" }} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-2)" }} />
          <Legend wrapperStyle={legendStyle} iconType="circle" />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={s.color} radius={i === series.length - 1 ? [0, 4, 4, 0] : 0} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Histograma em colunas (ex.: distribuição dos scores de oportunidade). */
export function Histogram({
  data,
  label,
  height = 200,
}: {
  data: { name: string; value: number; color: string }[];
  label: string;
  height?: number;
}) {
  return (
    <div role="img" aria-label={label} style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          {grid}
          <XAxis dataKey="name" {...axis} />
          <YAxis {...axis} allowDecimals={false} width={48} tickFormatter={(v: number) => v.toLocaleString("pt-BR")} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="value" name="Produtos" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Rosca com o total no centro e legenda com valores (≤ 5 fatias). */
export function Donut({
  data,
  label,
  centerLabel,
  size = 168,
}: {
  data: { name: string; value: number; color: string }[];
  label: string;
  centerLabel: string;
  size?: number;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const shown = total > 0 ? data.filter((d) => d.value > 0) : [{ name: "vazio", value: 1, color: "var(--chart-grid)" }];
  return (
    <div className="flex flex-wrap items-center gap-5" role="img" aria-label={label}>
      <div className="relative" style={{ width: size, height: size }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={shown} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
              {shown.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            {total > 0 && <Tooltip content={<ChartTooltip />} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-2xl font-semibold tabular-nums">{total}</div>
            <div className="muted text-xs">{centerLabel}</div>
          </div>
        </div>
      </div>
      <ul className="min-w-36 flex-1 space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} aria-hidden />
            <span className="muted">{d.name}</span>
            <span className="ml-auto font-semibold tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
