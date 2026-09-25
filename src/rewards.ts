import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Executor } from './database.js';
import { AppError } from './models.js';

export const THEMES = [
  { id: 'classic', name: 'Fala Classic', xp: 0 },
  { id: 'beach', name: 'Copacabana', xp: 2000 },
  { id: 'roda', name: 'Roda', xp: 5000 },
  { id: 'sunset', name: 'Salvador sunset', xp: 10000 },
] as const;
export const SKINS = [
  { id: 'classic', name: 'Classic', xp: 0 },
  { id: 'wave', name: 'Ocean wave', xp: 2000 },
  { id: 'rhythm', name: 'Roda rhythm', xp: 5000 },
] as const;
export const INSTRUCTORS = [
  { id: 'bananera', name: 'Bananera', xp: 0, color: 'Green & gold' },
  { id: 'bateba', name: 'Bateba', xp: 2000, color: 'Blue & copper' },
  { id: 'vesoura', name: 'Vesoura', xp: 5000, color: 'Red & gold' },
] as const;
// Only points awarded by the old rules retain the old unlock thresholds.
// New practice must never grant another reward at a retired threshold.
const LEGACY_UNLOCK_XP: Record<string, number> = {
  classic: 0, beach: 100, roda: 300, sunset: 1000, wave: 150, rhythm: 600,
  bananera: 0, bateba: 200, vesoura: 500,
};
const LESSON_XP_LIMIT = 20, DAILY_XP_LIMIT = 40;
export const zoneSchema = z.string().max(80).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return /^[A-Za-z0-9_+\-/]+$/.test(value); } catch { return false; }
}, 'Choose a valid time zone.');
export const rewardSettingsSchema = z.strictObject({
  nickname: z.string().trim().min(1).max(30).regex(/^[\p{L}\p{N} ._'’-]+$/u).optional(),
  timezone: zoneSchema.optional(),
  theme: z.enum(['classic','beach','roda','sunset']).optional(),
  skin: z.enum(['classic','wave','rhythm']).optional(),
  instructor: z.enum(['none','bananera','bateba','vesoura']).optional(),
  appearance: z.enum(['system','light','dark']).optional(),
  reduce_motion: z.boolean().optional(), reminder_enabled: z.boolean().optional(),
  reminder_minute: z.number().int().min(0).max(1439).multipleOf(15).optional(),
  walkthrough_seen: z.literal(true).optional(),
  ui_language: z.enum(['en-US','he-IL']).optional(),
});
type Profile = { nickname: string; timezone: string; timezone_confirmed: boolean; theme: string; skin: string; instructor: string;
  appearance: string; reduce_motion: boolean; reminder_enabled: boolean; reminder_minute: number; zone_changed_at: string | null; walkthrough_seen: boolean; ui_language: 'en-US' | 'he-IL' | null };
const dateKey = (date: Date) => date.toISOString().slice(0,10);
export const dayOffset = (date: string, days: number) => dateKey(new Date(Date.parse(date+'T12:00:00Z')+days*86400000));
export const weekOf = (date: string) => dayOffset(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));
export function localClock(now: Date, zone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).formatToParts(now).map(p=>[p.type,p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minute: +parts.hour*60 + +parts.minute };
}

// A protected day bridges one missed day per Monday-based week. It never counts as practice or XP.
export function streakFor(activeDays: string[], today: string) {
  const active = new Set(activeDays.filter(day=>day<=today));
  const oldest = [...active].sort()[0];
  const protectedDays: string[] = [], usedWeeks = new Set<string>();
  let streak=0, cursor=active.has(today)?today:dayOffset(today,-1);
  while (oldest && cursor>=oldest) {
    if (active.has(cursor)) streak++;
    else {
      const week=weekOf(cursor);
      if (usedWeeks.has(week) || !active.has(dayOffset(cursor,-1))) break;
      usedWeeks.add(week); protectedDays.push(cursor); streak++;
    }
    cursor=dayOffset(cursor,-1);
  }
  return { days: streak, protected_days: protectedDays, calendar: Array.from({length:7},(_,i)=>{
    const day=dayOffset(today,i-6);return {day,status:active.has(day)?'practised':protectedDays.includes(day)?'protected':day===today?'today':'empty'};
  }) };
}

export class Rewards {
  constructor(private db: Executor, private user: string, private now = new Date()) {}
  async profile(): Promise<Profile> {
    // Saved practice also identifies returning learners from clients without this flag.
    await this.db.query(`INSERT INTO fala.reward_profiles(user_id,walkthrough_seen)
      VALUES($1::uuid,EXISTS(SELECT 1 FROM fala.sessions s JOIN fala.turns t ON t.session_id=s.id WHERE s.user_id=$1::uuid))
      ON CONFLICT(user_id) DO UPDATE SET walkthrough_seen=true
      WHERE EXCLUDED.walkthrough_seen AND NOT fala.reward_profiles.walkthrough_seen`,[this.user]);
    const [profile]=await this.db.query<Profile>('SELECT nickname,timezone,timezone_confirmed,theme,skin,instructor,appearance,reduce_motion,reminder_enabled,reminder_minute,zone_changed_at,walkthrough_seen,ui_language FROM fala.reward_profiles WHERE user_id=$1::uuid',[this.user]);
    return profile;
  }
  async snapshot() {
    const profile=await this.profile(), {day}=localClock(this.now,profile.timezone);
    const [earned]=await this.db.query<{ xp:number; legacy_xp:number; spoken:number; completed:number; today_replies:number; today_xp:number; weekly_scenarios:number }>(`SELECT
      COALESCE(sum(xp),0)::int AS xp,
      COALESCE(sum(xp) FILTER(WHERE rules_version=1),0)::int AS legacy_xp,
      count(*) FILTER(WHERE kind='reply' AND spoken)::int AS spoken,
      count(*) FILTER(WHERE kind='complete')::int AS completed,
      count(*) FILTER(WHERE kind='reply' AND local_date=$2::date)::int AS today_replies,
      COALESCE(sum(xp) FILTER(WHERE local_date=$2::date),0)::int AS today_xp,
      count(DISTINCT lesson) FILTER(WHERE kind='complete' AND local_date >= $3::date AND lesson IS NOT NULL)::int AS weekly_scenarios
      FROM fala.reward_events WHERE user_id=$1::uuid`,[this.user,day,weekOf(day)]);
    const { legacy_xp, ...totals } = earned;
    const unlocked = (item: { id: string; xp: number }) => totals.xp >= item.xp || legacy_xp >= LEGACY_UNLOCK_XP[item.id];
    const days=await this.db.query<{day:string}>(`SELECT local_date::text AS day FROM fala.reward_events WHERE user_id=$1::uuid AND kind='reply' GROUP BY local_date HAVING count(*)>=3`,[this.user]);
    return { ...totals, profile, today:day, daily_target:3, daily_complete:totals.today_replies>=3,
      streak:streakFor(days.map(row=>row.day),day),
      themes:THEMES.map(t=>({...t,unlocked:unlocked(t)})), skins:SKINS.map(s=>({...s,unlocked:unlocked(s)})),
      instructors:INSTRUCTORS.map(i=>({...i,unlocked:unlocked(i)})),
      badges:[{name:'First conversation',earned:totals.completed>=1},{name:'Ten conversations',earned:totals.completed>=10},
        {name:'100 spoken replies',earned:totals.spoken>=100},{name:'Three class scenarios this week',earned:totals.weekly_scenarios>=3}],
      weekly_mission:{title:'Practise three different class scenarios',progress:Math.min(3,totals.weekly_scenarios),target:3,xp:0},
      web_push_key:process.env.FALA_VAPID_PUBLIC_KEY && process.env.FALA_VAPID_PRIVATE_KEY ? process.env.FALA_VAPID_PUBLIC_KEY : null };
  }

  // Called inside the same per-learner transaction as the saved reply. Browser counters are never trusted.
  async recordReply(session: string, requestId: string) {
    const [answer]=await this.db.query<{ spoken:boolean; lesson:string|null; round:number }>(`SELECT
      COALESCE(t.request->>'source','speech')='speech' AND t.speech_ms>0 AS spoken, s.request->'resolved_lesson'->>'id' AS lesson,
      (SELECT count(*)::int FROM fala.turns previous WHERE previous.session_id=s.id AND NOT previous.help AND previous.id<=t.id) AS round
      FROM fala.turns t JOIN fala.sessions s ON s.id=t.session_id
      WHERE s.user_id=$1::uuid AND s.id=$2::uuid AND t.request_id=$3 AND NOT s.demo AND NOT t.help
        AND t.language='pt-BR' AND t.text ~ '[A-Za-zÀ-ÿ]'`,[this.user,session,requestId]);
    if (!answer || answer.round>10) return;
    const profile=await this.profile(), {day}=localClock(this.now,profile.timezone);
    const [counts]=await this.db.query<{ replies:number; day_xp:number; session_xp:number }>(`SELECT
      count(*) FILTER(WHERE kind='reply' AND local_date=$2::date)::int AS replies,
      COALESCE(sum(xp) FILTER(WHERE local_date=$2::date),0)::int AS day_xp,
      COALESCE(sum(xp) FILTER(WHERE session_id=$3::uuid),0)::int AS session_xp
      FROM fala.reward_events WHERE user_id=$1::uuid AND (local_date=$2::date OR session_id=$3::uuid)`,[this.user,day,session]);
    const xp = Math.max(0, Math.min(answer.spoken ? 2 : 1, DAILY_XP_LIMIT-counts.day_xp, LESSON_XP_LIMIT-counts.session_xp));
    const inserted=await this.db.query(`INSERT INTO fala.reward_events(user_id,event_key,kind,xp,local_date,occurred_at,session_id,lesson,spoken,rules_version)
      VALUES($1::uuid,$2,'reply',$3,$4::date,$5::timestamptz,$6::uuid,$7,$8,2) ON CONFLICT DO NOTHING RETURNING event_key`,
      [this.user,`reply:${session}:${requestId}`,xp,day,this.now.toISOString(),session,answer.lesson,answer.spoken??false]);
    if (!inserted.length) return;
    if (counts.replies+1>=3) await this.event(`daily:${day}`,'daily',0,day);
    const [sessionCount]=await this.db.query<{n:number}>(`SELECT count(*)::int AS n FROM fala.reward_events WHERE user_id=$1::uuid AND session_id=$2::uuid AND kind='reply'`,[this.user,session]);
    if (sessionCount.n===10) {
      await this.event(`complete:${session}`,'complete',0,day,session,answer.lesson);
      const [lessons]=await this.db.query<{n:number}>(`SELECT count(DISTINCT lesson)::int AS n FROM fala.reward_events WHERE user_id=$1::uuid AND kind='complete' AND local_date >= $2::date`,[this.user,weekOf(day)]);
      if(lessons.n>=3) await this.event(`mission:${weekOf(day)}`,'mission',0,day);
    }
  }
  private async event(key:string,kind:string,xp:number,day:string,session:string|null=null,lesson:string|null=null) {
    await this.db.query(`INSERT INTO fala.reward_events(user_id,event_key,kind,xp,local_date,occurred_at,session_id,lesson,rules_version)
      VALUES($1::uuid,$2,$3,$4,$5::date,$6::timestamptz,$7::uuid,$8,2) ON CONFLICT DO NOTHING`,[this.user,key,kind,xp,day,this.now.toISOString(),session,lesson]);
  }
  async settings(input:z.infer<typeof rewardSettingsSchema>) {
    const state=await this.snapshot(), profile=state.profile;
    if(input.instructor && input.instructor !== 'none' && !state.instructors.some(i=>i.id===input.instructor&&i.unlocked)) throw new AppError(403,'Keep practising to unlock this partner.');
    if(input.theme && !state.themes.some(t=>t.id===input.theme&&t.unlocked) || input.skin && !state.skins.some(s=>s.id===input.skin&&s.unlocked)) throw new AppError(403,'Keep practising to unlock this reward.');
    if(input.timezone && input.timezone!==profile.timezone && profile.zone_changed_at && this.now.getTime()-Date.parse(profile.zone_changed_at)<20*3600000) throw new AppError(409,'You can change your time zone again tomorrow.');
    const next={...profile,...input};
    await this.db.query(`UPDATE fala.reward_profiles SET nickname=$2,timezone=$3,theme=$4,skin=$5,appearance=$6,reduce_motion=$7,
      reminder_enabled=$8,reminder_minute=$9,timezone_confirmed=timezone_confirmed OR $10,
      zone_changed_at=CASE WHEN $10 AND timezone_confirmed AND timezone<>$3 THEN $11::timestamptz ELSE zone_changed_at END,instructor=$12,
      walkthrough_seen=walkthrough_seen OR $13,ui_language=$14 WHERE user_id=$1::uuid`,
      [this.user,next.nickname,next.timezone,next.theme,next.skin,next.appearance,next.reduce_motion,next.reminder_enabled,next.reminder_minute,!!input.timezone,this.now.toISOString(),next.instructor,input.walkthrough_seen===true,next.ui_language]);
    return this.snapshot();
  }
  async social() {
    const [circle]=await this.db.query<{id:string;name:string;timezone:string;invite_code:string;owner_id:string}>(`SELECT c.* FROM fala.friend_circles c JOIN fala.circle_members m ON m.circle_id=c.id WHERE m.user_id=$1::uuid`,[this.user]);
    if(!circle) return {circle:null,members:[]};
    const week=weekOf(localClock(this.now,circle.timezone).day);
    const members=await this.db.query<{name:string;xp:number;conversations:number;self:boolean}>(`SELECT p.nickname AS name,
      COALESCE(sum(e.xp),0)::int AS xp, count(*) FILTER(WHERE e.kind='complete')::int AS conversations, m.user_id=$2::uuid AS self
      FROM fala.circle_members m JOIN fala.reward_profiles p ON p.user_id=m.user_id
      LEFT JOIN fala.reward_events e ON e.user_id=m.user_id AND e.occurred_at>=($3::date::timestamp AT TIME ZONE $4)
        AND e.occurred_at < (($3::date+7)::timestamp AT TIME ZONE $4)
      WHERE m.circle_id=$1::uuid GROUP BY m.user_id,p.nickname ORDER BY xp DESC,p.nickname,m.user_id`,[circle.id,this.user,week,circle.timezone]);
    return {circle:{name:circle.name,timezone:circle.timezone,invite_code:circle.invite_code,owner:circle.owner_id===this.user,week},members,
      challenge:{title:'Complete 12 conversations together this week',progress:members.reduce((n,m)=>n+m.conversations,0),target:12}};
  }
  // Deliberately outside the circle transaction: rejected guesses must still consume an attempt.
  async circleBudget() {
      // Authenticated invitation attempts are bounded independently of the paid AI allowance.
      const [limit]=await this.db.query<{requests:number}>(`INSERT INTO fala.auth_rate_limits(bucket,window_start,requests) VALUES($1,now(),1)
        ON CONFLICT(bucket) DO UPDATE SET requests=CASE WHEN fala.auth_rate_limits.window_start<now()-interval '1 hour' THEN 1 ELSE fala.auth_rate_limits.requests+1 END,
        window_start=CASE WHEN fala.auth_rate_limits.window_start<now()-interval '1 hour' THEN now() ELSE fala.auth_rate_limits.window_start END RETURNING requests`,[`circle:${this.user}`]);
      if(limit.requests>10) throw new AppError(429,'Please wait before trying another circle invitation.');
  }
  async circle(action:'create'|'join'|'leave'|'rotate', value='') {
    await this.profile();
    const current=await this.social();
    if(action==='leave') {
      if(current.circle?.owner) await this.db.query('DELETE FROM fala.friend_circles WHERE owner_id=$1::uuid',[this.user]);
      else await this.db.query('DELETE FROM fala.circle_members WHERE user_id=$1::uuid',[this.user]);
    } else if(action==='rotate') {
      if(!current.circle?.owner) throw new AppError(403,'Only the circle creator can replace its invitation.');
      await this.db.query('UPDATE fala.friend_circles SET invite_code=$2 WHERE owner_id=$1::uuid',[this.user,randomBytes(18).toString('base64url')]);
    } else {
      if(current.circle) throw new AppError(409,'Leave your current circle before joining another.');
      let id:string;
      if(action==='create') {
        id=randomUUID();const profile=await this.profile();
        await this.db.query('INSERT INTO fala.friend_circles(id,owner_id,name,timezone,invite_code) VALUES($1::uuid,$2::uuid,$3,$4,$5)',[id,this.user,value,profile.timezone,randomBytes(18).toString('base64url')]);
      } else {
        const [found]=await this.db.query<{id:string}>('SELECT id FROM fala.friend_circles WHERE invite_code=$1 FOR UPDATE',[value]);
        if(!found) throw new AppError(404,'This invitation is not available. Ask your friend for a new one.');
        id=found.id;
        const [count]=await this.db.query<{n:number}>('SELECT count(*)::int AS n FROM fala.circle_members WHERE circle_id=$1::uuid',[id]);
        if(count.n>=12) throw new AppError(409,'This circle already has 12 learners.');
      }
      await this.db.query('INSERT INTO fala.circle_members(user_id,circle_id) VALUES($1::uuid,$2::uuid)',[this.user,id]);
    }
    return this.social();
  }
  async claimReminder(language?: 'en-US' | 'he-IL') {
    const profile=await this.profile(), {day,minute}=localClock(this.now,profile.timezone);
    const elapsed=minute-profile.reminder_minute;
    if(!profile.reminder_enabled || elapsed<0 || elapsed>=60) return {notify:false};
    // One saved Portuguese reply is practice, even before the three-reply daily goal.
    // Recompute the local day from timestamps so travel/time-zone changes cannot hide today's practice.
    const practised=await this.db.query(`SELECT 1 FROM fala.reward_events WHERE user_id=$1::uuid AND kind='reply'
      AND occurred_at >= ($2::date::timestamp AT TIME ZONE $3)
      AND occurred_at < (($2::date+1)::timestamp AT TIME ZONE $3) LIMIT 1`,[this.user,day,profile.timezone]);
    if(practised.length)return {notify:false};
    language ??= profile.ui_language ?? undefined;
    if(!language) {
      const [last]=await this.db.query<{language:string}>(`SELECT request->>'support_language' AS language
        FROM fala.sessions WHERE user_id=$1::uuid AND NOT demo ORDER BY started_at DESC LIMIT 1`,[this.user]);
      language=last?.language==='he-IL'?'he-IL':'en-US';
    }
    const rows=await this.db.query(`INSERT INTO fala.reminder_deliveries(user_id,local_date) VALUES($1::uuid,$2::date) ON CONFLICT DO NOTHING RETURNING user_id`,[this.user,day]);
    if(!rows.length)return {notify:false};
    return {notify:true,day,
      title:language==='he-IL'?'יש זמן לקצת פורטוגזית?':'A little Portuguese today?',
      body:language==='he-IL'?'עוד לא תרגלתם היום. בואו נתחיל בשיחה קצרה.':'No practice yet today. Let’s start with a short conversation.'};
  }
  async reset() {
    await this.db.query('DELETE FROM fala.reward_events WHERE user_id=$1::uuid',[this.user]);
    await this.db.query("UPDATE fala.reward_profiles SET theme='classic',skin='classic',instructor=CASE WHEN instructor='none' THEN 'none' ELSE 'bananera' END WHERE user_id=$1::uuid",[this.user]);
  }
}
