import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll,beforeEach,afterAll,it,expect } from 'vitest';
import type { Database,Executor,Parameter } from '../src/database.js';
import { Rewards,localClock,streakFor,rewardSettingsSchema } from '../src/rewards.js';
import { allowedPushEndpoint,deliverReminders } from '../src/reminders.js';

let pg:PGlite,db:Database;
const a='00000000-0000-4000-8000-000000000010',b='00000000-0000-4000-8000-000000000011',c='00000000-0000-4000-8000-000000000012';
const now=new Date('2026-09-20T14:00:00Z');
beforeAll(async()=>{
  pg=new PGlite();const wrap=(client:Pick<PGlite,'query'>):Executor=>({query:async<T>(sql:string,values:Parameter[]=[]) => (await client.query<T>(sql,values)).rows});
  db={...wrap(pg),transaction:fn=>pg.transaction(tx=>fn(wrap(tx))),close:()=>pg.close()};
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  for(const file of ['202609180001_fala.sql','202609180002_google_sign_in.sql','202609200001_rewards.sql', '202609210001_instructors.sql', '202609210002_content_reports.sql', '202609230001_walkthrough.sql', '202609230002_reward_rules.sql'])await pg.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
},30000);
afterAll(async()=>{await db.close();});
beforeEach(async()=>{
  await db.query('DELETE FROM fala.users WHERE id IN ($1::uuid,$2::uuid,$3::uuid)',[a,b,c]);
  for(const id of [a,b,c])await db.query('INSERT INTO fala.users(id,google_subject,email) VALUES($1::uuid,$1,$2)',[id,`${id}@example.test`]);
});
async function session(user=a,lesson='kicks-v1',demo=false){const id=randomUUID();await db.query(`INSERT INTO fala.sessions(id,request_id,request,kind,topic,opening,user_id,demo) VALUES($1::uuid,$1,$2::jsonb,'conversation','Class','{}',$3::uuid,$4)`,[id,JSON.stringify({resolved_lesson:{id:lesson}}),user,demo]);return id;}
async function reply(id:string,user=a,help=false,clock=now,source:'typed'|'speech'='speech'){const request=randomUUID();await db.query(`INSERT INTO fala.turns(session_id,request_id,request,text,help,language,speech_ms,reply) VALUES($1::uuid,$2,$5::jsonb,'Sim, com certeza.',$3,$4,$6,'{}')`,[id,request,help,help?'en-US':'pt-BR',JSON.stringify({source}),source==='speech'?1000:0]);await db.transaction(tx=>new Rewards(tx,user,clock).recordReply(id,request));return request;}
async function conversation(user=a,lesson='kicks-v1',clock=now){const id=await session(user,lesson);for(let i=0;i<10;i++)await reply(id,user,false,clock);return id;}
// Previous earned points, without hundreds of synthetic conversations in a threshold test.
async function earnedPoints(xp:number,rules=2,user=a){
  await db.query(`INSERT INTO fala.reward_events(user_id,event_key,kind,xp,local_date,occurred_at,rules_version)
    SELECT $1::uuid,$2 || n,'reply',LEAST(20,$3-(n-1)*20),'2026-09-18','2026-09-18T12:00:00Z',$4
    FROM generate_series(1,($3+19)/20) AS n`,[user,randomUUID(),xp,rules]);
}

it('remembers the guide on the account across clients, settings changes and learning resets',async()=>{
  const rewards=new Rewards(db,a,now);
  expect((await rewards.snapshot()).profile.walkthrough_seen).toBe(false);
  await rewards.settings(rewardSettingsSchema.parse({walkthrough_seen:true}));
  await new Rewards(db,a,now).settings({appearance:'dark'}); // Older client omits the new preference.
  await rewards.reset();
  expect((await new Rewards(db,a,now).snapshot()).profile.walkthrough_seen).toBe(true);
  expect((await new Rewards(db,b,now).snapshot()).profile.walkthrough_seen).toBe(false);
  expect(rewardSettingsSchema.safeParse({walkthrough_seen:false}).success).toBe(false);
  await pg.exec(await readFile(new URL('../supabase/migrations/202609230001_walkthrough.sql',import.meta.url),'utf8'));
  expect((await rewards.snapshot()).profile.walkthrough_seen).toBe(true);
});

