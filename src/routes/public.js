'use strict';
const express = require('express');
const router = express.Router();
const catalog = require('../catalog');
const balance = require('../balance');

router.get('/', (req, res) => {
  res.render('index', { title: 'Servicios', categories: catalog.getCatalog() });
});

router.get('/category/:slug', (req, res) => {
  const cat = catalog.getCategoryBySlug(req.params.slug);
  if (!cat) return res.status(404).render('error', { title: 'No encontrada', message: 'Categoría no encontrada.' });
  res.render('category', { title: cat.name, category: cat });
});

router.get('/service/:id', (req, res) => {
  const service = catalog.getServiceById(req.params.id);
  if (!service || !service.active || !service.hasSource) {
    return res.status(404).render('error', { title: 'No disponible', message: 'Servicio no disponible.' });
  }
  res.render('service', {
    title: service.title, service,
    userBalance: req.user ? balance.getBalance(req.user.id) : null,
    error: null, form: {},
  });
});

router.get('/como-funciona', (req, res) => res.render('how', { title: 'Cómo funciona' }));

module.exports = router;
