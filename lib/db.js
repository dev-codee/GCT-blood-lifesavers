const crypto = require('node:crypto');
const path = require('node:path');

// MongoDB connection cache for Vercel serverless environment
let cachedClient = null;
let cachedDb = null;
let mongoFailedUntil = 0;

// Fallback SQLite instance
let sqliteDb = null;
try {
  const { DatabaseSync } = require('node:sqlite');
  const dbFile = process.env.VERCEL ? '/tmp/blood_directory.db' : path.join(__dirname, '..', 'blood_directory.db');
  sqliteDb = new DatabaseSync(dbFile);
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS donors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      blood_group TEXT NOT NULL,
      phone TEXT NOT NULL,
      whatsapp TEXT,
      email TEXT,
      age INTEGER,
      gender TEXT,
      city TEXT NOT NULL,
      state TEXT,
      area TEXT,
      pincode TEXT,
      last_donation_date TEXT,
      is_first_time INTEGER DEFAULT 0,
      availability TEXT DEFAULT 'available',
      is_verified INTEGER DEFAULT 0,
      emergency_ready INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS emergency_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_name TEXT NOT NULL,
      blood_group TEXT NOT NULL,
      units INTEGER DEFAULT 1,
      hospital_name TEXT NOT NULL,
      city TEXT NOT NULL,
      area TEXT,
      contact_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      urgency_level TEXT DEFAULT 'Critical',
      status TEXT DEFAULT 'open',
      notes TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const pRow = sqliteDb.prepare("SELECT value FROM admin_settings WHERE key = 'admin_password'").get();
  if (!pRow) {
    const hash = crypto.createHash('sha256').update('admin123').digest('hex');
    sqliteDb.prepare("INSERT INTO admin_settings (key, value) VALUES ('admin_password', ?)").run(hash);
  }
} catch (e) {
  // SQLite unavailable on older runtimes
}

// In-memory fallback (universal zero-failure storage)
let inMemoryDonors = [];
let inMemoryEmergencies = [];
let inMemoryAdminPass = crypto.createHash('sha256').update('admin123').digest('hex');

// Connect to MongoDB if MONGODB_URI is provided
async function getMongoDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;

  if (cachedDb) return cachedDb;

  // Don't retry immediately if connection recently failed
  if (Date.now() < mongoFailedUntil) return null;

  try {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 2500,
      connectTimeoutMS: 2500
    });
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'blood_directory');
    cachedClient = client;
    cachedDb = db;

    // Ensure admin credentials exist
    try {
      const settingsColl = db.collection('admin_settings');
      const passRow = await settingsColl.findOne({ key: 'admin_password' });
      if (!passRow) {
        const hash = crypto.createHash('sha256').update('admin123').digest('hex');
        await settingsColl.insertOne({ key: 'admin_password', value: hash });
      }
    } catch (e) {
      // Ignored
    }

    return db;
  } catch (err) {
    console.error('MongoDB connection error, falling back to storage:', err.message);
    mongoFailedUntil = Date.now() + 30000; // retry after 30s
    return null;
  }
}

// Eligibility calculator
function checkEligibility(lastDonationDate, isFirstTime) {
  if (isFirstTime || !lastDonationDate) {
    return { isEligible: true, daysRemaining: 0, statusText: 'Eligible (First Time)' };
  }
  const lastDate = new Date(lastDonationDate);
  if (isNaN(lastDate.getTime())) return { isEligible: true, daysRemaining: 0, statusText: 'Eligible' };
  const now = new Date();
  const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
  const cooldown = 90;
  if (diffDays >= cooldown) {
    return { isEligible: true, daysRemaining: 0, diffDays, statusText: `Eligible (${diffDays}d ago)` };
  }
  return { isEligible: false, daysRemaining: cooldown - diffDays, diffDays, statusText: `Cooldown (${cooldown - diffDays}d left)` };
}

// ----------------------------------------------------
// DATABASE ACCESS METHODS
// ----------------------------------------------------

