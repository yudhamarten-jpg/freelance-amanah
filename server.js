const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const Database = require('better-sqlite3');
const moment = require('moment');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const db = new Database('database.db');
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username_email TEXT NOT NULL,
    password_email TEXT NOT NULL,
    status TEXT DEFAULT 'available',
    member_id INTEGER,
    submitted_at DATETIME,
    FOREIGN KEY (member_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    email_id INTEGER,
    username_email TEXT NOT NULL,
    discord_name TEXT,
    wa_number TEXT,
    dana_number TEXT,
    status TEXT DEFAULT 'pending',
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_at DATETIME,
    FOREIGN KEY (member_id) REFERENCES members(id),
    FOREIGN KEY (email_id) REFERENCES emails(id)
  );

  CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_setoran INTEGER DEFAULT 0,
    total_pending INTEGER DEFAULT 0,
    total_accepted INTEGER DEFAULT 0,
    total_denied INTEGER DEFAULT 0,
    total_bayaran INTEGER DEFAULT 0,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_setoran INTEGER DEFAULT 0,
    total_pending INTEGER DEFAULT 0,
    total_accepted INTEGER DEFAULT 0,
    total_denied INTEGER DEFAULT 0,
    total_bayaran INTEGER DEFAULT 0,
    reset_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Default settings
const defaultSettings = {
  admin_password: 'yudha05',
  harga_bayaran: '1000',
  jam_open: '08:00',
  jam_close: '20:00',
  is_open: 'false'
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, value);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'freelance-amanah-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Helper
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function isLoggedIn(req) {
  return req.session && req.session.admin === true;
}

function isMemberLoggedIn(req) {
  return req.session && req.session.memberId;
}

function checkOpenClose() {
  const jamOpen = getSetting('jam_open') || '08:00';
  const jamClose = getSetting('jam_close') || '20:00';
  const now = moment();
  const currentTime = now.format('HH:mm');
  
  if (currentTime >= jamOpen && currentTime < jamClose) {
    setSetting('is_open', 'true');
  } else {
    setSetting('is_open', 'false');
  }
}

// Cek open/close setiap request
app.use((req, res, next) => {
  checkOpenClose();
  next();
});

// ==================== PUBLIC ROUTES ====================

// Landing page
app.get('/', (req, res) => {
  res.render('landing');
});

// ==================== ADMIN ROUTES ====================

// Admin login page
app.get('/admin', (req, res) => {
  if (isLoggedIn(req)) return res.redirect('/admin/dashboard');
  res.render('admin-login');
});

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = getSetting('admin_password');
  if (password === adminPassword) {
    req.session.admin = true;
    return res.json({ success: true });
  }
  res.json({ success: false, message: 'Password salah!' });
});

app.get('/admin/logout', (req, res) => {
  req.session.admin = false;
  res.redirect('/');
});

// Admin dashboard
app.get('/admin/dashboard', (req, res) => {
  if (!isLoggedIn(req)) return res.redirect('/admin');
  
  const settings = {};
  const allSettings = db.prepare('SELECT * FROM settings').all();
  allSettings.forEach(s => { settings[s.key] = s.value; });
  
  const stats = db.prepare('SELECT * FROM stats ORDER BY id DESC LIMIT 1').get() || {
    total_setoran: 0, total_pending: 0, total_accepted: 0, total_denied: 0, total_bayaran: 0
  };
  
  // history 24h
  const history = db.prepare('SELECT * FROM history ORDER BY id DESC LIMIT 20').all();
  
  res.render('admin-dashboard', { settings, stats, history, moment });
});

// Admin - Get statistics (API)
app.get('/admin/api/stats', (req, res) => {
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'Unauthorized' });
  
  const stats = db.prepare('SELECT * FROM stats ORDER BY id DESC LIMIT 1').get() || {
    total_setoran: 0, total_pending: 0, total_accepted: 0, total_denied: 0, total_bayaran: 0
  };
  res.json(stats);
});

