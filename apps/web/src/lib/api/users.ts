import { api } from './client.js';

export interface UserDto {
  id: string;
  username: string;
  email: string;
  timezone: string;
  createdAt: string;
}

export interface OrgMemberDto {
  id: string;
  userId: string;
  user: UserDto;
  role: string;
  status: string;
  invitedEmail: string;
  createdAt: string;
}

export const listMembers = () => api.get<OrgMemberDto[]>('/organizations/me/members');
export const inviteMember = (p: { email: string; role: string }) =>
  api.post<OrgMemberDto>('/organizations/me/members/invite', p);
export const removeMember = (memberId: string) =>
  api.delete(`/organizations/me/members/${memberId}`);
export const updateMemberRole = (memberId: string, p: { role: string }) =>
  api.patch(`/organizations/me/members/${memberId}/role`, p);
