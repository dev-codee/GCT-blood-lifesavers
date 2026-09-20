const url = require('node:url');
const crypto = require('node:crypto');
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

const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSWORD || 'changeme';

function verifyToken(token) {
  if (!token || !token.includes('.')) return false;
  const [rand, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(rand).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}

function isAuthorized(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  if (token && verifyToken(token)) return true;
  const cookieMatch = (req.headers['cookie'] || '').match(/admin_token=([a-f0-9.]+)/);
  if (cookieMatch && verifyToken(cookieMatch[1])) return true;
  return false;
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