// Admin - Reset stats
app.post('/admin/api/reset-stats', (req, res) => {
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'Unauthorized' });
  
  const currentStats = db.prepare('SELECT * FROM stats ORDER BY id DESC LIMIT 1').get();
  
  if (currentStats) {
    db.prepare(`INSERT INTO history (total_setoran, total_pending, total_accepted, total_denied, total_bayaran) VALUES (?, ?, ?, ?, ?)`)
      .run(currentStats.total_setoran, currentStats.total_pending, currentStats.total_accepted, currentStats.total_denied, currentStats.total_bayaran);
  }
  
  db.prepare('INSERT INTO stats (total_setoran, total_pending, total_accepted, total_denied, total_bayaran) VALUES (0, 0, 0, 0, 0)').run();
  
  res.json({ success: true });
});

// Admin - Update settings
app.post('/admin/api/settings', (req, res) => {
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'Unauthorized' });
  
  const { key, value } = req.body;
  setSetting(key, value);
  res.json({ success: true });
});

// Admin - Get all settings (API)
app.get('/admin/api/settings', (req, res) => {
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'Unauthorized' });
  const settings = {};
  db.prepare('SELECT * FROM settings').all().forEach(s => { settings[s.key] = s.value; });
  res.json(settings);
});

// Admin - Add emails
app.post('/admin/api/emails', (req, res) => {
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'Unauthorized' });
  
  const { emails } = req.body;
  const emailList = emails.split('\n').map(e => e.trim()).filter(e => e);
  
  const insert = db.prepare('INSERT INTO emails (username_email, password_email) VALUES (?, ?)');
  
  let count = 0;
  for (const line of emailList) {
    const parts = line.split(':');
    const username = parts[0]?.trim();
    const password = parts[1]?.trim() || 'sgsg1122';
    if (username) {
      insert.run(username, password);
      count++;
    }
  }
  
  res.json({ success: true, count });
});

// Admin - Get all emails
app.get('/admin/api/emails', (req, res) => {
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'Unauthorized' });
  const emails = db.prepare('SELECT * FROM emails ORDER BY id DESC').all();
  res.json(emails);
});

// Admin - Delete all emails
app.post('/admin/api/emails/clear', (req, res) => {
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'Unauthorized' });
  db.prepare('DELETE FROM emails').run();
  res.json({ success: true });
});

// Admin - Send emails to members
app.post('/admin/api/emails/send', (req, res) => {
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'Unauthorized' });
  
  // Mark all available emails as "sent" (they will appear on member page)
  db.prepare("UPDATE emails SET status = 'available' WHERE status = 'available'").run();
  
  res.json({ success: true, message: 'Data email berhasil dikirim ke halaman member!' });
});

// Admin - Get submissions
app.get('/admin/api/submissions', (req, res) => {
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'Unauthorized' });
  
  const submissions = db.prepare(`
    SELECT s.*, m.username as member_name 
    FROM submissions s 
    LEFT JOIN members m ON s.member_id = m.id 
    ORDER BY s.id DESC
  `).all();
  
  res.json(submissions);
});

// Admin - Update submission status
app.post('/admin/api/submissions/:id/status', (req, res) => {
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'Unauthorized' });
  
  const { id } = req.params;
  const { status } = req.body;
  
  db.prepare('UPDATE submissions SET status = ?, confirmed_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
  
  // Update stats
  const sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
  if (sub) {
    const latestStats = db.prepare('SELECT * FROM stats ORDER BY id DESC LIMIT 1').get();
    const harga = parseInt(getSetting('harga_bayaran') || '1000');
    
    let newStats = { ...latestStats };
    if (!newStats) {
      db.prepare('INSERT INTO stats DEFAULT VALUES').run();
      newStats = { total_setoran: 0, total_pending: 0, total_accepted: 0, total_denied: 0, total_bayaran: 0 };
    }
    
    // Update pending count
    const pendingCount = db.prepare("SELECT COUNT(*) as c FROM submissions WHERE status = 'pending'").get().c;
    const acceptedCount = db.prepare("SELECT COUNT(*) as c FROM submissions WHERE status = 'accepted'").get().c;
    const deniedCount = db.prepare("SELECT COUNT(*) as c FROM submissions WHERE status = 'denied'").get().c;
    const totalCount = db.prepare("SELECT COUNT(*) as c FROM submissions").get().c;
    const totalBayaran = acceptedCount * harga;
    
    db.prepare(`UPDATE stats SET total_setoran = ?, total_pending = ?, total_accepted = ?, total_denied = ?, total_bayaran = ? WHERE id = ?`)
      .run(totalCount, pendingCount, acceptedCount, deniedCount, totalBayaran, latestStats.id);
    
    // If accepted, mark email as done
    if (status === 'accepted') {
      db.prepare("UPDATE emails SET status = 'done', member_id = ? WHERE username_email = ? AND status = 'available'")
        .run(sub.member_id, sub.username_email);
    }
  }
  
  res.json({ success: true });
});