it('restores guide dismissal for returning learners from versions that only stored it locally',async()=>{
  const rewards=new Rewards(db,a,now);
  expect((await rewards.snapshot()).profile.walkthrough_seen).toBe(false);
  const id=await session();
  expect((await rewards.snapshot()).profile.walkthrough_seen).toBe(false); // A first opening still gets its guide.
  await reply(id);
  expect((await new Rewards(db,a,now).snapshot()).profile.walkthrough_seen).toBe(true);
  await db.query('DELETE FROM fala.sessions WHERE id=$1::uuid',[id]);
  expect((await rewards.snapshot()).profile.walkthrough_seen).toBe(true);
});

it('caps a spoken lesson at 20 XP, caps a day at 40, and prevents replay/cap farming',async()=>{
  const rewards=new Rewards(db,a,now),id=await session();const key=await reply(id);
  await rewards.recordReply(id,key);expect((await rewards.snapshot()).xp).toBe(2);
  for(let i=1;i<10;i++)await reply(id);
  expect(await rewards.snapshot()).toMatchObject({xp:20,today_xp:20,today_replies:10,daily_complete:true,completed:1});
  await conversation();await conversation();expect(await rewards.snapshot()).toMatchObject({xp:40,completed:3});
  await reply(id);expect((await rewards.snapshot()).xp).toBe(40);
  expect((await new Rewards(db,b,now).snapshot()).xp).toBe(0);
});
it('awards 1 XP for typed and 2 for spoken replies, without daily or completion bonuses',async()=>{
  const id=await session(),rewards=new Rewards(db,a,now);
  await reply(id,a,false,now,'typed');expect((await rewards.snapshot()).xp).toBe(1);
  for(let i=1;i<10;i++)await reply(id,a,false,now,i<5?'typed':'speech');
  expect(await rewards.snapshot()).toMatchObject({xp:15,completed:1});
  expect(await db.query('SELECT DISTINCT rules_version FROM fala.reward_events WHERE user_id=$1::uuid',[a])).toEqual([{rules_version:2}]);
  expect(await db.query("SELECT xp FROM fala.reward_events WHERE user_id=$1::uuid AND kind<>'reply'",[a])).toEqual([{xp:0},{xp:0}]);
});
it('caps a lesson across midnight and allows a fresh day to earn points again',async()=>{
  const id=await session(),next=new Date('2026-09-21T14:00:00Z');
  for(let i=0;i<5;i++)await reply(id);
  for(let i=0;i<5;i++)await reply(id,a,false,next);
  await reply(id,a,false,next); // Eleventh reply cannot earn more, even on another date.
  expect(await new Rewards(db,a,next).snapshot()).toMatchObject({xp:20,today_xp:10,completed:1});
  await conversation(a,'other',next);
  expect(await new Rewards(db,a,next).snapshot()).toMatchObject({xp:40,today_xp:30,completed:2});
});
it('only awards the remaining daily point and still counts completed practice',async()=>{
  await conversation();
  const mixed=await session();
  await reply(mixed,a,false,now,'typed');for(let i=1;i<10;i++)await reply(mixed);
  const last=await session();await reply(last);
  expect(await new Rewards(db,a,now).snapshot()).toMatchObject({xp:40,today_replies:21,completed:2});
  expect(await db.query('SELECT xp FROM fala.reward_events WHERE session_id=$1::uuid',[last])).toEqual([{xp:1}]);
});
it('excludes demos, help turns and another learner’s records',async()=>{
  const id=await session(a,'kicks-v1',true);await reply(id);const live=await session();const key=await reply(live,a,true);
  await new Rewards(db,b,now).recordReply(live,key);
  expect((await new Rewards(db,a,now).snapshot()).xp).toBe(0);expect((await new Rewards(db,b,now).snapshot()).xp).toBe(0);
});
it('keeps rewards on session deletion, clears them on learning reset, and validates unlocks server-side',async()=>{
  const rewards=new Rewards(db,a,now);await expect(rewards.settings({theme:'roda'})).rejects.toMatchObject({status:403});
  const id=await conversation();await conversation(a,'instruments-v1');await conversation(a,'exercises-v1');
  expect((await rewards.snapshot()).xp).toBe(40);await earnedPoints(1960);await rewards.settings({theme:'beach'});
  await db.query('DELETE FROM fala.sessions WHERE id=$1::uuid',[id]);expect((await rewards.snapshot()).profile.theme).toBe('beach');
  await rewards.reset();expect(await rewards.snapshot()).toMatchObject({xp:0,profile:{theme:'classic',skin:'classic'}});
  expect(rewardSettingsSchema.safeParse({xp:9000}).success).toBe(false);
});
it('keeps daily and weekly milestones without stacking extra XP and resets the mission on Monday',async()=>{
  for(const lesson of ['one','two','three','four'])await conversation(a,lesson);
  expect(await new Rewards(db,a,now).snapshot()).toMatchObject({xp:40,weekly_scenarios:4,weekly_mission:{xp:0,progress:3}});
  expect(await db.query("SELECT kind,xp FROM fala.reward_events WHERE kind='mission'")).toEqual([{kind:'mission',xp:0}]);
  const next=new Date('2026-09-21T14:00:00Z');await conversation(a,'one',next);
  expect(await new Rewards(db,a,next).snapshot()).toMatchObject({xp:60,weekly_scenarios:1});
});
it('uses local dates, handles Jerusalem DST, and protects at most one missed day in a week',()=>{
  expect(localClock(new Date('2026-09-20T21:05:00Z'),'Asia/Jerusalem').day).toBe('2026-09-21');
  expect(localClock(new Date('2026-10-24T14:00:00Z'),'Asia/Jerusalem').minute).toBe(1020);
  expect(localClock(new Date('2026-10-25T15:00:00Z'),'Asia/Jerusalem').minute).toBe(1020);
  expect(streakFor(['2026-09-14','2026-09-16','2026-09-17'],'2026-09-17')).toMatchObject({days:4,protected_days:['2026-09-15']});
  expect(streakFor(['2026-09-14','2026-09-16','2026-09-18'],'2026-09-18').days).toBe(3);
  expect(streakFor(['2026-09-14'],'2026-09-18').days).toBe(0);
  expect(streakFor([],'2026-09-20').days).toBe(0);
  expect(rewardSettingsSchema.safeParse({timezone:'Bad/Zone'}).success).toBe(false);
});
it('shows only the joined circle and nicknames, rotates invitations, and resets its weekly ranking',async()=>{
  const owner=new Rewards(db,a,now),friend=new Rewards(db,b,now),outsider=new Rewards(db,c,now);
  await owner.settings({nickname:'Gilad',timezone:'Asia/Jerusalem'});await friend.settings({nickname:'Friend'});
  const group=await owner.circle('create','Our roda');expect((await outsider.social()).circle).toBe(null);
  await friend.circle('join',group.circle!.invite_code);await conversation(a);
  const shared=await friend.social();expect(shared.members[0]).toMatchObject({name:'Gilad',xp:20,self:false,conversations:1});
  expect(shared.challenge?.progress).toBe(1); // Completion no longer needs an XP bonus to count.
  expect(JSON.stringify(shared)).not.toMatch(/google_subject|email|@example|session_id|transcript/);
  const rotated=await owner.circle('rotate');expect(rotated.circle!.invite_code).not.toBe(group.circle!.invite_code);
  await expect(outsider.circle('join',group.circle!.invite_code)).rejects.toMatchObject({status:404});
  expect((await new Rewards(db,a,new Date('2026-09-21T14:00:00Z')).social()).members.every(m=>m.xp===0)).toBe(true);
  await friend.circle('leave');expect((await friend.social()).circle).toBe(null);expect((await owner.social()).members.length).toBe(1);
});
it('sends at the chosen local time once a day, and skips even one reply before the daily goal',async()=>{
  const rewards=new Rewards(db,a,now);await rewards.settings({timezone:'Asia/Jerusalem',reminder_enabled:true});
  expect((await new Rewards(db,a,new Date('2026-09-20T13:59:00Z')).claimReminder()).notify).toBe(false);
  expect((await rewards.claimReminder()).notify).toBe(true);expect((await rewards.claimReminder()).notify).toBe(false);
  await new Rewards(db,b,now).settings({timezone:'Asia/Jerusalem',reminder_enabled:true});const id=await session(b);await reply(id,b);
  expect((await new Rewards(db,b,now).snapshot()).daily_complete).toBe(false);
  expect((await new Rewards(db,b,now).claimReminder()).notify).toBe(false);
  expect((await new Rewards(db,a,new Date('2026-09-21T14:00:00Z')).claimReminder()).notify).toBe(true);
  await rewards.settings({reminder_enabled:false});expect((await new Rewards(db,a,new Date('2026-09-21T14:00:00Z')).claimReminder()).notify).toBe(false);
});
it('respects opt-out, custom time, quiet hours, and the Jerusalem daylight-saving change',async()=>{
  const rewards=new Rewards(db,a,now);
  expect((await rewards.claimReminder()).notify).toBe(false);
  await rewards.settings({timezone:'Asia/Jerusalem',reminder_enabled:true,reminder_minute:18*60});
  expect((await rewards.claimReminder()).notify).toBe(false);
  expect((await new Rewards(db,a,new Date('2026-09-20T15:00:00Z')).claimReminder()).notify).toBe(true);
  expect((await new Rewards(db,a,new Date('2026-09-21T16:00:00Z')).claimReminder()).notify).toBe(false);
  await rewards.settings({reminder_minute:17*60});
  expect((await new Rewards(db,a,new Date('2026-10-25T14:00:00Z')).claimReminder()).notify).toBe(false);
  expect((await new Rewards(db,a,new Date('2026-10-25T15:00:00Z')).claimReminder()).notify).toBe(true);
});
it('uses real timestamps when a time-zone change moves practice onto the current local day',async()=>{
  const rewards=new Rewards(db,a,now);
  await rewards.settings({timezone:'America/Los_Angeles',reminder_enabled:true});
  await reply(await session(),a,false,new Date('2026-09-20T01:00:00Z')); // Sep 19 in the old zone, Sep 20 in Jerusalem.
  await rewards.settings({timezone:'Asia/Jerusalem'});
  expect((await rewards.snapshot()).today_replies).toBe(0); // Rewards keep their original accounting date.
  expect((await rewards.claimReminder()).notify).toBe(false);
});
it('delivers friendly Hebrew or English without requiring a new account preference',async()=>{
  for(const user of [a,b,c])await new Rewards(db,user,now).settings({timezone:'Asia/Jerusalem',reminder_enabled:true});
  const id=await session();
  await db.query(`UPDATE fala.sessions SET request=request || '{"support_language":"he-IL"}'::jsonb WHERE id=$1::uuid`,[id]);
  expect(await new Rewards(db,a,now).claimReminder()).toMatchObject({notify:true,body:'עוד לא תרגלתם היום. בואו נתחיל בשיחה קצרה.'});
  expect(await new Rewards(db,b,now).claimReminder('he-IL')).toMatchObject({notify:true,title:'יש זמן לקצת פורטוגזית?'});
  expect(await new Rewards(db,c,now).claimReminder()).toMatchObject({notify:true,body:'No practice yet today. Let’s start with a short conversation.'});
});
it('web delivery skips one or two replies on any device, including across a time-zone change',async()=>{
  for(const user of [a,b,c]) {
    await new Rewards(db,user,now).settings({timezone:user===c?'America/Los_Angeles':'Asia/Jerusalem',reminder_enabled:true});
    const endpoint=`https://fcm.googleapis.com/fcm/send/${user}`;
    await db.query('INSERT INTO fala.push_subscriptions(endpoint,user_id,subscription) VALUES($1,$2::uuid,$3::jsonb)',[endpoint,user,JSON.stringify({endpoint,keys:{}})]);
  }
  await reply(await session(b),b);
  const id=await session(c);
  await reply(id,c,false,new Date('2026-09-20T01:00:00Z'));await reply(id,c,false,new Date('2026-09-20T01:01:00Z'));
  await new Rewards(db,c,now).settings({timezone:'Asia/Jerusalem'});
  const endpoints:string[]=[];
  expect(await deliverReminders(db,now,async s=>{endpoints.push(s.endpoint);})).toEqual({delivered:1});
  expect(endpoints).toEqual([`https://fcm.googleapis.com/fcm/send/${a}`]);
  expect((await new Rewards(db,a,now).claimReminder()).notify).toBe(false); // The phone must not send a second copy.
});
it('rechecks practice after selecting a candidate, before claiming a reminder',async()=>{
  await new Rewards(db,a,now).settings({timezone:'Asia/Jerusalem',reminder_enabled:true});
  const endpoint='https://fcm.googleapis.com/fcm/send/late-practice';
  await db.query('INSERT INTO fala.push_subscriptions(endpoint,user_id,subscription) VALUES($1,$2::uuid,$3::jsonb)',[endpoint,a,JSON.stringify({endpoint,keys:{}})]);
  const interleaved:Database={...db,query:async<T>(sql:string,values:Parameter[]=[])=>{
    const rows=await db.query<T>(sql,values);
    if(sql.includes('SELECT p.user_id FROM fala.reward_profiles'))await reply(await session());
    return rows;
  }};
  let attempted=0;
  expect(await deliverReminders(interleaved,now,async()=>{attempted++;})).toEqual({delivered:0});
  expect(attempted).toBe(0);
  expect(await db.query('SELECT * FROM fala.reminder_deliveries WHERE user_id=$1::uuid',[a])).toEqual([]);
});
it('delivers to the most recently connected browser only and removes expired subscriptions',async()=>{
  await new Rewards(db,a,now).settings({timezone:'Asia/Jerusalem',reminder_enabled:true});
  for(const suffix of ['old','new'])await db.query('INSERT INTO fala.push_subscriptions(endpoint,user_id,subscription,created_at) VALUES($1,$2::uuid,$3::jsonb,$4::timestamptz)',[`https://fcm.googleapis.com/fcm/send/${suffix}`,a,JSON.stringify({endpoint:`https://fcm.googleapis.com/fcm/send/${suffix}`,keys:{}}),suffix==='old'?'2026-09-19T12:00:00Z':'2026-09-20T12:00:00Z']);
  const endpoints:string[]=[];
  expect(await deliverReminders(db,now,async s=>{endpoints.push(s.endpoint);return {};})).toEqual({delivered:1});expect(endpoints).toEqual(['https://fcm.googleapis.com/fcm/send/new']);
  expect(await deliverReminders(db,now,async()=>{throw Error('Must not run');})).toEqual({delivered:0});
  await db.query('DELETE FROM fala.reminder_deliveries WHERE user_id=$1::uuid',[a]);
  expect(await deliverReminders(db,now,async()=>{throw {statusCode:410};})).toEqual({delivered:0});
  expect((await db.query('SELECT endpoint FROM fala.push_subscriptions WHERE user_id=$1::uuid',[a])).length).toBe(1);
});
it('rejects push endpoints that could access internal services or arbitrary hosts',()=>{
  for(const url of ['http://fcm.googleapis.com/','https://127.0.0.1/','https://evil.test/','https://fcm.googleapis.com.evil.test/','https://user@fcm.googleapis.com/','https://fcm.googleapis.com:8443/'])expect(allowedPushEndpoint(url)).toBe(false);
  expect(allowedPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
});

it('starts with a free partner, synchronizes choices, and rejects unearned or invented skins',async()=>{
  const rewards=new Rewards(db,a,now);
  expect(await rewards.snapshot()).toMatchObject({xp:0,profile:{instructor:'bananera'},instructors:[
    {id:'bananera',unlocked:true},{id:'bateba',unlocked:false},{id:'vesoura',unlocked:false}
  ]});
  for(const instructor of ['bateba','vesoura'] as const)await expect(rewards.settings({instructor})).rejects.toMatchObject({status:403});
  expect(rewardSettingsSchema.safeParse({instructor:'invented'}).success).toBe(false);
  expect(rewardSettingsSchema.safeParse({instructor:'vesoura',xp:500}).success).toBe(false);
  await rewards.settings({instructor:'none'});
  // An older Android client updating other preferences must preserve the chosen partner.
  await new Rewards(db,a,now).settings({nickname:'Gilad',theme:'classic'});
  expect((await new Rewards(db,a,now).snapshot()).profile.instructor).toBe('none');
  expect((await new Rewards(db,b,now).snapshot()).profile.instructor).toBe('bananera');
  await rewards.reset();expect((await rewards.snapshot()).profile.instructor).toBe('none');
});
it('unlocks the first skins and partners at 2000 XP and the next at 5000 XP',async()=>{
  const rewards=new Rewards(db,a,now);
  await earnedPoints(1999);
  for(const selection of [{skin:'wave'},{instructor:'bateba'},{theme:'beach'}] as const)
    await expect(rewards.settings(selection)).rejects.toMatchObject({status:403});
  const id=await session();await reply(id,a,false,now,'typed');
  expect((await rewards.snapshot()).xp).toBe(2000);
  await rewards.settings({skin:'wave',instructor:'bateba',theme:'beach'});
  await earnedPoints(2999);
  for(const selection of [{skin:'rhythm'},{instructor:'vesoura'},{theme:'roda'}] as const)
    await expect(rewards.settings(selection)).rejects.toMatchObject({status:403});
  await reply(id,a,false,now,'typed');
  expect((await rewards.snapshot()).xp).toBe(5000);
  await rewards.settings({skin:'rhythm',instructor:'vesoura',theme:'roda'});
  await db.query('DELETE FROM fala.sessions WHERE id=$1::uuid',[id]);
  expect(await new Rewards(db,a,now).snapshot()).toMatchObject({xp:5000,profile:{skin:'rhythm',instructor:'vesoura',theme:'roda'}});
  await expect(rewards.settings({theme:'sunset'})).rejects.toMatchObject({status:403});
  await earnedPoints(4999);await expect(rewards.settings({theme:'sunset'})).rejects.toMatchObject({status:403});
  await earnedPoints(1);await rewards.settings({theme:'sunset'});
  await rewards.reset();expect(await rewards.snapshot()).toMatchObject({xp:0,profile:{instructor:'bananera',skin:'classic',theme:'classic'}});
});

it('preserves all previously earned looks without awarding future unlocks at old thresholds',async()=>{
  const rewards=new Rewards(db,a,now);
  await earnedPoints(150,1);
  await rewards.settings({skin:'wave',theme:'beach'});
  await earnedPoints(450,2); // New points cannot unlock Bateba at the old 200-XP boundary.
  for(const selection of [{skin:'rhythm'},{instructor:'bateba'},{theme:'roda'}] as const)
    await expect(rewards.settings(selection)).rejects.toMatchObject({status:403});
  await pg.exec(await readFile(new URL('../supabase/migrations/202609230002_reward_rules.sql',import.meta.url),'utf8'));
  expect(await new Rewards(db,a,now).snapshot()).toMatchObject({xp:600,profile:{skin:'wave',theme:'beach'}});
  await rewards.settings({skin:'classic'});await rewards.settings({skin:'wave'}); // Re-equipping also stays available.
  await earnedPoints(1000,1,b);
  const older=new Rewards(db,b,now);
  const before=await older.snapshot();
  expect([...before.themes,...before.skins,...before.instructors].every(item=>item.unlocked)).toBe(true);
  await older.settings({theme:'sunset',skin:'rhythm',instructor:'vesoura'});
  await older.reset();
  for(const selection of [{skin:'rhythm'},{instructor:'vesoura'},{theme:'sunset'}] as const)
    await expect(older.settings(selection)).rejects.toMatchObject({status:403});
});

it('defaults old-server writes to legacy rules while new awards always use version 2',async()=>{
  await db.query(`INSERT INTO fala.reward_events(user_id,event_key,kind,xp,local_date)
    VALUES($1::uuid,'old-server','daily',10,'2026-09-18')`,[a]);
  await reply(await session());
  expect(await db.query('SELECT event_key,rules_version FROM fala.reward_events ORDER BY occurred_at,event_key')).toEqual(
    expect.arrayContaining([{event_key:'old-server',rules_version:1},expect.objectContaining({rules_version:2})]));
});

it('does not add points to a legacy session that already exceeds the new lesson cap',async()=>{
  const id=await session();
  await db.query(`INSERT INTO fala.reward_events(user_id,event_key,kind,xp,local_date,session_id)
    VALUES($1::uuid,'old-complete','complete',20,'2026-09-19',$2::uuid)`,[a,id]);
  await reply(id);
  expect(await new Rewards(db,a,now).snapshot()).toMatchObject({xp:20,today_xp:0});
});
