/**
 * Permission Registry
 *
 * Single source of truth for all RBAC/PBAC permissions in the system.
 * Uses TypeScript's `as const` to create a strict registry that prevents typos
 * and ensures type safety throughout the codebase.
 *
 * all permission strings are automatically inferred from Resources + Actions,
 * eliminating magic strings and typos.
 *
 * Usage:
 * 1. In decorators: @RequirePermissions(AppPermission.TEAM_MEMBERS_MANAGE)
 * 2. In guards: Check using PermissionString type
 * 3. In database: PERMISSIONS_LIST is synced to DB by seeder
 */

/**
 * Resource definitions - all resources in the system
 */
export const AppResource = {
  TEAM_MEMBERS: 'team_members',
  ROLES: 'roles',
  ORGANIZATION: 'organization',
  LEADS: 'leads',
  CONTACTS: 'contacts',
  DEALS: 'deals',
  TASKS: 'tasks',
  BILLING: 'billing',
  REPORTS: 'reports',
} as const;

/**
 * Action definitions - all possible actions on resources
 */
export const AppAction = {
  MANAGE: 'manage', // God mode for the resource (deprecated but kept for compatibility)
  READ: 'read', // Read assigned/own items
  READ_ALL: 'read_all', // Read all items in organization
  CREATE: 'create',
  EDIT: 'edit', // Edit assigned/own items
  EDIT_ALL: 'edit_all', // Edit all items in organization
  DELETE: 'delete', // Delete assigned/own items
  DELETE_ALL: 'delete_all', // Delete all items in organization
  RESTORE: 'restore',
} as const;

/**
 * Type-safe permission string builder
 * Ensures only valid combinations of Resource:Action are created
 */
export type PermissionString =
  `${(typeof AppResource)[keyof typeof AppResource]}:${(typeof AppAction)[keyof typeof AppAction]}`;

/**
 * Pre-built permission constants for convenience
 * These are the primary permissions used in decorators and guards
 */
