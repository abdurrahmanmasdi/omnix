# Frontend Agent Playbook (CRM Backend)

## 1) Purpose

This document is the practical integration contract for frontend agents working against this backend.

Use it to answer:

- Which endpoint should I call for this user action?
- Which headers are mandatory?
- Which payload shape is accepted and validated?
- Which permission is required for rendering/enabling UI actions?
- How should I implement filtering, sorting, pagination, auth refresh, and realtime chat safely?

This guide is based on the current codebase behavior across controllers, DTOs, guards, global pipes, and Prisma schema.

## 2) Global API Rules

### 2.1 Base URL and Versioning

All routes are prefixed with:

- `/api/v1`

Examples:

- `POST /api/v1/auth/login`
- `GET /api/v1/organizations/:id`
- `GET /api/v1/organizations/:organizationId/leads`

### 2.2 Auth Model

- Access token: Bearer JWT in `Authorization` header.
- Refresh token: httpOnly cookie `refresh_token` (set by login and refresh endpoints).
- Protected by default: all routes are JWT-protected unless marked `@Public()`.

Public routes:

- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/verify-email`
- `POST /auth/resend-verification`
- `POST /auth/request-password-reset`
- `POST /auth/reset-password`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /organizations/invitations/:token`

### 2.3 Tenant Context (Critical)

There are two tenant patterns:

1. Path-tenant routes (most CRM routes):

- `.../organizations/:organizationId/...`
- Membership/access checks are done in service/controller flow.

2. Header-tenant routes (no org in path):

- `bank-accounts`, `social-links`, `chat`, and some permission/profile flows.
- Require header: `x-organization-id: <org_uuid>`.

Recommended frontend rule:

- Always send `x-organization-id` for all org-scoped calls, even if org id exists in URL.

### 2.4 Validation and Input Security

Global validation is active with:

- `transform: true`
- `whitelist: true`
- `forbidNonWhitelisted: true` (via i18n validation pipe)

Implications:

- Unknown fields are rejected for i18n pipe flow.
- Payloads should match DTOs exactly.

### 2.5 Standard Error Shape

Errors are normalized to:

```json
{
  "statusCode": 400,
  "timestamp": "2026-04-03T12:00:00.000Z",
  "path": "/api/v1/...",
  "message": "..."
}
```

Also supports `message` as array for validation errors.

## 3) Permission System (UI Authorization)

### 3.1 Permission string format

`resource:action`
Examples:

- `leads:read`
- `products:create`
- `team_members:manage`

### 3.2 Hierarchy behavior used by backend guard

If endpoint requires `resource:action`, backend also accepts:

- `resource:manage`
- `resource:*`
- `*`

And these implications:

- `resource:read_all` implies `resource:read`
- `resource:edit_all` implies `resource:edit`
- `resource:delete_all` implies `resource:delete`

### 3.3 Frontend boot sequence (recommended)

1. Login/register -> save `access_token` in memory.
2. Fetch organizations:

- `GET /users/me/organizations`

3. Choose active organization.
4. Fetch permissions:

- `GET /users/me/permissions` with `x-organization-id`

5. Build permission-gated UI from returned actions.

## 4) Query DSL (filters/sorts/search/pagination)

Used by leads/products/proposals list APIs.

### 4.1 Supported query params

- `page` number (>=1)
- `limit` number (1..100)
- `search` string
- `filters` JSON-stringified filter AST
- `sorts` JSON-stringified sort array

### 4.2 Filter operators

- `equals`, `not`, `in`, `notIn`, `lt`, `lte`, `gt`, `gte`, `contains`, `startsWith`, `endsWith`

### 4.3 Filter AST example

```json
{
  "logicalOperator": "AND",
  "conditions": [
    { "field": "status", "operator": "equals", "value": "OPEN" },
    {
      "logicalOperator": "OR",
      "conditions": [
        { "field": "country", "operator": "equals", "value": "Turkey" },
        { "field": "country", "operator": "equals", "value": "UAE" }
      ]
    }
  ]
}
```

### 4.4 Sort example

```json
[
  { "field": "created_at", "direction": "desc" },
  { "field": "first_name", "direction": "asc" }
]
```

### 4.5 URL example

