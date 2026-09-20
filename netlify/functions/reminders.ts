import type { Config } from '@netlify/functions';
import { connectDatabase } from '../../src/database.js';
import { settingsFromEnv } from '../../src/config.js';
import { deliverReminders } from '../../src/reminders.js';

export default async () => {
  if(!process.env.FALA_VAPID_PUBLIC_KEY || !process.env.FALA_VAPID_PRIVATE_KEY) return;
  const db=connectDatabase(settingsFromEnv());
  try { await deliverReminders(db); } finally { await db.close(); }
};
export const config:Config={schedule:'*/15 * * * *'};
