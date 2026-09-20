const url = require('node:url');
const crypto = require('node:crypto');
const db = require('../lib/db');

function sendJson(res, statusCode, data) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
  const action = parsedUrl.query.action || parsedUrl.pathname.split('/').pop();
  const method = req.method;

  if (method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.statusCode = 204;
    return res.end();
  }

  try {
    if (action === 'login' && method === 'POST') {
      const body = await parseJsonBody(req);
      const isValid = await db.verifyAdminPassword(body.password || '');
      if (isValid) {
        const token = crypto.randomBytes(24).toString('hex');
        res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; SameSite=Lax`);
        return sendJson(res, 200, { success: true, token });
      }
      return sendJson(res, 401, { success: false, error: 'Invalid password' });
    }

    if (action === 'change-password' && method === 'POST') {
      const body = await parseJsonBody(req);
      await db.changeAdminPassword(body.newPassword || '');
      return sendJson(res, 200, { success: true, message: 'Password updated' });
    }

    if (action === 'export' && method === 'GET') {
      const donors = await db.getDonors();
      const headers = ['ID', 'Name', 'Blood Group', 'Phone', 'WhatsApp', 'Email', 'City', 'Area', 'Availability', 'Verified'];
      const csv = [headers.join(',')].concat(donors.map(d => [d.id, `"${d.name}"`, d.blood_group, `"${d.phone}"`, `"${d.whatsapp || ''}"`, `"${d.email || ''}"`, `"${d.city}"`, `"${d.area || ''}"`, d.availability, d.is_verified ? 'Yes' : 'No'].join(','))).join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="blood_donors.csv"');
      return res.end(csv);
    }

    return sendJson(res, 404, { success: false, error: 'Unknown admin action' });
  } catch (err) {
    return sendJson(res, 500, { success: false, error: err.message });
  }
};
