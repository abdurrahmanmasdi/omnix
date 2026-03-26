# Default Roles - Quick Reference Guide

## 🎯 Role Comparison Matrix

| Action              | Owner | Manager | Agent |
| ------------------- | :---: | :-----: | :---: |
| **LEADS**           |
| leads:read          |  ✅   |   ✅    |  ✅   |
| leads:read_all      |  ✅   |   ✅    |  ❌   |
| leads:create        |  ✅   |   ✅    |  ✅   |
| leads:edit          |  ✅   |   ✅    |  ✅   |
| leads:edit_all      |  ✅   |   ✅    |  ❌   |
| leads:delete        |  ✅   |   ✅    |  ❌   |
| leads:delete_all    |  ✅   |   ✅    |  ❌   |
| leads:restore       |  ✅   |   ✅    |  ❌   |
| **CONTACTS**        |
| contacts:read       |  ✅   |   ✅    |  ✅   |
| contacts:read_all   |  ✅   |   ✅    |  ❌   |
| contacts:create     |  ✅   |   ✅    |  ✅   |
| contacts:edit       |  ✅   |   ✅    |  ✅   |
| contacts:edit_all   |  ✅   |   ✅    |  ❌   |
| contacts:delete     |  ✅   |   ✅    |  ❌   |
| contacts:delete_all |  ✅   |   ✅    |  ❌   |
| contacts:restore    |  ✅   |   ✅    |  ❌   |
| **DEALS**           |
| deals:read          |  ✅   |   ✅    |  ✅   |
| deals:read_all      |  ✅   |   ✅    |  ❌   |
| deals:create        |  ✅   |   ✅    |  ✅   |
| deals:edit          |  ✅   |   ✅    |  ✅   |
| deals:edit_all      |  ✅   |   ✅    |  ❌   |
| deals:delete        |  ✅   |   ✅    |  ❌   |
| deals:delete_all    |  ✅   |   ✅    |  ❌   |
| deals:restore       |  ✅   |   ✅    |  ❌   |
| **TASKS**           |
| tasks:read          |  ✅   |   ✅    |  ✅   |
| tasks:read_all      |  ✅   |   ✅    |  ❌   |
| tasks:create        |  ✅   |   ✅    |  ✅   |
| tasks:edit          |  ✅   |   ✅    |  ✅   |
| tasks:edit_all      |  ✅   |   ✅    |  ❌   |
| tasks:delete        |  ✅   |   ✅    |  ❌   |
| tasks:delete_all    |  ✅   |   ✅    |  ❌   |
| tasks:restore       |  ✅   |   ✅    |  ❌   |
| **TEAM**            |
| team_members:read   |  ✅   |   ✅    |  ✅   |
| team_members:create |  ✅   |   ✅    |  ❌   |
| team_members:edit   |  ✅   |   ✅    |  ❌   |
| team_members:delete |  ✅   |   ✅    |  ❌   |
| **ROLES**           |
| roles:read          |  ✅   |   ✅    |  ❌   |
| roles:create        |  ✅   |   ❌    |  ❌   |
| roles:edit          |  ✅   |   ❌    |  ❌   |
| roles:delete        |  ✅   |   ❌    |  ❌   |
| roles:manage        |  ✅   |   ❌    |  ❌   |
| **ORGANIZATION**    |
| organization:read   |  ✅   |   ✅    |  ✅   |
| organization:edit   |  ✅   |   ❌    |  ❌   |
| organization:manage |  ✅   |   ❌    |  ❌   |
| **BILLING**         |
| billing:read        |  ✅   |   ❌    |  ❌   |
| billing:manage      |  ✅   |   ❌    |  ❌   |
| **REPORTS**         |
| reports:read        |  ✅   |   ✅    |  ✅   |
| reports:create      |  ✅   |   ✅    |  ❌   |
| reports:edit        |  ✅   |   ✅    |  ❌   |
| reports:delete      |  ✅   |   ✅    |  ❌   |

---

## 📊 Permission Summary

```
Owner Role
├─ Total Permissions: 47
├─ Full Access: All resources and settings
├─ Can: Manage organization, roles, billing, team members
└─ Use Case: Organization founder

Manager Role
├─ Total Permissions: 39
├─ Full Access: Leads, Contacts, Deals, Tasks
├─ Limited Access: Team members, Reports, Organization (read-only)
├─ Cannot: Manage roles or billing
└─ Use Case: Department manager, Team lead

Agent Role
├─ Total Permissions: 14
├─ Read & Create: Leads, Contacts, Deals, Tasks (assigned only)
├─ Read-Only: Team members, Organization, Reports
├─ Cannot: Edit all, Delete, Restore, Manager functions
└─ Use Case: Sales agent, Customer service rep
```

---

## 🎯 Quick Decision Guide

### I want to assign someone as...

**"Full control" → Owner**

- Can do everything
- Can manage organization settings
- Can manage billing
- Can manage roles & permissions
- Typically 1-3 per organization

**"Team management" → Manager**

- Can manage leads, contacts, deals, tasks
- Can manage team members
- Can create reports
- Cannot touch organization settings or billing
- Typically 1-2 per department

