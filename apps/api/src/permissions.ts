export const organizationRoles = ["owner", "admin", "member"] as const;
export type OrganizationRole = (typeof organizationRoles)[number];

export function canManageOrganizationResources(role: string): boolean {
  return role === "owner" || role === "admin";
}

export function canReadOrganizationResources(role: string): boolean {
  return organizationRoles.includes(role as OrganizationRole);
}
