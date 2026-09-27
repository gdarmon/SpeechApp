import { createHash, timingSafeEqual } from "node:crypto";
import type { Database } from "./database.js";
import { deliverReminders } from "./reminders.js";

export function createReminderHandler(token: () => string, database: () => Database,
  deliver = deliverReminders) {
  return async (request: Request): Promise<Response> => {
    const secret = token();
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    if (secret.length < 32) return Response.json({ detail: "Scheduler not configured." }, { status: 503 });
    const hash = (text: string) => createHash("sha256").update(text).digest();
    if (!timingSafeEqual(hash(request.headers.get("Authorization") || ""), hash(`Bearer ${secret}`))) return new Response(null, { status: 401 });
    if (!process.env.FALA_VAPID_PUBLIC_KEY || !process.env.FALA_VAPID_PRIVATE_KEY) return Response.json({ detail: "Reminders not configured." }, { status: 503 });
    const result = await deliver(database());
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  };
}