export const AppPermission = {
  // Team Members & Access Control
  TEAM_MEMBERS_MANAGE:
    `${AppResource.TEAM_MEMBERS}:${AppAction.MANAGE}` as const,
  TEAM_MEMBERS_READ: `${AppResource.TEAM_MEMBERS}:${AppAction.READ}` as const,
  TEAM_MEMBERS_CREATE:
    `${AppResource.TEAM_MEMBERS}:${AppAction.CREATE}` as const,
  TEAM_MEMBERS_EDIT: `${AppResource.TEAM_MEMBERS}:${AppAction.EDIT}` as const,
  TEAM_MEMBERS_DELETE:
    `${AppResource.TEAM_MEMBERS}:${AppAction.DELETE}` as const,

  // Roles
  ROLES_READ: `${AppResource.ROLES}:${AppAction.READ}` as const,
  ROLES_CREATE: `${AppResource.ROLES}:${AppAction.CREATE}` as const,
  ROLES_EDIT: `${AppResource.ROLES}:${AppAction.EDIT}` as const,
  ROLES_DELETE: `${AppResource.ROLES}:${AppAction.DELETE}` as const,
  ROLES_MANAGE: `${AppResource.ROLES}:${AppAction.MANAGE}` as const,

  // Organization
  ORGANIZATION_READ: `${AppResource.ORGANIZATION}:${AppAction.READ}` as const,
  ORGANIZATION_EDIT: `${AppResource.ORGANIZATION}:${AppAction.EDIT}` as const,
  ORGANIZATION_MANAGE:
    `${AppResource.ORGANIZATION}:${AppAction.MANAGE}` as const,

  // Leads
  LEADS_READ: `${AppResource.LEADS}:${AppAction.READ}` as const,
  LEADS_READ_ALL: `${AppResource.LEADS}:${AppAction.READ_ALL}` as const,
  LEADS_CREATE: `${AppResource.LEADS}:${AppAction.CREATE}` as const,
  LEADS_EDIT: `${AppResource.LEADS}:${AppAction.EDIT}` as const,
  LEADS_EDIT_ALL: `${AppResource.LEADS}:${AppAction.EDIT_ALL}` as const,
  LEADS_DELETE: `${AppResource.LEADS}:${AppAction.DELETE}` as const,
  LEADS_DELETE_ALL: `${AppResource.LEADS}:${AppAction.DELETE_ALL}` as const,
  LEADS_RESTORE: `${AppResource.LEADS}:${AppAction.RESTORE}` as const,

  // Contacts
  CONTACTS_READ: `${AppResource.CONTACTS}:${AppAction.READ}` as const,
  CONTACTS_READ_ALL: `${AppResource.CONTACTS}:${AppAction.READ_ALL}` as const,
  CONTACTS_CREATE: `${AppResource.CONTACTS}:${AppAction.CREATE}` as const,
  CONTACTS_EDIT: `${AppResource.CONTACTS}:${AppAction.EDIT}` as const,
  CONTACTS_EDIT_ALL: `${AppResource.CONTACTS}:${AppAction.EDIT_ALL}` as const,
  CONTACTS_DELETE: `${AppResource.CONTACTS}:${AppAction.DELETE}` as const,
  CONTACTS_DELETE_ALL:
    `${AppResource.CONTACTS}:${AppAction.DELETE_ALL}` as const,
  CONTACTS_RESTORE: `${AppResource.CONTACTS}:${AppAction.RESTORE}` as const,

  // Deals
  DEALS_READ: `${AppResource.DEALS}:${AppAction.READ}` as const,
  DEALS_READ_ALL: `${AppResource.DEALS}:${AppAction.READ_ALL}` as const,
  DEALS_CREATE: `${AppResource.DEALS}:${AppAction.CREATE}` as const,
  DEALS_EDIT: `${AppResource.DEALS}:${AppAction.EDIT}` as const,
  DEALS_EDIT_ALL: `${AppResource.DEALS}:${AppAction.EDIT_ALL}` as const,
  DEALS_DELETE: `${AppResource.DEALS}:${AppAction.DELETE}` as const,
  DEALS_DELETE_ALL: `${AppResource.DEALS}:${AppAction.DELETE_ALL}` as const,
  DEALS_RESTORE: `${AppResource.DEALS}:${AppAction.RESTORE}` as const,

  // Tasks
  TASKS_READ: `${AppResource.TASKS}:${AppAction.READ}` as const,
  TASKS_READ_ALL: `${AppResource.TASKS}:${AppAction.READ_ALL}` as const,
  TASKS_CREATE: `${AppResource.TASKS}:${AppAction.CREATE}` as const,
  TASKS_EDIT: `${AppResource.TASKS}:${AppAction.EDIT}` as const,
  TASKS_EDIT_ALL: `${AppResource.TASKS}:${AppAction.EDIT_ALL}` as const,
  TASKS_DELETE: `${AppResource.TASKS}:${AppAction.DELETE}` as const,
  TASKS_DELETE_ALL: `${AppResource.TASKS}:${AppAction.DELETE_ALL}` as const,
  TASKS_RESTORE: `${AppResource.TASKS}:${AppAction.RESTORE}` as const,

  // Billing
  BILLING_READ: `${AppResource.BILLING}:${AppAction.READ}` as const,
  BILLING_MANAGE: `${AppResource.BILLING}:${AppAction.MANAGE}` as const,

  // Reports
  REPORTS_READ: `${AppResource.REPORTS}:${AppAction.READ}` as const,
  REPORTS_CREATE: `${AppResource.REPORTS}:${AppAction.CREATE}` as const,
  REPORTS_EDIT: `${AppResource.REPORTS}:${AppAction.EDIT}` as const,
  REPORTS_DELETE: `${AppResource.REPORTS}:${AppAction.DELETE}` as const,
} as const;

/**
 * Master list of all valid permissions in the system
 * Used by PermissionSeederService to sync to database
 * Derived from the registry above - no duplication
 */
export interface IPermissionDefinition {
  action: PermissionString;
  description: string;
}

