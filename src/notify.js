'use strict';
const config = require('./config');

async function telegram(text) {
  if (!config.telegram.enabled) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.telegram.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    if (!res.ok) { console.error('[notify] TG', res.status); return false; }
    return true;
  } catch (e) { console.error('[notify] TG', e.message); return false; }
}

let transporter = null;
function getTransporter() {
  if (!config.email.enabled) return null;
  if (transporter) return transporter;
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: config.email.host, port: config.email.port, secure: config.email.port === 465,
      auth: config.email.user ? { user: config.email.user, pass: config.email.pass } : undefined,
    });
    return transporter;
  } catch (e) { console.error('[notify] nodemailer:', e.message); return null; }
}

async function email(subject, text, to = config.email.to, html = null) {
  if (!to) return false;
  // 1) Preferir la API de Zoho (HTTPS) — evita los puertos SMTP bloqueados por DO.
  if (config.zoho.enabled) {
    try {
      const zoho = require('./zohomail');
      if (await zoho.send({ to, subject, text, html })) return true;
      console.error('[notify] zoho send falló; intento SMTP');
    } catch (e) { console.error('[notify] zoho:', e.message); }
  }
  // 2) Fallback: SMTP (si los puertos estuvieran abiertos).
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.sendMail({ from: config.email.from || config.email.user, to, subject, text, ...(html ? { html } : {}) });
    return true;
  } catch (e) { console.error('[notify] email:', e.message); return false; }
}

function esc(s) { return String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function strip(s) { return String(s || '').replace(/<[^>]+>/g, ''); }
function fmtDuration(sec) {
  sec = Number(sec) || 0;
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60); return `${h}h ${m % 60}m`;
}

