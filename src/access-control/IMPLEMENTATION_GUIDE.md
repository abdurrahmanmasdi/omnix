# Access Control Module: Role Assignment & Permission Overrides

## Overview

Extended the Access Control module with two new features:

1. **Role Assignment**: PATCH endpoint to assign roles to organization members
2. **Permission Overrides**: POST endpoint to create granular permission overrides

Both endpoints are secured with JWT authentication and include full tenant context validation.

---

## New Endpoints

### 1. Assign Role to Member

**Route**: `PATCH /api/v1/organizations/:orgId/memberships/:membershipId/role`

**Security**: JWT Bearer Token Required + `x-organization-id` Header

**Request Body**:

```json
{
  "role_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (200 OK)**:

```json
{
  "id": "membership-uuid",
  "role_id": "role-uuid",
  "message": "Role assigned to member successfully."
}
```

**Error Cases**:

- `401 Unauthorized`: Missing or invalid JWT token
- `403 Forbidden`: User not ACTIVE member in organization
- `404 Not Found`: Membership or role not found
- `400 Bad Request`: Invalid input

---

### 2. Create Permission Override

**Route**: `POST /api/v1/organizations/:orgId/memberships/:membershipId/overrides`

**Security**: JWT Bearer Token Required + `x-organization-id` Header

**Request Body**:

```json
{
  "permission_id": "550e8400-e29b-41d4-a716-446655440000",
  "is_granted": true
}
```

**Response (201 Created)**:

```json
{
  "id": "override-uuid",
  "permission_id": "permission-uuid",
  "is_granted": true,
  "message": "Permission override created successfully."
}
```

**Behavior**:

- Creates a new MembershipPermissionOverride if it doesn't exist
- Updates an existing override if it already exists for this membership/permission pair
- `is_granted: true` = grant the permission (override role's lack of it)
- `is_granted: false` = revoke the permission (override role's grant of it)

**Error Cases**:

- `401 Unauthorized`: Missing or invalid JWT token
- `403 Forbidden`: User not ACTIVE member in organization
- `404 Not Found`: Membership or permission not found
- `400 Bad Request`: Invalid input

---

## Architecture

### Service Layer (AccessControlService)

#### assignRoleToMember()

```typescript
async assignRoleToMember(
  organizationId: string,
  membershipId: string,
  currentUserId: string,
  dto: UpdateMemberRoleDto
): Promise<{ id: string; role_id: string; message: string }>
```

**Flow**:

1. Verify caller is ACTIVE member in organization
2. Verify membership exists and belongs to organization
3. Verify role exists and belongs to organization
4. Update membership with new role_id
5. Return success response with i18n message

#### createPermissionOverride()

```typescript
async createPermissionOverride(
  organizationId: string,
  membershipId: string,
  currentUserId: string,
  dto: CreatePermissionOverrideDto
): Promise<{ id: string; permission_id: string; is_granted: boolean; message: string }>
```

**Flow**:

1. Verify caller is ACTIVE member in organization
2. Verify membership exists and belongs to organization
3. Verify permission exists
4. Upsert MembershipPermissionOverride record
5. Return success response with i18n message

### Data Types

**UpdateMemberRoleDto**:

```typescript
{
  role_id: string (UUID, validated with @IsUUID)
}
```

**CreatePermissionOverrideDto**:

```typescript
{
  permission_id: string (UUID, validated with @IsUUID),
  is_granted: boolean (validated with @IsBoolean)
}
```

---

## Security & Validation

### JWT Authentication

- All endpoints require valid JWT Bearer token in `Authorization` header
- Verified by `JwtAuthGuard` on all routes

### Tenant Isolation

- `x-organization-id` header validates organization context
- User must be ACTIVE member in specified organization
- All queries scoped to organization_id

### Input Validation

- DTOs use class-validator decorators (@IsUUID, @IsBoolean)
- NestJS pipe validates before controller method runs
- Invalid requests return 400 Bad Request

### Resource Ownership

- Membership must belong to organization
- Role must belong to organization
- Permission must exist (not organization-specific in DB, but validated)
- User must have authority to perform the action (ACTIVE member status)

---

## Error Handling

### Standard Error Responses

**401 Unauthorized**:

```json
{
  "statusCode": 401,
  "message": "Unauthorized access."
}
```

**403 Forbidden**:

```json
{
  "statusCode": 403,
  "message": "You are not authorized to access this resource." | "REASON_SPECIFIC_ERROR"
}
```

**404 Not Found**:

```json
{
  "statusCode": 404,
  "message": "Membership not found." | "Role not found." | "Permission not found."
}
```

**400 Bad Request**:

```json
{
  "statusCode": 400,
  "message": "Invalid request.",
  "errors": [
    {
      "field": "role_id",
      "message": "Must be a valid UUID."
    }
  ]
}
```

---

## Internationalization

### Messages (messages.json)

- **ROLE_ASSIGNED_SUCCESSFULLY**: "Role assigned to member successfully."
- **PERMISSION_OVERRIDE_CREATED_SUCCESSFULLY**: "Permission override created successfully."

### Error Messages (errors.json)

All new errors under `ACCESS` namespace:

- **MEMBERSHIP_NOT_FOUND**: "Membership not found."
- **PERMISSION_NOT_FOUND**: "Permission not found."

**Languages Supported**: English, Arabic, Turkish

---

## Module Structure

### Files Updated/Created

**New Service Methods**:

- `src/access-control/access-control.service.ts`
  - Added `assignRoleToMember()`
  - Added `createPermissionOverride()`
  - Added imports for new DTOs

**New Controllers**:

- `src/access-control/membership-access-control.controller.ts` (NEW)
  - `PATCH /organizations/:orgId/memberships/:membershipId/role`
  - `POST /organizations/:orgId/memberships/:membershipId/overrides`

**New DTOs**:

- `src/access-control/dtos/update-member-role.dto.ts` (NEW)
- `src/access-control/dtos/create-permission-override.dto.ts` (NEW)

**Updated Modules**:

- `src/access-control/access-control.module.ts`
  - Registered MembershipAccessControlController

**I18n Files** (NEW):

- `src/i18n/en/messages.json`
- `src/i18n/ar/messages.json`
- `src/i18n/tr/messages.json`

**I18n Files** (UPDATED):

- `src/i18n/en/errors.json`
- `src/i18n/ar/errors.json`
- `src/i18n/tr/errors.json`

---

## Usage Examples

### cURL Examples

**Assign Role**:

```bash
curl -X PATCH \
  http://localhost:3000/api/v1/organizations/a1b2c3d4-e5f6-7890-abcd-ef1234567890/memberships/m1m2m3m4-m5m6-m7m8-m9m0-m1m2m3m4m5m6/role \
  -H 'Authorization: Bearer eyJhbGc...' \
  -H 'x-organization-id: a1b2c3d4-e5f6-7890-abcd-ef1234567890' \
  -H 'Content-Type: application/json' \
  -d '{"role_id": "r1r2r3r4-r5r6-r7r8-r9r0-r1r2r3r4r5r6"}'
