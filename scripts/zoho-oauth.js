'use strict';
// Intercambia el grant code (Self Client) por refresh_token, detecta el accountId
// de Zoho Mail para support@unlockify.uk y escribe las variables ZOHO_* en .env.
// Valores sensibles llegan por variables de entorno (no por argumentos/historial).
const fs = require('fs');
const path = require('path');

const ACCOUNTS_HOST = (process.env.ZOHO_ACCOUNTS_HOST || 'https://accounts.zoho.com').replace(/\/+$/, '');
const API_HOST = (process.env.ZOHO_API_HOST || 'https://mail.zoho.com').replace(/\/+$/, '');
const CLIENT_ID = (process.env.ZOHO_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.ZOHO_CLIENT_SECRET || '').trim();
const CODE = (process.env.ZOHO_CODE || '').trim();
const WANT_FROM = (process.env.ZOHO_FROM || 'support@unlockify.uk').trim().toLowerCase();
const ENV_PATH = process.env.ENV_PATH || path.join(__dirname, '..', '.env');

function mask(s) { s = String(s || ''); return s.length <= 10 ? '***' : s.slice(0, 5) + '…' + s.slice(-4); }

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !CODE) { console.error('Faltan CLIENT_ID / CLIENT_SECRET / CODE'); process.exit(1); }

  // 1) Intercambio code -> refresh_token
  const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code: CODE });
  const r1 = await fetch(`${ACCOUNTS_HOST}/oauth/v2/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
  });
  const d1 = await r1.json().catch(() => ({}));
  if (!d1.refresh_token) { console.error('ERROR en token:', JSON.stringify(d1)); process.exit(2); }
  const refresh = d1.refresh_token, access = d1.access_token;
  console.log('✔ refresh_token obtenido:', mask(refresh));

  // 2) Detectar accountId
  const r2 = await fetch(`${API_HOST}/api/accounts`, { headers: { Authorization: `Zoho-oauthtoken ${access}` } });
  const d2 = await r2.json().catch(() => ({}));
  const accts = (d2 && d2.data) || [];
  let chosen = null; const seen = [];
  for (const a of accts) {
    const primary = String(a.primaryEmailAddress || a.incomingUserName || '').toLowerCase();
    const froms = (a.sendMailDetails || []).map((s) => String(s.fromAddress || '').toLowerCase());
    seen.push(`${a.accountId} :: ${primary}${froms.length ? ' [from: ' + froms.join(', ') + ']' : ''}`);
    if (primary === WANT_FROM || froms.includes(WANT_FROM)) chosen = a;
  }
  console.log('Cuentas visibles para esta autorización:');
  seen.forEach((s) => console.log('   -', s));
  if (!chosen && accts.length === 1) chosen = accts[0];
  if (!chosen) { console.error('✖ No encontré una cuenta que pueda enviar como', WANT_FROM); process.exit(3); }
  const accountId = String(chosen.accountId);
  console.log('✔ accountId:', accountId, '(', chosen.primaryEmailAddress || '', ')');

  // 3) Escribir .env (quita ZOHO_* previas, conserva el resto)
  let env = ''; try { env = fs.readFileSync(ENV_PATH, 'utf8'); } catch (_) {}
  const set = { ZOHO_CLIENT_ID: CLIENT_ID, ZOHO_CLIENT_SECRET: CLIENT_SECRET, ZOHO_REFRESH_TOKEN: refresh, ZOHO_ACCOUNT_ID: accountId, ZOHO_FROM: WANT_FROM };
  const keep = env.split('\n').filter((l) => { const k = l.split('=')[0].trim(); return !Object.prototype.hasOwnProperty.call(set, k); });
  let out = keep.join('\n').replace(/\n+$/,''); if (out) out += '\n';
  for (const [k, v] of Object.entries(set)) out += `${k}=${v}\n`;
  fs.writeFileSync(ENV_PATH, out);
  console.log('✔ .env actualizado (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ACCOUNT_ID, ZOHO_FROM)');
}
main().catch((e) => { console.error('FALLO:', e.message); process.exit(9); });