export const PERMISSIONS_LIST: readonly IPermissionDefinition[] = [
  // Team Members & Access Control
  {
    action: AppPermission.TEAM_MEMBERS_MANAGE,
    description: 'Manage all team members, roles, and approvals',
  },
  {
    action: AppPermission.TEAM_MEMBERS_READ,
    description: 'View team members',
  },
  {
    action: AppPermission.TEAM_MEMBERS_CREATE,
    description: 'Add team members to organization',
  },
  {
    action: AppPermission.TEAM_MEMBERS_EDIT,
    description: 'Edit team member details and roles',
  },
  {
    action: AppPermission.TEAM_MEMBERS_DELETE,
    description: 'Remove team members from organization',
  },

  // Roles
  {
    action: AppPermission.ROLES_READ,
    description: 'View organization roles',
  },
  {
    action: AppPermission.ROLES_CREATE,
    description: 'Create new roles',
  },
  {
    action: AppPermission.ROLES_EDIT,
    description: 'Edit existing roles and their permissions',
  },
  {
    action: AppPermission.ROLES_DELETE,
    description: 'Delete roles',
  },
  {
    action: AppPermission.ROLES_MANAGE,
    description: 'Full role management (deprecated - use specific actions)',
  },

  // Organization
  {
    action: AppPermission.ORGANIZATION_READ,
    description: 'View organization details',
  },
  {
    action: AppPermission.ORGANIZATION_EDIT,
    description: 'Edit organization settings',
  },
  {
    action: AppPermission.ORGANIZATION_MANAGE,
    description: 'Full organization management',
  },

  // Leads
  {
    action: AppPermission.LEADS_READ,
    description: 'Read assigned leads',
  },
  {
    action: AppPermission.LEADS_READ_ALL,
    description: 'Read all leads in the organization',
  },
  {
    action: AppPermission.LEADS_CREATE,
    description: 'Create new leads',
  },
  {
    action: AppPermission.LEADS_EDIT,
    description: 'Edit assigned leads',
  },
  {
    action: AppPermission.LEADS_EDIT_ALL,
    description: 'Edit all leads in the organization',
  },
  {
    action: AppPermission.LEADS_DELETE,
    description: 'Delete assigned leads',
  },
  {
    action: AppPermission.LEADS_DELETE_ALL,
    description: 'Delete all leads in the organization',
  },
  {
    action: AppPermission.LEADS_RESTORE,
    description: 'Restore deleted leads',
  },

  // Contacts
  {
    action: AppPermission.CONTACTS_READ,
    description: 'Read assigned contacts',
  },
  {
    action: AppPermission.CONTACTS_READ_ALL,
    description: 'Read all contacts in the organization',
  },
  {
    action: AppPermission.CONTACTS_CREATE,
    description: 'Create new contacts',
  },
  {
    action: AppPermission.CONTACTS_EDIT,
    description: 'Edit assigned contacts',
  },
  {
    action: AppPermission.CONTACTS_EDIT_ALL,
    description: 'Edit all contacts in the organization',
  },
  {
    action: AppPermission.CONTACTS_DELETE,
    description: 'Delete assigned contacts',
  },
  {
    action: AppPermission.CONTACTS_DELETE_ALL,
    description: 'Delete all contacts in the organization',
  },
  {
    action: AppPermission.CONTACTS_RESTORE,
    description: 'Restore deleted contacts',
  },

  // Deals
  {
    action: AppPermission.DEALS_READ,
    description: 'Read assigned deals',
  },
  {
    action: AppPermission.DEALS_READ_ALL,
    description: 'Read all deals in the organization',
  },
  {
    action: AppPermission.DEALS_CREATE,
    description: 'Create new deals',
  },
  {
    action: AppPermission.DEALS_EDIT,
    description: 'Edit assigned deals',
  },
  {
    action: AppPermission.DEALS_EDIT_ALL,
    description: 'Edit all deals in the organization',
  },
  {
    action: AppPermission.DEALS_DELETE,
    description: 'Delete assigned deals',
  },
  {
    action: AppPermission.DEALS_DELETE_ALL,
    description: 'Delete all deals in the organization',
  },
  {
    action: AppPermission.DEALS_RESTORE,
    description: 'Restore deleted deals',
  },

  // Tasks
  {
    action: AppPermission.TASKS_READ,
    description: 'Read assigned tasks',
  },
  {
    action: AppPermission.TASKS_READ_ALL,
    description: 'Read all tasks in the organization',
  },
  {
    action: AppPermission.TASKS_CREATE,
    description: 'Create new tasks',
  },
  {
    action: AppPermission.TASKS_EDIT,
    description: 'Edit assigned tasks',
  },
  {
    action: AppPermission.TASKS_EDIT_ALL,
    description: 'Edit all tasks in the organization',
  },
  {
    action: AppPermission.TASKS_DELETE,
    description: 'Delete assigned tasks',
  },
  {
    action: AppPermission.TASKS_DELETE_ALL,
    description: 'Delete all tasks in the organization',
  },
  {
    action: AppPermission.TASKS_RESTORE,
    description: 'Restore deleted tasks',
  },

  // Billing
  {
    action: AppPermission.BILLING_READ,
    description: 'View billing and subscription information',
  },
  {
    action: AppPermission.BILLING_MANAGE,
    description: 'Manage billing, subscriptions, and payments',
  },

  // Reports
  {
    action: AppPermission.REPORTS_READ,
    description: 'View reports and analytics',
  },
  {
    action: AppPermission.REPORTS_CREATE,
    description: 'Create custom reports',
  },
  {
    action: AppPermission.REPORTS_EDIT,
    description: 'Edit custom reports',
  },
  {
    action: AppPermission.REPORTS_DELETE,
    description: 'Delete custom reports',
  },
] as const;
