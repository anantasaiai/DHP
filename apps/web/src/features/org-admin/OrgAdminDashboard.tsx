import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys/index.js';
import { listBookings, type BookingDto } from '../../lib/api/bookings.js';
import { StatCard } from '../../components/ui/StatCard.js';
import { Card } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

function statusVariant(status: string): BadgeVariant {
  if (status === 'CONFIRMED') return 'success';
  if (status === 'PENDING') return 'warning';
  if (status === 'CANCELLED') return 'danger';
  if (status === 'RESCHEDULED') return 'info';
  return 'neutral';
}

function appointmentTypeVariant(type: string): BadgeVariant {
  return type === 'online' ? 'info' : 'success';
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

export default function OrgAdminDashboard(): React.ReactElement {
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: queryKeys.bookings.all,
    queryFn: listBookings,
  });

  const todayCount = bookings.filter((b) => isToday(b.startsAt)).length;
  const weekCount = bookings.filter((b) => isThisWeek(b.startsAt)).length;
  const pendingCount = bookings.filter((b) => b.status === 'PENDING').length;
  const cancelledCount = bookings.filter((b) => b.status === 'CANCELLED').length;

  const upcoming = bookings
    .filter((b) => b.status === 'CONFIRMED' && new Date(b.startsAt) > new Date())
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 5);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 mt-1">Organization Overview</p>
      </div>

      <div className="grid grid-cols-4 gap-6 mb-8">
        <StatCard label="Today's Appointments" value={todayCount} color="blue" />
        <StatCard label="This Week" value={weekCount} color="green" />
        <StatCard label="Pending" value={pendingCount} color="amber" />
        <StatCard label="Cancelled" value={cancelledCount} color="red" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card title="Upcoming Appointments">
          {isLoading ? (
            <div className="py-8 text-center text-slate-400">Loading appointments…</div>
          ) : upcoming.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">No upcoming appointments.</div>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((b: BookingDto) => (
                <li key={b.id} className="flex items-start justify-between p-3 rounded-lg bg-slate-50">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{b.guestName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(b.startsAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 ml-3">
                    <Badge variant={appointmentTypeVariant(b.appointmentType)}>
                      {b.appointmentType === 'online' ? 'Online' : 'In-Person'}
                    </Badge>
                    <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent Activity">
          <ul className="space-y-3">
            {[
              'New appointment booked by John Smith',
              'Dr. Jane cancelled 2 appointments',
              'Feature flag "booking:online" enabled',
              'New staff member invited',
              'Weekly report generated',
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
                <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                <p className="text-sm text-slate-600">{item}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
