import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys/index.js';
import {
  listMeetingTypes,
  createMeetingType,
  updateMeetingType,
  archiveMeetingType,
  type MeetingTypeDto,
  type MeetingTypePayload,
} from '../../lib/api/meeting-types.js';
import type { ConferencingType } from '@dhp/types';

const CONFERENCING_OPTIONS: { value: ConferencingType; label: string }[] = [
  { value: 'custom', label: 'Custom / No link' },
  { value: 'google_meet', label: 'Google Meet' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'teams', label: 'Microsoft Teams' },
  { value: 'webex', label: 'Webex' },
];

interface FormState {
  name: string;
  slug: string;
  durationMinutes: string;
  description: string;
  conferencingType: ConferencingType;
  bufferBeforeMinutes: string;
  bufferAfterMinutes: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  slug: '',
  durationMinutes: '30',
  description: '',
  conferencingType: 'custom',
  bufferBeforeMinutes: '0',
  bufferAfterMinutes: '0',
};

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);
}

function validateForm(form: FormState): string | null {
  if (!form.name.trim()) return 'Name is required.';
  if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(form.slug))
    return 'Slug must be 2–48 lowercase alphanumeric characters or dashes, and start with a letter or digit.';
  const dur = Number(form.durationMinutes);
  if (!Number.isInteger(dur) || dur <= 0) return 'Duration must be a positive whole number.';
  return null;
}

