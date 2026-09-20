const url = require('node:url');
const donorsHandler = require('./donors');
const statsHandler = require('./stats');
const emergencyHandler = require('./emergency-requests');
const adminHandler = require('./admin');

module.exports = async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  // Detect route from URL or matched path header
  const pathname = (req.headers['x-matched-path'] || req.headers['x-forwarded-uri'] || parsedUrl.pathname || '').toLowerCase();

  if (pathname.includes('/donors')) {
    return donorsHandler(req, res);
  }
  if (pathname.includes('/stats')) {
    return statsHandler(req, res);
  }
  if (pathname.includes('/emergency')) {
    return emergencyHandler(req, res);
  }
  if (pathname.includes('/admin')) {
    return adminHandler(req, res);
  }

  // Default to donors
  return donorsHandler(req, res);
};
