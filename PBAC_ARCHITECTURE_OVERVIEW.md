# Role & Permission System - Architecture Overview

## 🏗️ System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    NestJS Application                        │
│                     (app.module.ts)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ imports
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              SeederModule                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  PermissionSeederService                             │   │
│  │                                                       │   │
│  │  onApplicationBootstrap() {                          │   │
│  │    for each permission in SYSTEM_PERMISSIONS {       │   │
│  │      .upsert(permission to database)                 │   │
│  │    }                                                 │   │
│  │  }                                                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ reads from
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  src/constants/permissions.list.ts                          │
│                                                             │
│  const SYSTEM_PERMISSIONS: ISystemPermission[] = [         │
│    { action: 'leads:read', description: '...' },          │
│    { action: 'leads:read_all', description: '...' },      │
│    { action: 'leads:create', description: '...' },        │
│    { action: 'leads:edit', description: '...' },          │
│    { action: 'leads:edit_all', description: '...' },      │
│    { action: 'leads:delete', description: '...' },        │
│    { action: 'leads:delete_all', description: '...' },    │
│    { action: 'leads:restore', description: '...' },       │
│    // ... 42 more permissions ...                         │
│    // Total: 50 system permissions                        │
│  ]                                                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ upserts to (via Prisma)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL Database                                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ permissions table                                    │   │
│  │                                                     │   │
│  │ id (UUID)  │ action (UNIQUE)   │ description       │   │
│  │────────────┼──────────────────┼───────────────────│   │
│  │ uuid-1     │ leads:read       │ Read assigned...  │   │
│  │ uuid-2     │ leads:read_all   │ Read all leads    │   │
│  │ uuid-3     │ leads:create     │ Create new leads  │   │
│  │ ...        │ ...              │ ...               │   │
│  │ (50 rows)  │                  │                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow: Adding New Permissions

```
Step 1: Developer edits
┌────────────────────────────────────┐
│ src/constants/permissions.list.ts  │
│                                    │
│ Add: {                             │
│   action: 'invoices:read',        │
│   description: 'View invoices'     │
│ }                                  │
└────────────────────────┬───────────┘
                         │
                         ▼
Step 2: Developer restarts server
┌────────────────────────────────────┐
│ $ npm run start:dev                │
└────────────────────────┬───────────┘
                         │
                         ▼
Step 3: PermissionSeederService runs
┌────────────────────────────────────┐
│ onApplicationBootstrap() {         │
│   // Reads updated SYSTEM_PERMISSIONS │
│   // Upserts each to database      │
│   // Logs: "✅ 51 permissions synced" │
│ }                                  │
└────────────────────────┬───────────┘
                         │
                         ▼
Step 4: Database updated
┌────────────────────────────────────┐
│ permissions table now has:         │
│ • invoices:read (NEW!)             │
│ • All other 50 permissions         │
│ Total: 51 permissions              │
└────────────────────────────────────┘
```

---

## 🎯 Permission Usage Flow

```
User requests action
         │
         ▼
┌─────────────────────────────────────┐
│ Verify JWT token & user.id          │
└─────────────────────┬───────────────┘
                      │
                      ▼
┌─────────────────────────────────────┐
│ Check OrganizationMembership        │
│ (user belongs to organization)      │
└─────────────────────┬───────────────┘
                      │
                      ▼
┌─────────────────────────────────────┐
│ Get member's Role                   │
│ (from OrganizationMembership)       │
└─────────────────────┬───────────────┘
                      │
                      ▼
┌─────────────────────────────────────┐
│ Query RolePermission                │
│ (get all permissions for role)      │
└─────────────────────┬───────────────┘
                      │
                      ▼
┌─────────────────────────────────────┐
│ Check MembershipPermissionOverride  │
│ (any exceptions for this member?)   │
└─────────────────────┬───────────────┘
                      │
                      ├─ Is permission GRANTED explicitly?
                      │  → YES: Allow ✅
                      │
                      ├─ Is permission REVOKED explicitly?
                      │  → YES: Deny ❌
                      │
                      └─ No override found?
                         → Use role permission ↑
```

