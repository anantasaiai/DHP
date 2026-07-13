import { api } from './client.js';

export interface OrgDto {
  id: string;
  slug: string;
  name: string;
  subscriptionStatus: string;
  createdAt: string;
}

export interface OrgAdminDto {
  id: string;
  userId: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

export const listOrganizations = () => api.get<OrgDto[]>('/admin/organizations');
export const createOrganization = (p: { name: string; slug: string }) =>
  api.post<OrgDto>('/admin/organizations', p);
export const updateOrganization = (id: string, p: Partial<{ name: string }>) =>
  api.patch<OrgDto>(`/admin/organizations/${id}`, p);
export const deleteOrganization = (id: string) =>
  api.delete(`/admin/organizations/${id}`);
export const listOrgAdmins = (orgId: string) =>
  api.get<OrgAdminDto[]>(`/admin/organizations/${orgId}/admins`);
export const addOrgAdmin = (orgId: string, p: { userId: string }) =>
  api.post<OrgAdminDto>(`/admin/organizations/${orgId}/admins`, p);
export const removeOrgAdmin = (orgId: string, userId: string) =>
  api.delete(`/admin/organizations/${orgId}/admins/${userId}`);
