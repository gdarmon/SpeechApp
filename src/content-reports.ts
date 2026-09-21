import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {AppError} from './models.js';
import type {Store} from './store.js';
export const contentReportSchema=z.strictObject({
  session_id:z.uuid(), target:z.enum(['opening','reply','summary']),
  turn_id:z.number().int().positive().nullable().default(null),
  category:z.enum(['inappropriate','unsafe','inaccurate','other']),
  note:z.string().trim().max(1000).default(''),
}).refine(i=>i.target==='reply'?i.turn_id!==null:i.turn_id===null);
export async function reportContent(store:Store,user:string,input:z.infer<typeof contentReportSchema>) {
  const session=await store.session(input.session_id);
  const content=input.target==='opening'?session.opening:input.target==='summary'?session.feedback:session.turns.find(t=>t.id===input.turn_id)?.reply;
  if(!content)throw new AppError(404,'The selected AI content was not found.');
  const key=input.target+(input.turn_id===null?'':':'+input.turn_id);
  const [existing]=await store.query<{id:string}>('SELECT id FROM fala.content_reports WHERE user_id=$1::uuid AND session_id=$2::uuid AND target_key=$3',[user,input.session_id,key]);
  if(existing)return {received:true,id:existing.id};
  const [count]=await store.query<{n:number}>("SELECT count(*)::int AS n FROM fala.content_reports WHERE user_id=$1::uuid AND created_at>now()-interval '1 day'",[user]);
  if(count.n>=20)throw new AppError(429,'Your reports have been received. Please try again tomorrow.');
  const id=randomUUID();
  await store.query('INSERT INTO fala.content_reports(id,user_id,session_id,target_key,category,note,content) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7::jsonb)',[id,user,input.session_id,key,input.category,input.note,JSON.stringify(content)]);
  return {received:true,id};
}