async function getDonors(query = {}) {
  let donors = [];

  try {
    const mdb = await getMongoDb();
    if (mdb) {
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

      const docs = await mdb.collection('donors').find(mongoQuery).sort({ is_verified: -1, _id: -1 }).toArray();
      donors = docs.map(d => ({
        ...d,
        id: d._id.toString()
      }));
    }
  } catch (err) {
    console.error('Error querying MongoDB for donors, falling back:', err);
  }

  // Fallback if mdb returned no list or failed
  if (donors.length === 0 && !cachedDb) {
    if (sqliteDb) {
      try {
        let sql = 'SELECT * FROM donors WHERE 1=1';
        const params = [];
        if (query.blood_group && query.blood_group !== 'ALL') {
          const groups = query.blood_group.split(',').map(g => g.trim());
          sql += ` AND blood_group IN (${groups.map(() => '?').join(',')})`;
          params.push(...groups);
        }
        if (query.city && query.city.trim()) {
          sql += ' AND LOWER(city) LIKE ?';
          params.push(`%${query.city.trim().toLowerCase()}%`);
        }
        if (query.availability && query.availability !== 'ALL') {
          sql += ' AND availability = ?';
          params.push(query.availability);
        }
        if (query.search && query.search.trim()) {
          const s = `%${query.search.trim().toLowerCase()}%`;
          sql += ' AND (LOWER(name) LIKE ? OR LOWER(city) LIKE ? OR LOWER(area) LIKE ? OR phone LIKE ?)';
          params.push(s, s, s, s);
        }
        sql += ' ORDER BY is_verified DESC, id DESC';
        donors = sqliteDb.prepare(sql).all(...params);
      } catch (e) {}
    } else {
      donors = [...inMemoryDonors];
    }
  }

  donors = donors.map(d => ({
    ...d,
    is_verified: !!d.is_verified,
    eligibility: checkEligibility(d.last_donation_date, d.is_first_time)
  }));

  if (query.eligible_only === 'true' || query.eligible_only === '1') {
    donors = donors.filter(d => d.eligibility.isEligible);
  }

  return donors;
}

