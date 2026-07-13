import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys/index.js';
import {
  listBookings,
  cancelBooking,
  rescheduleBooking,
  type BookingDto,
} from '../../lib/api/bookings.js';
import { Button } from '../../components/ui/Button.js';
import { Badge } from '../../components/ui/Badge.js';
import { Modal } from '../../components/ui/Modal.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { CreateBookingModal } from './CreateBookingModal.js';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
type TabStatus = 'all' | 'CONFIRMED' | 'PENDING' | 'CANCELLED' | 'RESCHEDULED';

const TABS: { key: TabStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'RESCHEDULED', label: 'Rescheduled' },
];

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

export default function BookingsPage(): React.ReactElement {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabStatus>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [rescheduleBooking_, setRescheduleBooking] = useState<BookingDto | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');

  const { data: bookings = [], isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.bookings.all,
    queryFn: listBookings,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelBooking(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, startsAt, endsAt }: { id: string; startsAt: string; endsAt: string }) =>
      rescheduleBooking(id, { startsAt, endsAt }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.bookings.all });
      setRescheduleBooking(null);
    },
  });

  const filteredBookings = activeTab === 'all'
    ? bookings
    : bookings.filter((b) => b.status === activeTab);

  function handleReschedule() {
    if (!rescheduleBooking_ || !rescheduleDate || !rescheduleTime) return;
    const startsAt = new Date(`${rescheduleDate}T${rescheduleTime}`).toISOString();
    const originalDuration =
      new Date(rescheduleBooking_.endsAt).getTime() - new Date(rescheduleBooking_.startsAt).getTime();
    const endsAt = new Date(new Date(startsAt).getTime() + originalDuration).toISOString();
    rescheduleMutation.mutate({ id: rescheduleBooking_.id, startsAt, endsAt });
  }

  if (isError) {
    return (
      <div className="p-8">
        <p className="text-red-600">Failed to load appointments.</p>
        <Button variant="secondary" onClick={() => void refetch()} className="mt-4">Retry</Button>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Appointments</h1>
          <p className="text-slate-500 mt-1">{filteredBookings.length} {activeTab === 'all' ? 'total' : activeTab.toLowerCase()} appointments</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New Appointment</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {TABS.map((tab) => {
          const count = tab.key === 'all' ? bookings.length : bookings.filter((b) => b.status === tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {isLoading ? (
          <div className="py-12 text-center text-slate-400">Loading appointments…</div>
        ) : filteredBookings.length === 0 ? (
          <EmptyState
            title="No appointments found"
            description={`There are no ${activeTab === 'all' ? '' : activeTab.toLowerCase() + ' '}appointments.`}
            action={<Button onClick={() => setCreateOpen(true)}>New Appointment</Button>}
          />
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {['Patient', 'Email', 'Type', 'Host', 'Date & Time', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBookings.map((b: BookingDto, i) => (
                <tr key={b.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">{b.guestName}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{b.guestEmail}</td>
                  <td className="px-4 py-3">
                    <Badge variant={appointmentTypeVariant(b.appointmentType)}>
                      {b.appointmentType === 'online' ? 'Online' : 'In-Person'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 font-mono text-xs">{b.hostId.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {new Date(b.startsAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {b.status !== 'CANCELLED' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRescheduleBooking(b);
                              setRescheduleDate('');
                              setRescheduleTime('');
                            }}
                          >
                            Reschedule
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={cancelMutation.isPending}
                            onClick={() => cancelMutation.mutate(b.id)}
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateBookingModal open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* Reschedule Modal */}
      <Modal
        open={rescheduleBooking_ !== null}
        onClose={() => setRescheduleBooking(null)}
        title="Reschedule Appointment"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRescheduleBooking(null)}>Cancel</Button>
            <Button
              loading={rescheduleMutation.isPending}
              disabled={!rescheduleDate || !rescheduleTime}
              onClick={handleReschedule}
            >
              Reschedule
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Rescheduling appointment for{' '}
            <strong>{rescheduleBooking_?.guestName}</strong>
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Date</label>
              <input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Time</label>
              <input
                type="time"
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {rescheduleMutation.isError && (
            <p className="text-sm text-red-600">Failed to reschedule. Please try again.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
