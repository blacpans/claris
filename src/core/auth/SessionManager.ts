import type { Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';

/**
 * Session Manager for Claris
 * Handles authenticated user sessions using signed cookies.
 */
const COOKIE_NAME = 'claris_session';
const SECRET = process.env.AUTH_SECRET || 'claris-fallback-secret';

/**
 * Sets the user session in a signed cookie.
 */
export async function setSession(c: Context, userId: string): Promise<void> {
  await setSignedCookie(c, COOKIE_NAME, userId, SECRET, {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 1 week
    sameSite: 'Lax',
  });
}

/**
 * Gets the authenticated userId from the session cookie.
 */
export async function getSession(c: Context): Promise<string | null> {
  const userId = await getSignedCookie(c, SECRET, COOKIE_NAME);
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
