import crypto from 'node:crypto';
import { digest, emailAddress, newPassword, passwordHash, passwordMatches, publicUser, SESSION_TTL_MS } from './auth-store.js';
import { httpError } from './security.js';
import { authMessage } from './mailer.js';

export function cookieToken(req) {
  const part = (req.headers.cookie || '').split(';').find(value => value.trim().startsWith('notesgym_session='));
  return part ? part.trim().slice('notesgym_session='.length) : undefined;
}
const generic = { message: 'Si cette adresse peut recevoir ce message, un email a été envoyé. Vérifiez aussi vos indésirables.' };
export class AuthService {
  constructor(store, { mailer, publicOrigin, cookieFlags, clientIP }) {
    Object.assign(this, { store, mailer, publicOrigin, cookieFlags, clientIP });
    this.mailJobs = new Set();
  }
  current(req) {
    const user = this.store.current(cookieToken(req));
    return user && (user.email_verified || user.legacy_access) ? user : null;
  }
  requireMail() { if (!this.mailer.configured || !this.publicOrigin) throw httpError(503, 'Les emails ne sont pas configurés. Contactez l’administrateur.'); }
  mail(to, kind, token) {
    const route = kind === 'reset' ? 'reset-password' : 'verify-email';
    // Fragment avoids exposing bearer tokens to HTTP request/access logs.
    const link = token ? `${this.publicOrigin}/${route}#token=${token}&kind=${kind}` : undefined;
    const job = Promise.resolve().then(() => this.mailer.send(authMessage(to, kind, link)))
      .catch(() => { console.error('NotesGym: transactional email delivery failed; check SMTP configuration.'); });
    this.mailJobs.add(job); job.finally(() => this.mailJobs.delete(job));
  }
  quota(req, action, email) {
    const s = this.store;
    if (!s.limit(`ip:${action}:${digest(this.clientIP(req))}`, action === 'login' ? 20 : 10, 600000)) throw httpError(429, 'Trop de tentatives. Réessayez plus tard.');
    if (email && !s.limit(`account:${action}:${digest(email)}`, action === 'login' ? 20 : 3, action === 'login' ? 600000 : 3600000)) throw httpError(429, 'Trop de tentatives. Réessayez plus tard.');
    if (action === 'register' && !s.limit('global:register', 100, 3600000)) throw httpError(429, 'Trop de tentatives. Réessayez plus tard.');
  }
  cookie(req, token = '') { return `notesgym_session=${token}; ${this.cookieFlags(req)}; Max-Age=${token ? SESSION_TTL_MS / 1000 : 0}`; }
  async handle(req, pathname, body) {
    const action = pathname.slice('/api/auth/'.length);
    const s = this.store;
    if (action === 'me' && req.method === 'GET') {
      const user = this.current(req); if (!user) throw httpError(401, 'Authentication required');
      return { data: publicUser(user) };
    }
    if (req.method !== 'POST' || !['register', 'login', 'logout', 'resend-verification', 'verify-email', 'forgot-password', 'reset-password', 'change-password', 'change-email'].includes(action)) throw httpError(404, 'Not found');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Invalid request');
    if (action === 'logout') {
      s.logout(cookieToken(req));
      return { data: { ok: true }, headers: { 'set-cookie': this.cookie(req) } };
    }
    if (['register', 'login', 'forgot-password', 'resend-verification'].includes(action)) {
      // Login errors stay generic even for malformed email input.
      let email;
      try { email = emailAddress(body.email); } catch (error) {
        this.quota(req, action);
        if (action === 'login') { await passwordMatches(typeof body.password === 'string' ? body.password : ''); throw httpError(401, 'Email ou mot de passe incorrect.'); }
        throw error;
      }
      this.quota(req, action, email);
      const user = s.byEmail(email);
      if (action === 'login') {
        const valid = await passwordMatches(body.password, user?.password);
        if (!user || !valid) throw httpError(401, 'Email ou mot de passe incorrect.');
        if (!user.email_verified && !user.legacy_access) throw httpError(403, 'Confirmez votre adresse email avant de vous connecter.');
        if (user.password.startsWith('scrypt-v1:')) s.db.prepare('UPDATE users SET password=? WHERE id=?').run(await passwordHash(body.password), user.id);
        return { data: { user: publicUser(user) }, headers: { 'set-cookie': this.cookie(req, s.session(user.id)) } };
      }
      this.requireMail();
      if (action === 'register') {
        if (process.env.NOTESGYM_REGISTRATION_ENABLED === 'false') throw httpError(403, 'Les inscriptions sont fermées.');
        const password = await passwordHash(newPassword(body.password, body.confirmPassword));
        if (s.available(email)) {
          const id = crypto.randomUUID();
          const token = s.transaction(() => { s.insert({ id, email, password, created_date: new Date(s.now()).toISOString() }); return s.issue(id, 'verify', email); });
          this.mail(email, 'verify', token);
        }
      } else if (user && (action === 'forgot-password' || !user.email_verified)) {
        const kind = action === 'forgot-password' ? 'reset' : 'verify';
        const token = s.transaction(() => s.issue(user.id, kind, email));
        this.mail(email, kind, token);
      }
      return { data: generic };
    }
    this.quota(req, action);
    if (action === 'verify-email') {
      const kind = body.kind === 'email' ? 'email' : body.kind === 'verify' ? 'verify' : null;
      if (!kind) throw httpError(400, 'Lien invalide.');
      const record = s.token(body.token, kind);
      const user = s.byId(record.user_id);
      s.transaction(() => {
        // Recheck inside the write transaction before consuming.
        s.token(body.token, kind);
        if (kind === 'email') {
          if (!s.available(record.target_email, user.id)) throw httpError(409, 'Cette adresse ne peut pas être utilisée.');
          s.db.prepare('INSERT OR IGNORE INTO email_owners VALUES(?,?)').run(record.target_email, user.id);
          s.db.prepare('UPDATE users SET email=?,email_verified=1,legacy_access=0 WHERE id=?').run(record.target_email, user.id);
          s.revoke(user.id); s.clearTokens(user.id);
        } else {
          if (user.email !== record.target_email) throw httpError(400, 'Lien invalide.');
          s.db.prepare('UPDATE users SET email_verified=1,legacy_access=0 WHERE id=?').run(user.id);
          s.db.prepare('DELETE FROM tokens WHERE user_id=? AND kind=?').run(user.id, kind);
        }
      });
      if (kind === 'email') this.mail(user.email, 'changed');
      return { data: { message: 'Adresse email vérifiée. Vous pouvez vous connecter.' }, ...(kind === 'email' ? { headers: { 'set-cookie': this.cookie(req) } } : {}) };
    }
    if (action === 'reset-password') {
      const record = s.token(body.token, 'reset');
      const password = await passwordHash(newPassword(body.password, body.confirmPassword));
      s.transaction(() => {
        s.token(body.token, 'reset');
        s.db.prepare('UPDATE users SET password=? WHERE id=?').run(password, record.user_id);
        s.revoke(record.user_id); s.clearTokens(record.user_id);
      });
      this.mail(s.byId(record.user_id).email, 'password');
      return { data: { message: 'Mot de passe modifié. Reconnectez-vous.' }, headers: { 'set-cookie': this.cookie(req) } };
    }
    const user = this.current(req); if (!user) throw httpError(401, 'Authentication required');
    if (!await passwordMatches(body.currentPassword, user.password)) throw httpError(401, 'Mot de passe actuel incorrect.');
    if (action === 'change-password') {
      const password = await passwordHash(newPassword(body.password, body.confirmPassword));
      s.transaction(() => { s.db.prepare('UPDATE users SET password=? WHERE id=?').run(password, user.id); s.revoke(user.id); s.clearTokens(user.id); });
      this.mail(user.email, 'password');
      return { data: { message: 'Mot de passe modifié. Reconnectez-vous.' }, headers: { 'set-cookie': this.cookie(req) } };
    }
    this.requireMail();
    const email = emailAddress(body.email);
    if (email === user.email || !s.available(email, user.id)) throw httpError(409, 'Cette adresse ne peut pas être utilisée.');
    const token = s.transaction(() => s.issue(user.id, 'email', email));
    this.mail(email, 'email', token);
    return { data: { message: 'Confirmez la nouvelle adresse avec le lien reçu. Votre adresse actuelle reste active jusque-là.' } };
  }
}
