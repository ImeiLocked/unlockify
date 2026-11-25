'use strict';
const express = require('express');
const router = express.Router();
const catalog = require('../catalog');
const balance = require('../balance');
const announcements = require('../announcements');

router.get('/', (req, res) => {
  res.render('index', {
    title: req.t('site.services'),
    categories: catalog.getCatalog(),
    announcements: announcements.listActive(60),
  });
});

router.get('/category/:slug', (req, res) => {
  const cat = catalog.getCategoryBySlug(req.params.slug);
  if (!cat) return res.status(404).render('error', { title: req.t('err.notFound'), message: req.t('err.categoryNotFound') });
  res.render('category', { title: cat.name, category: cat });
});

router.get('/service/:id', (req, res) => {
  const service = catalog.getServiceById(req.params.id);
  if (!service || !service.active || !service.hasSource) {
    return res.status(404).render('error', { title: req.t('err.unavailable'), message: req.t('err.serviceUnavailable') });
  }
  res.render('service', {
    title: service.title, service,
    userBalance: req.user ? balance.getBalance(req.user.id) : null,
    error: null, form: {},
  });
});

router.get('/how-it-works', (req, res) => res.render('how', { title: req.t('site.howItWorks') }));

module.exports = router;
