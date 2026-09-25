import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { rewardFixture } from './fixtures/rewards.mjs';
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(!path.startsWith('/app/')){res.writeHead(401);res.end('{}');return;}
  try{res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'text/html');res.end(await readFile('public'+(path.endsWith('/')?path+'index.html':path)));}
  catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.FALA_TEST_CHROME||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try{
  for(const outcome of ['granted','denied','disabled','account-changed']){
    const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/app/`);
    const data=rewardFixture();data.web_push_key='BA';data.profile.reminder_enabled=outcome!=='disabled';
    const result=await page.evaluate(async({data,outcome})=>{
      const {createRewards}=await import('/app/rewards.js');
      localStorage.removeItem('fala.notificationPermissionAsked');localStorage.removeItem('fala.pushDisconnected');
      let prompts=0,subscribed=0,release;
      class Notifications {
        static permission='default';
        static async requestPermission(){prompts++;if(outcome==='account-changed')await new Promise(resolve=>{release=resolve;});return this.permission=outcome==='denied'?'denied':'granted';}
      }
      Object.defineProperty(window,'Notification',{value:Notifications,configurable:true});
      Object.defineProperty(window,'PushManager',{value:class{},configurable:true});
      const subscription={toJSON:()=>({endpoint:'https://fcm.googleapis.com/fala-fixture',keys:{}}),unsubscribe:async()=>true};
      Object.defineProperty(navigator.serviceWorker,'ready',{value:Promise.resolve({pushManager:{getSubscription:async()=>subscription}}),configurable:true});
      Object.defineProperty(navigator.serviceWorker,'getRegistration',{value:async()=>({pushManager:{getSubscription:async()=>subscription}}),configurable:true});
      const manager=createRewards({api:async()=>data,post:async(path)=>{if(path==='/rewards/push')subscribed++;return data;},task:async action=>action(),screen:()=>{},home:()=>{}});
      manager.render(data);
      const first=manager.requestDefaultNotifications();
      if(outcome==='account-changed'){manager.reset();release();}
      await first;await manager.requestDefaultNotifications();
      const beforeDisconnect=subscribed;
      if(outcome==='granted'){
        document.getElementById('disconnect-push').click();
        for(let i=0;i<10&&localStorage.getItem('fala.pushDisconnected')!=='true';i++)await new Promise(resolve=>setTimeout(resolve,0));
        await manager.requestDefaultNotifications();
      }
      return {prompts,subscribed,beforeDisconnect};
    },{data,outcome});
    assert.equal(result.prompts,outcome==='disabled'?0:1,outcome+' permission prompt count');
    if(outcome==='granted'){assert.equal(result.beforeDisconnect,1,'A connected browser is registered only once');assert.equal(result.subscribed,result.beforeDisconnect,'Manual disconnection prevents automatic reconnect');}
    else assert.equal(result.subscribed,0,outcome+' must not subscribe');
    await context.close();
  }
  console.log('PASS: default reminders request permission, denial is not repeated, opt-outs and browser disconnect are respected, and changing accounts during permission cannot subscribe the next user.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
