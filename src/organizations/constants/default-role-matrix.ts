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
 * - Usually only one owner per organization
 */
const OWNER_ROLE: IRoleTemplate = {
  name: 'Owner',
  description: 'Full organizational control and management',
  permissionActions: [
    // Leads
    'leads:read',
    'leads:read_all',
    'leads:create',
    'leads:edit',
    'leads:edit_all',
    'leads:delete',
    'leads:delete_all',
    'leads:restore',

    // Contacts
    'contacts:read',
    'contacts:read_all',
    'contacts:create',
    'contacts:edit',
    'contacts:edit_all',
    'contacts:delete',
    'contacts:delete_all',
    'contacts:restore',

    // Deals
    'deals:read',
    'deals:read_all',
    'deals:create',
    'deals:edit',
    'deals:edit_all',
    'deals:delete',
    'deals:delete_all',
    'deals:restore',

    // Tasks
    'tasks:read',
    'tasks:read_all',
    'tasks:create',
    'tasks:edit',
    'tasks:edit_all',
    'tasks:delete',
    'tasks:delete_all',
    'tasks:restore',

    // Team Members
    'team_members:read',
    'team_members:create',
    'team_members:edit',
    'team_members:delete',

    // Roles
    'roles:read',
    'roles:create',
    'roles:edit',
    'roles:delete',
    'roles:manage',

    // Organization
    'organization:read',
    'organization:edit',
    'organization:manage',

    // Billing
    'billing:read',
    'billing:manage',

    // Reports
    'reports:read',
    'reports:create',
    'reports:edit',
    'reports:delete',
  ],
};

/**
 * MANAGER
 * - Can manage leads, contacts, deals, and tasks
 * - Can manage team members and view reports
 * - Cannot manage organization settings or billing
 * - Cannot manage roles
 */
const MANAGER_ROLE: IRoleTemplate = {
  name: 'Manager',
  description: 'Manage team members and core business resources',
  permissionActions: [
    // Leads - full access
    'leads:read',
    'leads:read_all',
    'leads:create',
    'leads:edit',
    'leads:edit_all',
    'leads:delete',
    'leads:delete_all',
    'leads:restore',

    // Contacts - full access
    'contacts:read',
    'contacts:read_all',
    'contacts:create',
    'contacts:edit',
    'contacts:edit_all',
    'contacts:delete',
    'contacts:delete_all',
    'contacts:restore',

    // Deals - full access
    'deals:read',
    'deals:read_all',
    'deals:create',
    'deals:edit',
    'deals:edit_all',
    'deals:delete',
    'deals:delete_all',
    'deals:restore',

    // Tasks - full access
    'tasks:read',
    'tasks:read_all',
    'tasks:create',
    'tasks:edit',
    'tasks:edit_all',
    'tasks:delete',
    'tasks:delete_all',
    'tasks:restore',

    // Team Members
    'team_members:read',
    'team_members:create',
    'team_members:edit',
    'team_members:delete',

    // Roles - read only
    'roles:read',

    // Organization - read only
    'organization:read',

    // Reports
    'reports:read',
    'reports:create',
    'reports:edit',
    'reports:delete',
  ],
};

/**
 * AGENT
 * - Can read and edit assigned resources only
 * - Can create new leads, contacts, tasks
 * - Cannot delete resources or view all data
 * - No administrative capabilities
 */
const AGENT_ROLE: IRoleTemplate = {
  name: 'Agent',
  description: 'Create and manage assigned resources',
  permissionActions: [
    // Leads - assigned only
    'leads:read',
    'leads:create',
    'leads:edit',

    // Contacts - assigned only
    'contacts:read',
    'contacts:create',
    'contacts:edit',

    // Deals - assigned only
    'deals:read',
    'deals:create',
    'deals:edit',

    // Tasks - assigned only
    'tasks:read',
    'tasks:create',
    'tasks:edit',

    // Team Members - read only
    'team_members:read',

    // Organization - read only
    'organization:read',

    // Reports - read only
    'reports:read',
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
