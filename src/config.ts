import { AppError } from "./models.js";

export interface Settings {
  token: string; databaseUrl: string; apiKey: string; baseUrl: string; model: string;
  demo: boolean; aiTimeoutMs: number; databaseCa: string; localDatabase: boolean;
  transcription: { provider: "openai" | "groq" | "none"; apiKey: string }; voiceApiKey: string;
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
  // Conversation and audio credentials are routed independently to fixed provider hosts.
  const openaiKey = (env.FALA_OPENAI_API_KEY || "").trim();
  const selected = env.FALA_AI_PROVIDER || (openaiKey ? "openai" : "compatible");
  if (!["groq", "openai", "compatible"].includes(selected)) throw new AppError(503, "Choose groq, openai or compatible for FALA_AI_PROVIDER.");
  const compatibleUrl = env.OPENAI_BASE_URL || "https://api.groq.com/openai/v1";
  const baseUrl = selected === "openai" ? "https://api.openai.com/v1" : selected === "groq" ? "https://api.groq.com/openai/v1" : compatibleUrl;
  let database: URL, provider: URL;
  try { database = new URL(env.DATABASE_URL); provider = new URL(baseUrl); }
  catch { throw new AppError(503, "The server database or AI endpoint address is invalid."); }
  if (!["postgres:", "postgresql:"].includes(database.protocol)) throw new AppError(503, "DATABASE_URL must be a PostgreSQL connection string.");
  const loopback = (url: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (provider.protocol !== "https:" && !(provider.protocol === "http:" && loopback(provider) && !env.NETLIFY)) {
    throw new AppError(503, "The AI endpoint must use HTTPS.");
  }
  if (provider.username || provider.password || provider.search || provider.hash) throw new AppError(503, "Use a plain AI endpoint URL; set its key separately.");
  let compatibleHost = "";
  try { compatibleHost = new URL(compatibleUrl).hostname; } catch { /* Unused compatible settings cannot reroute dedicated credentials. */ }
  const groqKey = (env.GROQ_API_KEY || (compatibleHost === "api.groq.com" ? env.OPENAI_API_KEY : "") || "").trim();
  const voiceApiKey = openaiKey || (compatibleHost === "api.openai.com" ? (env.OPENAI_API_KEY || "").trim() : "");
  const transcriptionProvider = env.FALA_TRANSCRIPTION_PROVIDER || (provider.hostname === "api.groq.com" && groqKey ? "groq" : voiceApiKey ? "openai" : "none");
  if (!["groq", "openai", "none"].includes(transcriptionProvider)) throw new AppError(503, "Choose groq, openai or none for FALA_TRANSCRIPTION_PROVIDER.");
  const transcription: Settings["transcription"] = { provider: transcriptionProvider as Settings["transcription"]["provider"], apiKey: transcriptionProvider === "groq" ? groqKey : transcriptionProvider === "openai" ? voiceApiKey : "" };
  const apiKey = selected === "groq" ? groqKey : selected === "openai" ? voiceApiKey : (env.OPENAI_API_KEY || "");
  const model = selected === "groq" ? (env.FALA_GROQ_MODEL || "openai/gpt-oss-120b") : selected === "openai" ? (env.FALA_OPENAI_MODEL || "gpt-5.6-terra") : (env.OPENAI_MODEL || (provider.hostname === "api.openai.com" ? "gpt-5.6-terra" : "openai/gpt-oss-120b"));
  const localDatabase = env.FALA_LOCAL_DATABASE === "true";
  if (localDatabase && (!loopback(database) || env.NETLIFY)) throw new AppError(503, "Unencrypted database connections are allowed only for local development.");
  return { token: token.length >= 32 ? token : "", googleClientId, dailyUserLimit, dailyAppLimit, databaseUrl: env.DATABASE_URL, apiKey, baseUrl, model, transcription, voiceApiKey, demo: env.FALA_DEMO === "true", aiTimeoutMs: timeout,
    databaseCa: (env.DATABASE_CA_CERT || "").replace(/\\n/g, "\n"), localDatabase };
}
