const crypto = require('node:crypto');
const { MongoClient, ObjectId } = require('mongodb');

// MongoDB connection cache for Vercel serverless environment
let cachedClient = null;
let cachedDb = null;

async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is not set.');

  if (cachedDb) return cachedDb;

  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000
  });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'blood_directory');
  cachedClient = client;
  cachedDb = db;
  return db;
}

// Eligibility calculator (90-day cooldown)
function checkEligibility(lastDonationDate, isFirstTime) {
  if (isFirstTime || !lastDonationDate) {
    return { isEligible: true, daysRemaining: 0, statusText: 'Eligible (First Time)' };
  }
  const lastDate = new Date(lastDonationDate);
  if (isNaN(lastDate.getTime())) return { isEligible: true, daysRemaining: 0, statusText: 'Eligible' };
  const diffDays = Math.floor((Date.now() - lastDate) / 86400000);
  const cooldown = 90;
  if (diffDays >= cooldown) {
    return { isEligible: true, daysRemaining: 0, diffDays, statusText: `Eligible (${diffDays}d ago)` };
  }
  return { isEligible: false, daysRemaining: cooldown - diffDays, diffDays, statusText: `Cooldown (${cooldown - diffDays}d left)` };
}

// -------------------------------------------------------
// DONORS
// -------------------------------------------------------

async function getDonors(query = {}) {
  const db = await getDb();
  const mongoQuery = {};

  if (query.blood_group && query.blood_group !== 'ALL') {
    const groups = query.blood_group.split(',').map(g => g.trim());
    mongoQuery.blood_group = { $in: groups };
  }
  if (query.city && query.city.trim()) {
    mongoQuery.city = { $regex: new RegExp(query.city.trim(), 'i') };
  }
  if (query.availability && query.availability !== 'ALL') {
    mongoQuery.availability = query.availability;
  }
  if (query.search && query.search.trim()) {
    const s = query.search.trim();
    mongoQuery.$or = [
      { name: { $regex: new RegExp(s, 'i') } },
      { city: { $regex: new RegExp(s, 'i') } },
      { area: { $regex: new RegExp(s, 'i') } },
      { phone: { $regex: new RegExp(s, 'i') } }
    ];
  }

  const docs = await db.collection('donors').find(mongoQuery).sort({ is_verified: -1, _id: -1 }).toArray();
  let donors = docs.map(d => ({
    ...d,
    id: d._id.toString(),
    is_verified: !!d.is_verified,
    eligibility: checkEligibility(d.last_donation_date, d.is_first_time)
  }));

  if (query.eligible_only === 'true' || query.eligible_only === '1') {
    donors = donors.filter(d => d.eligibility.isEligible);
  }

  return donors;
}

async function createDonor(data) {
  const db = await getDb();
  const doc = {
    name: data.name.trim(),
    blood_group: data.blood_group.toUpperCase(),
    phone: data.phone.trim(),
    whatsapp: (data.whatsapp || data.phone).trim(),
    email: data.email ? data.email.trim() : null,
    age: data.age ? parseInt(data.age, 10) : null,
    gender: data.gender || 'Not specified',
    city: data.city.trim(),
    state: data.state ? data.state.trim() : null,
    area: data.area ? data.area.trim() : null,
    pincode: data.pincode ? data.pincode.trim() : null,
    last_donation_date: data.last_donation_date || null,
    is_first_time: !!data.is_first_time,
    availability: data.availability || 'available',
    is_verified: false,
    emergency_ready: data.emergency_ready !== false && data.emergency_ready !== 0,
    notes: data.notes ? data.notes.trim() : null,
    created_at: new Date().toISOString()
  };
  const result = await db.collection('donors').insertOne(doc);
  return result.insertedId.toString();
}

async function updateDonor(id, data) {
  const db = await getDb();
  // Build the $set payload — only fields we allow to be updated
  const update = {};
  const allowed = ['name', 'blood_group', 'phone', 'whatsapp', 'email', 'age', 'gender',
    'city', 'state', 'area', 'pincode', 'availability', 'last_donation_date',
    'is_first_time', 'emergency_ready', 'notes', 'is_verified'];
  for (const key of allowed) {
    if (data[key] !== undefined) update[key] = data[key];
  }
  if (update.age) update.age = parseInt(update.age, 10);
  if (typeof update.is_verified !== 'undefined') update.is_verified = !!update.is_verified;
  await db.collection('donors').updateOne({ _id: new ObjectId(id) }, { $set: update });
}

