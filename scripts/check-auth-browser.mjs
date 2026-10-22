import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { legacyFixture } from '../test/helpers/legacy-fixture.js';
import { AuthStore } from '../server/auth-store.js';

// Optional UI QA: node scripts/check-auth-browser.mjs [path-to-playwright] [channel]
// Only synthetic local data. SMTP remains disabled: no real messages are sent.
const { chromium } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : 'playwright');
await mkdir('.notesgym-test-data', { recursive: true });
const directory = await mkdtemp(path.join(process.cwd(), '.notesgym-test-data', 'auth-browser-'));
const password = 'Synthetic browser password!';
const users = await legacyFixture(directory, ['browser@example.invalid', 'other@example.invalid'], { password, policy: 'require-verification' });
const store = new AuthStore(path.join(directory, 'auth.sqlite'));
const verification = store.issue(users[0].id, 'verify', users[0].email);
const reset = store.issue(users[1].id, 'reset', users[1].email);
store.close();
const child = spawn(process.execPath, ['server.js'], { windowsHide: true, env: {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(NOTESGYM_|SMTP_)/i.test(key))),
  PORT: '0', NOTESGYM_DATA_DIR: directory,
}, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  const base = await new Promise((resolve, reject) => {
    let output = ''; let errors = '';
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 15000);
    child.stderr.on('data', chunk => { errors += chunk; });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(errors)); });
    child.stdout.on('data', chunk => { output += chunk; const port = /localhost:(\d+)/.exec(output)?.[1]; if (port) { clearTimeout(timer); resolve('http://127.0.0.1:' + port); } });
  });
  browser = await chromium.launch({ headless: true, channel: process.argv[3] || undefined });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    const context = await browser.newContext({ viewport }); const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.addInitScript(ids => {
      for (const id of ids) { localStorage.setItem(`notesgym_tutorial_${id}`, '1'); localStorage.setItem(`notesgym_patch_navigation-ux-update_${id}`, '1'); }
    }, users.map(user => user.id));
    await page.goto(base + '/register');
    await page.getByLabel('Adresse email', { exact: true }).fill('new@example.invalid');
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill(password + 'mismatch');
    await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'ne correspondent pas' }).waitFor();
    await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'emails ne sont pas configurés' }).waitFor();
    await page.goto(base + '/login');
    await page.getByLabel('Adresse email', { exact: true }).fill(users[0].email);
    await page.getByLabel('Mot de passe', { exact: true }).fill('wrong');
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'incorrect' }).waitFor();
    if (viewport.width === 390) {
      await page.getByLabel('Mot de passe', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Confirmez votre adresse' }).waitFor();
      await page.goto(`${base}/verify-email#token=${verification}&kind=verify`);
      await page.getByRole('button', { name: 'Confirmer mon adresse', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Adresse email vérifiée' }).waitFor();
      assert.equal(new URL(page.url()).hash, '');
      await page.goto(`${base}/verify-email#token=${verification}&kind=verify`);
      await page.getByRole('button', { name: 'Confirmer mon adresse', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'expiré ou déjà utilisé' }).waitFor();
    }
    await page.goto(base + '/login');
    await page.getByLabel('Adresse email', { exact: true }).fill(users[0].email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await page.waitForURL(base + '/');
    await page.goto(base + '/account');
    await page.getByText('Adresse vérifiée', { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Account must fit viewport');
    await page.screenshot({ path: path.join(directory, `account-${viewport.width}.png`), fullPage: true });
    const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Changer l’adresse email', exact: true }) });
    await form.getByLabel('Nouvelle adresse email').fill('next@example.invalid');
    await form.getByLabel('Mot de passe actuel').fill(password);
    await form.getByRole('button').click();
    await page.getByRole('alert').filter({ hasText: 'emails ne sont pas configurés' }).waitFor();
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
    await page.waitForURL(base + '/login');
    assert.equal((await context.request.get(base + '/api/auth/me')).status(), 401);
    // Account uses the same menu button as Preferences, with keyboard navigation.
    // Logout remains available only on the account page, including failure/retry.
    assert.equal((await context.request.post(base + '/api/auth/login', { data: { email: users[0].email, password } })).status(), 200);
    const oldCookie = (await context.cookies()).find(cookie => cookie.name === 'notesgym_session');
    assert.ok(oldCookie);
    await page.goto(base + '/Dashboard');
    await page.getByRole('button', { name: viewport.width < 768 ? 'Plus…' : 'Ouvrir les options', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'Options', exact: true });
    const accountButton = menu.getByRole('button', { name: 'Mon compte', exact: true });
    await accountButton.waitFor();
    await page.waitForFunction(() => {
      const panel = document.querySelector('aside[role="dialog"]');
      return panel && Math.abs(panel.getBoundingClientRect().right - innerWidth) < 1 &&
        [...panel.querySelectorAll('[style]')].every(element => Number(getComputedStyle(element).opacity) >= 0.99);
    });
    await accountButton.scrollIntoViewIfNeeded();
    assert.equal(await menu.getByRole('button', { name: 'Se déconnecter', exact: true }).count(), 0);
    const preferences = menu.getByRole('button', { name: 'Préférences', exact: true });
    assert.equal(await accountButton.getAttribute('class'), await preferences.getAttribute('class'));
    assert.equal(await accountButton.evaluate(element => element.style.boxShadow), await preferences.evaluate(element => element.style.boxShadow));
    assert.equal(await accountButton.locator('svg').count(), 2, 'user icon and chevron');
    const accountBounds = await accountButton.boundingBox(); const preferencesBounds = await preferences.boundingBox();
    assert.equal(accountBounds.width, preferencesBounds.width); assert.equal(accountBounds.height, preferencesBounds.height);
    assert.ok(accountBounds.y < preferencesBounds.y, 'Account precedes Preferences');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Menu must fit viewport');
    await page.screenshot({ path: path.join(directory, `account-menu-${viewport.width}.png`), fullPage: true });
    await accountButton.focus();
    await accountButton.press(viewport.width === 390 ? 'Enter' : 'Space');
    await page.waitForURL(base + '/account');
    await page.getByRole('heading', { name: 'Mon compte', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Se déconnecter', exact: true }).count(), 1);
    await page.route('**/api/auth/logout', route => route.fulfill({ status: 503, json: { error: 'Indisponibilité simulée. Réessayez.' } }));
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Indisponibilité simulée' }).waitFor();
    assert.equal((await context.request.get(base + '/api/auth/me')).status(), 200);
    assert.equal(new URL(page.url()).pathname, '/account');
    await page.unroute('**/api/auth/logout');
    let finishLogout;
    const pendingLogout = new Promise(resolve => { finishLogout = resolve; });
    await page.route('**/api/auth/logout', async route => { await pendingLogout; await route.continue(); });
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Se déconnecter', exact: true }).isDisabled(), true);
    finishLogout();
    await page.waitForURL(base + '/login');
    await page.getByRole('heading', { name: 'Connexion', exact: true }).waitFor();
    assert.equal((await context.cookies()).find(cookie => cookie.name === 'notesgym_session'), undefined);
    for (const endpoint of ['/api/auth/me', '/api/notes', '/api/simulation-settings']) {
      assert.equal((await fetch(base + endpoint, { headers: { cookie: 'notesgym_session=' + oldCookie.value } })).status, 401, 'revoked browser cookie: ' + endpoint);
    }
    await page.reload();
    await page.getByRole('heading', { name: 'Connexion', exact: true }).waitFor();
    await page.unroute('**/api/auth/logout');
    await page.goto(base + '/forgot-password');
    await page.getByLabel('Adresse email').fill('unknown@example.invalid');
    await page.getByRole('button', { name: 'Envoyer le lien', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'emails ne sont pas configurés' }).waitFor();
    if (viewport.width === 390) {
      await page.goto(`${base}/reset-password#token=${reset}&kind=reset`);
      await page.getByLabel('Mot de passe', { exact: true }).fill(password + 'next');
      await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill(password + 'next');
      await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
      await page.getByRole('status').filter({ hasText: 'Mot de passe modifié' }).waitFor();
    }
    assert.deepEqual(errors, []);
    console.log(`Auth browser QA passed at ${viewport.width}px (synthetic data, no SMTP delivery).`);
    await context.close();
  }
  console.log('Screenshots: ' + directory);
} finally {
  if (browser) await browser.close();
  if (child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
}
