'use strict';
require('dotenv').config();

function bool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}
function num(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

// --- Proveedores (hasta 6; cada uno con su bloque PROVIDER_N_*) -----------
const providers = [];
for (let i = 1; i <= 6; i++) {
  const key = process.env[`PROVIDER_${i}_KEY`];
  if (!key) continue;
  providers.push({
    key: String(key).trim(),
    name: process.env[`PROVIDER_${i}_NAME`] || String(key).trim(),
    type: (process.env[`PROVIDER_${i}_TYPE`] || 'dhru').toLowerCase(),
    apiUrl: (process.env[`PROVIDER_${i}_API_URL`] || '').trim(),
    username: (process.env[`PROVIDER_${i}_USERNAME`] || '').trim(),
    apiKey: (process.env[`PROVIDER_${i}_API_KEY`] || '').trim(),
    enabled: bool(process.env[`PROVIDER_${i}_ENABLED`], false),
  });
}

const config = {
  brandName: process.env.BRAND_NAME || 'Unlockify',
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  port: num(process.env.PORT, 3000),
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',

  otp: {
    enabled: bool(process.env.OTP_ENABLED, false),
    idleMinutes: num(process.env.SESSION_IDLE_MINUTES, 30),
    trustedDays: num(process.env.TRUSTED_DEVICE_DAYS, 30),
    expiryMinutes: num(process.env.OTP_EXPIRY_MINUTES, 5),
    resendSeconds: num(process.env.OTP_RESEND_SECONDS, 30),
    maxAttempts: 5,
  },

  markup: {
    type: (process.env.MARKUP_TYPE || 'percent').toLowerCase(),
    value: num(process.env.MARKUP_VALUE, 35),
    rounding: (process.env.MARKUP_ROUNDING || 'up_99').toLowerCase(),
  },

  usdt: {
    trc20Address: (process.env.USDT_TRC20_ADDRESS || '').trim(),
    erc20Address: (process.env.USDT_ERC20_ADDRESS || '').trim(),
    invoiceExpiryMinutes: num(process.env.INVOICE_EXPIRY_MINUTES, 40),
    minTopup: num(process.env.MIN_TOPUP, 20),
    decimals: 6,
    trc20Contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    erc20Contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },

  watchers: {
    trongridApiKey: (process.env.TRONGRID_API_KEY || '').trim(),
    etherscanApiKey: (process.env.ETHERSCAN_API_KEY || '').trim(),
    pollSeconds: num(process.env.PAYMENT_POLL_SECONDS, 25),
    providerPollSeconds: num(process.env.PROVIDER_POLL_SECONDS, 30),
  },

  telegram: {
    botToken: (process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    chatId: (process.env.TELEGRAM_CHAT_ID || '').trim(),
    get enabled() { return !!(this.botToken && this.chatId); },
  },

  email: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
    to: process.env.NOTIFY_EMAIL || '',
    get enabled() { return !!(this.host && this.from); },
  },

  // Soporte: lectura del buzón por IMAP (Zoho por defecto). Si no hay credenciales,
  // el panel funciona pero la sincronización del buzón queda apagada.
  imap: {
    host: process.env.IMAP_HOST || 'imap.zoho.com',
    port: num(process.env.IMAP_PORT, 993),
    secure: bool(process.env.IMAP_SECURE, true),
    user: process.env.IMAP_USER || process.env.SMTP_USER || '',
    pass: process.env.IMAP_PASS || process.env.SMTP_PASS || '',
    get enabled() { return !!(this.host && this.user && this.pass); },
  },

  // Traducción (cliente<->admin). Por defecto MyMemory (gratis, sin clave).
  // Para más calidad/volumen, define DEEPL_API_KEY.
  translate: {
    email: (process.env.TRANSLATE_EMAIL || process.env.NOTIFY_EMAIL || '').trim(),
    deeplKey: (process.env.DEEPL_API_KEY || '').trim(),
    deeplHost: (process.env.DEEPL_API_HOST || 'https://api-free.deepl.com').trim(),
  },

  support: {
    pollSeconds: num(process.env.SUPPORT_POLL_SECONDS, 60),
    retentionDays: num(process.env.SUPPORT_RETENTION_DAYS, 30),
  },

  // Envío por la API de Zoho Mail (HTTPS). Evita los puertos SMTP (que
  // DigitalOcean bloquea). Si está configurado, notify.email() envía por aquí.
  //  accountsHost: US=accounts.zoho.com, EU=accounts.zoho.eu, IN=accounts.zoho.in...
  //  apiHost:      US=mail.zoho.com,     EU=mail.zoho.eu,     IN=mail.zoho.in...
  zoho: {
    clientId: (process.env.ZOHO_CLIENT_ID || '').trim(),
    clientSecret: (process.env.ZOHO_CLIENT_SECRET || '').trim(),
    refreshToken: (process.env.ZOHO_REFRESH_TOKEN || '').trim(),
    accountId: (process.env.ZOHO_ACCOUNT_ID || '').trim(),
    from: (process.env.ZOHO_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '').trim(),
    accountsHost: (process.env.ZOHO_ACCOUNTS_HOST || 'https://accounts.zoho.com').replace(/\/+$/, ''),
    apiHost: (process.env.ZOHO_API_HOST || 'https://mail.zoho.com').replace(/\/+$/, ''),
    get enabled() { return !!(this.clientId && this.clientSecret && this.refreshToken && this.accountId && this.from); },
  },

  providers, // array
  getProvider(key) { return providers.find((p) => p.key === key) || null; },
  enabledProviders() { return providers.filter((p) => p.enabled && p.apiUrl && p.apiKey); },

  admin: {
    email: (process.env.ADMIN_EMAIL || 'admin@unlockify.com').trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'change-me',
  },

  isProd: process.env.NODE_ENV === 'production',

  // ¿Podemos enviar correo por algún canal? (Zoho API por HTTPS o SMTP)
  get mailEnabled() { return this.zoho.enabled || this.email.enabled; },
};

module.exports = config;