// ==================== MEMBER ROUTES ====================

// Member login page
app.get('/member', (req, res) => {
  if (isMemberLoggedIn(req)) return res.redirect('/member/dashboard');
  res.render('member-login');
});

// Member register
app.post('/member/api/register', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.json({ success: false, message: 'Username dan password harus diisi!' });
  }
  
  if (username.length < 3) {
    return res.json({ success: false, message: 'Username minimal 3 karakter!' });
  }
  
  if (password.length < 4) {
    return res.json({ success: false, message: 'Password minimal 4 karakter!' });
  }
  
  const existing = db.prepare('SELECT * FROM members WHERE username = ?').get(username);
  if (existing) {
    return res.json({ success: false, message: 'Username sudah terdaftar!' });
  }
  
  const hashedPassword = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO members (username, password) VALUES (?, ?)').run(username, hashedPassword);
  
  res.json({ success: true, message: 'Registrasi berhasil! Silakan login.' });
});

// Member login API
app.post('/member/api/login', (req, res) => {
  const { username, password } = req.body;
  
  const member = db.prepare('SELECT * FROM members WHERE username = ?').get(username);
  if (!member) {
    return res.json({ success: false, message: 'Username tidak ditemukan!' });
  }
  
  if (!bcrypt.compareSync(password, member.password)) {
    return res.json({ success: false, message: 'Password salah!' });
  }
  
  req.session.memberId = member.id;
  req.session.memberName = member.username;
  
  res.json({ success: true, message: 'Login berhasil!' });
});

app.get('/member/logout', (req, res) => {
  req.session.memberId = null;
  req.session.memberName = null;
  res.redirect('/');
});

// Member dashboard
app.get('/member/dashboard', (req, res) => {
  if (!isMemberLoggedIn(req)) return res.redirect('/member');
  
  const memberId = req.session.memberId;
  const memberName = req.session.memberName;
  const harga = getSetting('harga_bayaran') || '0';
  const isOpen = getSetting('is_open') === 'true';
  const jamOpen = getSetting('jam_open') || '08:00';
  const jamClose = getSetting('jam_close') || '20:00';
  
  // Get available emails (only when open)
  let emails = [];
  if (isOpen) {
    emails = db.prepare("SELECT * FROM emails WHERE status = 'available' ORDER BY id ASC").all();
  }
  
  // Get member's submissions
  const submissions = db.prepare('SELECT * FROM submissions WHERE member_id = ? ORDER BY id DESC').all(memberId);
  
  res.render('member-dashboard', { 
    memberName, harga, isOpen, jamOpen, jamClose, emails, submissions, moment 
  });
});

