'use strict';
const config = require('./config');

/**
 * Calcula el precio de venta a partir del costo del proveedor.
 * Soporta markup global (env) y override por servicio (columnas en DB).
 *
 * @param {number} providerCost  costo que pagas al proveedor
 * @param {object} [override]    { markupType, markupValue } opcional por servicio
 * @returns {number} precio de venta redondeado
 */
function sellPrice(providerCost, override = {}) {
  const cost = Number(providerCost) || 0;
  const type = (override.markupType || config.markup.type || 'percent').toLowerCase();
  const value = override.markupValue != null ? Number(override.markupValue) : config.markup.value;

  let price;
  if (type === 'fixed') {
    price = cost + value;
  } else {
    // percent
    price = cost * (1 + value / 100);
  }

  return roundPrice(price);
}

function roundPrice(price) {
  const mode = config.markup.rounding;
  if (mode === 'up_int') {
    return Math.ceil(price);
  }
  if (mode === 'up_99') {
    // termina en .99 (ej: 58.47 -> 58.99 ; 59.00 -> 59.99)
    return Math.floor(price) + 0.99;
  }
  // none: 2 decimales
  return Math.round(price * 100) / 100;
}

/** Ganancia que te queda por una venta */
function profit(providerCost, salePrice) {
  return Math.round((Number(salePrice) - Number(providerCost)) * 100) / 100;
}

module.exports = { sellPrice, roundPrice, profit };
