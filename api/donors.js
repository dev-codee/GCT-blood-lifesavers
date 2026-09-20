const url = require('node:url');
const crypto = require('node:crypto');
const db = require('../lib/db');

function sendJson(res, statusCode, data) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
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

const { isAuthorized } = require('../lib/auth');

module.exports = async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const method = req.method;

  if (method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.statusCode = 204;
    return res.end();
  }

  try {
    // GET /api/donors
    if (method === 'GET') {
      const donors = await db.getDonors(parsedUrl.query);
      return sendJson(res, 200, { success: true, count: donors.length, donors });
    }

    // POST /api/donors
    if (method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.name || !body.blood_group || !body.phone || !body.city) {
        return sendJson(res, 400, { success: false, error: 'Name, Blood Group, Phone, and City are required.' });
      }
      const donorId = await db.createDonor(body);
      return sendJson(res, 201, { success: true, message: 'Donor registered successfully!', donorId });
    }

    // PUT /api/donors?id=...
    if (method === 'PUT') {
      if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const id = parsedUrl.query.id;
      const body = await parseJsonBody(req);
      await db.updateDonor(id, body);
      return sendJson(res, 200, { success: true, message: 'Donor updated.' });
    }

    // PATCH /api/donors?id=...&action=verify
    if (method === 'PATCH') {
      if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const id = parsedUrl.query.id;
      const body = await parseJsonBody(req);
      await db.toggleVerifyDonor(id, body.is_verified);
      return sendJson(res, 200, { success: true, message: 'Verification status updated.' });
    }

    // DELETE /api/donors?id=...
    if (method === 'DELETE') {
      if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const id = parsedUrl.query.id;
      await db.deleteDonor(id);
      return sendJson(res, 200, { success: true, message: 'Donor deleted.' });
    }

    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('API /donors error:', err);
    return sendJson(res, 500, { success: false, error: 'Server error: ' + (err.message || 'Unknown error') });
  }
};
