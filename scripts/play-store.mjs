import {writeFile,mkdir,appendFile} from 'node:fs/promises';
import {googleAccessToken} from './play-upload.mjs';
const root='https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.fala.app/edits';
const token=await googleAccessToken(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON||'');
const call=async(path='',method='GET',body)=>{
 const res=await fetch(root+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(`Google Play ${method} ${path.replace(/\d{10,}/g,'[edit]')}: HTTP ${res.status}: ${data.error?.message||'Request failed'}`);
 return data;
};
let edit;
try {
 edit=await call('','POST',{});
 const [details,listings,tracks]=await Promise.all(['/details','/listings','/tracks'].map(path=>call('/'+edit.id+path)));
 const images={};
 for(const listing of listings.listings||[]) {
  images[listing.language]={};
  for(const type of ['icon','featureGraphic','phoneScreenshots','sevenInchScreenshots','tenInchScreenshots']) {
   const result=await call('/'+edit.id+'/listings/'+listing.language+'/'+type);
   images[listing.language][type]=(result.images||[]).map(image=>({id:image.id,sha256:image.sha256,url:image.url}));
  }
 }
 await mkdir('artifacts/play-store',{recursive:true});
 await writeFile('artifacts/play-store/audit.json',JSON.stringify({checked_at:new Date().toISOString(),package:'com.fala.app',details,listings:listings.listings||[],tracks:tracks.tracks||[],images,limitations:['Play Console app-content declarations and account production eligibility are not exposed by these API calls.']},null,2)+'\n');
 const summary='Read-only Play listing audit completed. No listing or track changes committed.\n';console.log(summary);
 if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
}finally{if(edit?.id)await call('/'+edit.id,'DELETE');}
