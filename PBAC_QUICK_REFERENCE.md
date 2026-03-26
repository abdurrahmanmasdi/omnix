# PBAC System - Quick Reference Guide

## 🎯 Adding New Permissions (60 seconds)

### 1. Edit Permission List

```bash
# File: backend/src/constants/permissions.list.ts
```

Add to appropriate section:

```typescript
const CUSTOM_PERMISSIONS: ISystemPermission[] = [
  {
    action: 'resource:action', // e.g., 'invoices:read'
    description: 'What it allows', // e.g., 'View all invoices'
  },
];
```

Add to exports:

```typescript
export const SYSTEM_PERMISSIONS: ISystemPermission[] = [
  ...LEADS_PERMISSIONS,
  ...CONTACTS_PERMISSIONS,
  // ... existing ...
  ...CUSTOM_PERMISSIONS, // ← Add here
];
```

### 2. Restart Server

```bash
npm run start:dev
```

### 3. Done! ✅

Permission is now in database, ready to assign to roles.

---

## 🔧 Common Actions

### Get All Permissions for a Resource

```typescript
import { getResourcePermissions } from '@/constants/permissions.list';

const leadPermissions = getResourcePermissions('leads');
// → All permissions starting with 'leads:'
```

### Check if Permission Exists

```typescript
import { permissionExists } from '@/constants/permissions.list';

if (permissionExists('leads:read')) {
  // Use this permission
}
```

### Create Role with Permissions

```typescript
const role = await this.prisma.role.create({
  data: {
    name: 'Sales Rep',
    organizationId: orgId,
    rolePermissions: {
      create: [
        {
          permission: {
            connect: { action: 'leads:read' },
          },
        },
        {
          permission: {
            connect: { action: 'leads:create' },
          },
        },
      ],
    },
  },
});
```

### Override Permission for User

```typescript
// Grant a permission
await this.prisma.membershipPermissionOverride.create({
  data: {
    membershipId: 'xyz',
    permission: { connect: { action: 'leads:edit_all' } },
    isGranted: true,
  },
});

// Revoke a permission
await this.prisma.membershipPermissionOverride.create({
  data: {
    membershipId: 'xyz',
    permission: { connect: { action: 'leads:delete' } },
    isGranted: false,
  },
});
```

---

## 📋 All Permissions (50 Total)

### Leads (8)

- `leads:read` - Read assigned leads
- `leads:read_all` - Read all leads
- `leads:create` - Create new leads
- `leads:edit` - Edit assigned leads
- `leads:edit_all` - Edit all leads
- `leads:delete` - Delete assigned leads
- `leads:delete_all` - Delete all leads
- `leads:restore` - Restore deleted leads

### Contacts (8)

- `contacts:read`, `contacts:read_all`, `contacts:create`
- `contacts:edit`, `contacts:edit_all`, `contacts:delete`
- `contacts:delete_all`, `contacts:restore`

### Deals (8)

- `deals:read`, `deals:read_all`, `deals:create`
- `deals:edit`, `deals:edit_all`, `deals:delete`
- `deals:delete_all`, `deals:restore`

### Tasks (8)

- `tasks:read`, `tasks:read_all`, `tasks:create`
- `tasks:edit`, `tasks:edit_all`, `tasks:delete`
- `tasks:delete_all`, `tasks:restore`

### Team Members (4)

- `team_members:read` - View team members
- `team_members:create` - Add members
- `team_members:edit` - Edit members
- `team_members:delete` - Remove members

### Roles (5)

- `roles:read` - View roles
- `roles:create` - Create roles
- `roles:edit` - Edit roles
- `roles:delete` - Delete roles
- `roles:manage` - Full management (deprecated)

### Organization (3)

- `organization:read` - View org
- `organization:edit` - Edit org
- `organization:manage` - Full management

### Billing (2)

- `billing:read` - View billing
- `billing:manage` - Manage billing

### Reports (4)

- `reports:read` - View reports
- `reports:create` - Create reports
- `reports:edit` - Edit reports
- `reports:delete` - Delete reports

---

## 🧪 Verify Setup

### Check Database

```bash
npx prisma studio
# Look for permissions table → should have 50+ rows
```

### Check Logs

```bash
npm run start:dev
# Should show:
# 🌱 Starting permission seeding...
# ✅ Permission seeding completed in XXXms
```

### List All Permissions (Programmatic)

```typescript
import { SYSTEM_PERMISSIONS } from '@/constants/permissions.list';

console.log(SYSTEM_PERMISSIONS);
// [{action: 'leads:read', description: '...}, ...]

console.log(`Total: ${SYSTEM_PERMISSIONS.length}`);
```

---

## 🐛 Troubleshooting

| Issue                            | Solution                                      |
| -------------------------------- | --------------------------------------------- |
| Permission not in database       | Restart server, check console logs            |
| "Permission doesn't exist" error | Verify action name in permissions.list.ts     |
| Duplicate permission error       | Check unique constraint on `action` column    |
| Seeder not running               | Ensure SeederModule is imported in app.module |

---

## 📚 Files Reference

| File                                       | Purpose                |
| ------------------------------------------ | ---------------------- |
| `src/constants/permissions.list.ts`        | Define all permissions |
| `src/seeders/permission-seeder.service.ts` | Auto-sync logic        |
| `src/seeders/seeder.module.ts`             | Module wrapper         |
| `prisma/schema.prisma`                     | Database schema        |

---

**Last Updated:** March 26, 2026
