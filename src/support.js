'use strict';
// Support mailbox module.
//  - Reads client emails via IMAP, stores a lightweight copy, translates EN->ES
//    so the admin reads them in Spanish from the panel.
//  - Admin replies in Spanish; we translate ES->EN and send via SMTP, so the
//    client always receives English.
//  - Panel copy auto-deletes after SUPPORT_RETENTION_DAYS (default 30). The full
//    thread stays archived in Zoho.
const config = require('./config');
const { db } = require('./db');
const { translate, guessLang } = require('./translate');

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS support_threads (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      client_email TEXT NOT NULL,
      client_name  TEXT,
      subject      TEXT,
      subject_key  TEXT,
      status       TEXT NOT NULL DEFAULT 'open',
      unread       INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      last_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sthreads_last ON support_threads(last_at);
    CREATE TABLE IF NOT EXISTS support_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id  INTEGER NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
      direction  TEXT NOT NULL,            -- in | out
      from_email TEXT,
      to_email   TEXT,
      subject    TEXT,
      body_orig  TEXT,                     -- as received / as admin wrote
      body_es    TEXT,                     -- Spanish copy (shown in panel)
      body_sent  TEXT,                     -- English actually emailed (out only)
      lang_orig  TEXT,
      message_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_smsgs_thread ON support_messages(thread_id);
  `);
}

function normSubject(s) {
  let out = String(s || '');
  for (let i = 0; i < 4; i++) out = out.replace(/^\s*(re|fwd|fw|rv|r: )\s*:?\s*/i, '');
  out = out.trim().toLowerCase().slice(0, 160);
  return out || '(sin asunto)';
}

function findOrCreateThread(clientEmail, clientName, subject) {
  const key = normSubject(subject);
  const found = db.prepare('SELECT * FROM support_threads WHERE client_email=? AND subject_key=?').get(clientEmail, key);
  if (found) return found;
  const info = db.prepare('INSERT INTO support_threads (client_email, client_name, subject, subject_key) VALUES (?,?,?,?)')
    .run(clientEmail, clientName || null, subject || '(sin asunto)', key);
  return db.prepare('SELECT * FROM support_threads WHERE id=?').get(info.lastInsertRowid);
}

// ---------- incoming ----------
async function storeIncoming(parsed) {
  const fromAddr = (parsed.from && parsed.from.value && parsed.from.value[0]) || {};
  const clientEmail = String(fromAddr.address || '').toLowerCase();
  if (!clientEmail) return;
  const messageId = parsed.messageId || null;
  if (messageId && db.prepare('SELECT id FROM support_messages WHERE message_id=?').get(messageId)) return;

  const subject = parsed.subject || '(sin asunto)';
  let body = (parsed.text || '').trim();
  if (!body && parsed.html) body = String(parsed.html).replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+\n/g, '\n').trim();
  const lang = guessLang(body);
  const bodyEs = lang === 'es' ? body : await translate(body, 'en', 'es');

  const thread = findOrCreateThread(clientEmail, fromAddr.name, subject);
  db.prepare(`INSERT INTO support_messages (thread_id, direction, from_email, to_email, subject, body_orig, body_es, lang_orig, message_id)
              VALUES (?, 'in', ?, ?, ?, ?, ?, ?, ?)`)
    .run(thread.id, clientEmail, config.imap.user || null, subject, body, bodyEs, lang, messageId);
  db.prepare("UPDATE support_threads SET last_at=datetime('now'), unread=unread+1, status='open', client_name=COALESCE(client_name, ?) WHERE id=?")
    .run(fromAddr.name || null, thread.id);
}

let polling = false;
async function pollOnce() {
  if (!config.imap.enabled || polling) return;
  polling = true;
  let client;
  try {
    const { ImapFlow } = require('imapflow');
    const { simpleParser } = require('mailparser');
    client = new ImapFlow({
      host: config.imap.host, port: config.imap.port, secure: config.imap.secure,
      auth: { user: config.imap.user, pass: config.imap.pass }, logger: false,
    });
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      for (const uid of (uids || [])) {
        const msg = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        try {
          const parsed = await simpleParser(msg.source);
          await storeIncoming(parsed);
        } catch (e) { console.error('[support] parse/store:', e.message); }
        try { await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }); } catch (_) {}
      }
    } finally { lock.release(); }
    await client.logout();
  } catch (e) {
    console.error('[support] poll:', e.message);
    try { if (client) await client.close(); } catch (_) {}
  } finally { polling = false; }
}

// ---------- outgoing ----------
async function sendReply(threadId, bodyEs) {
  const thread = db.prepare('SELECT * FROM support_threads WHERE id=?').get(threadId);
  if (!thread) throw new Error('thread not found');
  const bodyEn = await translate(bodyEs, 'es', 'en');
  const subjectRaw = thread.subject || 'Support';
  const subject = /^re:/i.test(subjectRaw) ? subjectRaw : 'Re: ' + subjectRaw;
  const notify = require('./notify');
  const ok = await notify.email(subject, bodyEn, thread.client_email, null);
  if (!ok) return false;
  db.prepare(`INSERT INTO support_messages (thread_id, direction, from_email, to_email, subject, body_orig, body_es, body_sent, lang_orig)
              VALUES (?, 'out', ?, ?, ?, ?, ?, ?, 'es')`)
    .run(thread.id, config.email.from || config.imap.user, thread.client_email, subject, bodyEs, bodyEs, bodyEn);
  db.prepare("UPDATE support_threads SET last_at=datetime('now'), unread=0 WHERE id=?").run(thread.id);
  return true;
}

// ---------- retention ----------
function cleanupOld() {
  const days = config.support.retentionDays || 30;
  try {
    db.prepare("DELETE FROM support_messages WHERE created_at < datetime('now', ?)").run(`-${days} days`);
    db.prepare("DELETE FROM support_threads WHERE id NOT IN (SELECT DISTINCT thread_id FROM support_messages)").run();
  } catch (e) { console.error('[support] cleanup:', e.message); }
}

// ---------- panel helpers ----------
function listThreads(limit = 200) {
  return db.prepare('SELECT * FROM support_threads ORDER BY last_at DESC LIMIT ?').all(limit);
}
function getThread(id) {
  const thread = db.prepare('SELECT * FROM support_threads WHERE id=?').get(id);
  if (!thread) return null;
  const messages = db.prepare('SELECT * FROM support_messages WHERE thread_id=? ORDER BY datetime(created_at) ASC, id ASC').all(id);
  return { thread, messages };
}
function markRead(id) { db.prepare('UPDATE support_threads SET unread=0 WHERE id=?').run(id); }
function unreadCount() {
  try { return db.prepare("SELECT COUNT(*) n FROM support_threads WHERE unread>0").get().n; }
  catch (_) { return 0; }
}

function startPoller() {
  ensureSchema();
  if (config.imap.enabled) {
    const sec = config.support.pollSeconds || 60;
    setInterval(() => { pollOnce().catch(() => {}); }, sec * 1000);
    setTimeout(() => { pollOnce().catch(() => {}); }, 4000);
    console.log(`[support] IMAP poller every ${sec}s as ${config.imap.user}`);
  } else {
    console.log('[support] IMAP not configured — panel ready, inbox sync OFF');
  }
  setInterval(cleanupOld, 24 * 3600 * 1000);
  setTimeout(cleanupOld, 15000);
}

module.exports = { startPoller, pollOnce, sendReply, cleanupOld, ensureSchema, listThreads, getThread, markRead, unreadCount };
