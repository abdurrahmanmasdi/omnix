# E2E Test Suite: User and Organization Flow

## Overview

This E2E test suite validates the complete user registration, authentication, and organization management workflow in your NestJS application.

## Test Flow

The test executes the following sequence sequentially:

### 1. **Register User** (`POST /auth/register`)

- Creates a new user with dummy data
- **Expected Status:** 201
- **Validates:** User is created with correct name, email, and no password_hash in response

### 2. **Login** (`POST /auth/login`)

- Authenticates the user with email/password credentials
- **Expected Status:** 201
- **Validates:** JWT token is returned and properly formatted (3 parts separated by dots)
- **Captures:** JWT token for authenticated requests

### 3. **Create Organization** (`POST /organizations`)

- Creates a new organization using JWT Bearer token authentication
- **Expected Status:** 201
- **Validates:** Organization is created with correct name, slug, and is_public flag
- **Auto-creates:** Owner role and membership for the creator
- **Captures:** Organization ID for verification

### 4. **Verify Membership** (`GET /users/me/organizations`)

- Retrieves all organizations the user belongs to
- **Expected Status:** 200
- **Validates:**
  - Response is an array with at least one organization
  - Created organization is in the list
  - Membership status is 'active'
  - Role is 'owner'
  - Organization details are included (name, slug)

## Key Features

✅ **Sequential Execution**: Each step depends on the previous, ensuring realistic flow  
✅ **JWT Token Extraction**: Automatically extracts and uses JWT tokens for authenticated endpoints  
✅ **Bearer Authorization**: Properly sets Authorization headers with Bearer tokens  
✅ **Database Cleanup**: Automatically cleans up test data after execution:

- Deletes memberships first (respects foreign key constraints)
- Deletes organization
- Deletes user

✅ **Comprehensive Validation**: Checks response structures, status codes, and business logic

## Running the Tests

```bash
# Run E2E tests with database reset
npm run test:e2e

# Run E2E tests in watch mode (note: database not reset)
npm run test:watch

# Run all tests (unit + E2E)
npm run test
```

## Test Configuration

- **File:** `test/user-organization.e2e-spec.ts`
- **Jest Config:** `test/jest-e2e.json`
- **Database:** Automatically resets from `.env.test` configuration
- **Pattern:** Matches files ending with `.e2e-spec.ts`

## Environment

Tests use the `.env.test` configuration:

- **Database:** PostgreSQL test database (`saas_db`)
- **JWT Secret:** Pre-configured for test environment
- **Redis:** Test Redis instance for caching

## Notable Implementation Details

1. **Timestamp-based Test Data**: User email and organization slug use `Date.now()` to ensure uniqueness
2. **Token Storage**: JWT token is captured in variable and reused for subsequent authenticated requests
3. **Role Structure**: Role is returned as an object `{id, name}` not just a string
4. **Foreign Key Handling**: Membership must be deleted before organization due to database constraints

## Test Results

```
Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Time:        ~2.5 seconds
```

## Extending the Tests

To add more tests to this suite, follow this pattern:

```javascript
describe('New Feature', () => {
  it('should do something', async () => {
    const response = await request(app.getHttpServer())
      .get('/endpoint')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    expect(response.body).toBeDefined();
  });
});
```

## Troubleshooting

### "Jest did not exit one second after..." Warning

- This is a known issue with NestJS app cleanup in tests
- Tests pass successfully despite this warning
- It does not affect test reliability

### Database Connection Errors

- Ensure `.env.test` has correct DATABASE_URL
- Verify PostgreSQL test database exists
- Run `npm run test:e2e` to automatically reset schema

### JWT Token Undefined

- Verify login endpoint responds with `access_token` field
- Check Bearer token is properly set in Authorization header
- Ensure JWT_SECRET matches in `.env.test`
