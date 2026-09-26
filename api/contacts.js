const url = require('node:url');
const db = require('../lib/db');
const { isAuthorized } = require('../lib/auth');

function sendJson(res, statusCode, data) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.statusCode = 204;
    return res.end();
  }

  try {
    // GET /api/contacts            -> active contacts (public)
    // GET /api/contacts?all=1      -> every contact (admin only)
    if (method === 'GET') {
      const wantsAll = parsedUrl.query.all === '1' || parsedUrl.query.all === 'true';
      if (wantsAll && !isAuthorized(req)) {
        return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      }
      let contacts = await db.getContacts();
      if (!wantsAll) {
        contacts = contacts
          .filter(c => c.is_active)
          .map(c => ({ id: c.id, name: c.name, role: c.role, phone: c.phone, whatsapp: c.whatsapp, email: c.email }));
      }
      return sendJson(res, 200, { success: true, count: contacts.length, contacts });
    }

    // Everything below is admin-only
    if (!isAuthorized(req)) return sendJson(res, 401, { success: false, error: 'Unauthorized' });

    if (method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.name || !body.phone) {
        return sendJson(res, 400, { success: false, error: 'Name and phone are required.' });
      }
      const contactId = await db.createContact(body);
      return sendJson(res, 201, { success: true, message: 'Contact added.', contactId });
    }

    if (method === 'PUT') {
      const id = parsedUrl.query.id;
      if (!id) return sendJson(res, 400, { success: false, error: 'Missing contact id.' });
      const body = await parseJsonBody(req);
      await db.updateContact(id, body);
      return sendJson(res, 200, { success: true, message: 'Contact updated.' });
    }

    if (method === 'DELETE') {
      const id = parsedUrl.query.id;
      if (!id) return sendJson(res, 400, { success: false, error: 'Missing contact id.' });
      await db.deleteContact(id);
      return sendJson(res, 200, { success: true, message: 'Contact deleted.' });
    }

    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('API /contacts error:', err);
    return sendJson(res, 500, { success: false, error: 'Server error: ' + (err.message || 'Unknown error') });
  }
};
