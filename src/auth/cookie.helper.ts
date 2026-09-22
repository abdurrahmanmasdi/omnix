import { CookieOptions } from 'express';

export const REFRESH_COOKIE_NAME = 'refresh_token';

export const getRefreshCookieOptions = (clear = false): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/',
  maxAge: clear ? 0 : 7 * 24 * 60 * 60 * 1000,
});
