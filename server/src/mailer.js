import nodemailer from 'nodemailer';
import { Socket } from 'node:net';

export function mailConfigured(env = process.env) {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.MAIL_FROM && env.PUBLIC_SITE_ORIGIN);
}
export function makeMailTransport(env = process.env, { signal } = {}) {
  if (!mailConfigured(env)) return null;
  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP port.');
  // A dedicated owned socket lets the order worker enforce an absolute send
  // deadline, including DNS/handshake/slow DATA. Nodemailer still performs TLS.
  const socket = signal ? new Socket() : null;
  const abort = () => socket?.destroy(Object.assign(new Error('SMTP attempt aborted.'), { code: 'ETIMEDOUT' }));
  if (socket) { socket.on('error', () => {}); signal.addEventListener('abort', abort, { once: true }); }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST, port, secure: env.SMTP_SECURE === 'true' || port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    requireTLS: true, tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true, servername: env.SMTP_HOST },
    ...(socket ? { socket } : {}),
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  if (!socket) return transport;
  return { sendMail: message => signal.aborted ? Promise.reject(Object.assign(new Error('SMTP attempt aborted.'), { code: 'ETIMEDOUT' })) : transport.sendMail(message),
    close() { signal.removeEventListener('abort', abort); socket.destroy(); transport.close(); } };
}
const safe = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export function accountMailContent(purpose, link) {
  if (typeof link !== 'string' || !/^https?:\/\//.test(link)) throw new Error('Invalid action link.');
  const action = purpose === 'email_verification' ? 'Verify your email' : purpose === 'password_reset' ? 'Reset your password' : null;
  if (!action) throw new Error('Unsupported email type.');
  const message = purpose === 'email_verification'
    ? 'Confirm your email to finish setting up your Quantum Coffee account. This link expires in 24 hours.'
    : 'Someone requested a password reset for your Quantum Coffee account. This link expires in 30 minutes. If it was not you, ignore this email.';
  return {
    subject: `Quantum Coffee — ${action}`,
    text: `${message}\n\n${action}: ${link}\n\nQuantum Coffee`,
    html: `<div style="font-family:Arial,sans-serif;color:#e9dfd3;background:#100e0c;padding:32px;max-width:560px"><h1 style="font-size:24px;color:#e9dfd3">Quantum Coffee</h1><p>${safe(message)}</p><p><a style="display:inline-block;background:#a47148;color:#100e0c;padding:12px 20px;text-decoration:none" href="${safe(link)}">${safe(action)}</a></p><p style="font-size:12px;color:#bfae9f">If the button does not work, copy this link: ${safe(link)}</p></div>`,
  };
}
export async function sendAccountMail({ to, purpose, link, env = process.env, transport }) {
  const sender = transport || makeMailTransport(env);
  if (!sender) throw new Error('Mail delivery is not configured.');
  const content = accountMailContent(purpose, link);
  return sender.sendMail({
    from: env.MAIL_FROM, replyTo: env.MAIL_REPLY_TO || undefined, to,
    ...content, disableFileAccess: true, disableUrlAccess: true,
  });
}
