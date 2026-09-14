import crypto from "node:crypto";
import { cookies } from "next/headers";
import db, { ready } from "./db";

const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;

export interface SessionUser {
  id: number;
  username: string;
}

export async function createSession(userId: number): Promise<void> {
  await ready();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_DAYS * 86400 * 1000;
  await db
    .insertInto("sessions")
    .values({ token, user_id: userId, expires_at: expiresAt })
    .execute();
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  await ready();
  const row = await db
    .selectFrom("sessions as s")
    .innerJoin("users as u", "u.id", "s.user_id")
    .select(["u.id as id", "u.username as username", "s.expires_at as expiresAt"])
    .where("s.token", "=", token)
    .executeTakeFirst();
  if (!row) return null;
  if (Number(row.expiresAt) < Date.now()) {
    await db.deleteFrom("sessions").where("token", "=", token).execute();
    return null;
  }
  return { id: row.id, username: row.username };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await ready();
    await db.deleteFrom("sessions").where("token", "=", token).execute();
  }
  store.delete(SESSION_COOKIE);
}