```ts
const filters = JSON.stringify({
  logicalOperator: 'AND',
  conditions: [{ field: 'status', operator: 'equals', value: 'OPEN' }],
});

const sorts = JSON.stringify([{ field: 'created_at', direction: 'desc' }]);

const url = `/api/v1/organizations/${orgId}/leads?page=1&limit=20&search=john&filters=${encodeURIComponent(filters)}&sorts=${encodeURIComponent(sorts)}`;
```

## 5) Auth Endpoints: When and How

### 5.1 Login

Use when user signs in.

`POST /api/v1/auth/login`

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Returns:

- `access_token`
- `user` object (includes `permissions` array)
- sets `refresh_token` cookie

### 5.2 Refresh

Use on 401 or proactive token rotation.

`POST /api/v1/auth/refresh`

- Must include cookies (`credentials: 'include'` in browser fetch)
- returns fresh `access_token`

### 5.3 Logout

`POST /api/v1/auth/logout`

- clears refresh cookie.

### 5.4 Register

`POST /api/v1/auth/register`

```json
{
  "email": "new@example.com",
  "password": "newSecurePassword123",
  "first_name": "John",
  "last_name": "Doe",
  "inviteToken": "optional_token"
}
```

### 5.5 Email + Password recovery

- `POST /auth/verify-email` `{ token }`
- `POST /auth/resend-verification` `{ email }`
- `POST /auth/request-password-reset` `{ email }`
- `POST /auth/reset-password` `{ token, newPassword }`

## 6) Workspace and Organization Flows

### 6.1 Workspace switcher source

Use:

- `GET /api/v1/users/me/organizations`

This returns membership + organization + role info for org switch UI.

### 6.2 Get current profile in context

Use:

- `GET /api/v1/users/me` with optional `x-organization-id`.
- If header present, returns permissions for that org.

### 6.3 Get organization-specific permissions (preferred for RBAC refresh)

Use:

- `GET /api/v1/users/me/permissions` + `x-organization-id`

### 6.4 Organization CRUD and membership lifecycle

- `POST /organizations` create workspace
- `GET /organizations/:id`
- `PATCH /organizations/:id`
- `POST /organizations/join` by slug
- `GET /organizations/:id/requests` pending join requests
- `POST /organizations/:id/requests/:membershipId/approve`
- `POST /organizations/:id/requests/:membershipId/reject`
- `DELETE /users/me/requests/:id/cancel`

### 6.5 Invitation lifecycle

- `POST /organizations/:organizationId/invite`
- `GET /organizations/:id/invitations`
- `GET /organizations/invitations/:token` (public preview page)
- `POST /organizations/invitations/:token/accept`
- Legacy user acceptance route also exists: `POST /users/invites/:inviteId/accept`

## 7) Leads Domain

### 7.1 When to use Leads endpoints

Use for CRM lead lifecycle, assignment, stage progression, and value tracking.

Base:

- `/api/v1/organizations/:organizationId/leads`

Endpoints:

- `POST /` create
- `GET /` list (supports query DSL)
- `GET /:leadId` detail
- `PATCH /:leadId` update
- `PATCH /bulk` bulk update
- `DELETE /:leadId` delete

### 7.2 Create payload example

```json
{
  "first_name": "John",
  "last_name": "Doe",
  "phone_number": "+905551112233",
  "country": "Turkey",
  "timezone": "Europe/Istanbul",
  "primary_language": "tr",
  "email": "john.doe@company.com",
  "status": "OPEN",
  "priority": "WARM",
  "estimated_value": "15000.50",
  "currency": "USD",
  "pipeline_stage_id": "2f41db92-cdf8-4a6c-a40f-a35e9f8d9f2a",
  "assigned_agent_id": "f9ce8f72-9ec8-4db0-bf07-614ec2ec6143",
  "source_id": "c9a3874e-ebed-4fdf-8c14-f299f4d75668"
}
```

Important:

- `estimated_value` is validated as number-string.
- date inputs are ISO strings.
- list responses include `meta` pagination object.

### 7.3 Bulk update example

```json
{
  "lead_ids": ["uuid1", "uuid2"],
  "update_data": {
    "status": "WON",
    "assigned_agent_id": "uuid-agent"
  }
}
```

### 7.4 Leads nested resources

- Notes:
  - `GET /organizations/:organizationId/leads/:leadId/notes`
  - `POST /.../notes` `{ content }`
  - `DELETE /.../notes/:noteId`