async function toggleVerifyDonor(id, isVerified) {
  const db = await getDb();
  await db.collection('donors').updateOne(
    { _id: new ObjectId(id) },
    { $set: { is_verified: !!isVerified } }
  );
}

async function deleteDonor(id) {
  const db = await getDb();
  await db.collection('donors').deleteOne({ _id: new ObjectId(id) });
}

// -------------------------------------------------------
// EMERGENCY REQUESTS
// -------------------------------------------------------

async function getEmergencyRequests(status = 'open') {
  const db = await getDb();
  const filter = status ? { status } : {};
  const docs = await db.collection('emergency_requests').find(filter).sort({ _id: -1 }).limit(50).toArray();
  return docs.map(d => ({ ...d, id: d._id.toString() }));
}

async function createEmergencyRequest(data) {
  const db = await getDb();
  const doc = {
    patient_name: data.patient_name.trim(),
    blood_group: data.blood_group.toUpperCase(),
    units: data.units ? parseInt(data.units, 10) : 1,
    hospital_name: data.hospital_name.trim(),
    city: data.city.trim(),
    area: data.area ? data.area.trim() : null,
    contact_name: data.contact_name ? data.contact_name.trim() : 'Attendant',
    contact_phone: data.contact_phone.trim(),
    urgency_level: data.urgency_level || 'Critical',
    status: 'open',
    notes: data.notes ? data.notes.trim() : null,
    created_at: new Date().toISOString()
  };
  const result = await db.collection('emergency_requests').insertOne(doc);
  return result.insertedId.toString();
}

async function updateEmergencyStatus(id, status) {
  const db = await getDb();
  await db.collection('emergency_requests').updateOne(
    { _id: new ObjectId(id) },
    { $set: { status } }
  );
}

async function deleteEmergencyRequest(id) {
  const db = await getDb();
  await db.collection('emergency_requests').deleteOne({ _id: new ObjectId(id) });
}

// -------------------------------------------------------
// STATS
// -------------------------------------------------------

async function getStats() {
  const db = await getDb();
  const [totalDonors, availableDonors, verifiedDonors, emergencyRequests, bloodGroupCounts] = await Promise.all([
    db.collection('donors').countDocuments(),
    db.collection('donors').countDocuments({ availability: 'available' }),
    db.collection('donors').countDocuments({ is_verified: true }),
    db.collection('emergency_requests').countDocuments({ status: 'open' }),
    db.collection('donors').aggregate([
      { $group: { _id: '$blood_group', count: { $sum: 1 } } },
      { $project: { blood_group: '$_id', count: 1, _id: 0 } }
    ]).toArray()
  ]);
  return { totalDonors, availableDonors, verifiedDonors, emergencyRequests, bloodGroupCounts, database: 'MongoDB Atlas' };
}

// -------------------------------------------------------
// ADMIN AUTH — credentials come from environment variables only
// Set ADMIN_USERNAME and ADMIN_PASSWORD in your .env / Vercel settings
// -------------------------------------------------------

function verifyAdminCredentials(username, password) {
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPass) {
    throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD environment variables must be set.');
  }

  // Timing-safe comparison to prevent brute-force timing attacks
  const inputUserHash = crypto.createHash('sha256').update(username).digest('hex');
  const inputPassHash = crypto.createHash('sha256').update(password).digest('hex');
  const expectedUserHash = crypto.createHash('sha256').update(expectedUser).digest('hex');
  const expectedPassHash = crypto.createHash('sha256').update(expectedPass).digest('hex');

  const userMatch = crypto.timingSafeEqual(Buffer.from(inputUserHash), Buffer.from(expectedUserHash));
  const passMatch = crypto.timingSafeEqual(Buffer.from(inputPassHash), Buffer.from(expectedPassHash));

  return userMatch && passMatch;
}

module.exports = {
  getDonors,
  createDonor,
  updateDonor,
  toggleVerifyDonor,
  deleteDonor,
  getEmergencyRequests,
  createEmergencyRequest,
  updateEmergencyStatus,
  deleteEmergencyRequest,
  getStats,
  verifyAdminCredentials
};
