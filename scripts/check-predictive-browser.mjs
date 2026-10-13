import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
const modulePath=process.argv[2];
const { chromium }=await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const base=process.argv[3] || 'http://127.0.0.1:5178';
const notes=[
 ...[4,4.2,4.4,4.1,4.5,4.3].map((note,i)=>({id:'current-'+i,matiere:'Math',note,coefficient:1,annee:'Ma classe actuelle',semestre:i<3?'Semestre 1':'Semestre 2',date:'2026-'+(i<3?'09':'10')+'-0'+(i%3+1)})),
 ...[5,5.2,5.4].map((note,i)=>({id:'old-'+i,matiere:'Math',note,coefficient:1,annee:'Avant le changement',semestre:'Semestre 1',date:'2025-09-0'+(i+1),archived:true}))
];
const browser=await chromium.launch({headless:true,channel:process.argv[4] || undefined});
try {
 for(const viewport of [{width:390,height:844},{width:1440,height:1000}]) {
  const context=await browser.newContext({viewport}); const page=await context.newPage(); const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(()=>{localStorage.setItem('notesgym_language','fr');localStorage.setItem('notesgym_patch_navigation-ux-update_qa','1');localStorage.setItem('notesgym_patch_navigation-ux-update_qa-other','1');history.replaceState({usr:{filter:{year:sessionStorage.getItem('qa_target_year') || 'Ma classe actuelle',semester:'Semestre 1'}}},'');});
  let account='qa';
  await page.route('**/api/auth/me',route=>route.fulfill({json:{id:account,email:account+'@example.invalid'}}));
  let currentNotes=[...notes];
  await page.route('**/api/notes',route=>route.fulfill({json:currentNotes}));
  await page.goto(base+'/Insights');
  await page.getByRole('switch').waitFor();
  assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'true');
  await page.waitForFunction(()=>document.body.textContent.includes('3 anciennes notes utilisées'));
  currentNotes=notes.filter(n=>n.archived || n.id==='current-0');
  await page.reload(); await page.getByRole('switch').waitFor();
  await page.waitForFunction(()=>document.body.textContent.includes('3 anciennes notes utilisées'));
  currentNotes=currentNotes.map(n=>n.archived?{...n,matiere:'Algebra'}:n);
  await page.reload(); await page.getByRole('switch').waitFor();
  await page.waitForFunction(()=>document.body.textContent.includes('0 anciennes notes utilisées'));
  await page.locator('summary').click();
  await page.locator('details select').selectOption(JSON.stringify(['Ma classe actuelle','Math']));
  await page.waitForFunction(()=>document.body.textContent.includes('3 anciennes notes utilisées'));
  await page.locator('details select').selectOption('__ignore__');
  await page.waitForFunction(()=>document.body.textContent.includes('0 anciennes notes utilisées'));
  await page.locator('details select').selectOption(JSON.stringify(['Ma classe actuelle','Math']));
  await page.waitForFunction(()=>document.body.textContent.includes('3 anciennes notes utilisées'));
  currentNotes=[...notes]; await page.reload(); await page.getByRole('switch').waitFor();
  await page.getByRole('switch').click();
  assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'false');
  await page.reload();
  assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'false');
  await page.getByRole('switch').click();
  await mkdir('.notesgym-test-data/predictive-qa',{recursive:true});
  await page.screenshot({path:'.notesgym-test-data/predictive-qa/insights-'+viewport.width+'.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Insights overflows viewport');
  const remaining=page.getByRole('spinbutton',{name:'Math Évaluations restantes cette année'});
  const coefficient=page.getByRole('spinbutton',{name:'Math Coefficient moyen attendu'});
  await remaining.fill('4'); await coefficient.fill('2');
  await page.reload(); await remaining.waitFor();
  assert.equal(await remaining.inputValue(),'4'); assert.equal(await coefficient.inputValue(),'2');
  currentNotes.push({id:'added-grade',matiere:'Math',note:4.7,coefficient:1,annee:'Ma classe actuelle',semestre:'Semestre 2',date:'2026-10-04'});
  await page.reload(); await remaining.waitFor();
  assert.equal(await remaining.inputValue(),'3');
  await page.reload(); await remaining.waitFor(); assert.equal(await remaining.inputValue(),'3');
  currentNotes=currentNotes.map(n=>n.id==='added-grade'?{...n,note:5}:n);
  await page.reload(); await remaining.waitFor(); assert.equal(await remaining.inputValue(),'3');
  currentNotes=notes; await page.reload(); await remaining.waitFor(); assert.equal(await remaining.inputValue(),'3');
  currentNotes.push(...notes.filter(n=>!n.archived).slice(0,3).map(n=>({...n,id:'next-year-'+n.id,annee:'Après'})));
  await page.evaluate(()=>sessionStorage.setItem('qa_target_year','Après'));
  await page.reload(); await remaining.waitFor(); assert.equal(await remaining.inputValue(),'2');
  await remaining.fill('8'); await page.reload(); await remaining.waitFor(); assert.equal(await remaining.inputValue(),'8');
  await page.evaluate(()=>sessionStorage.setItem('qa_target_year','Ma classe actuelle'));
  await page.reload(); await remaining.waitFor(); assert.equal(await remaining.inputValue(),'3');
  account='qa-other';
  await page.reload(); await remaining.waitFor(); assert.equal(await remaining.inputValue(),'2');
  account='qa';
  await page.reload(); await remaining.waitFor(); assert.equal(await remaining.inputValue(),'3');
  await page.goto(base+'/Lab');
  await page.getByText('Année seule vs historique',{exact:false}).first().waitFor();
  const comparison=page.locator('section').filter({has:page.getByRole('heading',{name:/Année seule vs historique/})});
  assert.equal(await comparison.locator('div.rounded-xl').getByText('3',{exact:true}).count(),2);
  assert.equal(await comparison.getByText('Erreur médiane absolue',{exact:true}).count(),2);
  assert.equal(await comparison.getByText('Largeur moyenne',{exact:true}).count(),2);
  const selects=page.locator('main select'); await selects.nth(1).selectOption('Semestre 2');
  assert.equal(await comparison.locator('div.rounded-xl').getByText('3',{exact:true}).count(),2);
  await page.screenshot({path:'.notesgym-test-data/predictive-qa/lab-'+viewport.width+'.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Lab overflows viewport');
  for(const name of ['Sensibilité','Playground','Distributions']) {
   await page.getByRole('button',{name,exact:true}).click();
   await page.locator('main section').first().waitFor();
  }
  assert.deepEqual(errors,[]);
  console.log('Browser QA passed at '+viewport.width+'px: Free year labels, automatic and manual sparse history, opt-out, saved settings, 4-to-3 decrement and Lab');
  await context.close();
 }
} finally {await browser.close();}
