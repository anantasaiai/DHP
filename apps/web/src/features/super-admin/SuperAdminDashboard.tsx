import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-keys/index.js';
import { listOrganizations, type OrgDto } from '../../lib/api/organizations.js';
import { StatCard } from '../../components/ui/StatCard.js';
import { Card } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral';

function subscriptionBadgeVariant(status: string): BadgeVariant {
  if (status === 'ACTIVE') return 'success';
  if (status === 'TRIALING') return 'warning';
  if (status === 'PAST_DUE') return 'danger';
  return 'neutral';
}

export default function SuperAdminDashboard(): React.ReactElement {
  const { data: orgs = [], isLoading } = useQuery({
    queryKey: queryKeys.organizations.all,
    queryFn: listOrganizations,
  });

  const activeOrgs = orgs.filter((o) => o.subscriptionStatus === 'ACTIVE').length;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Platform Overview</h1>
        <p className="text-slate-500 mt-1">Super Admin Dashboard</p>
      </div>

      <div className="grid grid-cols-4 gap-6 mb-8">
        <StatCard label="Total Organizations" value={orgs.length} color="blue" />
        <StatCard label="Active Organizations" value={activeOrgs} color="green" />
        <StatCard label="Total Users" value="—" sub="Aggregate stat" color="amber" />
        <StatCard label="Platform Revenue" value="—" sub="Placeholder" color="red" />
      </div>

      <Card title="Recent Organizations">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {['Organization', 'Slug', 'Subscription', 'Created'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : orgs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">
                    No organizations found.
                  </td>
                </tr>
              ) : (
                orgs.slice(0, 10).map((org: OrgDto, i) => (
                  <tr key={org.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
