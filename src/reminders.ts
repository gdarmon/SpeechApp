import webpush from 'web-push';
import { z } from 'zod';
import type { Database, Executor } from './database.js';
import { AppError } from './models.js';
import { Rewards } from './rewards.js';

export function allowedPushEndpoint(value:string) {
  try {
    const u=new URL(value);
    return u.protocol==='https:' && !u.username && !u.password && !u.port && !u.hash &&
      (u.hostname==='fcm.googleapis.com' || u.hostname==='updates.push.services.mozilla.com' ||
        /^[a-z0-9-]+\.push\.apple\.com$/.test(u.hostname) || u.hostname==='web.push.apple.com');
  } catch { return false; }
}
export const subscriptionSchema=z.strictObject({
  endpoint:z.string().max(2048).refine(allowedPushEndpoint),
  expirationTime:z.number().nullable().optional(),
  keys:z.strictObject({p256dh:z.string().regex(/^[A-Za-z0-9_-]{87}=?$/),auth:z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/)}),
});
export async function saveSubscription(db:Executor,user:string,input:z.infer<typeof subscriptionSchema>) {
  if(!process.env.FALA_VAPID_PUBLIC_KEY || !process.env.FALA_VAPID_PRIVATE_KEY) throw new AppError(503,'Web reminders are not configured yet.');
  const [count]=await db.query<{n:number}>('SELECT count(*)::int AS n FROM fala.push_subscriptions WHERE user_id=$1::uuid AND endpoint<>$2',[user,input.endpoint]);
  if(count.n>=3) throw new AppError(409,'Reminders are already connected on three browsers. Disconnect one first.');
  await db.query(`INSERT INTO fala.push_subscriptions(endpoint,user_id,subscription) VALUES($1,$2::uuid,$3::text::jsonb)
    ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,subscription=EXCLUDED.subscription,created_at=now()`,[input.endpoint,user,JSON.stringify(input)]);
  return {subscribed:true};
}
export type Sender=(subscription:webpush.PushSubscription,payload:string)=>Promise<unknown>;
export async function deliverReminders(db:Database,now=new Date(),send:Sender=(subscription,payload)=>webpush.sendNotification(subscription,payload,{
  TTL:1800,timeout:4000,urgency:'normal',vapidDetails:{subject:'mailto:gdarmon@gmail.com',publicKey:process.env.FALA_VAPID_PUBLIC_KEY!,privateKey:process.env.FALA_VAPID_PRIVATE_KEY!},
})) {
  // Bounded batches keep a scheduled invocation within Netlify's execution limit.
  const due=await db.query<{user_id:string}>(`SELECT p.user_id FROM fala.reward_profiles p
    WHERE p.reminder_enabled AND EXISTS(SELECT 1 FROM fala.push_subscriptions s WHERE s.user_id=p.user_id)
    AND (extract(hour FROM ($1::timestamptz AT TIME ZONE p.timezone))*60+extract(minute FROM ($1::timestamptz AT TIME ZONE p.timezone))) BETWEEN p.reminder_minute AND p.reminder_minute+59
    AND NOT EXISTS(SELECT 1 FROM fala.reminder_deliveries d WHERE d.user_id=p.user_id AND d.local_date=($1::timestamptz AT TIME ZONE p.timezone)::date)
    AND (SELECT count(*) FROM fala.reward_events e WHERE e.user_id=p.user_id AND e.kind='reply' AND e.local_date=($1::timestamptz AT TIME ZONE p.timezone)::date)<3
    ORDER BY p.user_id LIMIT 20`,[now.toISOString()]);
  let delivered=0;
  // Four workers; use only the most recently connected browser to avoid duplicate alerts.
  async function deliver(user:string) {
    const claimed=await db.transaction(async tx=>{
      const [lock]=await tx.query<{locked:boolean}>('SELECT pg_try_advisory_xact_lock(hashtextextended($1,7310491701)) AS locked',[user]);
      return lock.locked?new Rewards(tx,user,now).claimReminder():{notify:false};
    });
    if(!claimed.notify || !('day' in claimed))return;
    const rows=await db.query<{endpoint:string;subscription:webpush.PushSubscription}>('SELECT endpoint,subscription FROM fala.push_subscriptions WHERE user_id=$1::uuid ORDER BY created_at DESC LIMIT 1',[user]);
    const results=await Promise.all(rows.map(async row=>{
      if(!allowedPushEndpoint(row.endpoint))return false;
      try {await send(row.subscription,JSON.stringify({title:claimed.title,body:claimed.body,tag:`fala-practice-${claimed.day}`}));return true;}
      catch(error) {
        if([404,410].includes((error as {statusCode:number}).statusCode))await db.query('DELETE FROM fala.push_subscriptions WHERE endpoint=$1 AND user_id=$2::uuid',[row.endpoint,user]);
        return false;
      }
    }));
    if(results.some(Boolean))delivered++;
    else await db.query('DELETE FROM fala.reminder_deliveries WHERE user_id=$1::uuid AND local_date=$2::date',[user,claimed.day!]);
  }
  let index=0;
  await Promise.all(Array.from({length:4},async()=>{while(index<due.length){const user=due[index++].user_id;try{await deliver(user);}catch{/* Retry next scheduled window; never log credentials or subscription endpoints. */}}}));
  await db.query("DELETE FROM fala.reminder_deliveries WHERE created_at<now()-interval '30 days'");
  return {delivered};
}
