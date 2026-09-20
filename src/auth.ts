import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from "jose";
import { z } from "zod";
import type { Settings } from "./config.js";
import type { Database, Executor, Parameter } from "./database.js";
import { AppError } from "./models.js";
import type { Timing } from "./timing.js";

export const LEGACY_USER_ID = "00000000-0000-4000-8000-000000000001";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const WEB_COOKIE = "__Host-fala";
export const webCookie = (token = "") => `${WEB_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${token ? 90 * 86400 : 0}`;
export const requestToken = (request: Request) => {
  const header = request.headers.get("Authorization");
  if (header) return header.startsWith("Bearer ") ? header.slice(7) : "";
  return request.headers.get("Cookie")?.split(";").map(item => item.trim()).find(item => item.startsWith(`${WEB_COOKIE}=`))?.slice(WEB_COOKIE.length + 1) ?? "";
};
export function sameOrigin(request: Request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) throw new AppError(403, "Open Fala on its own website and try again.");
}
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 5000 });
export type GoogleIdentity = { subject: string; email: string; nonce: string };
export type VerifyGoogle = (token: string, clientId: string) => Promise<GoogleIdentity>;
export const googleLoginSchema = z.strictObject({ challenge_id: z.uuid(), id_token: z.string().min(100).max(16000) });

export function googleVerifier(keys: JWTVerifyGetKey = googleKeys): VerifyGoogle {
  return async (token, clientId) => {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, keys, {
        audience: clientId, issuer: ["https://accounts.google.com", "accounts.google.com"], algorithms: ["RS256"],
        requiredClaims: ["sub", "exp", "iat", "email", "email_verified", "nonce"], maxTokenAge: "10m",
      }));
    } catch {
      throw new AppError(401, "Google sign-in could not be verified. Please try again.");
    }
    if (payload.email_verified !== true || typeof payload.email !== "string" || !payload.email
      || typeof payload.nonce !== "string" || !payload.nonce || !payload.sub) {
      throw new AppError(401, "Please use a verified Google account to sign in.");
    }
    return { subject: payload.sub, email: payload.email.trim().toLowerCase(), nonce: payload.nonce };
  };
}

export class Auth {
  constructor(private settings: Settings, private db: Database, private timing: Timing, private verify: VerifyGoogle = googleVerifier()) {}
  private query<T>(executor: Executor, sql: string, values: Parameter[] = []) {
    return this.timing.measure("db", () => executor.query<T>(sql, values));
  }
  private configured() {
    if (!this.settings.googleClientId) throw new AppError(503, "Google sign-in is not available yet. Please try again later.");
  }
  config() { this.configured(); return { google_client_id: this.settings.googleClientId }; }

  private async limit(action: string, address: string) {
    const bucket = `${action}:${hash(address)}`;
    const rows = await this.query<{ bucket: string; requests: number }>(this.db, `
      WITH cleanup AS (DELETE FROM fala.auth_rate_limits WHERE window_start < now()-interval '2 minutes' AND bucket NOT IN ($1,$2))
      INSERT INTO fala.auth_rate_limits(bucket,window_start,requests) VALUES($1,now(),1),($2,now(),1)
      ON CONFLICT(bucket) DO UPDATE SET
        requests=CASE WHEN fala.auth_rate_limits.window_start < now()-interval '1 minute' THEN 1 ELSE fala.auth_rate_limits.requests+1 END,
        window_start=CASE WHEN fala.auth_rate_limits.window_start < now()-interval '1 minute' THEN now() ELSE fala.auth_rate_limits.window_start END
      RETURNING bucket,requests`, [bucket, `${action}:global`]);
    if (rows.some(row => row.requests > (row.bucket === bucket ? 10 : 100))) throw new AppError(429, "Please wait a minute before trying to sign in again.");
  }

  async challenge(address: string) {
    this.configured(); await this.limit("challenge", address);
    const id = randomUUID(), nonce = randomBytes(32).toString("base64url");
    await this.query(this.db, `WITH cleanup AS (DELETE FROM fala.login_challenges WHERE expires_at < now())
      INSERT INTO fala.login_challenges(id,nonce_hash,expires_at) VALUES($1::uuid,$2,now()+interval '5 minutes')`, [id, hash(nonce)]);
    return { ...this.config(), challenge_id: id, nonce };
  }

  async signIn(input: z.infer<typeof googleLoginSchema>, address: string) {
    this.configured(); await this.limit("signin", address);
    const identity = await this.timing.measure("auth", () => this.verify(input.id_token, this.settings.googleClientId));
    const token = `fala_${randomBytes(32).toString("base64url")}`;
    return this.db.transaction(async tx => {
      const rows = await this.query(tx, `DELETE FROM fala.login_challenges
        WHERE id=$1::uuid AND nonce_hash=$2 AND expires_at > now() RETURNING id`, [input.challenge_id, hash(identity.nonce)]);
      if (!rows.length) throw new AppError(401, "This sign-in expired. Please choose your Google account again.");
      // Identity is Google's stable subject, never an email address that can change or be reused.
      const [user] = await this.query<{ id: string }>(tx, `INSERT INTO fala.users(id,google_subject,email)
        VALUES($1::uuid,$2,$3) ON CONFLICT(google_subject) DO UPDATE SET email=EXCLUDED.email RETURNING id`,
        [randomUUID(), identity.subject, identity.email]);
      const [saved] = await this.query<{ expires_at: string }>(tx, `
        WITH cleanup AS (DELETE FROM fala.device_sessions WHERE expires_at < now())
        INSERT INTO fala.device_sessions(token_hash,user_id,expires_at)
        VALUES($1,$2::uuid,now()+interval '90 days') RETURNING expires_at`, [hash(token), user.id]);
      return { token, expires_at: new Date(saved.expires_at).toISOString(), email: identity.email };
    });
  }

  async authorize(request: Request) {
    const credential = requestToken(request);
    const header = `Bearer ${credential}`;
    if (credential && !request.headers.has("Authorization") && !["GET", "HEAD"].includes(request.method)) sameOrigin(request);
    // Optional operator access for diagnostics and older development clients; never embedded in Android.
    if (this.settings.token && timingSafeEqual(Buffer.from(hash(header)), Buffer.from(hash(`Bearer ${this.settings.token}`)))) return { id: LEGACY_USER_ID, operator: true };
    if (!/^Bearer fala_[A-Za-z0-9_-]{43}$/.test(header)) throw new AppError(401, "Please sign in to Fala again.");
    const rows = await this.query<{ user_id: string }>(this.db, `SELECT user_id FROM fala.device_sessions
      WHERE token_hash=$1 AND expires_at > now()`, [hash(header.slice(7))]);
    if (!rows.length) throw new AppError(401, "Please sign in to Fala again.");
    return { id: rows[0].user_id, operator: false };
  }

  async signOut(request: Request) {
    const token = requestToken(request);
    await this.query(this.db, "DELETE FROM fala.device_sessions WHERE token_hash=$1", [hash(token)]);
  }

  async account(id: string) {
    const [user] = await this.query<{ email: string }>(this.db, "SELECT email FROM fala.users WHERE id=$1::uuid", [id]);
    if (!user) throw new AppError(401, "Please sign in to Fala again.");
    return { email: user.email };
  }
}
