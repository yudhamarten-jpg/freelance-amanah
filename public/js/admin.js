// Page navigation
function showPage(pageName) {
  // Update nav
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  document.querySelector(`[data-page="${pageName}"]`).classList.add('active');
  
  // Show page
  document.querySelectorAll('.page-content').forEach(p => p.style.display = 'none');
  document.getElementById('page-' + pageName).style.display = 'block';
  
  // Load data
  if (pageName === 'konfirmasi') loadDeposits();
  if (pageName === 'dataemail') loadEmails();
}

// ========== PENGATURAN ==========
async function changePassword() {
  const pw = document.getElementById('newPassword').value;
  if (!pw) return;
  const res = await fetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'admin_password', value: pw })
  });
  const data = await res.json();
  document.getElementById('passwordMsg').textContent = data.success ? '✅ Password berhasil diubah!' : '❌ Gagal';
  setTimeout(() => document.getElementById('passwordMsg').textContent = '', 3000);
}

async function updateSetting(key, value) {
  const res = await fetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value })
  });
  const data = await res.json();
  document.getElementById(key + 'Msg').textContent = data.success ? '✅ Berhasil disimpan!' : '❌ Gagal';
  setTimeout(() => {
    const el = document.getElementById(key + 'Msg');
    if (el) el.textContent = '';
  }, 3000);
}

async function updateSchedule() {
  const openHour = document.getElementById('openHour').value;
  const openMinute = document.getElementById('openMinute').value;
  const closeHour = document.getElementById('closeHour').value;
  const closeMinute = document.getElementById('closeMinute').value;
  
  await fetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'open_hour', value: openHour })
  });
  await fetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'open_minute', value: openMinute })
  });
  await fetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'close_hour', value: closeHour })
  });
  await fetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'close_minute', value: closeMinute })
  });
  
  document.getElementById('scheduleMsg').textContent = '✅ Jadwal berhasil disimpan! Refresh halaman untuk melihat perubahan.';
}

// ========== KONFIRMASI SETORAN ==========
async function loadDeposits() {
  const res = await fetch('/api/admin/deposits');
  const deposits = await res.json();
  
  const container = document.getElementById('depositList');
  if (deposits.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px;">Belum ada setoran</p>';
    return;
  }
  
  container.innerHTML = deposits.map(d => `
    <div class="deposit-item">
      <div class="deposit-header">
        <strong>${d.email_username}</strong>
        <span class="badge badge-${d.status}">${d.status.toUpperCase()}</span>
      </div>
      <div class="deposit-meta">
        <div>🎮 Discord: ${d.discord_name}</div>
        <div>📱 WA: ${d.wa_number}</div>
        <div>💳 DANA: ${d.dana_number}</div>
        <div>👤 Member: ${d.member_username}</div>
      </div>
      <div class="deposit-actions">
        <button class="btn btn-success btn-sm" onclick="updateDeposit(${d.id},'accepted')">✅ Accept</button>
        <button class="btn btn-danger btn-sm" onclick="updateDeposit(${d.id},'denied')">❌ Deny</button>
        <button class="btn btn-warning btn-sm" onclick="updateDeposit(${d.id},'pending')">⏳ Pending</button>
      </div>
    </div>
  `).join('');
}

async function updateDeposit(id, status) {
  await fetch('/api/admin/deposit-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status })
  });
  loadDeposits();
  setTimeout(() => location.reload(), 500);
}

// ========== DATA EMAIL ==========
async function loadEmails() {
  const res = await fetch('/api/admin/emails');
  const emails = await res.json();
  
  const container = document.getElementById('emailList');
  if (emails.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px;">Belum ada data email</p>';
    return;
  }
  
  container.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Username Email</th>
            <th>Sandi</th>
            <th>Status</th>
            <th>Disetor Oleh</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${emails.map(e => `
            <tr>
              <td>${e.email_username}</td>
              <td>${e.email_password}</td>
              <td><span class="badge ${e.is_deposited ? 'badge-accepted' : 'badge-pending'}">${e.is_deposited ? 'Disetor' : 'Belum'}</span></td>
              <td>${e.deposited_by || '-'}</td>
              <td><button class="btn btn-danger btn-sm" onclick="deleteEmail(${e.id})">🗑️ Hapus</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function addEmail() {
  const email_username = document.getElementById('emailUsername').value;
  const email_password = document.getElementById('emailPassword').value;
  
  if (!email_username || !email_password) {
    document.getElementById('emailMsg').textContent = '❌ Harap isi semua field!';
    return;
  }
  
  const res = await fetch('/api/admin/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email_username, email_password })
  });
  
  const data = await res.json();
  document.getElementById('emailMsg').textContent = data.success ? '✅ Data email berhasil dikirim!' : '❌ Gagal';
  document.getElementById('emailUsername').value = '';
  document.getElementById('emailPassword').value = '';
  loadEmails();
  setTimeout(() => document.getElementById('emailMsg').textContent = '', 3000);
}

async function deleteEmail(id) {
  if (!confirm('Hapus data email ini?')) return;
  await fetch('/api/admin/emails/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  loadEmails();
}

// ========== RESET ==========
async function manualReset() {
  if (!confirm('Reset manual semua data? Data yang di-reset akan masuk ke history.')) return;
  await fetch('/api/admin/reset', { method: 'POST' });
  location.reload();
}
