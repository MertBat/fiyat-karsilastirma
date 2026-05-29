import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  TooltipProps,
} from 'recharts';

interface PriceEntry {
  retailer: string;
  price: number;
  currency: string;
  timestamp: string;
}

interface PriceChartProps {
  prices?: PriceEntry[];
}

const RETAILER_COLORS: Record<string, string> = {
  'Vatan Bilgisayar': '#60a5fa',
  'Teknosa': '#4ade80',
  'MediaMarkt': '#f87171',
};

function formatDate(timestamp: string) {
  return new Date(timestamp).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

function formatPrice(value: number | null | undefined) {
  return value != null ? value.toLocaleString('tr-TR') + ' ₺' : '';
}

interface CustomTooltipPayload {
  name: string;
  value: number;
  color: string;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'rgba(15, 12, 41, 0.85)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '12px',
        padding: '10px 14px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 6 }}>{label}</p>
      {(payload as CustomTooltipPayload[]).map((entry) => (
        <p key={entry.name} style={{ color: entry.color, fontSize: 12, fontWeight: 600, margin: '2px 0' }}>
          {entry.name}: {formatPrice(entry.value)}
        </p>
      ))}
    </div>
  );
};

const PriceChart = ({ prices = [] }: PriceChartProps) => {
  if (!prices.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-white/25 gap-2">
        <span className="text-3xl">📈</span>
        <span className="text-sm">Henüz fiyat verisi yok.</span>
      </div>
    );
  }

  const byDate: Record<string, Record<string, unknown>> = {};
  const retailers = [...new Set(prices.map((p) => p.retailer))];

  prices.forEach((p) => {
    const date = formatDate(p.timestamp);
    if (!byDate[date]) byDate[date] = { date };
    byDate[date][p.retailer] = p.price;
  });

  const data = Object.values(byDate).sort(
    (a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime()
  );

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.35)' }}
          axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => v.toLocaleString('tr-TR')}
          tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.35)' }}
          axisLine={false}
          tickLine={false}
          width={72}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', paddingTop: 12 }}
        />
        {retailers.map((retailer) => (
          <Line
            key={retailer}
            type="monotone"
            dataKey={retailer}
            stroke={RETAILER_COLORS[retailer] || '#94a3b8'}
            strokeWidth={2.5}
            dot={{ r: 3.5, fill: RETAILER_COLORS[retailer] || '#94a3b8', strokeWidth: 0 }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: 'rgba(255,255,255,0.3)' }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};

export default PriceChart;

