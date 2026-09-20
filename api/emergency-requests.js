const url = require('node:url');
const db = require('../lib/db');

function sendJson(res, statusCode, data) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const method = req.method;

  if (method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.statusCode = 204;
    return res.end();
  }

  try {
    if (method === 'GET') {
      const requests = await db.getEmergencyRequests(parsedUrl.query.status || 'open');
      return sendJson(res, 200, { success: true, requests });
    }

    if (method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.patient_name || !body.blood_group || !body.hospital_name || !body.city || !body.contact_phone) {
        return sendJson(res, 400, { success: false, error: 'Required fields missing.' });
      }
      const requestId = await db.createEmergencyRequest(body);
      return sendJson(res, 201, { success: true, message: 'Broadcasted successfully', requestId });
    }

    if (method === 'PATCH') {
      const id = parsedUrl.query.id;
      const body = await parseJsonBody(req);
      await db.updateEmergencyStatus(id, body.status || 'fulfilled');
      return sendJson(res, 200, { success: true, message: 'Status updated' });
    }

    if (method === 'DELETE') {
      const id = parsedUrl.query.id;
      await db.deleteEmergencyRequest(id);
      return sendJson(res, 200, { success: true, message: 'Deleted' });
    }

    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  } catch (err) {
    return sendJson(res, 500, { success: false, error: err.message });
  }
};
