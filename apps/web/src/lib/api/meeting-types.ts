import { api } from './client.js';
import type { ConferencingType } from '@dhp/types';

export interface MeetingTypeDto {
  id: string;
  organizationId: string;
  ownerUserId: string;
  slug: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  conferencingType: ConferencingType;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  maxDaysInFuture: number;
  maxPerDay: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingTypePayload {
  slug: string;
  name: string;
  durationMinutes: number;
  conferencingType: ConferencingType;
  description?: string;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  minNoticeMinutes?: number;
  maxDaysInFuture?: number;
  maxPerDay?: number | null;
}

export function listMeetingTypes(): Promise<MeetingTypeDto[]> {
  return api.get<MeetingTypeDto[]>('/meeting-types');
}

export function createMeetingType(data: MeetingTypePayload): Promise<MeetingTypeDto> {
  return api.post<MeetingTypeDto>('/meeting-types', data);
}

export function updateMeetingType(
  id: string,
  data: Partial<MeetingTypePayload>,
): Promise<MeetingTypeDto> {
  return api.patch<MeetingTypeDto>(`/meeting-types/${id}`, data);
}

export function archiveMeetingType(id: string): Promise<void> {
  return api.delete(`/meeting-types/${id}`);
}
