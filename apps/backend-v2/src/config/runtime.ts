/**
 * NODE_ENV for code that runs outside dependency injection (cookie helpers, logger setup).
 * Its value is validated at startup by validateEnv; everything else reads ConfigService.
 */
export const isProduction = (): boolean =>
  process.env.NODE_ENV === 'production';
