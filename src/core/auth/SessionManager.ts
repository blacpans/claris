import type { Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';

/**
 * Session Manager for Claris
 * Handles authenticated user sessions using signed cookies.
 */
const COOKIE_NAME = 'claris_session';

/**
 * Gets the auth secret from environment variables. 🔐
 */
function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.warn('[Session] AUTH_SECRET is not set, using fallback! ⚠️');
    return 'claris-fallback-secret';
  }
  return secret;
}

/**
 * Sets the user session in a signed cookie.
 */
export async function setSession(c: Context, userId: string): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'prod';
  await setSignedCookie(c, COOKIE_NAME, userId, getSecret(), {
    path: '/',
    secure: isProd,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 1 week
    sameSite: 'Lax',
  });
}

/**
 * Gets the authenticated userId from the session cookie.
 */
export async function getSession(c: Context): Promise<string | null> {
  const userId = await getSignedCookie(c, getSecret(), COOKIE_NAME);
  return typeof userId === 'string' ? userId : null;
}

/**
 * Deletes the session cookie (logout).
 */
export function logout(c: Context): void {
  deleteCookie(c, COOKIE_NAME, {
    path: '/',
  });
}
