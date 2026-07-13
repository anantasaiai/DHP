import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys/index.js';
import {
  listSchedules, createSchedule, deleteSchedule,
  listRules, createRule, deleteRule,
  listOverrides, createOverride, deleteOverride,
  type ScheduleDto, type RuleDto, type OverrideDto,
} from '../../lib/api/availability.js';
import { Button } from '../../components/ui/Button.js';
import { Badge } from '../../components/ui/Badge.js';
import { Modal } from '../../components/ui/Modal.js';
import { Card } from '../../components/ui/Card.js';
import { EmptyState } from '../../components/ui/EmptyState.js';

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function buildMonthGrid(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface SelectedDay {
  day: number;
  dayOfWeek: number;
  dateStr: string;
}

function DayDetailModal({
  selected,
  scheduleId,
  rules,
  overrides,
  onClose,
}: {
  selected: SelectedDay;
  scheduleId: string | null;
  rules: RuleDto[];
  overrides: OverrideDto[];
  onClose: () => void;
}): React.ReactElement {
  const qc = useQueryClient();
  const [ruleStart, setRuleStart] = useState('09:00');
  const [ruleEnd, setRuleEnd] = useState('17:00');
  const [showAddRule, setShowAddRule] = useState(false);
  const [overrideAvailable, setOverrideAvailable] = useState(false);
  const [overrideStart, setOverrideStart] = useState('');
  const [overrideEnd, setOverrideEnd] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [showAddOverride, setShowAddOverride] = useState(false);

  const dayRules = rules.filter((r) => r.dayOfWeek === selected.dayOfWeek);
  const dayOverride = overrides.find((o) => o.date.startsWith(selected.dateStr)) ?? null;

  const addRuleMut = useMutation({
    mutationFn: () =>
      createRule(scheduleId!, { dayOfWeek: selected.dayOfWeek, startTime: ruleStart, endTime: ruleEnd }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...queryKeys.schedules.all, scheduleId, 'rules'] });
      setShowAddRule(false);
    },
  });

  const removeRuleMut = useMutation({
    mutationFn: (ruleId: string) => deleteRule(scheduleId!, ruleId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...queryKeys.schedules.all, scheduleId, 'rules'] });
    },
  });

  const addOverrideMut = useMutation({
    mutationFn: () =>
      createOverride({
        date: selected.dateStr,
        available: overrideAvailable,
        startTime: overrideAvailable && overrideStart ? overrideStart : null,
        endTime: overrideAvailable && overrideEnd ? overrideEnd : null,
        reason: overrideReason || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.overrides.all });
      setShowAddOverride(false);
    },
  });

  const removeOverrideMut = useMutation({
    mutationFn: (id: string) => deleteOverride(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.overrides.all });
    },
  });

  const parts = selected.dateStr.split('-').map(Number);
  const [y, m, d] = [parts[0] ?? 2026, parts[1] ?? 1, parts[2] ?? 1];
  const dateLabel = `${DAYS_SHORT[selected.dayOfWeek]}, ${MONTHS[m - 1]} ${d}, ${y}`;

  return (
    <Modal open onClose={onClose} title={dateLabel}>
      <div className="space-y-5">
        {scheduleId ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-slate-700">Recurring Hours</h4>
              {!showAddRule && (
                <button
                  onClick={() => setShowAddRule(true)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  + Add
                </button>
              )}
            </div>
            {dayRules.length === 0 && !showAddRule && (
              <p className="text-xs text-slate-400">
                No recurring hours for {DAYS_SHORT[selected.dayOfWeek]}
              </p>
            )}
            <div className="space-y-1.5">
              {dayRules.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2"
                >
                  <span className="text-sm text-blue-800 font-medium">
                    {r.startTime} – {r.endTime}
                  </span>
                  <button
                    onClick={() => removeRuleMut.mutate(r.id)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            {showAddRule && (
              <div className="mt-2 border border-slate-200 rounded-lg p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Start time
                    </label>
                    <input
                      type="time"
                      value={ruleStart}
                      onChange={(e) => setRuleStart(e.target.value)}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      End time
                    </label>
                    <input
                      type="time"
                      value={ruleEnd}
                      onChange={(e) => setRuleEnd(e.target.value)}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" loading={addRuleMut.isPending} onClick={() => addRuleMut.mutate()}>
                    Save
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setShowAddRule(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Select a schedule on the left to manage recurring hours.
          </p>
        )}

        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-700">Date Override</h4>
            {!dayOverride && !showAddOverride && (
              <button
                onClick={() => setShowAddOverride(true)}
                className="text-xs text-blue-600 hover:underline"
              >
                + Add
              </button>
            )}
          </div>
          {!dayOverride && !showAddOverride && (
            <p className="text-xs text-slate-400">No override set for this date</p>
          )}
          {dayOverride && (
            <div
              className={`flex items-start justify-between rounded-lg px-3 py-2 ${
                dayOverride.available ? 'bg-green-50' : 'bg-red-50'
              }`}
            >
              <div>
                <span
                  className={`text-sm font-medium ${
                    dayOverride.available ? 'text-green-700' : 'text-red-700'
                  }`}
                >
                  {dayOverride.available ? 'Available' : 'Unavailable'}
                </span>
                {dayOverride.available && dayOverride.startTime && (
                  <span className="text-xs text-slate-500 ml-2">
                    {dayOverride.startTime} – {dayOverride.endTime}
                  </span>
                )}
                {dayOverride.reason && (
                  <p className="text-xs text-slate-500 mt-0.5">{dayOverride.reason}</p>
                )}
              </div>
              <button
                onClick={() => removeOverrideMut.mutate(dayOverride.id)}
                className="text-xs text-red-400 hover:text-red-600 ml-4"
              >
                Remove
              </button>
            </div>
          )}
          {showAddOverride && (
            <div className="border border-slate-200 rounded-lg p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overrideAvailable}
                  onChange={(e) => setOverrideAvailable(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Available with custom hours</span>
              </label>
              {overrideAvailable && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Start time
                    </label>
                    <input
                      type="time"
                      value={overrideStart}
                      onChange={(e) => setOverrideStart(e.target.value)}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">End time</label>
                    <input
                      type="time"
                      value={overrideEnd}
                      onChange={(e) => setOverrideEnd(e.target.value)}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Holiday, vacation"
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  loading={addOverrideMut.isPending}
                  onClick={() => addOverrideMut.mutate()}
                >
                  Save
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setShowAddOverride(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function AvailabilityPage(): React.ReactElement {
  const qc = useQueryClient();
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<SelectedDay | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [scheduleName, setScheduleName] = useState('');
  const [scheduleTimezone, setScheduleTimezone] = useState('Asia/Kolkata');
  const [isDefault, setIsDefault] = useState(false);

  const { data: schedules = [], isLoading: loadingSchedules } = useQuery({
    queryKey: queryKeys.schedules.all,
    queryFn: listSchedules,
  });

  const { data: rules = [] } = useQuery({
    queryKey: [...queryKeys.schedules.all, selectedScheduleId, 'rules'],
    queryFn: () => listRules(selectedScheduleId!),
    enabled: !!selectedScheduleId,
  });

  const { data: overrides = [] } = useQuery({
    queryKey: queryKeys.overrides.all,
    queryFn: listOverrides,
  });

  const createMutation = useMutation({
    mutationFn: () => createSchedule({ name: scheduleName, timezone: scheduleTimezone, isDefault }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.schedules.all });
      setCreateOpen(false);
      setScheduleName('');
      setIsDefault(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSchedule(id),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: queryKeys.schedules.all });
      if (selectedScheduleId === id) setSelectedScheduleId(null);
    },
  });

  const cells = buildMonthGrid(viewYear, viewMonth);
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  function handleDayClick(day: number) {
    const date = new Date(viewYear, viewMonth, day);
    setSelectedDay({ day, dayOfWeek: date.getDay(), dateStr: toDateStr(viewYear, viewMonth, day) });
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">My Availability</h1>
        <p className="text-slate-500 mt-1">
          Manage your availability schedules and date-specific overrides
        </p>
      </div>

      <div className="flex gap-6">
        {/* Schedules list */}
        <div className="w-64 flex-shrink-0">
          <Card
            title="My Schedules"
            action={<Button size="sm" onClick={() => setCreateOpen(true)}>Add</Button>}
          >
            {loadingSchedules ? (
              <div className="py-4 text-sm text-slate-400">Loading…</div>
            ) : schedules.length === 0 ? (
              <EmptyState title="No schedules" description="Create one to define recurring hours." />
            ) : (
              <ul className="space-y-1">
                {schedules.map((s: ScheduleDto) => (
                  <li
                    key={s.id}
                    onClick={() =>
                      setSelectedScheduleId(s.id === selectedScheduleId ? null : s.id)
                    }
                    className={`flex items-start justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                      selectedScheduleId === s.id
                        ? 'bg-blue-50 border border-blue-200'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{s.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{s.timezone}</p>
                      {s.isDefault && <Badge variant="info">Default</Badge>}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMutation.mutate(s.id);
                      }}
                      className="ml-2 text-slate-400 hover:text-red-500 flex-shrink-0 text-lg leading-none"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {!selectedScheduleId && schedules.length > 0 && (
            <p className="mt-2 text-xs text-slate-400 text-center">
              Select a schedule to see recurring hours on the calendar
            </p>
          )}
        </div>

        {/* Calendar */}
        <div className="flex-1">
          <Card>
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={prevMonth}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 text-lg"
              >
                ‹
              </button>
              <h2 className="text-base font-semibold text-slate-800">
                {MONTHS[viewMonth]} {viewYear}
              </h2>
              <button
                onClick={nextMonth}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 text-lg"
              >
                ›
              </button>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS_SHORT.map((d) => (
                <div key={d} className="text-xs font-semibold text-slate-400 text-center py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden border border-slate-200">
              {cells.map((day, i) => {
                if (!day) {
                  return <div key={`empty-${i}`} className="bg-slate-50 min-h-[80px]" />;
                }

                const dateStr = toDateStr(viewYear, viewMonth, day);
                const isToday = dateStr === todayStr;
                const dow = new Date(viewYear, viewMonth, day).getDay();
                const dayRules = rules.filter((r) => r.dayOfWeek === dow);
                const override = overrides.find((o) => o.date.startsWith(dateStr));

                return (
                  <button
                    key={day}
                    onClick={() => handleDayClick(day)}
                    className={`bg-white min-h-[80px] p-1.5 text-left hover:bg-blue-50 transition-colors focus:outline-none focus:bg-blue-50 ${
                      isToday ? 'ring-2 ring-inset ring-blue-400' : ''
                    }`}
                  >
                    <span
                      className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full mb-1 ${
                        isToday ? 'bg-blue-600 text-white' : 'text-slate-700'
                      }`}
                    >
                      {day}
                    </span>
                    <div className="space-y-0.5">
                      {dayRules.length > 0 && !override && (
                        <div className="text-[10px] bg-blue-100 text-blue-700 rounded px-1 py-0.5 leading-tight truncate">
                          {dayRules.map((r) => `${r.startTime}–${r.endTime}`).join(', ')}
                        </div>
                      )}
                      {override && (
                        <div
                          className={`text-[10px] rounded px-1 py-0.5 leading-tight truncate font-medium ${
                            override.available
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {override.available
                            ? override.startTime
                              ? `${override.startTime}–${override.endTime}`
                              : 'Available'
                            : 'Unavailable'}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-blue-100 rounded inline-block" />
                Recurring hours
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-green-100 rounded inline-block" />
                Override: available
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-red-100 rounded inline-block" />
                Override: unavailable
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 ring-2 ring-blue-400 rounded inline-block" />
                Today
              </span>
            </div>
          </Card>
        </div>
      </div>

      {/* Day detail modal */}
      {selectedDay && (
        <DayDetailModal
          selected={selectedDay}
          scheduleId={selectedScheduleId}
          rules={rules}
          overrides={overrides}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {/* Create Schedule Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Schedule"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              loading={createMutation.isPending}
              disabled={!scheduleName.trim()}
              onClick={() => createMutation.mutate()}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Schedule Name</label>
            <input
              type="text"
              value={scheduleName}
              onChange={(e) => setScheduleName(e.target.value)}
              placeholder="Working Hours"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
            <input
              type="text"
              value={scheduleTimezone}
              onChange={(e) => setScheduleTimezone(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700">Set as default schedule</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
