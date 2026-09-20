const url = require('node:url');
const crypto = require('node:crypto');
const db = require('../lib/db');

// Serverless-safe token store (shared per warm instance)
// On Vercel, use a signed JWT or cookie-based approach for production;
// for this app the Authorization header token is validated here.
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

// Validate Bearer token against a signed HMAC so we don't need a shared Set
// Token format: <32-byte-random-hex>.<hmac-sha256>
const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSWORD || 'changeme';

function makeToken() {
  const rand = crypto.randomBytes(32).toString('hex');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(rand).digest('hex');
  return `${rand}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return false;
  const [rand, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(rand).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function isAuthorized(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token && verifyToken(token)) return true;
  const cookies = req.headers['cookie'] || '';
  const match = cookies.match(/admin_token=([a-f0-9.]+)/);
  if (match && verifyToken(match[1])) return true;
  return false;
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
        isValid = db.verifyAdminCredentials(body.username || '', body.password || '');
      } catch (e) {
        return sendJson(res, 500, { success: false, error: e.message });
      }
      if (isValid) {
        const token = makeToken();
        res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`);
        return sendJson(res, 200, { success: true, token });
      }
      return sendJson(res, 401, { success: false, error: 'Invalid credentials' });
    }

    // PUBLIC: logout
    if (action === 'logout' && method === 'POST') {
      res.setHeader('Set-Cookie', 'admin_token=; Max-Age=0; Path=/');
      return sendJson(res, 200, { success: true });
    }

    // ALL BELOW REQUIRE AUTH
    if (!isAuthorized(req)) {
      return sendJson(res, 401, { success: false, error: 'Unauthorized — please login first' });
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
