/**
 * Global Permission List
 *
 * This is the single source of truth for all system permissions.
 * Uses a 6-action matrix (read, read_all, create, edit, delete, restore) for standard resources.
 *
 * Add new permissions here, and they will automatically be synced to the database
 * when the application starts via the PermissionSeederService.
 */

export interface ISystemPermission {
  action: string;
  description: string;
}

/**
 * Leads Management Permissions
 */
const LEADS_PERMISSIONS: ISystemPermission[] = [
  {
    action: 'leads:read',
    description: 'Read assigned leads',
  },
  {
    action: 'leads:read_all',
    description: 'Read all leads in the organization',
  },
  {
    action: 'leads:create',
    description: 'Create new leads',
  },
  {
    action: 'leads:edit',
    description: 'Edit assigned leads',
  },
  {
    action: 'leads:edit_all',
    description: 'Edit all leads in the organization',
  },
  {
    action: 'leads:delete',
    description: 'Delete assigned leads',
  },
  {
    action: 'leads:delete_all',
    description: 'Delete all leads in the organization',
  },
  {
    action: 'leads:restore',
    description: 'Restore deleted leads',
  },
];

/**
 * Contacts Management Permissions
 */
const CONTACTS_PERMISSIONS: ISystemPermission[] = [
  {
    action: 'contacts:read',
    description: 'Read assigned contacts',
  },
  {
    action: 'contacts:read_all',
    description: 'Read all contacts in the organization',
  },
  {
    action: 'contacts:create',
    description: 'Create new contacts',
  },
  {
    action: 'contacts:edit',
    description: 'Edit assigned contacts',
  },
  {
    action: 'contacts:edit_all',
    description: 'Edit all contacts in the organization',
  },
  {
    action: 'contacts:delete',
    description: 'Delete assigned contacts',
  },
  {
    action: 'contacts:delete_all',
    description: 'Delete all contacts in the organization',
  },
  {
    action: 'contacts:restore',
    description: 'Restore deleted contacts',
  },
];

/**
 * Deals Management Permissions
 */
const DEALS_PERMISSIONS: ISystemPermission[] = [
  {
    action: 'deals:read',
    description: 'Read assigned deals',
  },
  {
    action: 'deals:read_all',
    description: 'Read all deals in the organization',
  },
  {
    action: 'deals:create',
    description: 'Create new deals',
  },
  {
    action: 'deals:edit',
    description: 'Edit assigned deals',
  },
  {
    action: 'deals:edit_all',
    description: 'Edit all deals in the organization',
  },
  {
    action: 'deals:delete',
    description: 'Delete assigned deals',
  },
  {
    action: 'deals:delete_all',
    description: 'Delete all deals in the organization',
  },
  {
    action: 'deals:restore',
    description: 'Restore deleted deals',
  },
];

/**
 * Tasks Management Permissions
 */
const TASKS_PERMISSIONS: ISystemPermission[] = [
  {
    action: 'tasks:read',
    description: 'Read assigned tasks',
  },
  {
    action: 'tasks:read_all',
    description: 'Read all tasks in the organization',
  },
  {
    action: 'tasks:create',
    description: 'Create new tasks',
  },
  {
    action: 'tasks:edit',
    description: 'Edit assigned tasks',
  },
  {
    action: 'tasks:edit_all',
    description: 'Edit all tasks in the organization',
  },
  {
    action: 'tasks:delete',
    description: 'Delete assigned tasks',
  },
  {
    action: 'tasks:delete_all',
    description: 'Delete all tasks in the organization',
  },
  {
    action: 'tasks:restore',
    description: 'Restore deleted tasks',
  },
];

/**
 * Team Management Permissions
 */
const TEAM_PERMISSIONS: ISystemPermission[] = [
  {
    action: 'team_members:read',
    description: 'View team members',
  },
  {
    action: 'team_members:create',
    description: 'Add team members to organization',
  },
  {
    action: 'team_members:edit',
    description: 'Edit team member details and roles',
  },
  {
    action: 'team_members:delete',
    description: 'Remove team members from organization',
  },
];

/**
 * Role Management Permissions
 */
const ROLE_PERMISSIONS: ISystemPermission[] = [
  {
    action: 'roles:read',
    description: 'View organization roles',
  },
  {
    action: 'roles:create',
    description: 'Create new roles',
  },
  {
    action: 'roles:edit',
    description: 'Edit existing roles and their permissions',
  },
  {
    action: 'roles:delete',
    description: 'Delete roles',
  },
  {
    action: 'roles:manage',
    description: 'Full role management (deprecated - use specific actions)',
  },
];

/**
 * Organization Management Permissions
 */
const ORGANIZATION_PERMISSIONS: ISystemPermission[] = [
  {
    action: 'organization:read',
    description: 'View organization details',
  },
  {
    action: 'organization:edit',
    description: 'Edit organization settings',
  },
  {
    action: 'organization:manage',
    description: 'Full organization management',
  },
];

/**
 * Billing & Subscription Permissions
 */
const BILLING_PERMISSIONS: ISystemPermission[] = [
  {
    action: 'billing:read',
    description: 'View billing and subscription information',
  },
  {
    action: 'billing:manage',
    description: 'Manage billing, subscriptions, and payments',
  },
];

/**
 * Reports & Analytics Permissions
 */
const REPORTS_PERMISSIONS: ISystemPermission[] = [
  {
    action: 'reports:read',
    description: 'View reports and analytics',
  },
  {
    action: 'reports:create',
    description: 'Create custom reports',
  },
  {
    action: 'reports:edit',
    description: 'Edit custom reports',
  },
  {
    action: 'reports:delete',
    description: 'Delete custom reports',
  },
];

/**
 * Complete list of all system permissions
 */
export const SYSTEM_PERMISSIONS: ISystemPermission[] = [
  ...LEADS_PERMISSIONS,
  ...CONTACTS_PERMISSIONS,
  ...DEALS_PERMISSIONS,
  ...TASKS_PERMISSIONS,
  ...TEAM_PERMISSIONS,
  ...ROLE_PERMISSIONS,
  ...ORGANIZATION_PERMISSIONS,
  ...BILLING_PERMISSIONS,
  ...REPORTS_PERMISSIONS,
];

/**
 * Helper function to get all permissions for a specific resource
 * @example getResourcePermissions('leads') -> all leads:* permissions
 */
export function getResourcePermissions(resource: string): ISystemPermission[] {
  return SYSTEM_PERMISSIONS.filter((perm) =>
    perm.action.startsWith(`${resource}:`),
  );
}

/**
 * Helper function to check if a permission action exists
 */
export function permissionExists(action: string): boolean {
  return SYSTEM_PERMISSIONS.some((perm) => perm.action === action);
}
