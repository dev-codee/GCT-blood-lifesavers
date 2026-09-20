const url = require('node:url');
const db = require('../lib/db');
const { makeToken, isAuthorized, verifyAdminCredentials } = require('../lib/auth');

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
    // PUBLIC: login
    if (action === 'login' && method === 'POST') {
      const body = await parseJsonBody(req);
      let isValid = false;
      try {
        isValid = verifyAdminCredentials(body.username || '', body.password || '');
      } catch (e) {
        return sendJson(res, 500, { success: false, error: e.message });
      }
      if (isValid) {
        const token = makeToken();
        res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
        return sendJson(res, 200, { success: true, token });
      }
      return sendJson(res, 401, { success: false, error: 'Invalid username or password' });
    }

    // Check token validity endpoint
    if (action === 'check' || action === 'check-auth') {
      if (isAuthorized(req)) {
        return sendJson(res, 200, { success: true, authenticated: true });
      }
      return sendJson(res, 401, { success: false, authenticated: false, error: 'Session expired' });
    }

    // PUBLIC: logout
    if (action === 'logout' && method === 'POST') {
      res.setHeader('Set-Cookie', 'admin_token=; Max-Age=0; Path=/');
      return sendJson(res, 200, { success: true });
    }

    // ALL BELOW REQUIRE AUTH
    if (!isAuthorized(req)) {
      return sendJson(res, 401, { success: false, error: 'Unauthorized — please login again' });
    }

    if (action === 'export' && method === 'GET') {
      const donors = await db.getDonors();
      const headers = ['ID', 'Name', 'Blood Group', 'Phone', 'WhatsApp', 'Email', 'City', 'Area', 'Province', 'Availability', 'Verified', 'Registered'];
      const csv = [headers.join(',')].concat(donors.map(d =>
        [d.id, `"${d.name}"`, d.blood_group, `"${d.phone}"`, `"${d.whatsapp || ''}"`, `"${d.email || ''}"`,
         `"${d.city}"`, `"${d.area || ''}"`, `"${d.state || ''}"`, d.availability, d.is_verified ? 'Yes' : 'No', `"${d.created_at || ''}"`].join(',')
      )).join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="gct_lifesavers_donors.csv"');
      res.statusCode = 200;
      return res.end(csv);
    }

    return sendJson(res, 404, { success: false, error: 'Unknown admin action' });
  } catch (err) {
    return sendJson(res, 500, { success: false, error: err.message });
  }
};