- Attachments:
  - `GET /organizations/:organizationId/leads/:leadId/attachments`
  - `POST /.../attachments` `{ file_name, file_url }`
  - `DELETE /.../attachments/:attachmentId`

## 8) Products Domain

### 8.1 When to use Products endpoints

Use for product catalog, pricing basis, media management, and optional inventory-like instances.

Base:

- `/api/v1/organizations/:organizationId/products`

Endpoints:

- `POST /`
- `GET /` (query DSL)
- `GET /:id`
- `PATCH /:id`
- `DELETE /:id`
- `POST /:id/media`
- `PUT /:id/media/:mediaId/primary`

### 8.2 Product create payload example

```json
{
  "type": "RESOURCE_RENTAL",
  "title": "SUV Daily Rental",
  "description": "Automatic SUV with insurance",
  "base_price": 120,
  "currency": "USD",
  "specifications": {
    "doors": 5,
    "fuel": "diesel"
  },
  "available_addons": [
    { "name": "Baby Seat", "price": 15 },
    { "name": "VIP Pickup", "price": 35 }
  ],
  "media": [
    { "file_url": "https://cdn.example.com/car.jpg", "file_name": "cover" }
  ],
  "instances": [
    {
      "start_date": "2026-04-20T09:00:00.000Z",
      "end_date": "2026-04-20T18:00:00.000Z",
      "max_capacity": 1
    }
  ]
}
```

### 8.3 Product type meaning for UX

- `REAL_ESTATE_ASSET`: fixed asset, usually no date selection.
- `SCHEDULED_EVENT`: fixed date slot with capacity.
- `RESOURCE_RENTAL`: requires date ranges at proposal line-item level.
- `DYNAMIC_SERVICE`: formula-like dynamic service pricing.

## 9) Proposals Domain

### 9.1 When to use Proposals endpoints

Use for quoting, sending, verification, and proposal line-item pricing.

Base:

- `/api/v1/organizations/:organizationId/proposals`

Endpoints:

- `POST /`
- `GET /` (query DSL + optional status)
- `GET /:id`
- `PATCH /:id`
- `DELETE /:id`
- `POST /:id/verify`

### 9.2 Create payload example

```json
{
  "lead_id": "lead-uuid",
  "created_by_id": "user-uuid",
  "bank_account_id": "bank-uuid",
  "total_amount": 1500,
  "currency": "USD",
  "client_notes": "Valid for 7 days",
  "line_items": [
    {
      "product_id": "product-uuid",
      "instance_id": "instance-uuid",
      "start_date": "2026-05-01T10:00:00.000Z",
      "end_date": "2026-05-03T10:00:00.000Z",
      "custom_name": "SUV Rental",
      "unit_price": 500,
      "quantity": 3,
      "selected_addons": [{ "name": "Insurance+", "price": 100 }]
    }
  ]
}
```

Validation/business rule to respect:

- If line item product type is `RESOURCE_RENTAL`, both `start_date` and `end_date` are required.

### 9.3 Update payload example

```json
{
  "status": "SENT",
  "bank_account_id": "bank-uuid",
  "total_amount": 1600,
  "client_notes": "Updated after customer call",
  "client_accepted_privacy_policy": true
}
```

### 9.4 Proposal statuses for UI state machine

- `DRAFT`
- `SENT`
- `ACCEPTED`
- `RECEIPT_UPLOADED`
- `VERIFIED`
- `REJECTED`
- `EXPIRED`

## 10) Access Control / Roles / Permissions

### 10.1 Use-cases

Use these endpoints to build admin screens:

- Role list/create/update/delete
- Member role assignment
- Permission overrides
- Permissions checklist data source

### 10.2 Key endpoints

- `GET /permissions` -> all global permissions checklist.
- `GET /organizations/:orgId/roles`
- `POST /organizations/:orgId/roles`
- `PATCH /organizations/:orgId/roles/:roleId`
- `DELETE /organizations/:orgId/roles/:roleId`
- `PATCH /organizations/:orgId/roles/memberships/:membershipId/role`
- `POST /organizations/:orgId/roles/memberships/:membershipId/overrides`
- `GET /organizations/:orgId/roles/memberships/:membershipId/permissions-breakdown`

Also present:

