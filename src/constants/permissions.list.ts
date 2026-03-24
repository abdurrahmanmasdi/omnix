/**
 * Central permission definitions for the PBAC system
 * All new permissions must be added here to be auto-seeded into the database on app startup
 */

export interface PermissionDefinition {
  name: string;
  description: string;
}

export const PERMISSIONS_LIST: PermissionDefinition[] = [
  // Role Management Permissions
  {
    name: 'roles:read',
    description: 'Can view roles and permissions',
  },
  {
    name: 'roles:write',
    description: 'Can create and modify roles',
  },

  // Member Management Permissions
  {
    name: 'members:read',
    description: 'Can view organization members',
  },
  {
    name: 'members:write',
    description: 'Can modify member roles and permissions',
  },

  // Leads Module (Placeholder)
  {
    name: 'leads:read',
    description: 'Can view leads',
  },
  {
    name: 'leads:write',
    description: 'Can create and modify leads',
  },
  {
    name: 'leads:delete',
    description: 'Can delete leads',
  },

  // Deals Module (Placeholder)
  {
    name: 'deals:read',
    description: 'Can view deals',
  },
  {
    name: 'deals:write',
    description: 'Can create and modify deals',
  },
  {
    name: 'deals:delete',
    description: 'Can delete deals',
  },
];
