"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface PricePoint {
  day: string;
  min: number | null;
  median: number | null;
  max: number | null;
  sellers: number;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const shortDay = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);

/** Faixa de preço (mín–máx) com a mediana por cima, por dia. */
export function PriceChart({ data, cost }: { data: PricePoint[]; cost?: number | null }) {
  const rows = data.map((d) => ({ ...d, range: d.min != null && d.max != null ? [d.min, d.max] : null }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
          <XAxis dataKey="day" tickFormatter={shortDay} fontSize={11} stroke="currentColor" strokeOpacity={0.5} />
          <YAxis tickFormatter={(v: number) => `R$${Math.round(v)}`} fontSize={11} width={56} stroke="currentColor" strokeOpacity={0.5} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{ background: "var(--tooltip-bg, #18181b)", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(d) => shortDay(String(d))}
            formatter={(value, name) => {
              if (name === "Faixa" && Array.isArray(value)) return [`${brl(value[0])} a ${brl(value[1])}`, name];
              return [typeof value === "number" ? brl(value) : String(value), name];
            }}
          />
          <Area dataKey="range" name="Faixa" stroke="none" fill="#0ea5e9" fillOpacity={0.15} isAnimationActive={false} />
          <Line dataKey="median" name="Mediana" stroke="#0ea5e9" strokeWidth={2} dot={rows.length < 15} isAnimationActive={false} />
          {cost != null && (
            <Line
              dataKey={() => cost}
              name="Seu custo"
              stroke="#ef4444"
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
