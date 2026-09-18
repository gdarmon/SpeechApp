import { AppError } from "./models.js";

export interface Settings {
  token: string; databaseUrl: string; apiKey: string; baseUrl: string; model: string;
  demo: boolean; aiTimeoutMs: number; databaseCa: string; localDatabase: boolean;
}

export function settingsFromEnv(env: NodeJS.ProcessEnv = process.env): Settings {
  const timeout = Number(env.AI_TIMEOUT_MS ?? 25000);
  if (!env.FALA_TOKEN || env.FALA_TOKEN.length < 32) throw new AppError(503, "Set FALA_TOKEN on the server to a random value of at least 32 characters.");
  if (!env.DATABASE_URL) throw new AppError(503, "Set the Supabase transaction-pooler DATABASE_URL on the server.");
  if (!Number.isInteger(timeout) || timeout < 5000 || timeout > 35000) throw new AppError(503, "AI_TIMEOUT_MS must be between 5000 and 35000.");
  const baseUrl = env.OPENAI_BASE_URL || "https://api.groq.com/openai/v1";
  let database: URL, provider: URL;
  try { database = new URL(env.DATABASE_URL); provider = new URL(baseUrl); }
  catch { throw new AppError(503, "The server database or AI endpoint address is invalid."); }
  if (!["postgres:", "postgresql:"].includes(database.protocol)) throw new AppError(503, "DATABASE_URL must be a PostgreSQL connection string.");
  const loopback = (url: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (provider.protocol !== "https:" && !(provider.protocol === "http:" && loopback(provider) && !env.NETLIFY)) {
    throw new AppError(503, "The AI endpoint must use HTTPS.");
  }
  if (provider.username || provider.password || provider.search || provider.hash) throw new AppError(503, "Use a plain AI endpoint URL; set its key separately.");
  const localDatabase = env.FALA_LOCAL_DATABASE === "true";
  if (localDatabase && (!loopback(database) || env.NETLIFY)) throw new AppError(503, "Unencrypted database connections are allowed only for local development.");
  return { token: env.FALA_TOKEN, databaseUrl: env.DATABASE_URL, apiKey: env.OPENAI_API_KEY || "", baseUrl,
    model: env.OPENAI_MODEL || "openai/gpt-oss-120b", demo: env.FALA_DEMO === "true", aiTimeoutMs: timeout,
    databaseCa: (env.DATABASE_CA_CERT || "").replace(/\\n/g, "\n"), localDatabase };
}
