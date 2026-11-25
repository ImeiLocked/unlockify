'use strict';
/**
 * Cliente de la API Dhru Fusion, parametrizado por proveedor.
 * Cada proveedor trae: { apiUrl, username, apiKey }.
 *
 * NOTA: Dhru Fusion tiene variantes segun la version. Este cliente usa el
 * formato estandar (POST form: username, apiaccesskey, action, requestformat=JSON,
 * parameters=base64(JSON)). Si la doc real del proveedor (api.zip) difiere, se
 * ajusta solo aqui.
 */

async function call(provider, action, params = {}) {
  if (!provider || !provider.apiUrl || !provider.username || !provider.apiKey) {
    throw new Error(`Credenciales incompletas para el proveedor ${provider ? provider.key : '?'}`);
  }
  const body = new URLSearchParams();
  body.set('username', provider.username);
  body.set('apiaccesskey', provider.apiKey);
  body.set('action', action);
  body.set('requestformat', 'JSON');
  body.set('parameters', Buffer.from(JSON.stringify(params)).toString('base64'));

  const res = await fetch(provider.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Dhru HTTP ${res.status}: ${text.slice(0, 160)}`);
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Respuesta no-JSON: ${text.slice(0, 160)}`); }
  if (json.ERROR && json.ERROR.length) throw new Error(`${provider.key}: ${json.ERROR[0].MESSAGE || 'error'}`);
  return json;
}

async function accountInfo(provider) {
  const r = await call(provider, 'accountinfo');
  return (r.SUCCESS && r.SUCCESS[0]) || r;
}

async function listServices(provider) {
  const r = await call(provider, 'imeiservicelist');
  const out = [];
  const groups = (r.SUCCESS && r.SUCCESS[0] && r.SUCCESS[0].LIST) || r.LIST || {};
  for (const [groupName, g] of Object.entries(groups)) {
    const services = (g && g.SERVICES) || {};
    for (const [sid, s] of Object.entries(services)) {
      out.push({
        providerServiceId: String(s.SERVICEID || sid),
        title: s.SERVICENAME || s.TITLE || `Servicio ${sid}`,
        cost: Number(s.CREDIT || s.PRICE || 0),
        deliveryTime: s.TIME || s.DELIVERYTIME || '',
        group: g.GROUPNAME || groupName || 'General',
      });
    }
  }
  return out;
}

async function placeOrder(provider, { providerServiceId, identifier }) {
  const r = await call(provider, 'placeimeiorder', { ID: providerServiceId, IMEI: identifier });
  const s = (r.SUCCESS && r.SUCCESS[0]) || {};
  const referenceId = s.REFERENCEID || s.REFERENCE || s.ID;
  if (!referenceId) throw new Error('El proveedor no devolvio REFERENCEID');
  return { referenceId: String(referenceId), raw: s };
}

async function getOrder(provider, referenceId) {
  const r = await call(provider, 'getimeiorder', { ID: referenceId });
  const s = (r.SUCCESS && r.SUCCESS[0]) || {};
  return { status: String(s.STATUS || '').toLowerCase(), code: s.CODE || s.COMMENTS || '', raw: s };
}

module.exports = { call, accountInfo, listServices, placeOrder, getOrder };
