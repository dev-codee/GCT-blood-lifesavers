const url = require('node:url');
const crypto = require('node:crypto');
const db = require('../lib/db');

// In-memory active tokens
const activeAdminTokens = new Set();

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

function isAuthorized(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token && activeAdminTokens.has(token)) return true;
  const cookies = req.headers['cookie'] || '';
  const match = cookies.match(/admin_token=([a-f0-9]+)/);
  if (match && activeAdminTokens.has(match[1])) return true;
  return false;
}

module.exports = async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname.replace(/^\/api/, '') || '/';
  const method = req.method;

  if (method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.statusCode = 204;
    return res.end();
  }

  try {
    // GET /donors
    if (pathname === '/donors' && method === 'GET') {
      const donors = await db.getDonors(parsedUrl.query);
      return sendJson(res, 200, { success: true, count: donors.length, donors });
    }

    // POST /donors
    if (pathname === '/donors' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.name || !body.blood_group || !body.phone || !body.city) {
        return sendJson(res, 400, { success: false, error: 'Name, Blood Group, Phone, and City are mandatory.' });
      }
      const donorId = await db.createDonor(body);
      return sendJson(res, 201, { success: true, message: 'Donor registered successfully!', donorId });
    }

    // PUT /donors/:id
    const donorMatch = pathname.match(/^\/donors\/([a-zA-Z0-9_-]+)$/);
    if (donorMatch && method === 'PUT') {
      if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const id = donorMatch[1];
      const body = await parseJsonBody(req);
      await db.updateDonor(id, body);
      return sendJson(res, 200, { success: true, message: 'Donor updated.' });
    }

    // PATCH /donors/:id/verify
    const verifyMatch = pathname.match(/^\/donors\/([a-zA-Z0-9_-]+)\/verify$/);
    if (verifyMatch && method === 'PATCH') {
      if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const id = verifyMatch[1];
      const body = await parseJsonBody(req);
      await db.toggleVerifyDonor(id, body.is_verified);
      return sendJson(res, 200, { success: true, message: 'Verification updated.' });
    }

    // DELETE /donors/:id
    if (donorMatch && method === 'DELETE') {
      if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const id = donorMatch[1];
      await db.deleteDonor(id);
      return sendJson(res, 200, { success: true, message: 'Donor deleted.' });
    }

    // GET /emergency-requests
    if (pathname === '/emergency-requests' && method === 'GET') {
      const requests = await db.getEmergencyRequests(parsedUrl.query.status || 'open');
      return sendJson(res, 200, { success: true, requests });
    }

    // POST /emergency-requests
    if (pathname === '/emergency-requests' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.patient_name || !body.blood_group || !body.hospital_name || !body.city || !body.contact_phone) {
        return sendJson(res, 400, { success: false, error: 'Required fields missing.' });
      }
      const requestId = await db.createEmergencyRequest(body);
      return sendJson(res, 201, { success: true, message: 'Request broadcasted.', requestId });
    }

    // PATCH /emergency-requests/:id/status
    const emgStatusMatch = pathname.match(/^\/emergency-requests\/([a-zA-Z0-9_-]+)\/status$/);
    if (emgStatusMatch && method === 'PATCH') {
      if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const id = emgStatusMatch[1];
      const body = await parseJsonBody(req);
      await db.updateEmergencyStatus(id, body.status || 'fulfilled');
      return sendJson(res, 200, { success: true, message: 'Status updated.' });
    }

    // DELETE /emergency-requests/:id
    const emgDelMatch = pathname.match(/^\/emergency-requests\/([a-zA-Z0-9_-]+)$/);
    if (emgDelMatch && method === 'DELETE') {
      if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const id = emgDelMatch[1];
      await db.deleteEmergencyRequest(id);
      return sendJson(res, 200, { success: true, message: 'Deleted.' });
    }

    // GET /stats
    if (pathname === '/stats' && method === 'GET') {
      const stats = await db.getStats();
      return sendJson(res, 200, { success: true, stats });
    }

    // POST /admin/login
    if (pathname === '/admin/login' && method === 'POST') {
      const body = await parseJsonBody(req);
      const isValid = await db.verifyAdminPassword(body.password || '');
      if (isValid) {
        const token = crypto.randomBytes(24).toString('hex');
        activeAdminTokens.add(token);
        res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; SameSite=Lax`);
        return sendJson(res, 200, { success: true, token });
      }
      return sendJson(res, 401, { success: false, error: 'Invalid password' });
    }

    // POST /admin/change-password
    if (pathname === '/admin/change-password' && method === 'POST') {
      if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const body = await parseJsonBody(req);
      await db.changeAdminPassword(body.newPassword || '');
      return sendJson(res, 200, { success: true, message: 'Password updated.' });
    }

    // GET /admin/export
    if (pathname === '/admin/export' && method === 'GET') {
      if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const donors = await db.getDonors();
      const headers = ['ID', 'Name', 'Blood Group', 'Phone', 'WhatsApp', 'Email', 'City', 'Area', 'Availability', 'Verified'];
      const csv = [headers.join(',')].concat(donors.map(d => [d.id, `"${d.name}"`, d.blood_group, `"${d.phone}"`, `"${d.whatsapp || ''}"`, `"${d.email || ''}"`, `"${d.city}"`, `"${d.area || ''}"`, d.availability, d.is_verified ? 'Yes' : 'No'].join(','))).join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="blood_donors.csv"');
      return res.end(csv);
    }

    return sendJson(res, 404, { success: false, error: 'Endpoint not found' });
  } catch (err) {
    console.error('API error:', err);
    return sendJson(res, 500, { success: false, error: err.message });
  }
};
