import {writeFile,mkdir,appendFile,readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {googleAccessToken} from './play-upload.mjs';
const root='https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.fala.app/edits';
const token=await googleAccessToken(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON||'');
const call=async(path='',method='GET',body)=>{
 const res=await fetch(root+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(`Google Play ${method} ${path.replace(/\d{10,}/g,'[edit]')}: HTTP ${res.status}: ${data.error?.message||'Request failed'}`);
 return data;
};
const upload=process.argv[2]==='upload';
let edit,committed=false;
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
 if(upload) {
  const read=async name=>(await readFile('store/google-play/en-US/'+name+'.txt','utf8')).trim();
  const title=await read('title'),shortDescription=await read('short-description'),fullDescription=await read('full-description');
  if(title.length>30||shortDescription.length>80||fullDescription.length>4000)throw Error('Store text exceeds Google Play limits.');
  const currentVersion=JSON.parse(await readFile('package.json','utf8')).version;
  const manifest=JSON.parse(await readFile('store/google-play/asset-manifest.json','utf8'));
  if(manifest.version!==currentVersion)throw Error('The reviewed store assets belong to a different app version.');
  const internal=tracks.tracks?.find(t=>t.track==='internal')?.releases?.find(r=>r.status==='completed'&&r.name?.startsWith('Fala '+currentVersion+' '));
  if(!internal?.versionCodes?.length)throw Error('The matching app version must finish internal publishing before preparing the closed test.');
  await call('/'+edit.id+'/listings/en-US','PATCH',{title,shortDescription,fullDescription});
  await call('/'+edit.id+'/details','PATCH',{contactEmail:'gdarmon@gmail.com',contactWebsite:'https://falachatapp.netlify.app'});
  const groups={icon:['store/google-play/icon-512.png'],featureGraphic:['store/google-play/feature-graphic-1024x500.jpg']};
  for(const [folder,type] of [['phone','phoneScreenshots'],['seven-inch','sevenInchScreenshots'],['ten-inch','tenInchScreenshots']]) {
   const path='store/google-play/screenshots/'+folder;
   groups[type]=(await readdir(path)).filter(f=>f.endsWith('.jpg')).sort().map(f=>path+'/'+f);
   if(groups[type].length<4||groups[type].length>8)throw Error('Expected four to eight native screenshots per size.');
  }
  for(const [type,files] of Object.entries(groups)) {
   const existing=images['en-US']?.[type]||[];
   const data=await Promise.all(files.map(async file=>({file,bytes:await readFile(file)})));
   const hashes=data.map(d=>createHash('sha256').update(d.bytes).digest('hex'));
   for(const [index,item] of data.entries()) {
    const reviewed=manifest.images.find(image=>image.path===item.file.replace('store/google-play/',''));
    if(reviewed?.sha256!==hashes[index])throw Error('Store image differs from the validated asset manifest: '+item.file);
   }
   if(existing.some(image=>!hashes.includes(image.sha256)))throw Error('Existing '+type+' differs; preserve it until the owner reviews a replacement.');
   for(const item of data) {
    const hash=createHash('sha256').update(item.bytes).digest('hex');if(existing.some(image=>image.sha256===hash))continue;
    const res=await fetch(root.replace('/androidpublisher/v3/','/upload/androidpublisher/v3/')+'/'+edit.id+'/listings/en-US/'+type+'?uploadType=media',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':item.file.endsWith('.png')?'image/png':'image/jpeg'},body:item.bytes});
    const response=await res.json().catch(()=>({}));if(!res.ok)throw Error('Google Play image upload '+type+': HTTP '+res.status+': '+(response.error?.message||'Upload failed'));
   }
  }
  const alpha=tracks.tracks?.find(t=>t.track==='alpha');
  if(!alpha?.releases?.some(r=>r.versionCodes?.length))await call('/'+edit.id+'/tracks/alpha','PUT',{track:'alpha',releases:[{name:internal.name,versionCodes:internal.versionCodes,releaseNotes:internal.releaseNotes,status:'draft'}]});
  await call('/'+edit.id+':validate','POST');
  await call('/'+edit.id+':commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW','POST');committed=true;
  await writeFile('artifacts/play-store/upload.json',JSON.stringify({version:currentVersion,listing:'en-US',imageCounts:Object.fromEntries(Object.entries(groups).map(([type,files])=>[type,files.length])),closed_test:'draft',production_modified:false,completed_at:new Date().toISOString()},null,2)+'\n');
 }
 const summary=upload?'Store listing and images uploaded; closed-testing draft prepared. Production unchanged.\n':'Read-only Play listing audit completed. No listing or track changes committed.\n';console.log(summary);
 if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
}finally{if(edit?.id&&!committed)await call('/'+edit.id,'DELETE');}