```

**Create Permission Override**:

```bash
curl -X POST \
  http://localhost:3000/api/v1/organizations/a1b2c3d4-e5f6-7890-abcd-ef1234567890/memberships/m1m2m3m4-m5m6-m7m8-m9m0-m1m2m3m4m5m6/overrides \
  -H 'Authorization: Bearer eyJhbGc...' \
  -H 'x-organization-id: a1b2c3d4-e5f6-7890-abcd-ef1234567890' \
  -H 'Content-Type: application/json' \
  -d '{"permission_id": "p1p2p3p4-p5p6-p7p8-p9p0-p1p2p3p4p5p6", "is_granted": true}'
```

### Typescript/Node.js Example

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api/v1',
  headers: {
    Authorization: `Bearer ${jwtToken}`,
    'x-organization-id': organizationId,
  },
});

// Assign role
const roleAssignmentResponse = await api.patch(
  `/organizations/${organizationId}/memberships/${membershipId}/role`,
  {
    role_id: newRoleId,
  },
);

// Create permission override
const overrideResponse = await api.post(
  `/organizations/${organizationId}/memberships/${membershipId}/overrides`,
  {
    permission_id: permissionId,
    is_granted: true,
  },
);
```

---

## Testing Notes

The implementation follows existing project patterns:

- Uses PrismaService for database operations
- Implements proper error handling with domain-specific exceptions
- Uses I18nService for multilingual support
- Includes comprehensive logging via Logger
- Validates ownership and tenant context
- Uses transactions where appropriate (not needed for these endpoints, but pattern available)

## Next Steps

To fully integrate permission overrides into the authorization system, you may want to:

1. Update the authorization logic to check MembershipPermissionOverride records
2. Create a permission evaluation service that considers:
   - User's role permissions
   - Permission overrides
   - Negation rule (if override exists, use it; otherwise use role permission)
3. Add E2E tests for the new endpoints
4. Add unit tests for the new service methods
5. Create endpoints to read and delete permission overrides (GET/DELETE)
