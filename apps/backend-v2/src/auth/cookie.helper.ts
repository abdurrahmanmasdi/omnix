import { CookieOptions } from 'express';
import { isProduction } from '../config/runtime';

export const REFRESH_COOKIE_NAME = 'refresh_token';

export const getRefreshCookieOptions = (clear = false): CookieOptions => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: isProduction() ? 'none' : 'lax',
  path: '/',
  maxAge: clear ? 0 : 7 * 24 * 60 * 60 * 1000,
});
