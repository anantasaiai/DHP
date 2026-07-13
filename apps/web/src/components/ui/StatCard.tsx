import React from 'react';

type StatColor = 'blue' | 'green' | 'amber' | 'red';

const colorClasses: Record<StatColor, { bg: string; text: string; sub: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', sub: 'text-blue-500' },
  green: { bg: 'bg-green-50', text: 'text-green-700', sub: 'text-green-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', sub: 'text-amber-500' },
  red: { bg: 'bg-red-50', text: 'text-red-700', sub: 'text-red-500' },
};

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: StatColor;
}

export function StatCard({
  label,
  value,
  sub,
  color = 'blue',
}: StatCardProps): React.ReactElement {
  const c = colorClasses[color];
  return (
    <div className={`rounded-xl p-6 ${c.bg}`}>
      <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-2 text-4xl font-bold ${c.text}`}>{value}</p>
      {sub && <p className={`mt-1 text-sm ${c.sub}`}>{sub}</p>}
    </div>
  );
}
