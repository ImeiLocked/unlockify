'use strict';
// Provider-agnostic translation layer.
//  - Default: MyMemory (free, no API key, ~ a few thousand words/day with email).
//  - Optional: DeepL (set DEEPL_API_KEY) for higher quality/volume.
// Swap providers by changing .env only — nothing else in the app changes.
const config = require('./config');

// Split text into chunks under maxLen, preferring paragraph/sentence breaks.
function chunk(text, maxLen) {
  const out = [];
  let s = String(text || '');
  while (s.length > maxLen) {
    let cut = s.lastIndexOf('\n', maxLen);
    if (cut < maxLen * 0.5) cut = s.lastIndexOf('. ', maxLen);
    if (cut < maxLen * 0.5) cut = s.lastIndexOf(' ', maxLen);
    if (cut < maxLen * 0.5) cut = maxLen;
    out.push(s.slice(0, cut));
    s = s.slice(cut);
  }
  if (s) out.push(s);
  return out;
}

async function viaDeepl(text, from, to) {
  const params = new URLSearchParams();
  params.append('auth_key', config.translate.deeplKey);
  params.append('text', text);
  if (from) params.append('source_lang', from.toUpperCase());
  params.append('target_lang', to.toUpperCase());
  const res = await fetch((config.translate.deeplHost || 'https://api-free.deepl.com') + '/v2/translate', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
  });
  if (!res.ok) throw new Error('deepl ' + res.status);
  const j = await res.json();
  return (j.translations || []).map((t) => t.text).join('');
}

async function viaMyMemory(text, from, to) {
  const de = config.translate.email ? `&de=${encodeURIComponent(config.translate.email)}` : '';
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}${de}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('mymemory ' + res.status);
  const j = await res.json();
  if (j.responseStatus && Number(j.responseStatus) >= 400) throw new Error('mymemory ' + j.responseStatus);
  return (j.responseData && j.responseData.translatedText) || text;
}

async function translateChunk(text, from, to) {
  if (config.translate.deeplKey) {
    try { return await viaDeepl(text, from, to); }
    catch (e) { console.error('[translate] deepl:', e.message); }
  }
  return viaMyMemory(text, from, to);
}

// Translate text from -> to. Falls back to the original text on failure so the
// support flow never breaks just because translation is down.
async function translate(text, from, to) {
  text = String(text || '').trim();
  if (!text) return '';
  if (from && to && from.toLowerCase() === to.toLowerCase()) return text;
  const maxLen = config.translate.deeplKey ? 25000 : 450; // MyMemory caps q ~500 chars
  const parts = chunk(text, maxLen);
  const out = [];
  for (const p of parts) {
    try { out.push(await translateChunk(p, from, to)); }
    catch (e) { console.error('[translate]', e.message); out.push(p); }
  }
  return out.join('');
}

// Lightweight language guess: 'es' or 'en'. Good enough to decide whether an
// incoming message needs EN->ES translation for the panel.
function guessLang(text) {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  if (/[áéíóúñ¿¡]/.test(t)) return 'es';
  const es = [' el ', ' la ', ' los ', ' las ', ' que ', ' de ', ' por ', ' para ', ' con ', ' una ', ' hola ', ' gracias ', ' necesito ', ' quiero ', ' mi ', ' está ', ' pago ', ' correo ', ' buenas ', ' ayuda '];
  const en = [' the ', ' and ', ' you ', ' your ', ' is ', ' for ', ' with ', ' hello ', ' hi ', ' thanks ', ' thank ', ' need ', ' want ', ' please ', ' order ', ' payment ', ' email ', ' unlock ', ' help '];
  let se = 0, eo = 0;
  for (const w of es) if (t.includes(w)) se++;
  for (const w of en) if (t.includes(w)) eo++;
  return se > eo ? 'es' : 'en';
}

module.exports = { translate, guessLang };
