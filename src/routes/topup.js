'use strict';
const express = require('express');
const QRCode = require('qrcode');
const router = express.Router();
const auth = require('../auth');
const config = require('../config');
const payments = require('../payments');
const topups = require('../topups');
const balance = require('../balance');

router.get('/topup', auth.requireLogin, (req, res) => {
  res.render('topup', {
    title: 'Recargar saldo',
    chains: payments.availableChains(),
    balance: balance.getBalance(req.user.id),
    min: config.usdt.minTopup,
    error: null, form: {},
  });
});

router.post('/topup/create', auth.requireLogin, (req, res) => {
  const chains = payments.availableChains();
  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  const chain = req.body.chain;
  const rerender = (error) => res.status(400).render('topup', { title: 'Recargar saldo', chains, balance: balance.getBalance(req.user.id), min: config.usdt.minTopup, error, form: { amount: req.body.amount, chain } });

  if (!chains.find((c) => c.key === chain)) return rerender('Elige una red válida.');
  if (!Number.isFinite(amount) || amount < config.usdt.minTopup) return rerender(`El mínimo de recarga es ${config.usdt.minTopup} USDT.`);
  if (amount > 100000) return rerender('Monto demasiado alto.');

  let pay;
  try { pay = payments.assignPayment(chain, amount); } catch (e) { return rerender(e.message); }
  const t = topups.create({
    user_id: req.user.id, chain, amount,
    expected_amount: pay.expectedAmount, pay_address: pay.payAddress, expires_at: pay.expiresAt,
  });
  res.redirect(`/topup/${t.code}`);
});

router.get('/topup/:code', auth.requireLogin, async (req, res) => {
  const t = topups.getByCodeForUser(req.params.code, req.user.id);
  if (!t) return res.status(404).render('error', { title: 'No encontrada', message: 'Recarga no encontrada.' });
  let qr = null;
  if (t.status === 'pending') { try { qr = await QRCode.toDataURL(t.pay_address, { margin: 1, width: 240 }); } catch {} }
  res.render('topup_pay', { title: `Recarga ${t.code}`, topup: t, qr, balance: balance.getBalance(req.user.id) });
});

router.get('/topup/:code/status.json', auth.requireLogin, (req, res) => {
  const t = topups.getByCodeForUser(req.params.code, req.user.id);
  if (!t) return res.status(404).json({ error: 'not_found' });
  res.json({ status: t.status, balance: balance.getBalance(req.user.id) });
});

module.exports = router;
