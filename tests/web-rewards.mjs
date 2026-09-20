import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const csp=(await readFile('netlify.toml','utf8')).match(/Content-Security-Policy = "(.*)"/)[1];
const server=createServer(async(req,res)=>{
  try {const path=new URL(req.url,'http://localhost').pathname;
    if(!path.startsWith('/app/')&&path!='/logo.png'){res.writeHead(401,{'Content-Type':'application/json'});res.end('{"detail":"Sign in"}');return;}
    const file=path.endsWith('/')?path+'index.html':path;
    res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html','Content-Security-Policy':csp});res.end(await readFile('public'+file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.FALA_TEST_CHROME||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try {
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 let loggedIn=true,group=null;
 const rewards={xp:100,today_xp:50,today_replies:10,daily_complete:true,profile:{nickname:'Learner',timezone:'Asia/Jerusalem',timezone_confirmed:true,theme:'classic',skin:'classic',appearance:'system',reduce_motion:false,reminder_enabled:false,reminder_minute:1020},streak:{days:1,protected_days:[],calendar:Array.from({length:7},(_,i)=>({day:`2026-09-${14+i}`,status:i===6?'practised':'empty'}))},themes:[{id:'classic',name:'Fala Classic',xp:0,unlocked:true},{id:'beach',name:'Copacabana',xp:100,unlocked:true},{id:'roda',name:'Roda',xp:300,unlocked:false},{id:'sunset',name:'Salvador sunset',xp:1000,unlocked:false}],skins:[{id:'classic',name:'Classic',xp:0,unlocked:true},{id:'wave',name:'Ocean wave',xp:150,unlocked:false},{id:'rhythm',name:'Roda rhythm',xp:600,unlocked:false}],badges:[{name:'First conversation',earned:true}],weekly_mission:{title:'Practise three different class scenarios',progress:1,target:3,xp:10},web_push_key:null};
 await page.route('**/*',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,send=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  if(path==='/auth/me')return loggedIn?send({email:'fixture@fala.invalid'}):route.fulfill({status:401,body:'{}'});
  if(path==='/dashboard')return send({status:{demo:false},progress:{practice:{level:1,title:'First phrases',goal:'Simple replies.'}},history:[],rewards});
  if(path==='/rewards')return send(rewards);
  if(path==='/rewards/settings'){Object.assign(rewards.profile,req.postDataJSON());return send(rewards);}
  if(path==='/friends'){
    if(req.method()==='POST'){const input=req.postDataJSON();group=input.action==='leave'?null:{name:input.value||'Roda',timezone:'Asia/Jerusalem',invite_code:'a'.repeat(24),owner:true};}
    return send({circle:group,members:group?[{name:rewards.profile.nickname,xp:100,self:true}]:[],challenge:{title:'Complete 12 conversations together this week',progress:1,target:12}});
  }
  if(path==='/auth/logout'){loggedIn=false;return send({signed_out:true});}
  return route.continue();
 });
 await page.goto(base+'/app/');await page.locator('#reward-home').waitFor({state:'visible'});
 assert.ok((await page.locator('#start').boundingBox()).y<760,'Talk should be within reach on mobile');
 await page.locator('[data-page="rewards-screen"]').click();await page.locator('#theme-list article').first().waitFor();
 const roda=page.locator('#theme-list article').filter({hasText:'Roda'});
 assert.equal(await roda.getByRole('button',{name:'Use theme'}).isDisabled(),true);
 await roda.getByRole('button',{name:'Preview'}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),'roda');
 await page.locator('[data-page="home"]').click();await page.locator('#start').waitFor({state:'visible'});assert.equal(await page.locator('html').getAttribute('data-theme'),'classic');
 await page.locator('[data-page="rewards-screen"]').click();await page.locator('#theme-list article').filter({hasText:'Copacabana'}).getByRole('button',{name:'Use theme'}).click();
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='beach');
 await page.locator('[data-page="reminders-screen"]').click();await page.locator('#nickname').fill('Gilad');await page.locator('#appearance').selectOption('dark');await page.locator('#reduce-motion').check();await page.locator('#reminder-time').fill('17:15');await page.locator('#reminder-enabled').check();await page.getByRole('button',{name:'Save preferences'}).click();
 await page.waitForFunction(()=>document.documentElement.classList.contains('reduce-motion'));
 assert.equal(rewards.profile.reminder_minute,1035);assert.equal(rewards.profile.reminder_enabled,true);assert.equal(await page.locator('#connect-push').isDisabled(),true);
 await page.locator('[data-page="friends-screen"]').click();await page.waitForFunction(()=>!document.querySelector('[data-page="friends-screen"]').disabled);await page.getByLabel('New circle name').fill('Our roda');await page.getByRole('button',{name:'Create my circle'}).click();await page.getByText('Gilad (you)',{exact:true}).waitFor();
 assert.ok((await page.getByLabel('Circle invitation link').inputValue()).includes('/app/#join='));
 for(const width of [320,390,1024]){await page.setViewportSize({width,height:844});for(const name of ['home','rewards-screen','friends-screen','reminders-screen']){await page.locator(`[data-page="${name}"]`).click();await page.waitForFunction(()=>!document.getElementById('notice').textContent||document.getElementById('notice').hidden);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} overflows at ${width}`);}}
 await page.setViewportSize({width:390,height:844});await page.locator('[data-page="rewards-screen"]').click();await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/rewards-mobile.png',fullPage:true});
 await page.locator('[data-page="home"]').click();await page.locator('#signout').click();await page.locator('#welcome').waitFor({state:'visible'});assert.equal(await page.locator('html').getAttribute('data-theme'),'classic');assert.equal(await page.locator('#reward-nav').isHidden(),true);assert.deepEqual(errors,[]);
 console.log('PASS: earned themes, locked previews, preferences, private circles, mobile layouts, and sign-out cleanup.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
