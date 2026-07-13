import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys/index.js';
import { listBookings, type BookingDto } from '../../lib/api/bookings.js';
import { listSchedules } from '../../lib/api/availability.js';
import { StatCard } from '../../components/ui/StatCard.js';
import { Badge } from '../../components/ui/Badge.js';
import { Card } from '../../components/ui/Card.js';
import { useAuthStore } from '../../store/auth.store.js';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

function statusVariant(status: string): BadgeVariant {
  if (status === 'CONFIRMED') return 'success';
  if (status === 'PENDING') return 'warning';
  if (status === 'CANCELLED') return 'danger';
  if (status === 'RESCHEDULED') return 'info';
  return 'neutral';
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  return d >= weekStart && d < weekEnd;
}

export default function MaintainerDashboard(): React.ReactElement {
  const principal = useAuthStore((s) => s.principal);
  const userId = principal?.userId ?? '';

  const { data: allBookings = [], isLoading } = useQuery({
    queryKey: queryKeys.bookings.byHost(userId),
    queryFn: listBookings,
  });

  const { data: schedules = [] } = useQuery({
    queryKey: queryKeys.schedules.all,
    queryFn: listSchedules,
  });

  // Filter to current user's bookings
  const myBookings = allBookings.filter((b) => b.hostId === userId || !b.hostId);

  const todayCount = myBookings.filter((b) => isToday(b.startsAt)).length;
  const weekCount = myBookings.filter((b) => isThisWeek(b.startsAt)).length;

  const upcoming = myBookings
    .filter((b) => b.status === 'CONFIRMED' && new Date(b.startsAt) > new Date())
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 10);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">My Dashboard</h1>
        <p className="text-slate-500 mt-1">Your schedule and upcoming appointments</p>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        <StatCard label="Today's Appointments" value={todayCount} color="blue" />
        <StatCard label="This Week" value={weekCount} color="green" />
        <StatCard label="Active Schedules" value={schedules.length} color="amber" sub="Availability schedules" />
      </div>

      <Card title="My Upcoming Appointments">
        {isLoading ? (
          <div className="py-8 text-center text-slate-400">Loading appointments…</div>
        ) : upcoming.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">No upcoming appointments.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  {['Patient', 'Email', 'Date & Time', 'Type', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {upcoming.map((b: BookingDto, i) => (
                  <tr key={b.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{b.guestName}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{b.guestEmail}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{new Date(b.startsAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Badge variant={b.appointmentType === 'online' ? 'info' : 'success'}>
                        {b.appointmentType === 'online' ? 'Online' : 'In-Person'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
