'use strict';
const config = require('./config');
const { getSetting } = require('./db');

/**
 * Markup global editable desde el panel (settings), con respaldo en .env.
 *  - type: 'percent' (porcentaje sobre el costo) | 'fixed' (margen fijo sumado al costo)
 *  - value: numero
 */
function getGlobalMarkup() {
  const type = String(getSetting('markup_type', config.markup.type) || 'percent').toLowerCase();
  const raw = getSetting('markup_value', null);
  let value = raw != null ? Number(raw) : Number(config.markup.value);
  if (!Number.isFinite(value)) value = 0;
  return { type, value };
}

/**
 * Precio de venta a partir del costo del proveedor.
 *  - override.markupType = 'fixed'   -> PRECIO FINAL FIJO (exacto, NO lo afecta ningun %)
 *  - override.markupType = 'percent' -> porcentaje propio de ese servicio
 *  - sin override                    -> markup global (settings/.env)
 */
function sellPrice(providerCost, override = {}) {
  const cost = Number(providerCost) || 0;
  const otype = String(override.markupType || '').toLowerCase();

  // Precio fijo final: exacto, inmune a cualquier cambio de porcentaje.
  if (otype === 'fixed') {
    const p = Number(override.markupValue) || 0;
    return Math.round(p * 100) / 100; // 2 decimales, tal cual lo pones
  }
  // Porcentaje propio del servicio.
  if (otype === 'percent') {
    const pct = Number(override.markupValue) || 0;
    return roundPrice(cost * (1 + pct / 100));
  }
  // Markup global.
  const g = getGlobalMarkup();
  if (g.type === 'fixed') return roundPrice(cost + g.value);
  return roundPrice(cost * (1 + g.value / 100));
}

function roundPrice(price) {
  const mode = config.markup.rounding;
  if (mode === 'up_int') return Math.ceil(price);
  if (mode === 'up_99') return Math.floor(price) + 0.99;
  return Math.round(price * 100) / 100;
}

/** Ganancia que te queda por una venta */
function profit(providerCost, salePrice) {
  return Math.round((Number(salePrice) - Number(providerCost)) * 100) / 100;
}

module.exports = { sellPrice, roundPrice, profit, getGlobalMarkup };
