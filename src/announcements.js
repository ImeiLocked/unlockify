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
function add(body, kind) {
  const b = String(body || '').trim().slice(0, 600);
  if (!b) return null;
  const k = ['news', 'price', 'new'].includes(kind) ? kind : 'news';
  return db.prepare('INSERT INTO announcements (body, kind) VALUES (?, ?)').run(b, k).lastInsertRowid;
}
function remove(id) { try { db.prepare('DELETE FROM announcements WHERE id=?').run(id); } catch (_) {} }
function toggle(id) { try { db.prepare('UPDATE announcements SET active = CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?').run(id); } catch (_) {} }

module.exports = { listActive, listAll, add, remove, toggle };
