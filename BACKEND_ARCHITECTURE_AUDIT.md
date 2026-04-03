# System Architecture Audit Report

As the **Software Architect**, I have analyzed the CRM backend to evaluate its robustness, scalability, domain boundaries, and security. While the architecture successfully implements a Modular Monolith pattern using NestJS and Prisma, there are several **critical vulnerabilities and architectural inconsistencies** that require immediate remediation before scaling.

Here is an analysis of your project's weaknesses and structural problems:

## 🚨 1. Critical Data Leakage: Broken Multi-Tenancy (RLS Bypass)

The core pattern for tenant isolation relies on a `PrismaService` extension to intercept queries and enforce Row-Level Security (RLS) dynamically using `TENANT_BOUND_MODELS`. 

**The Problem:**
- The `TENANT_BOUND_MODELS` array in `PrismaService` manually specifies which models enforce automatic isolation (`Role`, `Invitation`, `Lead`, etc.).
- Recently introduced models (`Product`, `ProductInstance`, `Proposal`, `ProposalLineItem`, `BankAccount`, `OrganizationSocialLink`) are **MISSING** from this array.
- In modules like `ProposalsService`, methods like `findAll()` execute `this.prisma.proposal.findMany()` with no explicit `organization_id` filter. Because `Proposal` is omitted from `TENANT_BOUND_MODELS`, **any authenticated user can retrieve all proposals from all organizations across the entire database**. 

**Architectural Recommendation:**
Instead of an explicit opt-in allowlist (`TENANT_BOUND_MODELS`), Prisma extensions should dynamically detect if an entity has an `organization_id` field in its DMMF metadata and apply the tenant filter universally, acting as a strict default-deny system.

## 🛑 2. Severe Inconsistencies in Route & Controller Architecture

The codebase has split into two conflicting approaches for routing and authorization, leading to maintainability issues and security gaps:

**Approach A (e.g., `LeadsController`):**
- **Routing:** `/organizations/:organizationId/leads` (NestJS explicit params).
- **Authorization:** Relies on explicitly calling `AccessVerificationService.verifyUserInOrganization()` inside every controller function.
- **RBAC:** Secured with `@UseGuards(JwtAuthGuard, PermissionsGuard)` and `@RequirePermissions(...)`.

**Approach B (e.g., `ProductsController`, `ProposalsController`):**
- **Routing:** `/products` and `/proposals` (No context in URI).
- **Authorization:** Relies entirely on `TenantInterceptor` which magically pulls `x-organization-id` from headers and attaches it to `req.tenantId`.
- **RBAC:** Complete absence of `@RequirePermissions(...)` or RBAC controls. Any verified user in the organization holds "Admin" privileges by default over products and proposals. Or worse, in `Proposals`, the service doesn't even use `req.tenantId`.

**Architectural Recommendation:**
Standardize on unified domain boundaries. Move entirely to **Approach A** for RESTful semantic purity or formalize a globally enforced RBAC middleware that explicitly requires permission decorators on all routes to prevent insecure defaults.

## ⚠️ 3. Flawed Soft Deletion Integrity

The system intercepts `delete` requests and transforms them into `update({ deleted_at: new Date() })`.

**The Problem:**
Prisma uses exact unique constraints (`@unique`) for fields like `User.email`, `Organization.slug`, and `Proposal.public_link_hash`. Because deleted rows remain in the DB, **if you soft-delete an organization with slug `my-org`, no one can ever create an organization with `my-org` again**. 

**Architectural Recommendation:**
PostgreSQL supports Partial Indexes. Instead of a standard unique constraint, you must implement raw SQL partial indexes during migrations: `CREATE UNIQUE INDEX unique_slug_active ON organizations(slug) WHERE deleted_at IS NULL;` ensuring uniqueness applies solely to non-deleted records.

## 📉 4. Domain Leakage in Bounded Contexts

Modules access other domains' data directly through Prisma violating bounded context encapsulation.
- `ProposalsService` directly invokes `this.prisma.product.findUnique()` to validate whether a line item is a `RESOURCE_RENTAL`. 
- `LeadsService` manually queries `OrganizationMembership` logic.

**The Problem:**
This creates a tangled data-access monolith where a change to `Product` properties requires rewriting `ProposalsService`. Internal representations of bounded contexts are exposed.

**Architectural Recommendation:**
Enforce strict separation between Bounded Contexts. `ProposalsService` should inject returning behaviors from a `ProductsService` or a `ProductFacade` rather than directly querying the database via Prisma for product domain logic. 

## 🧱 5. Unregulated JSON Schema Persistence

Models utilize `Json?` extensively (`Product.specifications`, `ProposalLineItem.selected_addons`, `Organization.brand_colors`). 

**The Problem:**
The persistence layer lacks a JSON Schema registry. NestJS controller DTOs provide standard validation, but nested arbitrary properties in JSON blobs bypass type safety. This introduces vulnerabilities regarding NoSQL injection and client-side rendering failures.

**Architectural Recommendation:**
Employ class-transformer and class-validator deep nesting strategies on DTOs, or define strict JSON Schema validations natively in the PostgreSQL structure utilizing trigger functions.

---

### Priority Actions Check-list
1. [ ] Immediately add `Product`, `Proposal`, and associated items to `TENANT_BOUND_MODELS`.
2. [ ] Audit all controllers (`ProposalsController`, `ProductsController`) establishing identical `@RequirePermissions` RBAC metadata.
3. [ ] Standardize the tenant routing paradigm between `Leads` and `Products`.
4. [ ] Define structural DTOs for JSON fields (`specifications`, `available_addons`).
