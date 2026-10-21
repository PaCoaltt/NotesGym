import fs from 'node:fs/promises';
import nodemailer from 'nodemailer';

export async function createMailer(env = process.env) {
  if (!env.SMTP_HOST) return { configured: false, send: async () => { throw new Error('SMTP is not configured'); } };
  const password = env.SMTP_PASSWORD_FILE ? (await fs.readFile(env.SMTP_PASSWORD_FILE, 'utf8')).trimEnd() : env.SMTP_PASSWORD;
  const port = Number(env.SMTP_PORT || 587);
  if (!env.SMTP_FROM || /[\r\n]/.test(env.SMTP_FROM) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP configuration');
  if (env.SMTP_USER && !password) throw new Error('SMTP password required');
  const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port, secure: port === 465,
    requireTLS: port !== 465, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: password } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false });
  return { configured: true, send: message => transport.sendMail({ from: env.SMTP_FROM, ...message }) };
}

const titles = { verify: 'Confirmez votre adresse email', reset: 'Réinitialisez votre mot de passe', email: 'Confirmez votre nouvelle adresse email', password: 'Votre mot de passe a été modifié', changed: 'Votre adresse email a été modifiée' };
const escapeHtml = text => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function authMessage(to, kind, link) {
  const title = titles[kind];
  const description = link ? `Ce lien personnel expire dans ${kind === 'reset' ? '30 minutes' : '24 heures'} et ne fonctionne qu’une fois.` : 'Si vous n’êtes pas à l’origine de ce changement, contactez l’administrateur et récupérez votre compte immédiatement.';
  return { to, subject: `NotesGym — ${title}`, text: `${title}\n\n${description}\n${link || ''}\n\nSi vous n’avez pas demandé ce lien, ignorez cet email.\nNotesGym`,
    html: `<div style="background:#e0e5eb;padding:24px;font-family:Arial,sans-serif;color:#394b5c"><div style="max-width:480px;margin:auto;background:#fff;border-radius:16px;padding:24px"><p style="font-weight:bold">NotesGym</p><h1 style="font-size:22px">${title}</h1><p>${description}</p>${link ? `<p><a style="display:inline-block;padding:14px 20px;background:#394b5c;color:white;border-radius:8px" href="${escapeHtml(link)}">${title}</a></p><p style="word-break:break-all;font-size:12px">${escapeHtml(link)}</p>` : ''}<p style="font-size:12px">Si vous n’avez pas demandé ce lien, ignorez cet email.</p></div></div>` };
}