// Member - Submit setoran
app.post('/member/api/submit', (req, res) => {
  if (!isMemberLoggedIn(req)) return res.status(401).json({ error: 'Unauthorized' });
  
  const memberId = req.session.memberId;
  const { discord_name, wa_number, dana_number, username_email } = req.body;
  
  if (!username_email) {
    return res.json({ success: false, message: 'Username email harus diisi!' });
  }
  
  // Check if already submitted by this member
  const existing = db.prepare('SELECT * FROM submissions WHERE member_id = ? AND username_email = ?').get(memberId, username_email);
  if (existing) {
    return res.json({ success: false, message: 'Email ini sudah kamu setorkan!' });
  }
  
  // Check if anyone else already submitted this email
  const duplicate = db.prepare('SELECT * FROM submissions WHERE username_email = ?').get(username_email);
  if (duplicate) {
    return res.json({ success: false, message: 'Email ini sudah disetorkan oleh member lain!' });
  }
  
  db.prepare(`INSERT INTO submissions (member_id, username_email, discord_name, wa_number, dana_number) VALUES (?, ?, ?, ?, ?)`)
    .run(memberId, username_email, discord_name || '', wa_number || '', dana_number || '');
  
  // Update email status
  db.prepare("UPDATE emails SET status = 'submitted', member_id = ?, submitted_at = CURRENT_TIMESTAMP WHERE username_email = ? AND status = 'available'")
    .run(memberId, username_email);
  
  // Update stats
  const latestStats = db.prepare('SELECT * FROM stats ORDER BY id DESC LIMIT 1').get();
  if (latestStats) {
    const totalCount = db.prepare("SELECT COUNT(*) as c FROM submissions").get().c;
    const pendingCount = db.prepare("SELECT COUNT(*) as c FROM submissions WHERE status = 'pending'").get().c;
    const acceptedCount = db.prepare("SELECT COUNT(*) as c FROM submissions WHERE status = 'accepted'").get().c;
    const deniedCount = db.prepare("SELECT COUNT(*) as c FROM submissions WHERE status = 'denied'").get().c;
    const harga = parseInt(getSetting('harga_bayaran') || '1000');
    
    db.prepare(`UPDATE stats SET total_setoran = ?, total_pending = ?, total_accepted = ?, total_denied = ?, total_bayaran = ? WHERE id = ?`)
      .run(totalCount, pendingCount, acceptedCount, deniedCount, acceptedCount * harga, latestStats.id);
  }
  
  res.json({ success: true, message: 'Setoran berhasil dikirim!' });
});

// Member - Check submission status
app.post('/member/api/check-status', (req, res) => {
  const { discord_name, wa_number } = req.body;
  
  let submissions;
  if (discord_name) {
    submissions = db.prepare('SELECT * FROM submissions WHERE discord_name LIKE ? ORDER BY id DESC').all(`%${discord_name}%`);
  } else if (wa_number) {
    submissions = db.prepare('SELECT * FROM submissions WHERE wa_number LIKE ? ORDER BY id DESC').all(`%${wa_number}%`);
  } else {
    return res.json({ success: false, message: 'Masukkan nama Discord atau nomor WA!' });
  }
  
  res.json({ success: true, submissions });
});

// Member - Get submissions for current member
app.get('/member/api/submissions', (req, res) => {
  if (!isMemberLoggedIn(req)) return res.status(401).json({ error: 'Unauthorized' });
  const submissions = db.prepare('SELECT * FROM submissions WHERE member_id = ? ORDER BY id DESC').all(req.session.memberId);
  res.json(submissions);
});

// Auto-reset 24h stats (except total_setoran)
setInterval(() => {
  const latestStats = db.prepare('SELECT * FROM stats ORDER BY id DESC LIMIT 1').get();
  if (latestStats) {
    // Simpan ke history sebelum reset
    db.prepare(`INSERT INTO history (total_setoran, total_pending, total_accepted, total_denied, total_bayaran) VALUES (?, ?, ?, ?, ?)`)
      .run(latestStats.total_setoran, latestStats.total_pending, latestStats.total_accepted, latestStats.total_denied, latestStats.total_bayaran);
    
    // Reset kecuali total_setoran
    db.prepare(`INSERT INTO stats (total_setoran, total_pending, total_accepted, total_denied, total_bayaran) VALUES (?, 0, 0, 0, 0)`)
      .run(latestStats.total_setoran);
  }
}, 24 * 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
