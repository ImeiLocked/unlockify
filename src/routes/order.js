'use strict';
const express = require('express');
const router = express.Router();
const auth = require('../auth');
const catalog = require('../catalog');
const orders = require('../orders');
const balance = require('../balance');
const fulfillment = require('../providers/fulfillment');

function validIdentifier(type, value) {
  value = String(value || '').trim();
  if (type === 'imei') return /^\d{14,16}$/.test(value);
  return /^[A-Za-z0-9]{6,20}$/.test(value);
}

router.post('/order/create', auth.requireLogin, (req, res) => {
  const { service_id, identifier } = req.body;
  const service = catalog.getServiceById(service_id);
  if (!service || !service.active || !service.hasSource) {
    return res.status(404).render('error', { title: 'No disponible', message: 'Servicio no disponible.' });
  }
  const bal = balance.getBalance(req.user.id);
  const rerender = (error) => res.status(400).render('service', { title: service.title, service, userBalance: bal, error, form: { identifier } });

  const idValue = String(identifier || '').trim();
  if (!validIdentifier(service.identifier_type, idValue)) {
    return rerender(service.identifier_type === 'imei'
      ? 'IMEI inválido. Deben ser 14 a 16 dígitos (marca *#06#).'
      : 'Número de serie inválido (6 a 20 caracteres).');
  }
  if (bal < service.price) {
    return rerender(`Saldo insuficiente. Tu saldo es ${bal} USDT y el servicio cuesta ${service.price}. Recarga para continuar.`);
  }

  // crear orden y cobrar del saldo
  const order = orders.createOrder({
    user_id: req.user.id, service_id: service.id, service_title: service.title,
    identifier: idValue, identifier_type: service.identifier_type,
    price: service.price, auto: service.auto_fulfill,
  });
  const deb = balance.debit(req.user.id, service.price, 'order', order.code);
  if (!deb.ok) { orders.setStatus(order.id, orders.STATUS.CANCELLED); return rerender('No se pudo cobrar del saldo. Intenta de nuevo.'); }

  // disparar cumplimiento (auto) o cola (manual) sin bloquear la respuesta
  fulfillment.submitNewOrder(orders.getById(order.id)).catch((e) => console.error('[order] submit:', e.message));
  res.redirect(`/order/${order.code}`);
});

router.get('/order/:code', auth.requireLogin, (req, res) => {
  const order = orders.getByCodeForUser(req.params.code, req.user.id);
  if (!order) return res.status(404).render('error', { title: 'No encontrada', message: 'Orden no encontrada.' });
  res.render('order', { title: `Orden ${order.code}`, order });
});

router.get('/order/:code/status.json', auth.requireLogin, (req, res) => {
  const order = orders.getByCodeForUser(req.params.code, req.user.id);
  if (!order) return res.status(404).json({ error: 'not_found' });
  res.json({ status: order.status, result_text: order.result_text || null, total_seconds: order.total_seconds || null });
});

module.exports = router;