---

## 📊 Permission Matrix (6-Action Pattern)

```
Resource: LEADS

│ Action      │ Scope    │ Description                      │
├─────────────┼──────────┼──────────────────────────────────┤
│ read        │ Assigned │ Read only your assigned leads     │
│ read_all    │ All      │ Read any lead in organization    │
│ create      │ New      │ Create new leads                 │
│ edit        │ Assigned │ Edit your assigned leads         │
│ edit_all    │ All      │ Edit any lead in organization    │
│ delete      │ Assigned │ Delete your assigned leads       │
│ delete_all  │ All      │ Delete any lead in organization  │
│ restore     │ All      │ Restore deleted leads            │
└─────────────┴──────────┴──────────────────────────────────┘

Same pattern for: contacts, deals, tasks, ...
```

---

## 🎨 Permission Categories (50 Total)

```
┌─────────────────────────────────────────────────┐
│  LEADS (8) - Sales pipeline management          │
│  • read, read_all, create, edit, edit_all       │
│  • delete, delete_all, restore                  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  CONTACTS (8) - Customer database               │
│  • read, read_all, create, edit, edit_all       │
│  • delete, delete_all, restore                  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  DEALS (8) - Opportunity tracking               │
│  • read, read_all, create, edit, edit_all       │
│  • delete, delete_all, restore                  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  TASKS (8) - Activity management                │
│  • read, read_all, create, edit, edit_all       │
│  • delete, delete_all, restore                  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  TEAM MEMBERS (4) - User management             │
│  • read, create, edit, delete                   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  ROLES (5) - Administrative                     │
│  • read, create, edit, delete, manage           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  ORGANIZATION (3) - Company settings            │
│  • read, edit, manage                           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  BILLING (2) - Payment management               │
│  • read, manage                                 │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  REPORTS (4) - Analytics                        │
│  • read, create, edit, delete                   │
└─────────────────────────────────────────────────┘
```

---

## 🗂️ Database Schema Relationships

```
┌────────────┐
│ Permission │  (Global system permissions)
│ ┌────────┐ │
│ │ id     │─┼──────────┐
│ │ action │ │          │
│ │ desc   │ │          │
└┼────────┘ │          │
 └──────────┘          │
      ▲                │
      │                │
      │         ┌──────┴──────────┐
      │         │                 │
      │         ▼                 ▼
      │    ┌─────────────┐   ┌──────────────────────┐
      │    │RolePermission│  │MembershipPermissionOv│
      │    │┌──────────┐ │  │┌────────────────────┐│
      └────│role_id   │ │  ││membership_id       ││
           │permission_id││  ││permission_id       ││
           └──────────┘ │  ││is_granted (T/F)    ││
           └─────────────┘  └────────────────────┘│
                 ▲                     ▲           │
                 │                     │           │
                 │        ┌────────────┘           │
                 │        │                        │
              ┌──┴────┐   │                        │
              │ Role  │   │                        │
              │       │   │                        │
       ┌──────┤id     │   │                        │
       │      │name   │   │                        │
       │      │org_id │   │                        │
       │      └───────┘   │                        │
       │                  │                        │
       │                  ▼                        │
       │        ┌─────────────────────────────┐   │
       │        │OrganizationMembership       │───┘
       │        │┌────────────────────────────┐   │
       │        ││id                          │   │
       │        ││user_id ────────┐           │   │
       │        ││organization_id │           │   │
       ├────────│role_id          │           │   │
       │        ││status           │           │   │
       │        └────────────────────────────┘   │
       │            │                    │       │
       │            │                    │       │
       │            ▼                    ▼       │
       │        ┌────────┐        ┌──────────────┐
       │        │ User   │        │Organization │
       │        │id      │        │id            │
       └────────│email   │        │name          │
                │pass_hash
                │name
                └────────┘
```

