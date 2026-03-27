/**
 * Default Role Matrix for New Organizations
 *
 * Defines the default roles that should be created for every new organization,
 * along with the permissions each role should have.
 *
 * This is the single source of truth for default RBAC configuration.
 * When a new organization is created, it will automatically get these three roles
 * with their corresponding permissions assigned.
 */

export interface IRoleTemplate {
  name: string;
  description: string;
  permissionActions: string[];
}

/**
 * Default Role Templates
 *
 * OWNER
 * - Full organizational control
 * - Can manage all resources, users, roles, and settings
 * - Has ALL permissions in the system
 * - Usually only one owner per organization
 */
const OWNER_ROLE: IRoleTemplate = {
  name: 'Kurucu',
  description: 'Full organizational control and management',
  permissionActions: [
    // Leads - full access
    'leads:manage',
    'leads:read',
    'leads:read_all',
    'leads:create',
    'leads:edit',
    'leads:edit_all',
    'leads:delete',
    'leads:delete_all',
    'leads:restore',

    // Team Members - full access
    'team_members:manage',
    'team_members:read',
    'team_members:read_all',
    'team_members:create',
    'team_members:edit',
    'team_members:edit_all',
    'team_members:delete',
    'team_members:delete_all',
    'team_members:restore',

    // Roles - full access
    'roles:manage',
    'roles:read',
    'roles:read_all',
    'roles:create',
    'roles:edit',
    'roles:edit_all',
    'roles:delete',
    'roles:delete_all',
    'roles:restore',

    // Organization - full access
    'organization:manage',
    'organization:read',
    'organization:read_all',
    'organization:edit',
    'organization:edit_all',
    'organization:delete',
    'organization:delete_all',
    'organization:restore',
  ],
};

/**
 * MANAGER
 * - Can manage leads and team members
 * - Can view and manage roles
 * - Cannot manage organization settings
 */
const MANAGER_ROLE: IRoleTemplate = {
  name: 'Yönetici',
  description: 'Manage team members and core business resources',
  permissionActions: [
    // Leads - full access
    'leads:manage',
    'leads:read',
    'leads:read_all',
    'leads:create',
    'leads:edit',
    'leads:edit_all',
    'leads:delete',
    'leads:delete_all',
    'leads:restore',

    // Team Members - full access
    'team_members:manage',
    'team_members:read',
    'team_members:read_all',
    'team_members:create',
    'team_members:edit',
    'team_members:edit_all',
    'team_members:delete',
    'team_members:delete_all',
    'team_members:restore',

    // Roles - manage only
    'roles:manage',
    'roles:read',
    'roles:read_all',
    'roles:create',
    'roles:edit',
    'roles:edit_all',
    'roles:delete',
    'roles:delete_all',
    'roles:restore',

    // Organization - read only
    'organization:manage',
    'organization:read',
    'organization:read_all',
  ],
};

/**
 * AGENT
 * - Can read and create leads
 * - Can read team members
 * - Cannot delete resources or manage other entities
 * - No administrative capabilities
 */
const AGENT_ROLE: IRoleTemplate = {
  name: 'Temsilci',
  description: 'Create and manage assigned resources',
  permissionActions: [
    // Leads - assigned only
    'leads:read',
    'leads:read_all',
    'leads:create',
    'leads:edit',

    // Team Members - read only
    'team_members:read',
    'team_members:read_all',

    // Organization - read only
    'organization:read',
  ],
};

/**
 * Complete Default Role Matrix
 * Used during organization creation to set up initial roles and permissions
 */
export const DEFAULT_ROLE_MATRIX: IRoleTemplate[] = [
  OWNER_ROLE,
  MANAGER_ROLE,
  AGENT_ROLE,
];

/**
 * Helper function to get a role template by name
 */
export function getRoleTemplate(roleName: string): IRoleTemplate | undefined {
  return DEFAULT_ROLE_MATRIX.find((role) => role.name === roleName);
}

/**
 * Helper function to get all permission actions for a specific role
 */
export function getRolePermissions(roleName: string): string[] {
  const role = getRoleTemplate(roleName);
  return role?.permissionActions ?? [];
}

/**
 * Get all unique permission actions across all default roles
 */
export function getAllDefaultPermissionActions(): string[] {
  const actions = new Set<string>();
  DEFAULT_ROLE_MATRIX.forEach((role) => {
    role.permissionActions.forEach((action) => actions.add(action));
  });
  return Array.from(actions).sort();
}
