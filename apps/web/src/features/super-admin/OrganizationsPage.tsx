import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys/index.js';
import {
  listOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  listOrgAdmins,
  addOrgAdmin,
  removeOrgAdmin,
  type OrgDto,
  type OrgAdminDto,
} from '../../lib/api/organizations.js';
import { Button } from '../../components/ui/Button.js';
import { Badge } from '../../components/ui/Badge.js';
import { Modal } from '../../components/ui/Modal.js';
import { Card } from '../../components/ui/Card.js';
import { EmptyState } from '../../components/ui/EmptyState.js';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

function subscriptionBadgeVariant(status: string): BadgeVariant {
  if (status === 'ACTIVE') return 'success';
  if (status === 'TRIALING') return 'warning';
  if (status === 'PAST_DUE') return 'danger';
  return 'neutral';
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function OrgAdminsPanel({ orgId }: { orgId: string }): React.ReactElement {
  const qc = useQueryClient();
  const [newUserId, setNewUserId] = useState('');

  const { data: admins = [], isLoading } = useQuery({
    queryKey: queryKeys.organizations.admins(orgId),
    queryFn: () => listOrgAdmins(orgId),
  });

  const addMutation = useMutation({
    mutationFn: () => addOrgAdmin(orgId, { userId: newUserId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.organizations.admins(orgId) });
      setNewUserId('');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeOrgAdmin(orgId, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.organizations.admins(orgId) });
    },
  });

  return (
    <div className="mt-4 pl-6 border-l-2 border-blue-200">
      <h4 className="text-sm font-semibold text-slate-700 mb-3">Organization Admins</h4>
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading admins…</p>
      ) : admins.length === 0 ? (
        <p className="text-sm text-slate-400 mb-3">No admins assigned yet.</p>
      ) : (
        <ul className="space-y-2 mb-3">
          {admins.map((admin: OrgAdminDto) => (
            <li key={admin.id} className="flex items-center justify-between bg-slate-50 rounded px-3 py-2">
              <div>
                <span className="text-sm font-medium text-slate-700">{admin.email}</span>
                <span className="ml-2 text-xs text-slate-400">{admin.role}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                loading={removeMutation.isPending}
                onClick={() => removeMutation.mutate(admin.userId)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={newUserId}
          onChange={(e) => setNewUserId(e.target.value)}
          placeholder="User ID"
          className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button
          size="sm"
          loading={addMutation.isPending}
          disabled={!newUserId.trim()}
          onClick={() => addMutation.mutate()}
        >
          Add Admin
        </Button>
      </div>
    </div>
  );
}

export default function OrganizationsPage(): React.ReactElement {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOrg, setEditOrg] = useState<OrgDto | null>(null);
  const [deleteOrg, setDeleteOrg] = useState<OrgDto | null>(null);
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [editName, setEditName] = useState('');

  const { data: orgs = [], isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.organizations.all,
    queryFn: listOrganizations,
  });

  const createMutation = useMutation({
    mutationFn: () => createOrganization({ name: createName, slug: createSlug }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.organizations.all });
      setCreateOpen(false);
      setCreateName('');
      setCreateSlug('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => updateOrganization(editOrg!.id, { name: editName }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.organizations.all });
      setEditOrg(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteOrganization(deleteOrg!.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.organizations.all });
      setDeleteOrg(null);
    },
  });

  function openEdit(org: OrgDto) {
    setEditOrg(org);
    setEditName(org.name);
  }

  if (isError) {
    return (
      <div className="p-8">
        <p className="text-red-600">Failed to load organizations.</p>
        <Button variant="secondary" onClick={() => void refetch()} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Organizations</h1>
          <p className="text-slate-500 mt-1">{orgs.length} total organizations</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Add Organization</Button>
      </div>

      <Card>
        {isLoading ? (
          <div className="py-12 text-center text-slate-400">Loading…</div>
        ) : orgs.length === 0 ? (
          <EmptyState
            title="No organizations yet"
            description="Create your first organization to get started."
            action={<Button onClick={() => setCreateOpen(true)}>Add Organization</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  {['Name', 'Slug', 'Subscription', 'Created', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orgs.map((org, i) => (
                  <React.Fragment key={org.id}>
                    <tr
                      className={`cursor-pointer ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/30 transition-colors`}
                      onClick={() => setExpandedOrgId(expandedOrgId === org.id ? null : org.id)}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{org.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 font-mono">{org.slug}</td>
                      <td className="px-4 py-3">
                        <Badge variant={subscriptionBadgeVariant(org.subscriptionStatus)}>
                          {org.subscriptionStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {new Date(org.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(org)}>
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setDeleteOrg(org)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {expandedOrgId === org.id && (
                      <tr>
                        <td colSpan={5} className="px-4 py-3 bg-blue-50/20">
                          <OrgAdminsPanel orgId={org.id} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Organization"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              loading={createMutation.isPending}
              disabled={!createName.trim() || !createSlug.trim()}
              onClick={() => createMutation.mutate()}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Organization Name
            </label>
            <input
              type="text"
              value={createName}
              onChange={(e) => {
                setCreateName(e.target.value);
                setCreateSlug(slugify(e.target.value));
              }}
              placeholder="Acme Hospital"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Slug
            </label>
            <input
              type="text"
              value={createSlug}
              onChange={(e) => setCreateSlug(e.target.value)}
              placeholder="acme-hospital"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
          {createMutation.isError && (
            <p className="text-sm text-red-600">Failed to create organization. Please try again.</p>
          )}
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={editOrg !== null}
        onClose={() => setEditOrg(null)}
        title="Edit Organization"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOrg(null)}>Cancel</Button>
            <Button
              loading={updateMutation.isPending}
              disabled={!editName.trim()}
              onClick={() => updateMutation.mutate()}
            >
              Save Changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Organization Name
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {updateMutation.isError && (
            <p className="text-sm text-red-600">Failed to update organization. Please try again.</p>
          )}
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteOrg !== null}
        onClose={() => setDeleteOrg(null)}
        title="Delete Organization"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOrg(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Are you sure you want to delete{' '}
          <strong>{deleteOrg?.name}</strong>? This action cannot be undone.
        </p>
        {deleteMutation.isError && (
          <p className="mt-3 text-sm text-red-600">Failed to delete organization. Please try again.</p>
        )}
      </Modal>
    </div>
  );
}
