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
// A recorded donation date always wins over the is_first_time flag — once an
// admin records a donation the donor is no longer a first-timer.
function checkEligibility(lastDonationDate, isFirstTime) {
  const lastDate = lastDonationDate ? new Date(lastDonationDate) : null;
  if (!lastDate || isNaN(lastDate.getTime())) {
    return isFirstTime
      ? { isEligible: true, daysRemaining: 0, statusText: 'Eligible (First Time)' }
      : { isEligible: true, daysRemaining: 0, statusText: 'Eligible' };
  }
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
    ...Object.fromEntries(Object.entries(d).filter(([k]) => k !== "access_hash")),
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
  // Recording a donation date clears the first-time flag; clearing it restores one
  if (data.is_first_time === undefined && data.last_donation_date !== undefined) {
    update.is_first_time = !data.last_donation_date;
  }
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
  await db.collection('emergency_requests').updateMany({status:'open', expires_at:{$lte:new Date().toISOString()}}, {$set:{status:'expired'}});
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
    expires_at: new Date(Date.now()+48*3600000).toISOString(),
    responses: {},
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
// ADMIN CONTACTS (people the public can reach out to)
// -------------------------------------------------------

async function getContacts() {
  const db = await getDb();
  const docs = await db.collection('contacts')
    .find({})
    .sort({ sort_order: 1, _id: 1 })
    .toArray();
  return docs.map(d => ({ ...d, id: d._id.toString(), is_active: d.is_active !== false }));
}

function contactFields(data) {
  const doc = {};
  if (data.name !== undefined) doc.name = String(data.name).trim();
  if (data.role !== undefined) doc.role = data.role ? String(data.role).trim() : null;
  if (data.phone !== undefined) doc.phone = String(data.phone).trim();
  if (data.whatsapp !== undefined) doc.whatsapp = data.whatsapp ? String(data.whatsapp).trim() : null;
  if (data.email !== undefined) doc.email = data.email ? String(data.email).trim() : null;
  if (data.sort_order !== undefined) doc.sort_order = parseInt(data.sort_order, 10) || 0;
  if (data.is_active !== undefined) doc.is_active = !!data.is_active;
  return doc;
}

async function createContact(data) {
  const db = await getDb();
  const doc = {
    role: null,
    whatsapp: null,
    email: null,
    sort_order: 0,
    is_active: true,
    ...contactFields(data),
    created_at: new Date().toISOString()
  };
  if (!doc.whatsapp) doc.whatsapp = doc.phone;
  const result = await db.collection('contacts').insertOne(doc);
  return result.insertedId.toString();
}

async function updateContact(id, data) {
  const db = await getDb();
  const update = contactFields(data);
  if (!Object.keys(update).length) return;
  await db.collection('contacts').updateOne({ _id: new ObjectId(id) }, { $set: update });
}

async function deleteContact(id) {
  const db = await getDb();
  await db.collection('contacts').deleteOne({ _id: new ObjectId(id) });
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

const { verifyAdminCredentials } = require('./auth');

module.exports = {
  getDb,
  getDonors,
  createDonor,
  updateDonor,
  toggleVerifyDonor,
  deleteDonor,
  getEmergencyRequests,
  createEmergencyRequest,
  updateEmergencyStatus,
  deleteEmergencyRequest,
  getContacts,
  createContact,
  updateContact,
  deleteContact,
  getStats,
  verifyAdminCredentials
};