**"Individual contributor" → Agent**

- Can work on assigned leads, contacts, deals, tasks
- Can create and edit only their own items
- Can view team and organization info
- Cannot delete or restore
- Typically 5-50+ per organization

---

## 🔑 Key Differences

### Owner vs Manager

```
Owner CAN:
✅ Edit organization settings
✅ Manage billing & subscriptions
✅ Create and delete roles
✅ View all permissions
✅ Delete and restore any resource

Manager CANNOT:
❌ Edit organization settings
❌ Access billing
❌ Manage roles
❌ Delete resources (from other roles)
❌ Restore any resource
```

### Manager vs Agent

```
Manager CAN:
✅ View ALL leads/contacts/deals/tasks (read_all)
✅ Edit ALL resources assigned to their team
✅ Create custom reports
✅ Invite and remove team members
✅ Manage tasks across team

Agent CAN:
✅ View only ASSIGNED leads/contacts/deals
✅ Edit only OWN assigned resources
✅ View basic reports
✅ Cannot invite team members
❌ Cannot manage other user's tasks
```

---

## 📋 Permission Grouping

### Full Resource Management (Owner & Manager)

```
Leads:       read, read_all, create, edit, edit_all, delete, delete_all, restore
Contacts:    read, read_all, create, edit, edit_all, delete, delete_all, restore
Deals:       read, read_all, create, edit, edit_all, delete, delete_all, restore
Tasks:       read, read_all, create, edit, edit_all, delete, delete_all, restore
```

### Assigned Resource Management (Manager & Agent)

```
Agent CAN:
├─ leads:read      (my leads)
├─ leads:create    (new leads)
└─ leads:edit      (my leads)

Manager CAN:
├─ leads:read      (assigned to them)
├─ leads:read_all  (all in organization)
├─ leads:create    (all new)
├─ leads:edit      (assigned to them)
├─ leads:edit_all  (any lead)
├─ leads:delete    (any lead)
├─ leads:delete_all (any lead)
└─ leads:restore   (deleted leads)
```

### Administrative (Owner Only)

```
✅ roles:create, roles:edit, roles:delete
✅ organization:edit, organization:manage
✅ billing:read, billing:manage
✅ team_members:create, :edit, :delete
```

---

## 🚀 Implementation Example

### Check if user can perform action

```typescript
// In a service or guard
canUserAction(
  role: string,
  action: string
): boolean {
  // Import the default matrix
  const roleTemplate = getRoleTemplate(role);
  return roleTemplate?.permissionActions.includes(action) ?? false;
}

// Usage
if (canUserAction('Agent', 'leads:delete')) {
  // User can delete
} else {
  throw new ForbiddenException('Cannot delete leads');
}
```

### Get user's permissions

```typescript
async getUserPermissions(
  userId: string,
  organizationId: string
): Promise<string[]> {
  const membership = await this.prisma.organizationMembership.findFirst({
    where: { user_id: userId, organization_id: organizationId },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true }
          }
        }
      }
    }
  });

  // Get base permissions from role
  const basePermissions = membership.role.rolePermissions
    .map(rp => rp.permission.action);

  // Check for membership-level overrides
  const overrides = await this.prisma.membershipPermissionOverride.findMany({
    where: { membership_id: membership.id },
  });

  return [
    ...basePermissions,
    ...overrides
      .filter(o => o.is_granted)
      .map(o => o.permission.action)
  ];
}
```

---

## 📚 Default Role Matrix File

**Location:** `src/organizations/constants/default-role-matrix.ts`

```typescript
import {
  DEFAULT_ROLE_MATRIX,
  getRoleTemplate,
} from './constants/default-role-matrix';

// Get the Owner role template
const ownerTemplate = getRoleTemplate('Owner');
console.log(ownerTemplate.permissionActions); // All 47 permissions

// Get all default roles
DEFAULT_ROLE_MATRIX.forEach((role) => {
  console.log(`${role.name}: ${role.permissionActions.length} permissions`);
});
// Output:
// Owner: 47 permissions
// Manager: 39 permissions
// Agent: 14 permissions
```

---

## 🔄 When New Organization is Created

```
1. User creates organization
2. System automatically creates:
   ├─ Owner role (47 permissions)
   ├─ Manager role (39 permissions)
   └─ Agent role (14 permissions)
3. Creator is assigned Owner role (ACTIVE status)
4. Organization is ready to use!
```

---

## 📝 Default Role Checklist

### Owner

- [x] Can manage organization
- [x] Can manage billing
- [x] Can manage roles
- [x] Full access to all resources
- [x] Can invite and remove members
- [x] Can view all data

### Manager

- [x] Can manage team resources
- [x] Can view all team data
- [x] Can create reports
- [x] Can manage team members
- [x] Cannot touch organization settings
- [x] Cannot manage billing

### Agent

- [x] Can work on assigned items
- [x] Can create new items
- [x] Cannot delete items
- [x] Cannot view other's data (unless read_all)
- [x] Cannot manage users
- [x] Cannot access billing

---

**Last Updated:** March 26, 2026  
**Status:** Reference Guide Complete
