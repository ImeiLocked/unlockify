'use strict';
const config = require('../config');

/**
 * Devuelve transferencias USDT (TRC20) ENTRANTES recientes a `address`.
 * Usa la API publica de Trongrid. La API key es opcional pero sube el rate limit.
 * @returns {Promise<Array<{txHash, amount, from, timestamp}>>}
 */
async function getIncomingUsdt(address, sinceMs = 0) {
  if (!address) return [];
  const base = 'https://api.trongrid.io';
  const url =
    `${base}/v1/accounts/${address}/transactions/trc20` +
    `?only_to=true&limit=50&order_by=block_timestamp,desc` +
    `&contract_address=${config.usdt.trc20Contract}` +
    (sinceMs ? `&min_timestamp=${sinceMs}` : '');

  const headers = { 'Content-Type': 'application/json' };
  if (config.watchers.trongridApiKey) headers['TRON-PRO-API-KEY'] = config.watchers.trongridApiKey;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Trongrid HTTP ${res.status}`);
  const json = await res.json();
  const rows = Array.isArray(json.data) ? json.data : [];

  return rows
    .filter((r) => r.to === address && r.type === 'Transfer')
    .map((r) => {
      const decimals = (r.token_info && r.token_info.decimals) || config.usdt.decimals;
      return {
        txHash: r.transaction_id,
        amount: Number(r.value) / Math.pow(10, decimals),
        from: r.from,
        timestamp: Number(r.block_timestamp),
      };
    });
}

module.exports = { getIncomingUsdt };
