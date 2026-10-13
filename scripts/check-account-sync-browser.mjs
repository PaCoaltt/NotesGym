import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
const { chromium }=await import(process.argv[2]?pathToFileURL(process.argv[2]).href:'playwright');
await mkdir('.notesgym-test-data',{recursive:true});
const directory=await mkdtemp(path.join(process.cwd(),'.notesgym-test-data','account-browser-'));
const child=spawn(process.execPath,['server.js'],{windowsHide:true,env:{...process.env,PORT:'0',NOTESGYM_DATA_DIR:directory,NOTESGYM_USERS:'sync@example.invalid:test-only,other@example.invalid:test-only'},stdio:['ignore','pipe','pipe']});
let browser;
try {
 const base=await new Promise((resolve,reject)=>{let output='';let errors='';const timer=setTimeout(()=>reject(new Error('Server startup timed out')),15000);child.stderr.on('data',chunk=>{errors+=chunk;});child.once('exit',()=>{clearTimeout(timer);reject(new Error(errors));});child.stdout.on('data',chunk=>{output+=chunk;const match=/localhost:(\d+)/.exec(output);if(match){clearTimeout(timer);resolve('http://127.0.0.1:'+match[1]);}});});
 browser=await chromium.launch({headless:true,channel:process.argv[3]||undefined});
 const note={matiere:'Math',note:4,coefficient:1,annee:'Synced year',semestre:'Semestre 1',date:'2026-09-01'};
 async function device(email,width=390) {
  const context=await browser.newContext({viewport:{width,height:900}});
  const login=await context.request.post(base+'/api/auth/login',{data:{email,password:'test-only'}});assert.equal(login.status(),200);
  const user=(await login.json()).user;
  await context.addInitScript(id=>{localStorage.setItem('notesgym_language','fr');localStorage.setItem('notesgym_patch_navigation-ux-update_'+id,'1');history.replaceState({usr:{filter:{year:'Synced year'}}},'');},user.id);
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  return {context,user,page,errors};
 }
 const a=await device('sync@example.invalid');
 const ids=[];
 for(let i=0;i<3;i++){const response=await a.context.request.post(base+'/api/notes',{data:{...note,date:'2026-09-0'+(i+1)}});assert.equal(response.status(),201);ids.push('id:'+(await response.json()).id);}
 await a.context.addInitScript(({id,ids})=>localStorage.setItem('notesgym_simulation_settings_v1_'+encodeURIComponent(id),JSON.stringify({'Synced year':{Math:{remaining:4,coefficient:2,knownNoteIds:ids}}})),{id:a.user.id,ids});
 const b=await device('sync@example.invalid',1440);
 const count=page=>page.getByRole('spinbutton',{name:'Math Évaluations restantes cette année'});
 const coefficient=page=>page.getByRole('spinbutton',{name:'Math Coefficient moyen attendu'});
 const saved=page=>page.getByText('Paramètres synchronisés avec le compte.',{exact:true}).waitFor();
 async function value(locator,expected){await locator.waitFor();await locator.evaluate((element,expected)=>new Promise((resolve,reject)=>{const start=Date.now();const tick=()=>{if(element.value===String(expected))resolve();else if(Date.now()-start>15000)reject(new Error('Expected '+expected+', got '+element.value));else setTimeout(tick,50);};tick();}),expected);}
 async function focus(page){await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));delete document.visibilityState;});}
 await a.page.goto(base+'/Insights');await saved(a.page);await value(count(a.page),4);await value(coefficient(a.page),2);
 assert.equal(await a.page.evaluate(id=>localStorage.getItem('notesgym_simulation_settings_v1_'+encodeURIComponent(id)),a.user.id),null);
 await b.page.goto(base+'/Insights');await saved(b.page);await value(count(b.page),4);await value(coefficient(b.page),2);
 await count(a.page).fill('6');await coefficient(a.page).fill('3');await saved(a.page);
 await focus(b.page);await value(count(b.page),6);await value(coefficient(b.page),3);
 await count(a.page).fill('4');await count(a.page).fill('7');await saved(a.page);
 await focus(b.page);await value(count(b.page),7);
 await b.context.request.post(base+'/api/notes',{data:{...note,date:'2026-09-04'}});
 // Device A still displays its old count; a coefficient-only edit must not reset it.
 await coefficient(a.page).fill('4');await saved(a.page);await value(count(a.page),6);
 await focus(b.page);await value(count(b.page),6);await focus(a.page);await value(count(a.page),6);
 const other=await device('other@example.invalid');await other.context.request.post(base+'/api/notes',{data:note});
 await other.page.goto(base+'/Insights');await saved(other.page);await value(count(other.page),2);
 await count(other.page).fill('12');await saved(other.page);await focus(b.page);await value(count(b.page),6);
 await a.page.route('**/api/simulation-settings',route=>route.request().method()==='PATCH'?route.fulfill({status:503,json:{error:'Test failure'}}):route.continue());
 await count(a.page).fill('9');await a.page.getByRole('status').filter({hasText:'Synchronisation impossible. Les dernières modifications ne sont pas enregistrées.'}).waitFor();
 await focus(b.page);await value(count(b.page),6);
 await a.page.unroute('**/api/simulation-settings');await a.page.getByRole('button',{name:'Réessayer',exact:true}).click();await saved(a.page);
 await focus(b.page);await value(count(b.page),9);await b.page.reload();await saved(b.page);await value(count(b.page),9);await value(coefficient(b.page),4);
 // Simulate a committed write whose response is lost: retry must not undo a new grade.
 await a.page.route('**/api/simulation-settings',async route=>{
  if(route.request().method()==='PATCH'){await route.fetch();return route.fulfill({status:503,json:{error:'Lost acknowledgement'}});}
  return route.continue();
 });
 await count(a.page).fill('10');await a.page.getByRole('status').filter({hasText:'Synchronisation impossible.'}).waitFor();
 await focus(b.page);await value(count(b.page),10);
 await b.context.request.post(base+'/api/notes',{data:{...note,date:'2026-09-05'}});
 await focus(b.page);await value(count(b.page),9);
 await a.page.unroute('**/api/simulation-settings');await a.page.getByRole('button',{name:'Réessayer',exact:true}).click();await saved(a.page);
 await value(count(a.page),9);await focus(b.page);await value(count(b.page),9);
 await mkdir('.notesgym-test-data/account-sync-qa',{recursive:true});
 await a.page.screenshot({path:'.notesgym-test-data/account-sync-qa/mobile.png',fullPage:true});
 await b.page.screenshot({path:'.notesgym-test-data/account-sync-qa/desktop.png',fullPage:true});
 assert.deepEqual([...a.errors,...b.errors,...other.errors],[]);
 console.log('Real browser account sync passed: migration, two devices, rapid edits, single decrement, account isolation, failed-save status, retry and lost-acknowledgement idempotency.');
} finally {if(browser)await browser.close();await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
