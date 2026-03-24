/**
 * E2E Test Type Definitions
 *
 * Centralized type definitions for all E2E test interfaces.
 * These types represent the API response structures used in tests.
 */

/**
 * User profile response from registration and profile endpoints
 */
export interface IUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: Date;
}

/**
 * Authentication response containing JWT access token
 */
export interface IAuthResponse {
  access_token: string;
}

/**
 * Organization resource with metadata
 */
export interface IOrganization {
  id: string;
  name: string;
  slug: string;
  is_public: boolean;
  created_at: Date;
}

/**
 * Role definition with ID and name
 */
export interface IRole {
  id: string;
  name: string;
}

/**
 * Membership record linking user to organization with role and status
 */
export interface IOrganizationMembership {
  id: string;
  user_id: string;
  organization_id: string;
  role: IRole;
  status: 'active' | 'pending_approval' | 'invited';
  organization: IOrganization;
}

/**
 * Request payload for user registration
 */
export interface IRegisterPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

/**
 * Request payload for user login
 */
export interface ILoginPayload {
  email: string;
  password: string;
}

/**
 * Request payload for organization creation
 */
export interface ICreateOrganizationPayload {
  name: string;
  slug: string;
}