function customerHtml({ heading, intro, rows = [], note, ctaUrl, ctaText }) {
  const rowsHtml = rows.map((r) => `<tr><td style="padding:6px 0;color:#667">${esc(r[0])}</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(r[1])}</td></tr>`).join('');
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff;border:1px solid #e5e9f0;border-radius:12px;overflow:hidden">
    <div style="background:#0b0f14;color:#fff;padding:18px 22px;font-size:18px;font-weight:700">🔓 ${esc(config.brandName)}</div>
    <div style="padding:22px">
      <h2 style="margin:0 0 8px;font-size:19px;color:#0b0f14">${esc(heading)}</h2>
      <p style="margin:0 0 14px;color:#445;font-size:15px">${esc(intro)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #eef;border-bottom:1px solid #eef;margin:10px 0">${rowsHtml}</table>
      ${note ? `<p style="color:#667;font-size:13px;margin:12px 0">${esc(note)}</p>` : ''}
      ${ctaUrl ? `<a href="${ctaUrl}" style="display:inline-block;margin-top:10px;background:#16a34a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:9px;font-weight:600">${esc(ctaText || 'View')}</a>` : ''}
      <p style="color:#99a;font-size:12px;margin-top:20px">${esc(config.brandName)}</p>
    </div></div>`;
}

const idLabel = (o) => (o.identifier_type === 'serial' ? 'Serial' : 'IMEI');

// --- ADMIN ---------------------------------------------------------------
async function notifyAdminNewOrder(order, mode) {
  const text = `🆕 <b>NEW ORDER</b> (${mode})\n\n🧾 ${order.code}\n📦 ${esc(order.service_title)}\n🔑 ${idLabel(order)}: <code>${esc(order.identifier)}</code>\n💵 ${order.price} from balance\n` +
    (mode === 'manual' ? `👉 Process: ${config.publicUrl}/admin/orders/${order.code}` : `🤖 Sent automatically to the provider…`);
  await telegram(text);
}
async function notifyAdminTopup(topup, newBalance) {
  await telegram(`💰 <b>TOP-UP</b> ${topup.expected_amount} USDT (${topup.chain.toUpperCase()})\n👤 ${esc(topup.user_email || '')}\n🧾 ${topup.code} — balance: ${newBalance}`);
}
/** Alerta al admin: una orden quedó retenida porque tu saldo en el proveedor no alcanza. */
async function notifyAdminFundsHold(order, providerKey, credit, cost) {
  const cr = credit == null ? '—' : `$${Number(credit).toFixed(2)}`;
  const co = cost == null ? '—' : `$${Number(cost).toFixed(2)}`;
  await telegram(`⚠️ <b>ORDEN EN ESPERA</b> — saldo insuficiente en ${esc(providerKey)}\n\n🧾 ${order.code}\n📦 ${esc(order.service_title)}\n🔑 ${idLabel(order)}: <code>${esc(order.identifier)}</code>\n💳 Saldo: ${cr} · Costo: ${co}\n\n👉 Recarga y reintenta: ${config.publicUrl}/admin/held`);
  const to = config.email.to || config.zoho.from;
  if (!config.mailEnabled || !to) return;
  const url = `${config.publicUrl}/admin/held`;
  const text = `Orden en espera por saldo insuficiente.\n\nOrden: ${order.code}\nServicio: ${order.service_title}\n${idLabel(order)}: ${order.identifier}\nProveedor: ${providerKey}\nSaldo proveedor: ${cr}\nCosto: ${co}\n\nEl cliente la ve como "procesando". Recarga saldo en ${providerKey} y pulsa Reintentar:\n${url}`;
  await email(`⚠️ Orden ${order.code} en espera — recarga saldo de ${providerKey}`, text, to, customerHtml({
    heading: '⚠️ Orden en espera por saldo',
    intro: `La orden ${order.code} no se pudo procesar porque tu saldo en ${providerKey} no alcanza. El cliente la ve como "procesando". Recarga y reintenta desde el panel.`,
    rows: [['Orden', order.code], ['Servicio', order.service_title], [idLabel(order), order.identifier], ['Proveedor', providerKey], ['Saldo proveedor', cr], ['Costo', co]],
    ctaUrl: url, ctaText: 'Ver pendientes y reintentar',
  }));
}

// --- CUSTOMER ------------------------------------------------------------
async function notifyOrderCompleted(order, to) {
  await telegram(`✅ Order <b>${order.code}</b> completed (${order.provider_key || '-'}) in ${fmtDuration(order.total_seconds)}.`);
  if (!config.mailEnabled || !to) return;
  const url = `${config.publicUrl}/order/${order.code}`;
  const text = `Hi,\n\nYour order ${order.code} (${order.service_title}) is ready.\n\nResult:\n${order.result_text || 'Processed successfully.'}\n\n${url}\n\n${config.brandName}`;
  await email(`Your order ${order.code} is ready`, text, to, customerHtml({
    heading: '🎉 Your order is ready', intro: `We completed your order ${order.code}.`,
    rows: [['Service', order.service_title], ['Result', order.result_text || 'Processed successfully'], ['Time', fmtDuration(order.total_seconds)]],
    ctaUrl: url, ctaText: 'View my order',
  }));
}
async function notifyOrderRejected(order, to) {
  await telegram(`⛔ Order <b>${order.code}</b> rejected. Balance refunded to customer.`);
  if (!config.mailEnabled || !to) return;
  const url = `${config.publicUrl}/order/${order.code}`;
  const text = `Hi,\n\nYour order ${order.code} (${order.service_title}) couldn't be completed and we refunded ${order.price} to your balance.\n\n${url}\n\n${config.brandName}`;
  await email(`Order ${order.code} — refunded`, text, to, customerHtml({
    heading: 'Order not completed', intro: `We couldn't complete your order ${order.code}. We refunded your balance.`,
    rows: [['Service', order.service_title], ['Refund', `${order.price} to your balance`]],
    ctaUrl: url, ctaText: 'View my account',
  }));
}
async function notifyTopupConfirmed(topup, newBalance, to) {
  if (!config.mailEnabled || !to) return;
  const url = `${config.publicUrl}/account`;
  const text = `Hi,\n\nYour top-up ${topup.code} of ${topup.expected_amount} USDT was confirmed.\nCurrent balance: ${newBalance} USDT.\n\n${url}\n\n${config.brandName}`;
  await email(`Top-up confirmed — balance ${newBalance} USDT`, text, to, customerHtml({
    heading: '💳 Top-up confirmed', intro: `We credited your top-up ${topup.code}.`,
    rows: [['Added', `${topup.expected_amount} USDT`], ['Current balance', `${newBalance} USDT`]],
    ctaUrl: url, ctaText: 'Go to my account',
  }));
}

async function sendOtp(to, code) {
  if (!config.mailEnabled || !to) return false;
  const text = `Your access code for ${config.brandName} is: ${code}\n\nIt expires in ${config.otp.expiryMinutes} minutes. If you didn't try to log in, ignore this email.`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:420px;margin:0 auto;background:#fff;border:1px solid #e5e9f0;border-radius:12px;overflow:hidden">
    <div style="background:#0b0f14;color:#fff;padding:16px 22px;font-size:17px;font-weight:700">🔓 ${esc(config.brandName)}</div>
    <div style="padding:24px;text-align:center">
      <p style="margin:0 0 10px;color:#445;font-size:15px">Your access code:</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#0b0f14">${esc(code)}</div>
      <p style="margin:14px 0 0;color:#99a;font-size:13px">Expires in ${config.otp.expiryMinutes} minutes. If this wasn't you, ignore this email.</p>
    </div></div>`;
  return email(`Your access code: ${code}`, text, to, html);
}

module.exports = {
  telegram, email, fmtDuration, sendOtp,
  notifyAdminNewOrder, notifyAdminTopup, notifyAdminFundsHold,
  notifyOrderCompleted, notifyOrderRejected, notifyTopupConfirmed,
};
