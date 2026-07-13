export interface Organization {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly brandingJson: Record<string, unknown> | null;
  readonly senderDisplayName: string | null;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function isOrganizationDeleted(org: Organization): boolean {
  return org.deletedAt !== null;
}
