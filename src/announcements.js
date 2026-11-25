'use strict';
// Novedades / anuncios: nuevos servicios, cambios de precio, avisos.
// El admin los crea; se muestran en un modal en la tienda (una vez por sesión).
const { db } = require('./db');

function listActive(limit = 60) {
  try {
    return db.prepare('SELECT * FROM announcements WHERE active=1 ORDER BY datetime(created_at) DESC, id DESC LIMIT ?').all(limit);
  } catch (_) { return []; }
}
function listAll(limit = 300) {
  try {
    return db.prepare('SELECT * FROM announcements ORDER BY datetime(created_at) DESC, id DESC LIMIT ?').all(limit);
  } catch (_) { return []; }
}
function add(body, kind, source) {
  const b = String(body || '').trim().slice(0, 600);
  if (!b) return null;
  const k = ['news', 'price', 'new'].includes(kind) ? kind : 'news';
  const s = source === 'auto' ? 'auto' : 'manual';
  return db.prepare('INSERT INTO announcements (body, kind, source) VALUES (?, ?, ?)').run(b, k, s).lastInsertRowid;
}

// Novedad automática: evita repetir la misma en los últimos 30 días.
function addAuto(body, kind) {
  const b = String(body || '').trim().slice(0, 600);
  if (!b) return null;
  try {
    const dup = db.prepare("SELECT 1 FROM announcements WHERE body=? AND datetime(created_at) > datetime('now','-30 days') LIMIT 1").get(b);
    if (dup) return null;
  } catch (_) {}
  return add(b, kind, 'auto');
}

// Desactiva novedades AUTOMÁTICAS viejas (no toca las manuales).
function pruneAuto(days = 30) {
  try {
    db.prepare(`UPDATE announcements SET active=0 WHERE source='auto' AND active=1 AND datetime(created_at) < datetime('now','-${Number(days) || 30} days')`).run();
  } catch (_) {}
}

function remove(id) { try { db.prepare('DELETE FROM announcements WHERE id=?').run(id); } catch (_) {} }
function toggle(id) { try { db.prepare('UPDATE announcements SET active = CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?').run(id); } catch (_) {} }

module.exports = { listActive, listAll, add, addAuto, pruneAuto, remove, toggle };
