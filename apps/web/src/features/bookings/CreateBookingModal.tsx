import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys/index.js';
import { createBooking, type CreateBookingPayload } from '../../lib/api/bookings.js';
import { listMeetingTypes } from '../../lib/api/meeting-types.js';
import { listMembers } from '../../lib/api/users.js';
import { Modal } from '../../components/ui/Modal.js';
import { Button } from '../../components/ui/Button.js';
import { useAuthStore } from '../../store/auth.store.js';

interface CreateBookingModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateBookingModal({ open, onClose }: CreateBookingModalProps): React.ReactElement {
  const qc = useQueryClient();
  const principal = useAuthStore((s) => s.principal);
  const isAdmin = principal?.role === 'ADMIN';

  const [patientName, setPatientName] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [meetingTypeId, setMeetingTypeId] = useState('');
  const [hostId, setHostId] = useState(principal?.userId ?? '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [appointmentType, setAppointmentType] = useState<'online' | 'in_person'>('online');

  const { data: meetingTypes = [] } = useQuery({
    queryKey: queryKeys.meetingTypes.all,
    queryFn: listMeetingTypes,
    enabled: open,
  });

  const { data: members = [] } = useQuery({
    queryKey: queryKeys.members.all,
    queryFn: listMembers,
    enabled: open && isAdmin,
  });

  const maintainers = members.filter((m) => m.role === 'MAINTAINER');
  const selectedMeetingType = meetingTypes.find((mt) => mt.id === meetingTypeId);

  const mutation = useMutation({
    mutationFn: (payload: CreateBookingPayload) => createBooking(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.bookings.all });
      onClose();
      setPatientName('');
      setPatientEmail('');
      setMeetingTypeId('');
      setDate('');
      setTime('');
      setAppointmentType('online');
    },
  });

  function handleSubmit() {
    if (!date || !time || !meetingTypeId || !patientName || !patientEmail) return;

    const startsAt = new Date(`${date}T${time}`).toISOString();
    const durationMs = (selectedMeetingType?.durationMinutes ?? 30) * 60 * 1000;
    const endsAt = new Date(new Date(startsAt).getTime() + durationMs).toISOString();

    mutation.mutate({
      meetingTypeId,
      hostId: isAdmin ? hostId : (principal?.userId ?? ''),
      guestEmail: patientEmail,
      guestName: patientName,
      startsAt,
      endsAt,
      appointmentType,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  const isValid = patientName.trim() && patientEmail.trim() && meetingTypeId && date && time;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Appointment"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={mutation.isPending}
            disabled={!isValid}
            onClick={handleSubmit}
          >
            Book Appointment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Patient Name</label>
          <input
            type="text"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            placeholder="John Smith"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Patient Email</label>
          <input
            type="email"
            value={patientEmail}
            onChange={(e) => setPatientEmail(e.target.value)}
            placeholder="patient@email.com"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Meeting Type</label>
          <select
            value={meetingTypeId}
            onChange={(e) => setMeetingTypeId(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a meeting type…</option>
            {meetingTypes.map((mt) => (
              <option key={mt.id} value={mt.id}>
                {mt.name} ({mt.durationMinutes} min)
              </option>
            ))}
          </select>
        </div>

        {isAdmin && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Doctor / Staff</label>
            <select
              value={hostId}
              onChange={(e) => setHostId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a doctor…</option>
              {maintainers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.invitedEmail}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {selectedMeetingType && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Duration</label>
            <input
              type="text"
              value={`${selectedMeetingType.durationMinutes} minutes`}
              readOnly
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Appointment Type</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="appointmentType"
                value="online"
                checked={appointmentType === 'online'}
                onChange={() => setAppointmentType('online')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">Online / Telehealth</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="appointmentType"
                value="in_person"
                checked={appointmentType === 'in_person'}
                onChange={() => setAppointmentType('in_person')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">In-Person</span>
            </label>
          </div>
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-600">Failed to create appointment. Please try again.</p>
        )}
      </div>
    </Modal>
  );
}
