import { api } from './client.js';

export interface ScheduleDto {
  id: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  createdAt: string;
}

export interface RuleDto {
  id: string;
  scheduleId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface OverrideDto {
  id: string;
  date: string;
  available: boolean;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

export const listSchedules = () => api.get<ScheduleDto[]>('/availability/schedules');
export const createSchedule = (p: {
  name: string;
  timezone: string;
  isDefault?: boolean;
}) => api.post<ScheduleDto>('/availability/schedules', p);
export const deleteSchedule = (id: string) =>
  api.delete(`/availability/schedules/${id}`);
export const listRules = (scheduleId: string) =>
  api.get<RuleDto[]>(`/availability/schedules/${scheduleId}/rules`);
export const createRule = (
  scheduleId: string,
  p: { dayOfWeek: number; startTime: string; endTime: string },
) => api.post<RuleDto>(`/availability/schedules/${scheduleId}/rules`, p);
export const deleteRule = (scheduleId: string, ruleId: string) =>
  api.delete(`/availability/schedules/${scheduleId}/rules/${ruleId}`);
export const listOverrides = () =>
  api.get<OverrideDto[]>('/availability/overrides');
export const createOverride = (p: {
  date: string;
  available: boolean;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}) => api.post<OverrideDto>('/availability/overrides', p);
export const deleteOverride = (id: string) =>
  api.delete(`/availability/overrides/${id}`);
