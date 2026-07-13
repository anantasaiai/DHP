import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys/index.js';
import {
  listMembers,
  inviteMember,
  removeMember,
  updateMemberRole,
  type OrgMemberDto,
} from '../../lib/api/users.js';
import { Button } from '../../components/ui/Button.js';
import { Badge } from '../../components/ui/Badge.js';
import { Modal } from '../../components/ui/Modal.js';
import { Card } from '../../components/ui/Card.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { useAuthStore } from '../../store/auth.store.js';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

function roleBadgeVariant(role: string): BadgeVariant {
  if (role === 'ADMIN') return 'danger';
  if (role === 'MAINTAINER') return 'info';
  return 'neutral';
}

function statusBadgeVariant(status: string): BadgeVariant {
  if (status === 'ACTIVE') return 'success';
  if (status === 'INVITED') return 'warning';
  return 'neutral';
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MAINTAINER: 'Doctor / Staff',
  MEMBER: 'Member',
};

export default function UsersPage(): React.ReactElement {
  const qc = useQueryClient();
  const currentUserId = useAuthStore((s) => s.principal?.userId);

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');

  // Change role modal
  const [roleModalMember, setRoleModalMember] = useState<OrgMemberDto | null>(null);
  const [newRole, setNewRole] = useState('MEMBER');

  // Success banner
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  // Generic confirmation modal
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    variant: 'danger' | 'primary';
    onConfirm: () => void;
  } | null>(null);

  const { data: members = [], isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.members.all,
    queryFn: listMembers,
    staleTime: 0,
  });

  const inviteMutation = useMutation({
    mutationFn: () => inviteMember({ email: inviteEmail, role: inviteRole }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.members.all });
      setSuccessMsg(`Invite sent to ${inviteEmail}.`);
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('MEMBER');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => removeMember(memberId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.members.all });
      setSuccessMsg('Member removed successfully.');
    },
  });

  const roleMutation = useMutation({
    mutationFn: () => updateMemberRole(roleModalMember!.id, { role: newRole }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.members.all });
      setRoleModalMember(null);
      setSuccessMsg('Role updated successfully.');
    },
  });

  function openRoleModal(member: OrgMemberDto) {
    setRoleModalMember(member);
    setNewRole(member.role);
    roleMutation.reset();
  }

  function requestRemove(member: OrgMemberDto) {
    setConfirm({
      title: 'Remove member',
      message: `Remove ${member.invitedEmail} from the organization? They will lose access immediately.`,
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: () => removeMutation.mutate(member.id),
    });
  }

  function requestRoleChange() {
    if (!roleModalMember || newRole === roleModalMember.role) return;
    const from = ROLE_LABELS[roleModalMember.role] ?? roleModalMember.role;
    const to = ROLE_LABELS[newRole] ?? newRole;
    setConfirm({
      title: 'Change role',
      message: `Change ${roleModalMember.invitedEmail}'s role from ${from} to ${to}?`,
      confirmLabel: 'Confirm change',
      variant: 'primary',
      onConfirm: () => roleMutation.mutate(),
    });
  }

  if (isError) {
    return (
      <div className="p-8">
        <p className="text-red-600">Failed to load staff members.</p>
        <Button variant="secondary" onClick={() => void refetch()} className="mt-4">Retry</Button>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Users</h1>
          <p className="text-slate-500 mt-1">{members.length} members</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>Invite Member</Button>
      </div>

      {successMsg && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {successMsg}
        </div>
      )}

      {removeMutation.isError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {removeMutation.error instanceof Error ? removeMutation.error.message : 'Failed to remove member.'}
        </div>
      )}

      <Card>
        {isLoading ? (
          <div className="py-12 text-center text-slate-400">Loading…</div>
        ) : members.length === 0 ? (
          <EmptyState
            title="No staff members yet"
            description="Invite your first team member to get started."
            action={<Button onClick={() => setInviteOpen(true)}>Invite Member</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  {['Email', 'Role', 'Status', 'Invited', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m: OrgMemberDto, i) => (
                  <tr key={m.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-4 py-3 text-sm text-slate-800">{m.invitedEmail}</td>
                    <td className="px-4 py-3">
                      <Badge variant={roleBadgeVariant(m.role)}>{m.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusBadgeVariant(m.status)}>{m.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {m.userId === currentUserId ? (
                        <span className="text-xs text-slate-400 italic">You</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openRoleModal(m)}>
                            Change Role
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={removeMutation.isPending}
                            onClick={() => requestRemove(m)}
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Invite Modal */}
      <Modal
        open={inviteOpen}
        onClose={() => { setInviteOpen(false); inviteMutation.reset(); }}
        title="Invite Member"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setInviteOpen(false); inviteMutation.reset(); }}>Cancel</Button>
            <Button
              loading={inviteMutation.isPending}
              disabled={!inviteEmail.trim()}
              onClick={() => inviteMutation.mutate()}
            >
              Send Invite
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="doctor@hospital.com"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ADMIN">Admin</option>
              <option value="MAINTAINER">Doctor / Staff</option>
              <option value="MEMBER">Member</option>
            </select>
          </div>
          {inviteMutation.isError && (
            <p className="text-sm text-red-600">
              {inviteMutation.error instanceof Error ? inviteMutation.error.message : 'Failed to invite member.'}
            </p>
          )}
        </div>
      </Modal>

      {/* Change Role Modal */}
      <Modal
        open={roleModalMember !== null}
        onClose={() => { setRoleModalMember(null); roleMutation.reset(); }}
        title="Change Role"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setRoleModalMember(null); roleMutation.reset(); }}>Cancel</Button>
            <Button
              disabled={newRole === roleModalMember?.role}
              onClick={requestRoleChange}
            >
              Update Role
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Changing role for <strong>{roleModalMember?.invitedEmail}</strong>
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">New Role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ADMIN">Admin</option>
              <option value="MAINTAINER">Doctor / Staff</option>
              <option value="MEMBER">Member</option>
            </select>
          </div>
          {roleMutation.isError && (
            <p className="text-sm text-red-600">
              {roleMutation.error instanceof Error ? roleMutation.error.message : 'Failed to update role.'}
            </p>
          )}
        </div>
      </Modal>

      {/* Generic Confirmation Modal */}
      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant={confirm?.variant === 'danger' ? 'danger' : 'primary'}
              loading={removeMutation.isPending || roleMutation.isPending}
              onClick={() => {
                confirm?.onConfirm();
                setConfirm(null);
              }}
            >
              {confirm?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{confirm?.message}</p>
      </Modal>
    </div>
  );
}
