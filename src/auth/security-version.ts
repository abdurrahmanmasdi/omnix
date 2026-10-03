/**
 * A token is current only when it carries the user's present security version.
 * Account recovery bumps the version, so every token issued before it is rejected;
 * tokens without a version (never issued since the column exists) fail closed.
 */
export function hasCurrentSecurityVersion(
  tokenVersion: unknown,
  userVersion: number,
): boolean {
  return typeof tokenVersion === 'number' && tokenVersion === userVersion;
}