- `PATCH /organizations/:orgId/memberships/:membershipId/role`
- `POST /organizations/:orgId/memberships/:membershipId/overrides`

### 10.3 Role creation example

```json
{
  "name": "Sales Manager",
  "name_translations": { "en": "Sales Manager", "tr": "Satış Müdürü" },
  "permissionIds": ["perm-uuid-1", "perm-uuid-2"]
}
```

## 11) Analytics

### 11.1 Endpoint

- `GET /api/v1/organizations/:organizationId/analytics/dashboard`
- Optional query: `agent_id`

### 11.2 Response blocks

- `pipeline_overview`
- `leads_by_stage`
- `leads_by_source`
- `recent_activity`
- `dashboard_stats`

Use this as the single source for dashboard cards + charts + recent feed.

## 12) Chat (REST + WebSocket)

### 12.1 REST endpoints

Base: `/api/v1/chat`

- `GET /conversations` (requires `x-organization-id`)
- `POST /conversations` (requires `x-organization-id`, body `{ targetUserId }`)
- `POST /groups` (requires `x-organization-id`, body `{ name, participantIds }`)
- `GET /conversations/:conversationId/messages?cursor=...&limit=...`

REST responses are wrapped as:

```json
{
  "status": "success",
  "data": ...
}
```

### 12.2 WebSocket namespace

- Namespace: `/chat`
- Auth token from `handshake.auth.token` or Authorization header.
- Organization can be passed as:
  - JWT payload `orgId` or `organizationId`
  - handshake auth `orgId` / `organizationId`
  - header `x-organization-id`

### 12.3 WebSocket events

Client -> server:

- `join_conversation` `{ conversationId }`
- `send_message` `{ conversationId, content }`
- `leave_conversation` `{ conversationId }`
- `get_messages` `{ conversationId }`

Server -> client:

- `new_message`
- `user_joined`
- `user_left`
- `conversation_messages`
- `error`

Rate limit:

- `send_message` throttled to 20/minute.

## 13) Header-Tenant CRUD Domains

These endpoints depend on `request.tenantId` from `x-organization-id` header and do not carry org in URL.

### 13.1 Bank accounts

- `POST /api/v1/bank-accounts`
- `GET /api/v1/bank-accounts`
- `PATCH /api/v1/bank-accounts/:id`
- `DELETE /api/v1/bank-accounts/:id`

Create example:

```json
{
  "bank_name": "Example Bank",
  "iban": "DE89370400440532013000",
  "currency": "EUR",
  "account_holder_name": "Acme Corp",
  "is_default": true
}
```

### 13.2 Social links

- `POST /api/v1/social-links`
- `GET /api/v1/social-links`
- `PATCH /api/v1/social-links/:id`
- `DELETE /api/v1/social-links/:id`

Create example:

```json
{
  "platform": "linkedin",
  "url": "https://linkedin.com/company/acme"
}
```

## 14) Pipeline and Lead Sources

### 14.1 Pipeline stages

- `GET /organizations/:organizationId/pipeline-stages`
- `POST /organizations/:organizationId/pipeline-stages`
- `PATCH /organizations/:organizationId/pipeline-stages/:stageId`
- `DELETE /organizations/:organizationId/pipeline-stages/:stageId`

Create payload:

```json
{ "name": "Qualified", "order_index": 2 }
```

### 14.2 Lead sources

- `GET /organizations/:organizationId/lead-sources?activeOnly=true`
- `POST /organizations/:organizationId/lead-sources`
- `PATCH /organizations/:organizationId/lead-sources/:sourceId`
- `DELETE /organizations/:organizationId/lead-sources/:sourceId`

Create payload:

```json
{ "name": "Facebook Ads", "is_active": true }
```

## 15) Frontend Implementation Patterns (Recommended)

### 15.1 HTTP client wrapper

```ts
export async function api<T>(
  path: string,
  init: RequestInit = {},
  ctx?: { token?: string; orgId?: string },
) {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');
  if (ctx?.token) headers.set('Authorization', `Bearer ${ctx.token}`);
  if (ctx?.orgId) headers.set('x-organization-id', ctx.orgId);

  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: 'include', // required for refresh cookie flow
  });

  if (res.status === 401 && path !== '/auth/refresh') {
    const refresh = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (refresh.ok) {
      const data = (await refresh.json()) as { access_token: string };
      headers.set('Authorization', `Bearer ${data.access_token}`);
      const retry = await fetch(`/api/v1${path}`, {
        ...init,
        headers,
        credentials: 'include',
      });
      if (!retry.ok) throw await retry.json();
      return retry.json() as Promise<T>;
    }
  }

  if (!res.ok) throw await res.json();
  return (res.status === 204 ? undefined : await res.json()) as T;
}
```

