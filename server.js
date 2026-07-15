const express = require('express');
const session = require('express-session');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const moment = require('moment');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const db = new Database(path.join(__dirname, 'data.db'));

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS email_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_username TEXT,
    email_password TEXT,
    is_deposited INTEGER DEFAULT 0,
    deposited_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_name TEXT,
    wa_number TEXT,
    dana_number TEXT,
    email_username TEXT,
    member_username TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    total_setoran INTEGER,
    total_pending INTEGER,
    total_accepted INTEGER,
    total_denied INTEGER,
    total_bayaran INTEGER,
    reset_date TEXT
  );
`);

// Default settings
const defaultSettings = {
  'admin_password': bcrypt.hashSync('yudha05', 10),
  'open_hour': '0',
  'open_minute': '0',
  'close_hour': '23',
  'close_minute': '59',
  'bayaran_harga': '5000'
};

for (const [key, value] of Object.entries(defaultSettings)) {
  const exists = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
  if (!exists) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'freelance-amanah-secret-key-' + Math.random(),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make moment available in all views
app.locals.moment = moment;
moment.locale('id');

// Helper function to get setting
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

// Helper to update setting
function updateSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// Check if setoran is open
function isSetoranOpen() {
  const now = moment();
  const openHour = parseInt(getSetting('open_hour') || '0');
  const openMinute = parseInt(getSetting('open_minute') || '0');
  const closeHour = parseInt(getSetting('close_hour') || '23');
  const closeMinute = parseInt(getSetting('close_minute') || '59');
  
  const openTime = moment().hour(openHour).minute(openMinute).second(0);
  const closeTime = moment().hour(closeHour).minute(closeMinute).second(0);
  
  return now.isBetween(openTime, closeTime);
}

// Auto-reset daily (check every minute)
function checkDailyReset() {
  const now = moment().format('YYYY-MM-DD');
  const lastReset = getSetting('last_reset_date');
  
  if (lastReset !== now) {
    // Save to history before reset
    const pending = db.prepare("SELECT COUNT(*) as count FROM deposits WHERE status='pending'").get();
    const accepted = db.prepare("SELECT COUNT(*) as count FROM deposits WHERE status='accepted'").get();
    const denied = db.prepare("SELECT COUNT(*) as count FROM deposits WHERE status='denied'").get();
    const totalSetoran = db.prepare("SELECT COUNT(*) as count FROM deposits").get();
    const bayaranHarga = parseInt(getSetting('bayaran_harga') || '0');
    const totalBayaran = accepted.count * bayaranHarga;
    
    db.prepare(`INSERT INTO history (type, total_setoran, total_pending, total_accepted, total_denied, total_bayaran, reset_date) 
                VALUES ('daily', ?, ?, ?, ?, ?, ?)`).run(
      totalSetoran.count, pending.count, accepted.count, denied.count, totalBayaran, lastReset || moment().subtract(1, 'day').format('YYYY-MM-DD')
    );
    
    // Reset deposits (keep accepted for total)
    db.prepare("UPDATE deposits SET status='archived' WHERE status IN ('pending','accepted','denied')").run();
    
    updateSetting('last_reset_date', now);
  }
}

setInterval(checkDailyReset, 60000);

// ============ ROUTES ============

// Landing page
app.get('/', (req, res) => {
  res.render('landing');
});

// Admin password check
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = getSetting('admin_password');
  
  if (bcrypt.compareSync(password, adminPassword)) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'Password salah!' });
  }
});

// Admin page
app.get('/admin', (req, res) => {
  if (!req.session.isAdmin) {
    return res.redirect('/');
  }
  
  const setoranOpen = isSetoranOpen();
  
  // Counts
  const totalSetoran = db.prepare("SELECT COUNT(*) as count FROM deposits WHERE status != 'archived'").get();
  const pending = db.prepare("SELECT COUNT(*) as count FROM deposits WHERE status='pending'").get();
  const accepted = db.prepare("SELECT COUNT(*) as count FROM deposits WHERE status='accepted'").get();
  const denied = db.prepare("SELECT COUNT(*) as count FROM deposits WHERE status='denied'").get();
  const bayaranHarga = parseInt(getSetting('bayaran_harga') || '0');
  const totalBayaran = accepted.count * bayaranHarga;
  
  // History
  const history = db.prepare("SELECT * FROM history ORDER BY id DESC LIMIT 30").all();
  
  // Settings
  const settings = {
    open_hour: getSetting('open_hour'),
    open_minute: getSetting('open_minute'),
    close_hour: getSetting('close_hour'),
    close_minute: getSetting('close_minute'),
    bayaran_harga: getSetting('bayaran_harga')
  };
  
  res.render('admin/dashboard', {
    setoranOpen,
    totalSetoran: totalSetoran.count,
    pending: pending.count,
    accepted: accepted.count,
    denied: denied.count,
    totalBayaran,
    history,
    settings
  });
});

// Admin - Get deposits
app.get('/api/admin/deposits', (req, res) => {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  const deposits = db.prepare("SELECT * FROM deposits WHERE status != 'archived' ORDER BY id DESC").all();
  res.json(deposits);
});

// Admin - Update deposit status
app.post('/api/admin/deposit-status', (req, res) => {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  const { id, status } = req.body;
  db.prepare("UPDATE deposits SET status=? WHERE id=?").run(status, id);
  res.json({ success: true });
});

// Admin - Get email data
app.get('/api/admin/emails', (req, res) => {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  const emails = db.prepare("SELECT * FROM email_data ORDER BY id DESC").all();
  res.json(emails);
});

// Admin - Add email
app.post('/api/admin/emails', (req, res) => {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  const { email_username, email_password } = req.body;
  db.prepare("INSERT INTO email_data (email_username, email_password) VALUES (?,?)").run(email_username, email_password);
  res.json({ success: true });
});

// Admin - Delete email
app.post('/api/admin/emails/delete', (req, res) => {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.body;
  db.prepare("DELETE FROM email_data WHERE id=?").run(id);
  res.json({ success: true });
});

// Admin - Update settings
app.post('/api/admin/settings', (req, res) => {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  const { key, value } = req.body;
  if (key === 'admin_password') {
    updateSetting(key, bcrypt.hashSync(value, 10));
  } else {
    updateSetting(key, value);
  }
  res.json({ success: true });
});

// Admin - Manual reset
app.post('/api/admin/reset', (req, res) => {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  
  const pending = db.prepare("SELECT COUNT(*) as count FROM deposits WHERE status='pending'").get();
  const accepted = db.prepare("SELECT COUNT(*) as count FROM deposits WHERE status='accepted'").get();
  const denied = db.prepare("SELECT COUNT(*) as count FROM deposits WHERE status='denied'").get();
  const totalSetoran = db.prepare("SELECT COUNT(*) as count FROM deposits").get();
  const bayaranHarga = parseInt(getSetting('bayaran_harga') || '0');
  const totalBayaran = accepted.count * bayaranHarga;
  
  db.prepare(`INSERT INTO history (type, total_setoran, total_pending, total_accepted, total_denied, total_bayaran, reset_date) 
              VALUES ('manual', ?, ?, ?, ?, ?, ?)`).run(
    totalSetoran.count, pending.count, accepted.count, denied.count, totalBayaran, moment().format('YYYY-MM-DD HH:mm')
  );
  
  db.prepare("UPDATE deposits SET status='archived' WHERE status IN ('pending','accepted','denied')").run();
  
  res.json({ success: true });
});

// Admin logout
app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Check setoran status
app.get('/api/setoran-status', (req, res) => {
  res.json({ open: isSetoranOpen() });
});

// Member routes
app.get('/member', (req, res) => {
  const setoranOpen = isSetoranOpen();
  const bayaranHarga = getSetting('bayaran_harga');
  
  // Get available emails (not yet deposited and not archived)
  let emails;
  if (setoranOpen) {
    emails = db.prepare("SELECT id, email_username FROM email_data WHERE is_deposited=0").all();
  } else {
    emails = [];
  }
  
  res.render('member/dashboard', {
    setoranOpen,
    bayaranHarga,
    emails,
    isLoggedIn: !!req.session.memberUsername,
    memberUsername: req.session.memberUsername
  });
});

// Member registration
app.post('/api/member/register', (req, res) => {
  const { username, password } = req.body;
  const existing = db.prepare("SELECT id FROM members WHERE username=?").get(username);
  if (existing) {
    return res.json({ success: false, message: 'Username sudah terdaftar!' });
  }
  const hashedPassword = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO members (username, password) VALUES (?,?)").run(username, hashedPassword);
  req.session.memberUsername = username;
  res.json({ success: true });
});

// Member login
app.post('/api/member/login', (req, res) => {
  const { username, password } = req.body;
  const member = db.prepare("SELECT * FROM members WHERE username=?").get(username);
  if (!member) {
    return res.json({ success: false, message: 'Username tidak ditemukan!' });
  }
  if (bcrypt.compareSync(password, member.password)) {
    req.session.memberUsername = username;
    return res.json({ success: true });
  }
  res.json({ success: false, message: 'Password salah!' });
});

// Member logout
app.get('/member/logout', (req, res) => {
  req.session.memberUsername = null;
  res.redirect('/member');
});

// Member - Submit deposit
app.post('/api/member/deposit', (req, res) => {
  if (!isSetoranOpen()) {
    return res.json({ success: false, message: 'Setoran sedang tutup!' });
  }
  
  const { discord_name, wa_number, dana_number, email_username } = req.body;
  const memberUsername = req.session.memberUsername || 'guest';
  
  db.prepare(`INSERT INTO deposits (discord_name, wa_number, dana_number, email_username, member_username) 
              VALUES (?,?,?,?,?)`).run(discord_name, wa_number, dana_number, email_username, memberUsername);
  
  // Mark email as deposited
  db.prepare("UPDATE email_data SET is_deposited=1, deposited_by=? WHERE email_username=?").run(memberUsername, email_username);
  
  res.json({ success: true });
});

// Member - Check deposit status
app.post('/api/member/check-status', (req, res) => {
  const { search } = req.body;
  const deposits = db.prepare(
    "SELECT * FROM deposits WHERE (discord_name LIKE ? OR wa_number LIKE ?) AND status != 'archived' ORDER BY id DESC LIMIT 10"
  ).all('%' + search + '%', '%' + search + '%');
  res.json(deposits);
});

// Member - Get my deposits
app.get('/api/member/my-deposits', (req, res) => {
  if (!req.session.memberUsername) return res.json([]);
  const deposits = db.prepare(
    "SELECT * FROM deposits WHERE member_username=? ORDER BY id DESC LIMIT 20"
  ).all(req.session.memberUsername);
  res.json(deposits);
});

app.listen(PORT, () => {
  console.log(`Freelance Amanah running on port ${PORT}`);
});