---

## 🔐 Permission Override Logic

```
Has user (membership) permission for 'leads:edit'?

Step 1: Check membership role
   ├─ Role has 'leads:edit'?
   │     └─ YES → Check overrides
   │     └─ NO  → Check overrides anyway
   │
   └─ Go to Step 2

Step 2: Check membership overrides
   ├─ Override exists for 'leads:edit'?
   │     ├─ YES, is_granted = true  → GRANT ✅
   │     ├─ YES, is_granted = false → REVOKE ❌
   │     └─ NO override → Step 3
   │
   └─ Go to Step 3

Step 3: Use role permission
   ├─ Role has 'leads:edit'? → YES: GRANT ✅
   └─ Role doesn't have it? → NO: REVOKE ❌
```

---

## 📋 Implementation Checklist Summary

```
✅ STEP 1: Prisma Schema
   ✓ Permission model uses 'action' instead of 'name'
   ✓ All required models present
   ✓ Database synchronized
   ✓ Prisma client regenerated

✅ STEP 2: Permission Constants
   ✓ Strictly typed interface
   ✓ 50 permissions defined (9 categories)
   ✓ 6-action matrix pattern
   ✓ Helper functions provided
   ✓ File: src/constants/permissions.list.ts

✅ STEP 3: Seeder Service
   ✓ OnApplicationBootstrap implementation
   ✓ Upsert pattern (idempotent)
   ✓ Error handling & logging
   ✓ File: src/seeders/permission-seeder.service.ts

✅ INTEGRATION
   ✓ Seeder module created
   ✓ App module updated
   ✓ All imports resolved
   ✓ TypeScript compilation: SUCCESS
   ✓ Database sync: SUCCESS
   ✓ Build verification: SUCCESS

✅ DOCUMENTATION
   ✓ Implementation report
   ✓ Quick reference guide
   ✓ Completion summary
   ✓ Architecture overview (this file)
   ✓ Usage examples
```

---

## 🚀 Getting Started

### 1. Start the Server

```bash
npm run start:dev
```

Expected console output:

```
🌱 Starting permission seeding...
✅ Permission seeding completed in 245ms | Total permissions: 50, Status: All 50 permissions synced ✓
```

### 2. Verify Permissions in Database

```bash
npx prisma studio
```

Navigate to `permissions` table → should show 50 rows

### 3. Use in Code

```typescript
import { SYSTEM_PERMISSIONS } from '@/constants/permissions.list';

// All permissions
console.log(SYSTEM_PERMISSIONS);

// Check if exists
import { permissionExists } from '@/constants/permissions.list';
permissionExists('leads:read'); // → true

// Get resource permissions
import { getResourcePermissions } from '@/constants/permissions.list';
getResourcePermissions('leads'); // → all 'leads:*' perms
```

---

## 📚 Files Reference

| File                                       | Purpose                  | Type    |
| ------------------------------------------ | ------------------------ | ------- |
| `src/constants/permissions.list.ts`        | Permission definitions   | NEW     |
| `src/seeders/permission-seeder.service.ts` | Seeding logic            | NEW     |
| `src/seeders/seeder.module.ts`             | Module wrapper           | NEW     |
| `prisma/schema.prisma`                     | Database schema          | UPDATED |
| `src/app.module.ts`                        | App integration          | UPDATED |
| `PBAC_IMPLEMENTATION_REPORT.md`            | Full documentation       | NEW     |
| `PBAC_QUICK_REFERENCE.md`                  | Developer guide          | NEW     |
| `PBAC_COMPLETION_SUMMARY.md`               | Summary                  | NEW     |
| `PBAC_ARCHITECTURE_OVERVIEW.md`            | Architecture (this file) | NEW     |

---

**Version:** 1.0  
**Status:** ✅ Production Ready  
**Date:** March 26, 2026