### 15.2 Permission guard in UI

```ts
export function can(userPermissions: string[], required: string): boolean {
  const [resource, action] = required.split(':');
  const granted = new Set(userPermissions);
  const candidates = new Set([
    required,
    '*',
    `${resource}:*`,
    `${resource}:manage`,
  ]);
  if (action === 'read') candidates.add(`${resource}:read_all`);
  if (action === 'edit') candidates.add(`${resource}:edit_all`);
  if (action === 'delete') candidates.add(`${resource}:delete_all`);
  return [...candidates].some((p) => granted.has(p));
}
```

### 15.3 Query builder helper

```ts
export function buildListQuery(params: {
  page?: number;
  limit?: number;
  search?: string;
  filters?: unknown;
  sorts?: unknown;
}) {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.search) q.set('search', params.search);
  if (params.filters) q.set('filters', JSON.stringify(params.filters));
  if (params.sorts) q.set('sorts', JSON.stringify(params.sorts));
  return q.toString();
}
```

## 16) Enum Reference for Frontend Typing

Use these for strict UI form/select values:

- `MembershipStatus`: `PENDING | ACTIVE | REJECTED`
- `Gender`: `MALE | FEMALE | OTHER | UNKNOWN`
- `LeadStatus`: `OPEN | WON | LOST | UNQUALIFIED`
- `Priority`: `HOT | WARM | COLD`
- `Currency`: `USD | TRY | EUR | GBP`
- `AuthTokenType`: `REFRESH | VERIFICATION | RESET`
- `ProductType`: `REAL_ESTATE_ASSET | SCHEDULED_EVENT | RESOURCE_RENTAL | DYNAMIC_SERVICE`
- `ProposalStatus`: `DRAFT | SENT | ACCEPTED | RECEIPT_UPLOADED | VERIFIED | REJECTED | EXPIRED`

## 17) Known Integration Caveats (Frontend-safe behavior)

1. Always pass `x-organization-id` in org context.

- Mandatory for chat/bank/social and safer for all org-scoped requests.

2. Prefer DTO fields exactly.

- Validation is strict; avoid extra keys.

3. For proposal line items tied to `RESOURCE_RENTAL`, always send dates.

4. For decimal-ish fields:

- Leads `estimated_value` expects a numeric string.
- Product/proposal monetary fields are numeric in DTOs.

5. List endpoints with DSL parse failures return 400.

- Validate filter/sort JSON client-side before request.

## 18) Feature-to-Endpoint Decision Matrix (Quick)

- Login page submit:
  - `POST /auth/login`
- Silent auth refresh:
  - `POST /auth/refresh`
- Workspace switch dropdown:
  - `GET /users/me/organizations`
- Workspace permission bootstrap:
  - `GET /users/me/permissions`
- CRM lead board:
  - `GET /organizations/:orgId/leads`
- Lead details page:
  - `GET /organizations/:orgId/leads/:leadId`
- Lead notes panel:
  - `GET/POST/DELETE /organizations/:orgId/leads/:leadId/notes...`
- Lead files panel:
  - `GET/POST/DELETE /organizations/:orgId/leads/:leadId/attachments...`
- Product catalog page:
  - `GET /organizations/:orgId/products`
- Product editor:
  - `POST/PATCH /organizations/:orgId/products...`
- Proposal builder:
  - `POST /organizations/:orgId/proposals`
- Proposal lifecycle:
  - `PATCH /organizations/:orgId/proposals/:id`, `POST /:id/verify`
- Team role management:
  - `/organizations/:orgId/roles...` and `/permissions`
- Chat inbox/messages:
  - REST `/chat/...` + WS namespace `/chat`
- Dashboard:
  - `GET /organizations/:orgId/analytics/dashboard`

---

If you follow this playbook exactly, frontend behavior will match backend guard, validation, tenancy, and permission expectations without trial-and-error.
