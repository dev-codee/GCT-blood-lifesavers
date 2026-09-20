const http = require('node:http');
const url = require('node:url');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('./lib/db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// In-memory active tokens
const activeAdminTokens = new Set();

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 2 * 1024 * 1024) reject(new Error('Request body too large'));
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try { resolve(JSON.parse(body)); } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
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

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  try {
    // API ROUTES
    if (pathname === '/api/donors' && method === 'GET') {
      const donors = await db.getDonors(parsedUrl.query);
      return sendJson(res, 200, { success: true, count: donors.length, donors });
    }

    if (pathname === '/api/donors' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.name || !body.blood_group || !body.phone || !body.city) {
        return sendJson(res, 400, { success: false, error: 'Name, Blood Group, Phone, and City are mandatory.' });
      }
      const donorId = await db.createDonor(body);
      return sendJson(res, 201, { success: true, message: 'Donor registered successfully!', donorId });
    }

    const donorMatch = pathname.match(/^\/api\/donors\/([a-zA-Z0-9_-]+)$/);
    if (donorMatch && method === 'PUT') {
      if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const id = donorMatch[1];
      const body = await parseJsonBody(req);
      await db.updateDonor(id, body);
      return sendJson(res, 200, { success: true, message: 'Donor updated.' });
    }

    const verifyMatch = pathname.match(/^\/api\/donors\/([a-zA-Z0-9_-]+)\/verify$/);
    if (verifyMatch && method === 'PATCH') {
      if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const id = verifyMatch[1];
      const body = await parseJsonBody(req);
      await db.toggleVerifyDonor(id, body.is_verified);
      return sendJson(res, 200, { success: true, message: 'Verification updated.' });
    }

    if (donorMatch && method === 'DELETE') {
      if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const id = donorMatch[1];
      await db.deleteDonor(id);
      return sendJson(res, 200, { success: true, message: 'Donor deleted.' });
    }

    if (pathname === '/api/emergency-requests' && method === 'GET') {
      const requests = await db.getEmergencyRequests(parsedUrl.query.status || 'open');
      return sendJson(res, 200, { success: true, requests });
    }

    if (pathname === '/api/emergency-requests' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.patient_name || !body.blood_group || !body.hospital_name || !body.city || !body.contact_phone) {
        return sendJson(res, 400, { success: false, error: 'Required fields missing.' });
      }
      const requestId = await db.createEmergencyRequest(body);
      return sendJson(res, 201, { success: true, message: 'Request broadcasted.', requestId });
    }

    const emgStatusMatch = pathname.match(/^\/api\/emergency-requests\/([a-zA-Z0-9_-]+)\/status$/);
    if (emgStatusMatch && method === 'PATCH') {
      if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const id = emgStatusMatch[1];
      const body = await parseJsonBody(req);
      await db.updateEmergencyStatus(id, body.status || 'fulfilled');
      return sendJson(res, 200, { success: true, message: 'Status updated.' });
    }

    const emgDelMatch = pathname.match(/^\/api\/emergency-requests\/([a-zA-Z0-9_-]+)$/);
    if (emgDelMatch && method === 'DELETE') {
      if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const id = emgDelMatch[1];
      await db.deleteEmergencyRequest(id);
      return sendJson(res, 200, { success: true, message: 'Deleted.' });
    }

    if (pathname === '/api/stats' && method === 'GET') {
      const stats = await db.getStats();
      return sendJson(res, 200, { success: true, stats });
    }

    if (pathname === '/api/admin/login' && method === 'POST') {
      const body = await parseJsonBody(req);
      const isValid = await db.verifyAdminPassword(body.password || '');
      if (isValid) {
        const token = crypto.randomBytes(24).toString('hex');
        activeAdminTokens.add(token);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `admin_token=${token}; Path=/; HttpOnly; SameSite=Lax`
        });
        return res.end(JSON.stringify({ success: true, token }));
      }
      return sendJson(res, 401, { success: false, error: 'Invalid password' });
    }

    if (pathname === '/api/admin/change-password' && method === 'POST') {
      if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const body = await parseJsonBody(req);
      await db.changeAdminPassword(body.newPassword || '');
      return sendJson(res, 200, { success: true, message: 'Password updated.' });
    }

    if (pathname === '/api/admin/export' && method === 'GET') {
      if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      const donors = await db.getDonors();
      const headers = ['ID', 'Name', 'Blood Group', 'Phone', 'WhatsApp', 'Email', 'City', 'Area', 'Availability', 'Verified'];
      const csv = [headers.join(',')].concat(donors.map(d => [d.id, `"${d.name}"`, d.blood_group, `"${d.phone}"`, `"${d.whatsapp || ''}"`, `"${d.email || ''}"`, `"${d.city}"`, `"${d.area || ''}"`, d.availability, d.is_verified ? 'Yes' : 'No'].join(','))).join('\r\n');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="blood_donors.csv"'
      });
      return res.end(csv);
    }

    // STATIC FILES
    if (pathname === '/' || pathname === '/donors') return serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
    if (pathname === '/register' || pathname === '/join') return serveFile(res, path.join(PUBLIC_DIR, 'register.html'));
    if (pathname === '/admin') return serveFile(res, path.join(PUBLIC_DIR, 'admin.html'));

    const safeSuffix = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    const candidatePath = path.join(PUBLIC_DIR, safeSuffix);
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      return serveFile(res, candidatePath);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { success: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`🩸 GCT Lifesavers is live on http://localhost:${PORT}/`);
  if (process.env.MONGODB_URI) {
    console.log(`🍃 Connected to MongoDB Atlas!`);
  } else {
    console.log(`ℹ️  Running with local SQLite/storage. Set MONGODB_URI to use MongoDB Atlas.`);
  }
});