const s = {
  page: { padding: '24px', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' } as React.CSSProperties,
  h1: { margin: 0, fontSize: '1.5rem' } as React.CSSProperties,
  btn: {
    padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer',
    fontSize: '0.875rem', fontWeight: 600,
  } as React.CSSProperties,
  btnPrimary: { background: '#2563eb', color: '#fff' } as React.CSSProperties,
  btnDanger: { background: '#dc2626', color: '#fff' } as React.CSSProperties,
  btnSecondary: { background: '#e5e7eb', color: '#111' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.875rem' },
  th: { textAlign: 'left' as const, padding: '10px 12px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600 },
  td: { padding: '10px 12px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' as const },
  badge: (active: boolean): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.75rem',
    fontWeight: 600, background: active ? '#d1fae5' : '#f3f4f6', color: active ? '#065f46' : '#6b7280',
  }),
  overlay: {
    position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
  },
  modal: {
    background: '#fff', borderRadius: '10px', padding: '28px 32px',
    width: '100%', maxWidth: '540px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  formRow: { marginBottom: '16px' } as React.CSSProperties,
  label: { display: 'block', marginBottom: '4px', fontSize: '0.875rem', fontWeight: 600 } as React.CSSProperties,
  input: {
    width: '100%', padding: '8px 10px', border: '1px solid #d1d5db',
    borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box' as const,
  },
  errorBox: { background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.875rem' },
  formActions: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' } as React.CSSProperties,
  rowActions: { display: 'flex', gap: '8px' } as React.CSSProperties,
};

export default function MeetingTypesPage(): React.ReactElement {
  const qc = useQueryClient();

  const { data: meetingTypes, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.meetingTypes.all,
    queryFn: () => listMeetingTypes(),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MeetingTypeDto | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [slugManual, setSlugManual] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setSlugManual(false);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(mt: MeetingTypeDto) {
    setEditTarget(mt);
    setForm({
      name: mt.name,
      slug: mt.slug,
      durationMinutes: String(mt.durationMinutes),
      description: mt.description ?? '',
      conferencingType: mt.conferencingType as ConferencingType,
      bufferBeforeMinutes: String(mt.bufferBeforeMinutes),
      bufferAfterMinutes: String(mt.bufferAfterMinutes),
    });
    setSlugManual(true);
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditTarget(null);
  }

  function handleNameChange(name: string) {
    setForm((f) => ({
      ...f,
      name,
      slug: slugManual ? f.slug : toSlug(name),
    }));
  }

  function handleSlugChange(slug: string) {
    setSlugManual(true);
    setForm((f) => ({ ...f, slug }));
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.meetingTypes.all });

  const createMutation = useMutation({
    mutationFn: (data: MeetingTypePayload) => createMeetingType(data),
    onSuccess: () => { invalidate(); closeForm(); },
    onError: (err: Error) => setFormError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<MeetingTypePayload> }) =>
      updateMeetingType(id, data),
    onSuccess: () => { invalidate(); closeForm(); },
    onError: (err: Error) => setFormError(err.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveMeetingType(id),
    onSuccess: () => invalidate(),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateForm(form);
    if (validationError) { setFormError(validationError); return; }
    setFormError(null);

    const trimmedDescription = form.description.trim();
    const basePayload = {
      name: form.name.trim(),
      slug: form.slug,
      durationMinutes: Number(form.durationMinutes),
      conferencingType: form.conferencingType,
      bufferBeforeMinutes: Number(form.bufferBeforeMinutes) || 0,
      bufferAfterMinutes: Number(form.bufferAfterMinutes) || 0,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
    };

    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: basePayload });
    } else {
      createMutation.mutate(basePayload);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.h1}>Meeting Types</h1>
        <button style={{ ...s.btn, ...s.btnPrimary }} onClick={openCreate}>
          New Meeting Type
        </button>
      </div>

      {isLoading && <p>Loading…</p>}

      {isError && (
        <div style={s.errorBox}>
          Failed to load meeting types: {(error as Error).message}
        </div>
      )}

      {meetingTypes && meetingTypes.length === 0 && (
        <p style={{ color: '#6b7280' }}>No meeting types yet. Create one to get started.</p>
      )}

      {meetingTypes && meetingTypes.length > 0 && (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Name</th>
              <th style={s.th}>Slug</th>
              <th style={s.th}>Duration</th>
              <th style={s.th}>Conferencing</th>
              <th style={s.th}>Status</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {meetingTypes.map((mt) => (
              <tr key={mt.id}>
                <td style={s.td}>
                  <strong>{mt.name}</strong>
                  {mt.description && (
                    <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '2px' }}>
                      {mt.description}
                    </div>
                  )}
                </td>
                <td style={s.td}>
                  <code style={{ fontSize: '0.8rem', background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>
                    {mt.slug}
                  </code>
                </td>
                <td style={s.td}>{mt.durationMinutes} min</td>
                <td style={s.td}>{mt.conferencingType.replace('_', ' ')}</td>
                <td style={s.td}>
                  <span style={s.badge(mt.isActive)}>{mt.isActive ? 'Active' : 'Archived'}</span>
                </td>
                <td style={s.td}>
                  <div style={s.rowActions}>
                    <button
                      style={{ ...s.btn, ...s.btnSecondary }}
                      onClick={() => openEdit(mt)}
                    >
                      Edit
                    </button>
                    {mt.isActive && (
                      <button
                        style={{ ...s.btn, ...s.btnDanger }}
                        disabled={archiveMutation.isPending}
                        onClick={() => archiveMutation.mutate(mt.id)}
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {formOpen && (
        <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) closeForm(); }}>
          <div style={s.modal}>
            <h2 style={{ margin: '0 0 20px', fontSize: '1.25rem' }}>
              {editTarget ? 'Edit Meeting Type' : 'New Meeting Type'}
            </h2>

            {formError && <div style={s.errorBox}>{formError}</div>}

            <form onSubmit={handleSubmit}>
              <div style={s.formRow}>
                <label style={s.label}>Name *</label>
                <input
                  style={s.input}
                  type="text"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={s.formRow}>
                <label style={s.label}>Slug *</label>
                <input
                  style={s.input}
                  type="text"
                  value={form.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  pattern="[a-z0-9][a-z0-9\-]{1,47}"
                  required
                />
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '3px' }}>
                  Lowercase letters, digits, and dashes (2–48 chars). Auto-generated from name.
                </div>
              </div>

              <div style={s.formRow}>
                <label style={s.label}>Duration (minutes) *</label>
                <input
                  style={s.input}
                  type="number"
                  min={1}
                  value={form.durationMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
                  required
                />
              </div>

              <div style={s.formRow}>
                <label style={s.label}>Description</label>
                <textarea
                  style={{ ...s.input, minHeight: '72px', resize: 'vertical' }}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div style={s.formRow}>
                <label style={s.label}>Conferencing</label>
                <select
                  style={s.input}
                  value={form.conferencingType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, conferencingType: e.target.value as ConferencingType }))
                  }
                >
                  {CONFERENCING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ ...s.formRow, flex: 1 }}>
                  <label style={s.label}>Buffer before (min)</label>
                  <input
                    style={s.input}
                    type="number"
                    min={0}
                    value={form.bufferBeforeMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, bufferBeforeMinutes: e.target.value }))}
                  />
                </div>
                <div style={{ ...s.formRow, flex: 1 }}>
                  <label style={s.label}>Buffer after (min)</label>
                  <input
                    style={s.input}
                    type="number"
                    min={0}
                    value={form.bufferAfterMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, bufferAfterMinutes: e.target.value }))}
                  />
                </div>
              </div>

              <div style={s.formActions}>
                <button
                  type="button"
                  style={{ ...s.btn, ...s.btnSecondary }}
                  onClick={closeForm}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ ...s.btn, ...s.btnPrimary }}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving…' : editTarget ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
