'use strict';
// Envío de correo por la API de Zoho Mail sobre HTTPS (puerto 443).
// Se usa porque DigitalOcean bloquea los puertos SMTP (465/587) del droplet.
// Flujo OAuth: refresh_token -> access_token (cacheado ~1h) -> POST message.
//   Docs: POST {apiHost}/api/accounts/{accountId}/messages
//         Authorization: Zoho-oauthtoken {access_token}
const config = require('./config');

let _token = null;       // { value, exp }  exp = epoch ms
let _refreshing = null;  // promesa en curso para evitar refrescos simultáneos

async function getAccessToken() {
  const z = config.zoho;
  if (_token && Date.now() < _token.exp - 60000) return _token.value; // margen 60s
  if (_refreshing) return _refreshing;
  _refreshing = (async () => {
    const url = `${z.accountsHost}/oauth/v2/token`;
    const body = new URLSearchParams({
      refresh_token: z.refreshToken,
      client_id: z.clientId,
      client_secret: z.clientSecret,
      grant_type: 'refresh_token',
    });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      throw new Error(`token ${res.status} ${data.error || JSON.stringify(data).slice(0, 120)}`);
    }
    const ttl = (Number(data.expires_in) || 3600) * 1000;
    _token = { value: data.access_token, exp: Date.now() + ttl };
    return _token.value;
  })();
  try { return await _refreshing; }
  finally { _refreshing = null; }
}

// Envía un correo. Devuelve true/false (no lanza).
async function send({ to, subject, text, html }) {
  const z = config.zoho;
  if (!z.enabled || !to) return false;
  try {
    const token = await getAccessToken();
    const url = `${z.apiHost}/api/accounts/${z.accountId}/messages`;
    const payload = {
      fromAddress: z.from,
      toAddress: to,
      subject: subject || '',
      content: html || text || '',
      mailFormat: html ? 'html' : 'plaintext',
      askReceipt: 'no',
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    const code = data && data.status && data.status.code;
    if (res.ok && (code === 200 || code === undefined)) return true;
    console.error('[zoho] send', res.status, (data.status && data.status.description) || JSON.stringify(data).slice(0, 160));
    return false;
  } catch (e) {
    console.error('[zoho] send:', e.message);
    return false;
  }
}

module.exports = { send, getAccessToken };
