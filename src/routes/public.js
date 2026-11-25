'use strict';
const express = require('express');
const router = express.Router();
const catalog = require('../catalog');
const balance = require('../balance');

router.get('/', (req, res) => {
  res.render('index', { title: 'Services', categories: catalog.getCatalog() });
});

router.get('/category/:slug', (req, res) => {
  const cat = catalog.getCategoryBySlug(req.params.slug);
  if (!cat) return res.status(404).render('error', { title: 'Not found', message: 'Category not found.' });
  res.render('category', { title: cat.name, category: cat });
});

router.get('/service/:id', (req, res) => {
  const service = catalog.getServiceById(req.params.id);
  if (!service || !service.active || !service.hasSource) {
    return res.status(404).render('error', { title: 'Unavailable', message: 'Service unavailable.' });
  }
  res.render('service', {
    title: service.title, service,
    userBalance: req.user ? balance.getBalance(req.user.id) : null,
    error: null, form: {},
  });
});

router.get('/how-it-works', (req, res) => res.render('how', { title: 'How it works' }));

module.exports = router;