async function createDonor(data) {
  const donorDoc = {
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

  // Try MongoDB
  try {
    const mdb = await getMongoDb();
    if (mdb) {
      const res = await mdb.collection('donors').insertOne(donorDoc);
      return res.insertedId.toString();
    }
  } catch (err) {
    console.error('MongoDB insert error, falling back:', err.message);
  }

  // Try SQLite
  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare(`
        INSERT INTO donors (name, blood_group, phone, whatsapp, email, age, gender, city, state, area, pincode, last_donation_date, is_first_time, availability, is_verified, emergency_ready, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const r = stmt.run(donorDoc.name, donorDoc.blood_group, donorDoc.phone, donorDoc.whatsapp, donorDoc.email, donorDoc.age, donorDoc.gender, donorDoc.city, donorDoc.state, donorDoc.area, donorDoc.pincode, donorDoc.last_donation_date, donorDoc.is_first_time ? 1 : 0, donorDoc.availability, 0, donorDoc.emergency_ready ? 1 : 0, donorDoc.notes, donorDoc.created_at);
      return Number(r.lastInsertRowid);
    } catch (e) {
      console.error('SQLite insert error:', e.message);
    }
  }

  // Memory Fallback
  const id = Date.now();
  inMemoryDonors.unshift({ id, ...donorDoc });
  return id;
}

async function updateDonor(id, data) {
  try {
    const mdb = await getMongoDb();
    if (mdb) {
      const { ObjectId } = require('mongodb');
      await mdb.collection('donors').updateOne(
        { _id: new ObjectId(id) },
        { $set: data }
      );
      return;
    }
  } catch (err) {}

  if (sqliteDb) {
    try {
      sqliteDb.prepare(`
        UPDATE donors SET name=?, blood_group=?, phone=?, whatsapp=?, email=?, age=?, city=?, area=?, availability=?, last_donation_date=?, is_verified=?, notes=? WHERE id=?
      `).run(data.name, data.blood_group, data.phone, data.whatsapp, data.email || null, data.age ? parseInt(data.age, 10) : null, data.city, data.area || null, data.availability, data.last_donation_date || null, data.is_verified ? 1 : 0, data.notes || null, id);
      return;
    } catch (e) {}
  }

  const d = inMemoryDonors.find(x => String(x.id) === String(id));
  if (d) Object.assign(d, data);
}

async function toggleVerifyDonor(id, isVerified) {
  try {
    const mdb = await getMongoDb();
    if (mdb) {
      const { ObjectId } = require('mongodb');
      await mdb.collection('donors').updateOne(
        { _id: new ObjectId(id) },
        { $set: { is_verified: !!isVerified } }
      );
      return;
    }
  } catch (err) {}

  if (sqliteDb) {
    try {
      sqliteDb.prepare('UPDATE donors SET is_verified = ? WHERE id = ?').run(isVerified ? 1 : 0, id);
      return;
    } catch (e) {}
  }

  const d = inMemoryDonors.find(x => String(x.id) === String(id));
  if (d) d.is_verified = !!isVerified;
}

async function deleteDonor(id) {
  try {
    const mdb = await getMongoDb();
    if (mdb) {
      const { ObjectId } = require('mongodb');
      await mdb.collection('donors').deleteOne({ _id: new ObjectId(id) });
      return;
    }
  } catch (err) {}

  if (sqliteDb) {
    try {
      sqliteDb.prepare('DELETE FROM donors WHERE id = ?').run(id);
      return;
    } catch (e) {}
  }

  inMemoryDonors = inMemoryDonors.filter(x => String(x.id) !== String(id));
}

async function getEmergencyRequests(status = 'open') {
  try {
    const mdb = await getMongoDb();
    if (mdb) {
      const docs = await mdb.collection('emergency_requests').find(status ? { status } : {}).sort({ _id: -1 }).limit(20).toArray();
      return docs.map(d => ({ ...d, id: d._id.toString() }));
    }
  } catch (err) {}

  if (sqliteDb) {
    try {
      const sql = status ? 'SELECT * FROM emergency_requests WHERE status = ? ORDER BY id DESC LIMIT 20' : 'SELECT * FROM emergency_requests ORDER BY id DESC LIMIT 20';
      return status ? sqliteDb.prepare(sql).all(status) : sqliteDb.prepare(sql).all();
    } catch (e) {}
  }

  return inMemoryEmergencies.filter(e => !status || e.status === status);
}

async function createEmergencyRequest(data) {
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

  try {
    const mdb = await getMongoDb();
    if (mdb) {
      const res = await mdb.collection('emergency_requests').insertOne(doc);
      return res.insertedId.toString();
    }
  } catch (err) {}

  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare(`
        INSERT INTO emergency_requests (patient_name, blood_group, units, hospital_name, city, area, contact_name, contact_phone, urgency_level, status, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const r = stmt.run(doc.patient_name, doc.blood_group, doc.units, doc.hospital_name, doc.city, doc.area, doc.contact_name, doc.contact_phone, doc.urgency_level, doc.status, doc.notes, doc.created_at);
      return Number(r.lastInsertRowid);
    } catch (e) {}
  }

  const id = Date.now();
  inMemoryEmergencies.unshift({ id, ...doc });
  return id;
}

async function updateEmergencyStatus(id, status) {
  try {
    const mdb = await getMongoDb();
    if (mdb) {
      const { ObjectId } = require('mongodb');
      await mdb.collection('emergency_requests').updateOne({ _id: new ObjectId(id) }, { $set: { status } });
      return;
    }
  } catch (err) {}

  if (sqliteDb) {
    try {
      sqliteDb.prepare('UPDATE emergency_requests SET status = ? WHERE id = ?').run(status, id);
      return;
    } catch (e) {}
  }

  const e = inMemoryEmergencies.find(x => String(x.id) === String(id));
  if (e) e.status = status;
}

async function deleteEmergencyRequest(id) {
  try {
    const mdb = await getMongoDb();
    if (mdb) {
      const { ObjectId } = require('mongodb');
      await mdb.collection('emergency_requests').deleteOne({ _id: new ObjectId(id) });
      return;
    }
  } catch (err) {}

  if (sqliteDb) {
    try {
      sqliteDb.prepare('DELETE FROM emergency_requests WHERE id = ?').run(id);
      return;
    } catch (e) {}
  }

  inMemoryEmergencies = inMemoryEmergencies.filter(x => String(x.id) !== String(id));
}

async function getStats() {
  try {
    const mdb = await getMongoDb();
    if (mdb) {
      const totalDonors = await mdb.collection('donors').countDocuments();
      const availableDonors = await mdb.collection('donors').countDocuments({ availability: 'available' });
      const verifiedDonors = await mdb.collection('donors').countDocuments({ is_verified: true });
      const emergencyRequests = await mdb.collection('emergency_requests').countDocuments({ status: 'open' });

      const pipeline = [
        { $group: { _id: '$blood_group', count: { $sum: 1 } } },
        { $project: { blood_group: '$_id', count: 1, _id: 0 } }
      ];
      const bloodGroupCounts = await mdb.collection('donors').aggregate(pipeline).toArray();

      return { totalDonors, availableDonors, verifiedDonors, emergencyRequests, bloodGroupCounts, database: 'MongoDB Atlas' };
    }
  } catch (err) {}

  if (sqliteDb) {
    try {
      const totalDonors = sqliteDb.prepare('SELECT COUNT(*) as c FROM donors').get().c;
      const availableDonors = sqliteDb.prepare("SELECT COUNT(*) as c FROM donors WHERE availability = 'available'").get().c;
      const verifiedDonors = sqliteDb.prepare('SELECT COUNT(*) as c FROM donors WHERE is_verified = 1').get().c;
      const emergencyRequests = sqliteDb.prepare("SELECT COUNT(*) as c FROM emergency_requests WHERE status = 'open'").get().c;
      const bloodGroupCounts = sqliteDb.prepare('SELECT blood_group, COUNT(*) as count FROM donors GROUP BY blood_group').all();
      return { totalDonors, availableDonors, verifiedDonors, emergencyRequests, bloodGroupCounts, database: 'SQLite' };
    } catch (e) {}
  }

  return {
    totalDonors: inMemoryDonors.length,
    availableDonors: inMemoryDonors.filter(d => d.availability === 'available').length,
    verifiedDonors: inMemoryDonors.filter(d => d.is_verified).length,
    emergencyRequests: inMemoryEmergencies.filter(e => e.status === 'open').length,
    bloodGroupCounts: [],
    database: 'Memory'
  };
}

async function verifyAdminPassword(password) {
  const inputHash = crypto.createHash('sha256').update(password).digest('hex');
  try {
    const mdb = await getMongoDb();
    if (mdb) {
      const row = await mdb.collection('admin_settings').findOne({ key: 'admin_password' });
      if (!row) return inputHash === inMemoryAdminPass;
      return row.value === inputHash;
    }
  } catch (err) {}

  if (sqliteDb) {
    try {
      const row = sqliteDb.prepare("SELECT value FROM admin_settings WHERE key = 'admin_password'").get();
      return row && row.value === inputHash;
    } catch (e) {}
  }

  return inputHash === inMemoryAdminPass;
}

async function changeAdminPassword(newPassword) {
  const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');
  try {
    const mdb = await getMongoDb();
    if (mdb) {
      await mdb.collection('admin_settings').updateOne(
        { key: 'admin_password' },
        { $set: { value: newHash } },
        { upsert: true }
      );
      return;
    }
  } catch (err) {}

  if (sqliteDb) {
    try {
      sqliteDb.prepare("UPDATE admin_settings SET value = ? WHERE key = 'admin_password'").run(newHash);
      return;
    } catch (e) {}
  }

  inMemoryAdminPass = newHash;
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
  verifyAdminPassword,
  changeAdminPassword
};
