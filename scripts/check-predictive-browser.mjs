import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
const modulePath=process.argv[2];
const { chromium }=await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const base=process.argv[3] || 'http://127.0.0.1:5178';
const notes=[
 ...[4,4.2,4.4,4.1,4.5,4.3].map((note,i)=>({id:'current-'+i,matiere:'Math',note,coefficient:1,annee:'2026/27',semestre:i<3?'Semestre 1':'Semestre 2',date:'2026-'+(i<3?'09':'10')+'-0'+(i%3+1)})),
 ...[5,5.2,5.4].map((note,i)=>({id:'old-'+i,matiere:'Algebra',note,coefficient:1,annee:'2025/26',semestre:'Semestre 1',date:'2025-09-0'+(i+1),archived:true}))
];
const browser=await chromium.launch({headless:true,channel:process.argv[4] || undefined});
try {
 for(const viewport of [{width:390,height:844},{width:1440,height:1000}]) {
  const context=await browser.newContext({viewport}); const page=await context.newPage(); const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(()=>{localStorage.setItem('notesgym_language','fr');localStorage.setItem('notesgym_patch_navigation-ux-update_qa','1');history.replaceState({usr:{filter:{year:'2026/27',semester:'Semestre 1'}}},'');});
  await page.route('**/api/auth/me',route=>route.fulfill({json:{id:'qa',email:'qa@example.invalid'}}));
  await page.route('**/api/notes',route=>route.fulfill({json:notes}));
  await page.goto(base+'/Insights');
  await page.getByRole('switch').waitFor();
  assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'true');
  await page.locator('summary').click();
  await page.locator('details select').selectOption(JSON.stringify(['2026/27','Math']));
  await page.waitForFunction(()=>document.body.textContent.includes('3 anciennes notes utilisées'));
  await page.getByRole('switch').click();
  assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'false');
  await page.reload();
  assert.equal(await page.getByRole('switch').getAttribute('aria-checked'),'false');
  await page.getByRole('switch').click();
  await mkdir('.notesgym-test-data/predictive-qa',{recursive:true});
  await page.screenshot({path:'.notesgym-test-data/predictive-qa/insights-'+viewport.width+'.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Insights overflows viewport');
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
  console.log('Browser QA passed at '+viewport.width+'px: annual scope, links, toggle persistence, paired metrics and Lab tabs');
  await context.close();
 }
} finally {await browser.close();}
