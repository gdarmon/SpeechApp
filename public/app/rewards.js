import { createPartners } from './partners.js';
import { t, setText, localizeTree, uiLanguage } from './i18n.js';
const $=id=>document.getElementById(id);
const node=(tag,text,className='')=>{const el=document.createElement(tag);setText(el,text);el.className=className;return el;};
const button=(label,action,className='secondary')=>{const b=node('button',label,className);b.type='button';b.onclick=action;return b;};
const minuteText=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
function meter(value,max,label){const p=document.createElement('progress');p.max=max;p.value=Math.min(max,value);p.setAttribute('aria-label',label);return p;}

export function createRewards({api,post,task,screen,home}) {
  let state=null, generation=0, previewTheme=null;
  const preference = { get:key=>{try{return localStorage.getItem(`fala.${key}`);}catch{return null;}}, set:(key,value)=>{try{localStorage.setItem(`fala.${key}`,value);}catch{}} };
  let connectingPush = null, pushConnected = false;
  const partners=createPartners({choose:instructor=>save({instructor}),openCollection:()=>navigate('rewards-screen')});
  let pendingInvite='';
  const match=location.hash.match(/^#join=([A-Za-z0-9_-]{24})$/);
  if(match){pendingInvite=match[1];history.replaceState(null,'',location.pathname);}
  function apply(){
    const p=state?.profile||{};
    document.documentElement.dataset.theme=previewTheme||p.theme||'classic';
    document.documentElement.dataset.skin=p.skin||'classic';
    document.documentElement.style.colorScheme=p.appearance==='system'?'light dark':p.appearance||'light dark';
    document.documentElement.classList.toggle('reduce-motion',!!p.reduce_motion);
  }
  function render(data){
    if(!data)return;
    state=data;apply();partners.render(data);
    const box=$('reward-home');box.hidden=false;box.replaceChildren();
    const card=node('article','','reward-overview'), row=node('div','','row');
    row.append(node('h2',`${data.streak.days}-day streak`),node('span',`${data.xp} XP`,'badge'));card.append(row);
    const days=node('div','','reward-days');
    for(const day of data.streak.calendar){const item=node('div','','reward-day '+day.status), label=node('small',new Date(day.day+'T12:00:00').toLocaleDateString(uiLanguage(),{weekday:'narrow'}));label.dataset.weekday=day.day;item.append(node('span',day.status==='practised'?'✓':day.status==='protected'?'◇':'·'),label);item.setAttribute('aria-label',`${day.day}: ${t(day.status)}`);days.append(item);}
    card.append(days,node('p',data.daily_complete?'Daily goal complete. Nice work!':`${Math.min(3,data.today_replies)} of 3 replies for today's goal`,'fine'));
    if(data.streak.protected_days.length)card.append(node('p','◇ Protected rest day · no points earned','fine'));
    const next=data.themes.find(t=>!t.unlocked);
    if(next){card.append(meter(data.xp,next.xp,`Progress to ${next.name}`),button(`${next.xp-data.xp} XP to ${next.name} →`,()=>navigate('rewards-screen'),'text-button'));}
    box.append(card);
    $('reward-total').textContent=`${data.xp} lifetime XP · ${data.today_xp} earned today. Unlocked looks stay yours.`;
    renderLooks('theme-list',data.themes,'theme');renderLooks('skin-list',data.skins,'skin');
    $('reward-badges').replaceChildren(...data.badges.map(b=>node('p',`${b.earned?'✓':'○'} ${b.name}`,b.earned?'badge earned':'fine')));
    const p=data.profile;
    $('nickname').value=p.nickname;$('appearance').value=p.appearance;$('reduce-motion').checked=p.reduce_motion;
    $('reward-timezone').value=p.timezone;$('reminder-time').value=minuteText(p.reminder_minute);$('reminder-enabled').checked=p.reminder_enabled;
    const supported='Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;
    $('connect-push').disabled=!supported||!data.web_push_key;
    $('push-state').textContent=!supported?'This browser cannot receive reminders here. On iPhone, use the Home Screen app.':!data.web_push_key?'Browser reminders are being configured.':Notification.permission==='denied'?'Notifications are blocked. You can allow Fala in browser or device settings.':'Connect once to receive a reminder here, even when Fala is closed.';
    localizeTree();
  }
  function renderLooks(id,items,field){
    $(id).replaceChildren();
    for(const item of items){
      const card=node('article','','reward-look');card.dataset.theme=item.id;
      const sample=node('div',field==='theme'?'Fala · Olá!':item.id==='rhythm'?'♪  Hold to speak':item.id==='wave'?'≈  Hold to speak':'Hold to speak','look-swatch');
      card.append(sample,node('h2',item.name),node('p',item.unlocked?'Unlocked':`${item.xp} XP to unlock`,'fine'));
      if(field==='theme')card.append(button('Preview',()=>{previewTheme=item.id;apply();setText($('reward-total'),`Previewing ${item.name}${item.unlocked?'':' · locked'}. Your saved theme is unchanged.`);},'text-button'));
      const use=button(state.profile[field]===item.id?'Selected':'Use '+(field==='theme'?'theme':'skin'),()=>save({[field]:item.id}));use.disabled=!item.unlocked||state.profile[field]===item.id;card.append(use);$(id).append(card);
    }
  }
  async function refresh(){const own=generation;const next=await api('/rewards');if(own===generation)render(next);return next;}
  function save(input){void task(async()=>{const own=generation;const next=await post('/rewards/settings',input);if(own!==generation)return;previewTheme=null;render(next);});}
  async function navigate(id){
    previewTheme=null;apply();
    if(id==='home'){await home();return;}
    screen(id);
    await task(async()=>{const own=generation;if(id==='friends-screen'){const data=await api('/friends');if(own===generation)renderCircle(data);}else await refresh();});
  }
  function renderCircle(data){
    const box=$('circle-content');box.replaceChildren();
    if(!data.circle){
      const create=document.createElement('form'),name=document.createElement('input');name.placeholder='Circle name';name.maxLength=50;name.required=true;name.setAttribute('aria-label','New circle name');
      const createButton=node('button','Create my circle');createButton.type='submit';create.append(name,createButton);create.onsubmit=e=>{e.preventDefault();social({action:'create',value:name.value});};
      const join=document.createElement('form'),code=document.createElement('input');code.value=pendingInvite;code.placeholder='Invitation code or link';code.required=true;code.setAttribute('aria-label','Circle invitation');
      const joinButton=node('button','Join a circle');joinButton.type='submit';join.append(code,joinButton);join.onsubmit=e=>{e.preventDefault();const value=code.value.trim().match(/(?:#join=)?([A-Za-z0-9_-]{24})$/)?.[1]||'';social({action:'join',value});};
      box.append(node('h2','Start with people you know'),create,node('h2','Have an invitation?'),join);return;
    }
    pendingInvite='';const c=data.circle;
    box.append(node('h2',c.name),node('p',`This week · resets Monday · ${c.timezone}`,'fine'));
    const challenge=node('article');challenge.append(node('h2',data.challenge.title),meter(data.challenge.progress,data.challenge.target,'Group conversations'),node('p',`${data.challenge.progress} / ${data.challenge.target} conversations`));box.append(challenge);
    const list=node('ol','','leaderboard');for(const member of data.members){const li=node('li','','row');li.append(node('span',member.self?`${member.name} (you)`:member.name),node('strong',`${member.xp} XP`));list.append(li);}box.append(list);
    const invite=node('input');invite.readOnly=true;invite.value=`${location.origin}/app/#join=${c.invite_code}`;invite.setAttribute('aria-label','Circle invitation link');box.append(invite);
    box.append(button('Copy invitation',async()=>{try{await navigator.clipboard.writeText(invite.value);}catch{invite.select();} }));
    if(c.owner)box.append(button('Replace invitation',()=>social({action:'rotate'}),'text-button'));
    box.append(button(c.owner?'Close this circle':'Leave this circle',()=>{if(confirm(t(c.owner?'Close this circle for every member? Everyone keeps their own points.':'Leave this circle? Your points and rewards stay yours.')))social({action:'leave'});},'text-button'));
    const mission=state?.weekly_mission;
    if(mission){const card=node('article');card.append(node('h2','Your weekly mission'),node('p',mission.title),node('p',`${mission.progress}/${mission.target}${mission.xp>0?` · +${mission.xp} XP`:" · Practice milestone"}`));box.append(card);}
  }
  function social(input){void task(async()=>{const own=generation;const next=await post('/friends',input);if(own===generation)renderCircle(next);});}
  $('reward-nav').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
  $('reward-settings').onsubmit=e=>{e.preventDefault();const [h,m]=$('reminder-time').value.split(':').map(Number);save({nickname:$('nickname').value,appearance:$('appearance').value,reduce_motion:$('reduce-motion').checked,timezone:$('reward-timezone').value,reminder_minute:h*60+m,reminder_enabled:$('reminder-enabled').checked});};
  async function connectPush() {
    const own = generation;
    if(!state?.web_push_key)throw Error('Browser reminders are not ready. Please try again later.');
    preference.set('notificationPermissionAsked','true');
    const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();if(permission!=='granted')throw Error('Notifications remain off. You can enable them later in device settings.');
    if (own !== generation) return;
    const registration=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Browser reminders are not ready. Please try again later.')),3000);
      navigator.serviceWorker.ready.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
    });
    if (own !== generation) return;
    const bytes=Uint8Array.from(atob(state.web_push_key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
    if (own !== generation) return;
    await post('/rewards/push',subscription.toJSON());
    if (own !== generation) return;
    pushConnected = true;
    setText($('push-state'),'Connected. You will be reminded here only if you haven’t practised that day.');
  }
  $('connect-push').onclick=()=>{void task(async()=>{
    preference.set('pushDisconnected','false'); await connectPush(); render(await post('/rewards/settings',{reminder_enabled:true}));
  });};
  async function requestDefaultNotifications() {
    if (pushConnected || !state?.profile?.reminder_enabled || !state.web_push_key || preference.get('pushDisconnected')==='true'
      || !('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)
      || Notification.permission==='denied' || Notification.permission==='default' && preference.get('notificationPermissionAsked')==='true') return;
    if (connectingPush) return connectingPush;
    const own=generation;
    connectingPush=connectPush().catch(()=>{localizeTree();}).finally(()=>{if(own===generation)connectingPush=null;});
    return connectingPush;
  }
  async function disconnect(){pushConnected=false;if(!('serviceWorker' in navigator))return;const registration=await navigator.serviceWorker.getRegistration('/app/');const subscription=await registration?.pushManager?.getSubscription();if(subscription){try{await post('/rewards/push/remove',{endpoint:subscription.endpoint});}finally{await subscription.unsubscribe();}}}
  $('disconnect-push').onclick=()=>{void task(async()=>{await disconnect();preference.set('pushDisconnected','true');setText($('push-state'),'This browser is disconnected. Other connected devices keep their settings.');});};
  return {render,disconnect,requestDefaultNotifications,conversation:partners.conversation,reset(){generation++;connectingPush=null;pushConnected=false;state=null;previewTheme=null;partners.reset();apply();$('reward-home').hidden=true;$('reward-celebration').hidden=true;},
    async initialize(data){if(!data)return;render(data);if(!data.profile.timezone_confirmed){const own=generation;try{const next=await post('/rewards/settings',{timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});if(own===generation)render(next);}catch{/* Keep the explicit timezone control available. */}}
      if ('Notification' in window && Notification.permission==='granted') void requestDefaultNotifications();
      if(pendingInvite)$('reward-home').append(button('Open your circle invitation',()=>navigate('friends-screen')));
    },
    async celebrate(){const own=generation,prior=state;try{const next=await refresh();if(own!==generation)return;const el=$('reward-celebration');el.replaceChildren(node('strong',next.daily_complete?'Daily goal complete!':'A little more practice.'),node('p',`${next.today_xp} XP today · ${next.xp} XP total`));
      const unlocked=next.themes.filter(t=>t.unlocked&&t.xp>0&&!prior?.themes.some(old=>old.id===t.id&&old.unlocked));for(const reward of unlocked)el.append(node('p',`${reward.name} unlocked!`));partners.celebrate(el,prior,next);el.hidden=false;el.classList.remove('celebrate');void el.offsetWidth;el.classList.add('celebrate');
    }catch{/* A delayed rewards refresh must not hide the conversation summary. */}},
  };
}
