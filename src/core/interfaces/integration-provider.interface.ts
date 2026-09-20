export interface IIntegrationProvider {
  /**
   * Verifies if the credentials are still valid.
   * Enforces bounded timeouts internally.
   */
  verifyCredentials(credentialId: string, organizationId: string): Promise<boolean>;

  /**
   * Attempts to reconnect or re-authenticate.
   */
  reconnect(credentialId: string, organizationId: string, newPayload: any): Promise<void>;

  /**
   * Performs any necessary cleanup/revocation on the provider side.
   */
  disconnect(credentialId: string, organizationId: string): Promise<void>;
}
