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
  const t = getTransporter();
  if (!t || !to) return false;
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
      ${ctaUrl ? `<a href="${ctaUrl}" style="display:inline-block;margin-top:10px;background:#16a34a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:9px;font-weight:600">${esc(ctaText || 'Ver')}</a>` : ''}
      <p style="color:#99a;font-size:12px;margin-top:20px">${esc(config.brandName)}</p>
    </div></div>`;
}

const idLabel = (o) => (o.identifier_type === 'serial' ? 'N° Serie' : 'IMEI');

// --- ADMIN ---------------------------------------------------------------
async function notifyAdminNewOrder(order, mode) {
  const text = `🆕 <b>NUEVA ORDEN</b> (${mode})\n\n🧾 ${order.code}\n📦 ${esc(order.service_title)}\n🔑 ${idLabel(order)}: <code>${esc(order.identifier)}</code>\n💵 ${order.price} del saldo\n` +
    (mode === 'manual' ? `👉 Procesar: ${config.publicUrl}/admin/orders/${order.code}` : `🤖 Enviada automaticamente al proveedor…`);
  await telegram(text);
}
async function notifyAdminTopup(topup, newBalance) {
  await telegram(`💰 <b>RECARGA</b> ${topup.expected_amount} USDT (${topup.chain.toUpperCase()})\n👤 ${esc(topup.user_email || '')}\n🧾 ${topup.code} — saldo: ${newBalance}`);
}

// --- CLIENTE -------------------------------------------------------------
async function notifyOrderCompleted(order, to) {
  await telegram(`✅ Orden <b>${order.code}</b> completada (${order.provider_key || '-'}) en ${fmtDuration(order.total_seconds)}.`);
  if (!config.email.enabled || !to) return;
  const url = `${config.publicUrl}/order/${order.code}`;
  const text = `Hola,\n\nTu pedido ${order.code} (${order.service_title}) esta listo.\n\nResultado:\n${order.result_text || 'Procesado correctamente.'}\n\n${url}\n\n${config.brandName}`;
  await email(`Tu pedido ${order.code} está listo`, text, to, customerHtml({
    heading: '🎉 Tu pedido está listo', intro: `Completamos tu orden ${order.code}.`,
    rows: [['Servicio', order.service_title], ['Resultado', order.result_text || 'Procesado correctamente'], ['Tiempo', fmtDuration(order.total_seconds)]],
    ctaUrl: url, ctaText: 'Ver mi pedido',
  }));
}
async function notifyOrderRejected(order, to) {
  await telegram(`⛔ Orden <b>${order.code}</b> rechazada. Saldo reembolsado al cliente.`);
  if (!config.email.enabled || !to) return;
  const url = `${config.publicUrl}/order/${order.code}`;
  const text = `Hola,\n\nTu pedido ${order.code} (${order.service_title}) no se pudo completar y te reembolsamos ${order.price} a tu saldo.\n\n${url}\n\n${config.brandName}`;
  await email(`Pedido ${order.code} — reembolsado`, text, to, customerHtml({
    heading: 'Pedido no completado', intro: `No pudimos completar tu orden ${order.code}. Te devolvimos el saldo.`,
    rows: [['Servicio', order.service_title], ['Reembolso', `${order.price} a tu saldo`]],
    ctaUrl: url, ctaText: 'Ver mi cuenta',
  }));
}
async function notifyTopupConfirmed(topup, newBalance, to) {
  if (!config.email.enabled || !to) return;
  const url = `${config.publicUrl}/account`;
  const text = `Hola,\n\nTu recarga ${topup.code} de ${topup.expected_amount} USDT fue confirmada.\nSaldo actual: ${newBalance} USDT.\n\n${url}\n\n${config.brandName}`;
  await email(`Recarga confirmada — saldo ${newBalance} USDT`, text, to, customerHtml({
    heading: '💳 Recarga confirmada', intro: `Acreditamos tu recarga ${topup.code}.`,
    rows: [['Recargado', `${topup.expected_amount} USDT`], ['Saldo actual', `${newBalance} USDT`]],
    ctaUrl: url, ctaText: 'Ir a mi cuenta',
  }));
}

async function sendOtp(to, code) {
  if (!config.email.enabled || !to) return false;
  const text = `Tu codigo de acceso a ${config.brandName} es: ${code}\n\nVence en ${config.otp.expiryMinutes} minutos. Si no intentaste iniciar sesion, ignora este correo.`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:420px;margin:0 auto;background:#fff;border:1px solid #e5e9f0;border-radius:12px;overflow:hidden">
    <div style="background:#0b0f14;color:#fff;padding:16px 22px;font-size:17px;font-weight:700">🔓 ${esc(config.brandName)}</div>
    <div style="padding:24px;text-align:center">
      <p style="margin:0 0 10px;color:#445;font-size:15px">Tu código de acceso:</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#0b0f14">${esc(code)}</div>
      <p style="margin:14px 0 0;color:#99a;font-size:13px">Vence en ${config.otp.expiryMinutes} minutos. Si no fuiste tú, ignora este correo.</p>
    </div></div>`;
  return email(`Tu código de acceso: ${code}`, text, to, html);
}

module.exports = {
  telegram, email, fmtDuration, sendOtp,
  notifyAdminNewOrder, notifyAdminTopup,
  notifyOrderCompleted, notifyOrderRejected, notifyTopupConfirmed,
};
