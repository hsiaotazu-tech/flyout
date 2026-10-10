// sync.js — saves the trip on this device, or in Firebase when configured, and keeps shared trips in sync.
import {CONFIG} from './firebase-config.js';
const FB='https://www.gstatic.com/firebasejs/10.14.1/';
const A=window.__app;
const S=window.__sync={mode:'local',role:'owner',email:'',error:'',configured:!!CONFIG.apiKey&&!/^YOUR/.test(CONFIG.apiKey)};
{const m=location.hash.match(/[#&]j=([A-Za-z0-9]+)/);if(m)S.pending=m[1].toUpperCase()}
let last={},ready=false,applying=false,timer=0,ctx=null,db,auth,F,AU,_idb;

const rnd=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');
const snap=()=>Object.fromEntries(A.keys().map(k=>[k,JSON.stringify(A.get(k))]));
const parse=o=>Object.fromEntries(Object.entries(o).map(([k,j])=>[k,JSON.parse(j)]));
const baseline=()=>{const c=snap();for(const k in c)if(!(k in last))last[k]=c[k]};
function applyRemote(js){
 applying=true;
 try{(A.apply(parse(js))||[]).forEach(k=>{last[k]=js[k]})}finally{applying=false}
}

/* ---- on-device storage (IndexedDB) ---- */
const idb=()=>_idb||(_idb=new Promise((ok,no)=>{const r=indexedDB.open('trip-planner',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}));
const tx=async(mode,fn)=>{const d=await idb();return new Promise((ok,no)=>{const t=d.transaction('kv',mode),r=fn(t.objectStore('kv'));t.oncomplete=()=>ok(r&&r.result);t.onerror=()=>no(t.error)})};
const idbSet=(k,v)=>tx('readwrite',s=>s.put(v,k));
const idbAll=async()=>{const ks=await tx('readonly',s=>s.getAllKeys()),vs=await tx('readonly',s=>s.getAll());return Object.fromEntries(ks.map((k,i)=>[k,vs[i]]))};

/* ---- saving: only the pieces that changed ---- */
S.commit=()=>{if(!ready||applying||(S.mode==='cloud'&&S.role==='viewer'))return;clearTimeout(timer);timer=setTimeout(flush,600)};
async function flush(){
 const cur=snap(),prev=S.error;
 if(prev.startsWith('Too large'))S.error='';
 for(const [k,j] of Object.entries(cur)){
  if(last[k]===j)continue;
  if(j.length>900000){S.error='Too large to sync: '+k+'. Use a smaller photo.';continue}
  last[k]=j;
  if(S.mode==='cloud'&&ctx)F.setDoc(F.doc(db,'trips',ctx.tid,'data',k),{j,by:ctx.uid,t:F.serverTimestamp()}).catch(e=>{delete last[k];console.warn(e)});
  else try{await idbSet(k,j)}catch(e){delete last[k];console.warn(e)}
 }
 if(S.error!==prev)A.status();
}
S.rebase=()=>{last={};clearTimeout(timer);flush()};
S.mark=(k,j)=>{last[k]=j};
addEventListener('pagehide',()=>{clearTimeout(timer);if(ready)flush()});

/* ---- start-up ---- */
async function localInit(){
 S.mode='local';ctx=null;
 try{applyRemote(await idbAll())}catch(e){console.warn(e)}
 baseline();ready=true;
}
async function openTrip(u,tid){
 const m=await F.getDoc(F.doc(db,'trips',tid,'members',u.uid));   // throws if you are not a member
 if(!m.exists())throw new Error('not a member');
 ctx={tid,uid:u.uid};S.tid=tid;S.role=m.data().role;S.mode='cloud';S.email=u.email||'';S.pending='';
 if(location.hash)history.replaceState(null,'',location.pathname+location.search);
 try{localStorage.setItem('trip',tid)}catch(e){}
 F.setDoc(F.doc(db,'users',u.uid),{tripId:tid},{merge:true}).catch(()=>{});
 await new Promise(res=>{
  let first=true;
  const done=()=>{if(first){first=false;baseline();ready=true;res()}};
  F.onSnapshot(F.collection(db,'trips',tid,'data'),s=>{
   const js={};
   s.docChanges().forEach(c=>{
    if(c.type==='removed'||c.doc.metadata.hasPendingWrites)return;
    const j=c.doc.data().j;if(typeof j!=='string'||j===last[c.doc.id])return;
    js[c.doc.id]=j;
   });
   if(Object.keys(js).length)applyRemote(js);
   done();
  },e=>{console.warn(e);done()});
 });
}
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}},lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
const ALPHA='23456789ABCDEFGHJKLMNPQRSTUVWXYZ',LINK_LEN=10;     // 32 symbols, no 0/O/1/I: about 50 bits, not guessable
const mkToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(LINK_LEN)),b=>ALPHA[b%32]).join('');
const linkOf=t=>location.origin+location.pathname+'#j='+t;
const parseTok=raw=>{const m=String(raw).match(/[#&?]j=([A-Za-z0-9]+)/),t=(m?m[1]:String(raw).trim()).toUpperCase();return new RegExp('^['+ALPHA+']{'+LINK_LEN+'}$').test(t)?t:null};
const linkCache={};
const tripIds=d=>[...new Set([...(d.trips||[]),...(d.tripId?[d.tripId]:[])])];
async function ownedIds(uid){try{return (await F.getDocs(F.query(F.collection(db,'trips'),F.where('owner','==',uid)))).docs.map(d=>d.id)}catch(e){return []}}   // needs the 2026-10 rules; harmless without them

async function createTrip(uid,name,dataMap){
 const cur=await F.getDoc(F.doc(db,'users',uid)),keep=tripIds(cur.exists()?cur.data():{});      // trips you already have stay in the list
 const tid=rnd(),b1=F.writeBatch(db);
 b1.set(F.doc(db,'trips',tid),{owner:uid,name,createdAt:F.serverTimestamp()});
 b1.set(F.doc(db,'trips',tid,'members',uid),{role:'owner',name:(auth.currentUser&&auth.currentUser.displayName)||'',joinedAt:F.serverTimestamp()});
 b1.set(F.doc(db,'users',uid),{tripId:tid,trips:[...new Set([...keep,tid])]},{merge:true});
 await b1.commit();
 const rows=Object.entries(dataMap);
 for(let i=0;i<rows.length;i+=100){
  const b=F.writeBatch(db);
  rows.slice(i,i+100).forEach(([k,j])=>b.set(F.doc(db,'trips',tid,'data',k),{j,by:uid,t:F.serverTimestamp()}));
  await b.commit();
 }
 return tid;
}
async function joinWith(u,name,tok){
 const bad=new Error('This link is invalid or has been reset.');
 let c;try{c=await F.getDoc(F.doc(db,'links',tok))}catch(e){throw bad}
 if(!c.exists())throw bad;
 const tid=c.data().tid,mref=F.doc(db,'trips',tid,'members',u.uid);
 try{await F.setDoc(mref,{token:tok,role:'editor',name:String(name).trim().slice(0,30)||'Guest',joinedAt:F.serverTimestamp()})}
 catch(e){const mm=await F.getDoc(mref).catch(()=>null);if(!(mm&&mm.exists()))throw bad}   // already a member is fine
 await F.setDoc(F.doc(db,'users',u.uid),{tripId:tid},{merge:true});
 lsSet('trip',tid);
 return tid;
}
async function cloudInit(){
 const [{initializeApp},au,fs]=await Promise.all([import(FB+'firebase-app.js'),import(FB+'firebase-auth.js'),import(FB+'firebase-firestore.js')]);
 AU=au;F=fs;
 const app=initializeApp(CONFIG);auth=au.getAuth(app);
 db=fs.initializeFirestore(app,{localCache:fs.persistentLocalCache({tabManager:fs.persistentMultipleTabManager()}),experimentalAutoDetectLongPolling:true});   // more reliable on some phone networks
 try{await au.getRedirectResult(auth)}catch(e){console.warn(e)}
 let u=await new Promise(r=>{const off=au.onAuthStateChanged(auth,x=>{off();r(x)})});
 if(!u)return localInit();
 // a guest who already joined one trip taps another trip's link: join it with the same name
 if(S.pending&&u.isAnonymous&&lsGet('guestName')){try{await joinWith(u,lsGet('guestName'),S.pending)}catch(e){console.warn(e)}}
 const uref=fs.doc(db,'users',u.uid),ud=await fs.getDoc(uref),data=ud.exists()?ud.data():{};
 let ids=tripIds(data);const want=lsGet('trip');
 if(!ids.length&&!u.isAnonymous){ids=await ownedIds(u.uid);if(ids.length)fs.setDoc(uref,{trips:ids,tripId:ids[0]},{merge:true}).catch(()=>{})}   // never start a second trip when one already exists
 const first=want&&(ids.includes(want)||want===data.tripId)?want:(data.tripId||ids[0]);
 for(const tid of [first,...ids.filter(x=>x!==first)].filter(Boolean)){
  try{await openTrip(u,tid);return}
  catch(e){
   const gone=e&&(e.code==='permission-denied'||e.message==='not a member');
   if(!gone)throw e;                                             // offline or a temporary problem: do not forget the trip
   console.warn('trip unavailable',tid);
   if(!u.isAnonymous)fs.setDoc(uref,{trips:fs.arrayRemove(tid)},{merge:true}).catch(()=>{});
   if(lsGet('trip')===tid)lsSet('trip','');
   S.lost=true;
  }
 }
 if(u.isAnonymous){if(S.lost)S.error='This trip is no longer available.';return localInit()}
 // first Google sign-in (or no trip left): create a trip from what is on this device
 try{applyRemote(await idbAll())}catch(e){}
 const cur=snap(),tid=await createTrip(u.uid,A.get('trip').dest,cur);
 Object.assign(last,cur);
 return openTrip(u,tid);
}
async function init(){
 try{ if(S.configured)await cloudInit();else await localInit() }
 catch(e){
  console.error(e);
  S.error='Sync problem ('+(e.code||e.message)+').';
  S.mode='local';S.role='owner';ctx=null;
  if(!ready)try{await localInit()}catch(_){ready=true}
 }
 S.inited=true;A.status();
}

/* ---- sign-in, sharing, trips (cloud only) ---- */
const need=()=>{if(!AU)throw new Error('Cloud sync is unavailable right now. Check your connection.')};
S.signIn=async()=>{need();const p=new AU.GoogleAuthProvider();
 try{await AU.signInWithPopup(auth,p)}
 catch(e){
  if(e.code==='auth/popup-closed-by-user'||e.code==='auth/cancelled-popup-request')return;
  if(/popup|not-supported/.test(e.code||'')){await AU.signInWithRedirect(auth,p);return}
  throw e}
 location.reload()};
S.signOut=async()=>{need();await AU.signOut(auth);location.reload()};
const revokeTok=async(tid,t)=>{await F.deleteDoc(F.doc(db,'links',t)).catch(()=>{});await F.deleteDoc(F.doc(db,'trips',tid,'invites',t))};
S.newLink=async(tid=ctx.tid)=>{
 need();
 for(const d of (await F.getDocs(F.collection(db,'trips',tid,'invites'))).docs)await revokeTok(tid,d.id);   // an older link stops working
 const t=mkToken();
 await F.setDoc(F.doc(db,'links',t),{tid,by:ctx.uid});
 await F.setDoc(F.doc(db,'trips',tid,'invites',t),{createdAt:F.serverTimestamp()});
 return linkCache[tid]=linkOf(t);
};
S.getLink=async(tid=ctx.tid)=>{
 need();
 if(linkCache[tid])return linkCache[tid];
 const cur=(await F.getDocs(F.collection(db,'trips',tid,'invites'))).docs.filter(d=>d.id.length===LINK_LEN);
 return linkCache[tid]=cur.length?linkOf(cur[0].id):await S.newLink(tid);
};
S.join=async(name,raw)=>{
 need();
 const tok=parseTok(raw);if(!tok)throw new Error('This link is invalid or has been reset.');
 const u=auth.currentUser||(await AU.signInAnonymously(auth)).user;
 await joinWith(u,name,tok);
 lsSet('guestName',String(name).trim().slice(0,30));
 history.replaceState(null,'',location.pathname+location.search);
 location.reload();
};
S.members=async()=>(await F.getDocs(F.collection(db,'trips',ctx.tid,'members'))).docs.map(d=>({uid:d.id,role:d.data().role,name:d.data().name}));
S.kick=uid=>F.deleteDoc(F.doc(db,'trips',ctx.tid,'members',uid));
S.leave=async()=>{await F.deleteDoc(F.doc(db,'trips',ctx.tid,'members',ctx.uid));await F.deleteDoc(F.doc(db,'users',ctx.uid)).catch(()=>{});lsSet('trip','');location.reload()};
S.myTrips=async()=>{
 need();
 const [ud,owned]=await Promise.all([F.getDoc(F.doc(db,'users',ctx.uid)),ownedIds(ctx.uid)]);
 const d=ud.exists()?ud.data():{},ids=[...new Set([...tripIds(d),...owned])];
 const missing=owned.filter(x=>!(d.trips||[]).includes(x));
 if(missing.length)F.setDoc(F.doc(db,'users',ctx.uid),{trips:F.arrayUnion(...missing)},{merge:true}).catch(()=>{});   // put forgotten trips back in the list
 const rows=await Promise.all(ids.map(async tid=>{
  try{
   const [t,td]=await Promise.all([F.getDoc(F.doc(db,'trips',tid,'data','trip')),F.getDoc(F.doc(db,'trips',tid)).catch(()=>null)]);
   const v=t.exists()?JSON.parse(t.data().j):(tid===ctx.tid?A.get('trip'):null);
   return v?{tid,dest:v.dest,title:(td&&td.exists()&&td.data().title)||'',start:v.start,end:v.end,current:tid===ctx.tid}:null;
  }catch(e){return null}
 }));
 const out=rows.filter(Boolean);
 try{localStorage.setItem('tripsCache',JSON.stringify(out))}catch(e){}
 return out;
};
S.cachedTrips=()=>{try{return JSON.parse(localStorage.getItem('tripsCache')||'null')}catch(e){return null}};
S.renameTrip=async(tid,name)=>{need();await F.setDoc(F.doc(db,'trips',tid),{title:name},{merge:true})};   // the list name only; the destination on the overview is untouched
S.switchTrip=tid=>{lsSet('trip',tid);location.reload()};
S.newTrip=async()=>{
 need();
 const ud=await F.getDoc(F.doc(db,'users',ctx.uid)),d=ud.exists()?ud.data():{};
 if(tripIds(d).length>=20)throw new Error('You can keep up to 20 trips.');
 const tpl=A.template(),map=Object.fromEntries(Object.entries(tpl).map(([k,v])=>[k,JSON.stringify(v)]));
 const tid=await createTrip(ctx.uid,tpl.trip.dest,map);
 lsSet('trip',tid);location.reload();
};
S.deleteTrip=async tid=>{
 need();
 const wasCurrent=tid===ctx.tid,list=async n=>(await F.getDocs(F.collection(db,'trips',tid,n))).docs;
 const wipe=async docs=>{for(let i=0;i<docs.length;i+=100){const b=F.writeBatch(db);docs.slice(i,i+100).forEach(d=>b.delete(d.ref));await b.commit()}};
 await wipe(await list('data'));                                    // content and photo chunks
 const inv=await list('invites');for(const d of inv)await F.deleteDoc(F.doc(db,'links',d.id)).catch(()=>{});await wipe(inv);
 await wipe((await list('members')).filter(d=>d.id!==ctx.uid));    // guests lose access
 await F.deleteDoc(F.doc(db,'trips',tid));
 await F.deleteDoc(F.doc(db,'trips',tid,'members',ctx.uid));         // the owner's own membership goes last
 const uref=F.doc(db,'users',ctx.uid);
 await F.setDoc(uref,{trips:F.arrayRemove(tid)},{merge:true});
 const d=(await F.getDoc(uref)).data()||{},rest=tripIds(d).filter(x=>x!==tid);
 if(d.tripId===tid)await F.setDoc(uref,{tripId:rest[0]||F.deleteField()},{merge:true});
 delete linkCache[tid];try{localStorage.removeItem('tripsCache')}catch(e){}
 if(wasCurrent){
  if(rest.length){lsSet('trip',rest[0]);location.reload()}
  else await S.newTrip();
 }
};

init();
