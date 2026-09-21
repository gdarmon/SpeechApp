import { rewardFixture } from './fixtures/rewards.mjs';
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
 const rewards=rewardFixture(); let settingsWrites=0;
 await page.route('**/*',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,send=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  if(path==='/auth/me')return loggedIn?send({email:'fixture@fala.invalid'}):route.fulfill({status:401,body:'{}'});
  if(path==='/dashboard')return send({status:{demo:false},progress:{practice:{level:1,title:'First phrases',goal:'Simple replies.'}},history:[],rewards});
  if(path==='/rewards')return send(rewards);
  if(path==='/rewards/settings'){settingsWrites++;Object.assign(rewards.profile,req.postDataJSON());return send(rewards);}
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

 // Preview never equips a locked partner; saved choices survive reload and topic changes.
 const bateba=page.locator('#instructor-list article[data-partner="bateba"]');
 const beforePreview=settingsWrites;
 await bateba.getByRole('button',{name:'Preview',exact:true}).click();
 assert.equal(await page.locator('#partner-preview-use').isDisabled(),true);
 assert.match(await page.locator('#partner-preview-note').textContent(),/100 more XP/);
 await page.keyboard.press('Escape'); assert.equal(settingsWrites,beforePreview);
 await page.locator('#partner-none').click();
 await page.waitForFunction(()=>document.querySelector('#partner-none').disabled);
 await page.reload(); await page.locator('#home').waitFor({state:'visible'});
 assert.match(await page.locator('#partner-home').textContent(),/Fala only/);
 assert.equal(await page.locator('#partner-home img').count(),0);
 rewards.xp=200;rewards.instructors[1].unlocked=true;
 await page.locator('[data-page="rewards-screen"]').click();
 await bateba.getByRole('button',{name:'Use Bateba'}).click();
 await page.waitForFunction(()=>document.querySelector('#instructor-list [data-partner="bateba"]').dataset.selected==='true');
 await page.reload(); await page.locator('#home').waitFor({state:'visible'});
 assert.match(await page.locator('#partner-home').textContent(),/Bateba/);
 await page.locator('#topic').selectOption('everyday life');assert.equal(await page.locator('#partner-home').isHidden(),true);
 await page.locator('#topic').selectOption('capoeira class');assert.equal(await page.locator('#partner-home').isVisible(),true);
 await page.locator('#partner-home button').click();await page.locator('#instructor-list article').first().waitFor();
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
 await page.emulateMedia({colorScheme:'light'});rewards.profile.appearance='light';await page.reload();await page.locator('#home').waitFor({state:'visible'});await page.locator('[data-page="rewards-screen"]').click();await page.locator('#instructor-list article').first().waitFor();
 await page.locator('#instructor-collection').screenshot({path:'artifacts/fala-0.12.0-partners-mobile.png'});
 await page.setViewportSize({width:1280,height:900});await page.locator('#instructor-collection').screenshot({path:'artifacts/fala-0.12.0-partners-desktop.png'});
 await page.locator('[data-page="home"]').click();await page.locator('#signout').click();await page.locator('#welcome').waitFor({state:'visible'});assert.equal(await page.locator('html').getAttribute('data-theme'),'classic');assert.equal(await page.locator('#reward-nav').isHidden(),true);assert.equal(await page.locator('#instructor-list img').count(),0);assert.equal(await page.locator('#partner-identity img').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS: partner selection persists across reload; locked partner previews never equip; opt-out and topic filtering; earned themes, locked previews, preferences, private circles, mobile layouts, and sign-out cleanup.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
