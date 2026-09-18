import postgres from "postgres";
import type { Settings } from "./config.js";

export type Parameter = string | number | boolean | null;
export interface Executor { query<T = Record<string, unknown>>(sql: string, values?: Parameter[]): Promise<T[]> }
export interface Database extends Executor { transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>; close(): Promise<void> }

export function connectDatabase(settings: Settings): Database {
  const url = new URL(settings.databaseUrl);
  // Never let a connection-string sslmode silently override the server policy.
  url.searchParams.delete("sslmode");
  const sql = postgres(url.toString(), {
    max: 1, prepare: false, connect_timeout: 5, idle_timeout: 20, max_lifetime: 300,
    ssl: settings.localDatabase ? false : settings.databaseCa
      ? { ca: settings.databaseCa, rejectUnauthorized: true } : "require",
    connection: { application_name: "fala-netlify" },
    onnotice: () => {}, // Never log SQL, parameters, connection strings, or transcripts.
  });
  const wrap = (client: Pick<typeof sql, "unsafe">): Executor => ({
    query: async <T>(statement: string, values: Parameter[] = []) =>
      await client.unsafe(statement, values) as unknown as T[],
  });
  return {
    ...wrap(sql),
    transaction: async <T>(fn: (tx: Executor) => Promise<T>) =>
      await sql.begin((tx) => fn(wrap(tx))) as T,
    close: () => sql.end({ timeout: 5 }),
  };
}
