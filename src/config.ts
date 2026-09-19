import { AppError } from "./models.js";

export interface Settings {
  token: string; databaseUrl: string; apiKey: string; baseUrl: string; model: string;
  demo: boolean; aiTimeoutMs: number; databaseCa: string; localDatabase: boolean;
  googleClientId: string; dailyUserLimit: number; dailyAppLimit: number;
}

export function settingsFromEnv(env: NodeJS.ProcessEnv = process.env): Settings {
  const timeout = Number(env.AI_TIMEOUT_MS ?? 25000);
  const googleClientId = (env.GOOGLE_WEB_CLIENT_ID || "").trim();
  if (googleClientId && !/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleClientId)) throw new AppError(503, "The Google web client ID is invalid.");
  const dailyUserLimit = Number(env.FALA_DAILY_USER_LIMIT || 200);
  const dailyAppLimit = Number(env.FALA_DAILY_APP_LIMIT || 2000);
  if (![dailyUserLimit, dailyAppLimit].every(n => Number.isInteger(n) && n > 0 && n <= 1000000)) {
    throw new AppError(503, "Daily conversation limits must be positive integers up to 1000000.");
  }
  const token = env.FALA_TOKEN || "";
  if (!googleClientId && token.length < 32) throw new AppError(503, "Google sign-in is not configured on the service yet.");
  if (!env.DATABASE_URL) throw new AppError(503, "Set the Supabase transaction-pooler DATABASE_URL on the server.");
  if (!Number.isInteger(timeout) || timeout < 5000 || timeout > 35000) throw new AppError(503, "AI_TIMEOUT_MS must be between 5000 and 35000.");
  // A dedicated OpenAI credential switches the key, endpoint and model together.
  // Existing Groq settings must never route this key to a different provider.
  const openaiKey = (env.FALA_OPENAI_API_KEY || "").trim();
  const baseUrl = openaiKey ? "https://api.openai.com/v1" : env.OPENAI_BASE_URL || "https://api.groq.com/openai/v1";
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
  return { token: token.length >= 32 ? token : "", googleClientId, dailyUserLimit, dailyAppLimit, databaseUrl: env.DATABASE_URL, apiKey: openaiKey || env.OPENAI_API_KEY || "", baseUrl,
    model: openaiKey ? (env.FALA_OPENAI_MODEL || "gpt-5.6-terra") : env.OPENAI_MODEL || (provider.hostname === "api.openai.com" ? "gpt-5.6-terra" : "openai/gpt-oss-120b"), demo: env.FALA_DEMO === "true", aiTimeoutMs: timeout,
    databaseCa: (env.DATABASE_CA_CERT || "").replace(/\\n/g, "\n"), localDatabase };
}
