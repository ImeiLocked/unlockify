'use strict';
const config = require('../config');

/**
 * Devuelve transferencias USDT (ERC20) ENTRANTES recientes a `address`.
 * Usa la API de Etherscan v2 (chainid=1). Requiere ETHERSCAN_API_KEY.
 * @returns {Promise<Array<{txHash, amount, from, timestamp}>>}
 */
async function getIncomingUsdt(address, sinceMs = 0) {
  if (!address) return [];
  if (!config.watchers.etherscanApiKey) {
    throw new Error('Falta ETHERSCAN_API_KEY para vigilar ERC20');
  }
  const url =
    `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx` +
    `&contractaddress=${config.usdt.erc20Contract}` +
    `&address=${address}&page=1&offset=50&sort=desc` +
    `&apikey=${config.watchers.etherscanApiKey}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
  const json = await res.json();
  // status "0" con result "No transactions found" es normal
  if (json.status !== '1' && !Array.isArray(json.result)) return [];
  const rows = Array.isArray(json.result) ? json.result : [];
  const addrLc = address.toLowerCase();

  return rows
    .filter((r) => String(r.to).toLowerCase() === addrLc)
    .map((r) => {
      const decimals = Number(r.tokenDecimal) || config.usdt.decimals;
      return {
        txHash: r.hash,
        amount: Number(r.value) / Math.pow(10, decimals),
        from: r.from,
        timestamp: Number(r.timeStamp) * 1000,
      };
    });
}

module.exports = { getIncomingUsdt };
