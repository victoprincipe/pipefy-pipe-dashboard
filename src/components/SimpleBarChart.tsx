'use client';

import { BarChart3 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const SAMPLE_DATA = [
  { name: 'Jan', cards: 1240 },
  { name: 'Fev', cards: 1580 },
  { name: 'Mar', cards: 1890 },
  { name: 'Abr', cards: 1420 },
  { name: 'Mai', cards: 2150 },
  { name: 'Jun', cards: 2490 },
];

/**
 * Simple client-side bar chart card powered by Recharts and Lucide icons.
 */
export function SimpleBarChart() {
  return (
    <section className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
          <BarChart3 className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Cards por Mês
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Gráfico de barras simples com Recharts e Lucide React
          </p>
        </div>
      </header>

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height={320} minWidth={0}>
          <BarChart data={SAMPLE_DATA} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#71717a', fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#71717a', fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(37, 99, 235, 0.08)' }}
              contentStyle={{
                borderRadius: '0.75rem',
                borderColor: '#e4e4e7',
                fontSize: '0.875rem',
              }}
            />
            <Bar dataKey="cards" name="Cards" fill="#2563eb" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
