const crypto = require('node:crypto');

// Secret for HMAC tokens. Uses ADMIN_TOKEN_SECRET, then ADMIN_PASSWORD, then fallback.
const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSWORD || 'gct_lifesavers_secret_token_key_2026';

/**
 * Generate a stateless HMAC-signed token with timestamp
 */
function makeToken() {
  const timestamp = Date.now().toString(36);
  const rand = crypto.randomBytes(16).toString('hex');
  const payload = `${timestamp}-${rand}`;
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/**
 * Verify HMAC signature and token expiration (valid for 7 days)
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  if (!payload || !sig) return false;

  try {
    const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    const bufSig = Buffer.from(sig, 'hex');
    const bufExpected = Buffer.from(expectedSig, 'hex');
    if (bufSig.length !== bufExpected.length) return false;
    if (!crypto.timingSafeEqual(bufSig, bufExpected)) return false;

    const [timestamp] = payload.split('-');
    const tokenTime = parseInt(timestamp, 36);
    // Expire after 7 days
    if (isNaN(tokenTime) || Date.now() - tokenTime > 7 * 24 * 60 * 60 * 1000) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if incoming request has a valid admin token in Authorization header or Cookie
 */
function isAuthorized(req) {
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (bearerToken && verifyToken(bearerToken)) return true;

  const cookies = req.headers['cookie'] || '';
  const match = cookies.match(/admin_token=([a-f0-9\-.]+)/i);
  if (match && verifyToken(match[1])) return true;

  return false;
}

/**
 * Verify admin username and password against environment variables
 * Fallback to default admin/admin123 if not explicitly provided in environment
 */
function verifyAdminCredentials(username, password) {
  const expectedUser = (process.env.ADMIN_USERNAME || 'admin').trim();
  const expectedPass = (process.env.ADMIN_PASSWORD || 'admin123').trim();

  const inputUser = String(username || '').trim();
  const inputPass = String(password || '').trim();

  const inputUserHash = crypto.createHash('sha256').update(inputUser).digest('hex');
  const inputPassHash = crypto.createHash('sha256').update(inputPass).digest('hex');
  const expectedUserHash = crypto.createHash('sha256').update(expectedUser).digest('hex');
  const expectedPassHash = crypto.createHash('sha256').update(expectedPass).digest('hex');

  const userMatch = crypto.timingSafeEqual(Buffer.from(inputUserHash), Buffer.from(expectedUserHash));
  const passMatch = crypto.timingSafeEqual(Buffer.from(inputPassHash), Buffer.from(expectedPassHash));

  return userMatch && passMatch;
}

module.exports = {
  makeToken,
  verifyToken,
  isAuthorized,
  verifyAdminCredentials
};
