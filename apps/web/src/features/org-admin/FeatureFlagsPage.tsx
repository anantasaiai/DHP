import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys/index.js';
import { listFeatureFlags, upsertFeatureFlag, type FeatureFlagDto } from '../../lib/api/feature-flags.js';

interface FlagMeta {
  key: string;
  label: string;
  description: string;
}

const FLAG_META: FlagMeta[] = [
  { key: 'booking:in_person', label: 'In-Person Appointments', description: 'Allow patients to book in-person clinic visits.' },
  { key: 'booking:online', label: 'Online / Telehealth Appointments', description: 'Enable video and phone consultations via the platform.' },
  { key: 'ai_suggestions', label: 'AI Scheduling Suggestions', description: 'Surface AI-powered slot recommendations for doctors and admins.' },
  { key: 'recurring_bookings', label: 'Recurring Appointments', description: 'Let patients set up weekly or monthly recurring appointment series.' },
  { key: 'public_booking_page', label: 'Public Booking Page', description: 'Show the organization\'s public booking page to unauthenticated users.' },
  { key: 'webhook_events', label: 'Webhook Events', description: 'Send real-time webhook notifications for booking lifecycle events.' },
  { key: 'calendar_sync', label: 'Calendar Sync', description: 'Sync appointments with Google Calendar / Outlook for staff members.' },
];

function ToggleSwitch({ enabled, onChange, loading }: { enabled: boolean; onChange: (v: boolean) => void; loading: boolean }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      disabled={loading}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
        enabled ? 'bg-blue-600' : 'bg-slate-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function FeatureFlagsPage(): React.ReactElement {
  const qc = useQueryClient();

  const { data: flags = [], isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.featureFlags.all,
    queryFn: listFeatureFlags,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      upsertFeatureFlag(key, { enabled }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.featureFlags.all });
    },
  });

  function getFlagEnabled(key: string): boolean {
    const flag = flags.find((f: FeatureFlagDto) => f.key === key);
    return flag?.enabled ?? false;
  }

  if (isError) {
    return (
      <div className="p-8">
        <p className="text-red-600">Failed to load feature flags.</p>
        <button onClick={() => void refetch()} className="mt-4 text-blue-600 underline text-sm">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Feature Flags</h1>
        <p className="text-slate-500 mt-1">Enable or disable hospital scheduling features for your organization.</p>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-slate-400">Loading feature flags…</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
          {FLAG_META.map((meta) => {
            const enabled = getFlagEnabled(meta.key);
            return (
              <div
                key={meta.key}
                className={`bg-white rounded-xl border-2 p-5 transition-all ${
                  enabled ? 'border-blue-200 shadow-sm' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800">{meta.label}</h3>
                    <p className="mt-1 text-xs text-slate-500 leading-relaxed">{meta.description}</p>
                    <p className="mt-2 text-xs text-slate-400 font-mono">{meta.key}</p>
                  </div>
                  <ToggleSwitch
                    enabled={enabled}
                    loading={toggleMutation.isPending}
                    onChange={(v) => toggleMutation.mutate({ key: meta.key, enabled: v })}
                  />
                </div>
                <div className={`mt-3 text-xs font-medium ${enabled ? 'text-blue-600' : 'text-slate-400'}`}>
                  {enabled ? 'Enabled' : 'Disabled'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
