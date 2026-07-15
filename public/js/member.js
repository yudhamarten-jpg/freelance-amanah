// Auth switching
function switchAuth(type) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.style.display = 'none');
  
  if (type === 'login') {
    document.querySelectorAll('.auth-tab')[0].classList.add('active');
    document.getElementById('loginForm').style.display = 'block';
  } else {
    document.querySelectorAll('.auth-tab')[1].classList.add('active');
    document.getElementById('registerForm').style.display = 'block';
  }
}

// Member Login
async function memberLogin() {
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  const error = document.getElementById('loginError');
  
  if (!username || !password) {
    error.textContent = 'Harap isi semua field!';
    return;
  }
  
  const res = await fetch('/api/member/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  
  if (data.success) {
    location.reload();
  } else {
    error.textContent = data.message;
  }
}

// Member Register
async function memberRegister() {
  const username = document.getElementById('regUsername').value;
  const password = document.getElementById('regPassword').value;
  const error = document.getElementById('regError');
  
  if (!username || !password) {
    error.textContent = 'Harap isi semua field!';
    return;
  }
  
  const res = await fetch('/api/member/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  
  if (data.success) {
    location.reload();
  } else {
    error.textContent = data.message;
  }
}

// Submit Deposit
async function submitDeposit() {
  const discord_name = document.getElementById('discordName').value;
  const wa_number = document.getElementById('waNumber').value;
  const dana_number = document.getElementById('danaNumber').value;
  const email_username = document.getElementById('emailToDeposit').value;
  const msg = document.getElementById('depositMsg');
  
  if (!discord_name || !wa_number || !dana_number || !email_username) {
    msg.textContent = '❌ Harap isi semua field!';
    msg.style.color = '#f87171';
    return;
  }
  
  const res = await fetch('/api/member/deposit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ discord_name, wa_number, dana_number, email_username })
  });
  
  const data = await res.json();
  if (data.success) {
    msg.textContent = '✅ Setoran berhasil dikirim! Menunggu konfirmasi admin.';
    msg.style.color = '#4ecb71';
    document.getElementById('discordName').value = '';
    document.getElementById('waNumber').value = '';
    document.getElementById('danaNumber').value = '';
    document.getElementById('emailToDeposit').value = '';
    setTimeout(() => location.reload(), 2000);
  } else {
    msg.textContent = '❌ ' + (data.message || 'Gagal mengirim setoran');
    msg.style.color = '#f87171';
  }
}

// Check Status
async function checkStatus() {
  const search = document.getElementById('searchStatus').value;
  const container = document.getElementById('statusResult');
  
  if (!search) {
    container.innerHTML = '<p style="color:#f87171;">Masukkan nama discord atau no. WA</p>';
    return;
  }
  
  const res = await fetch('/api/member/check-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ search })
  });
  
  const deposits = await res.json();
  
  if (deposits.length === 0) {
    container.innerHTML = '<p style="color:var(--text-secondary);">Tidak ditemukan setoran dengan data tersebut.</p>';
    return;
  }
  
  container.innerHTML = deposits.map(d => `
    <div class="status-item">
      <div class="status-header">
        <strong>${d.email_username}</strong>
        <span class="badge badge-${d.status}">${d.status.toUpperCase()}</span>
      </div>
      <div style="font-size:0.85rem;color:var(--text-secondary);">
        Discord: ${d.discord_name} | WA: ${d.wa_number} | DANA: ${d.dana_number}
      </div>
    </div>
  `).join('');
}

// Auto-refresh setoran status every 30s
setInterval(async () => {
  const res = await fetch('/api/setoran-status');
  const data = await res.json();
  const badge = document.getElementById('setoranStatusBadge');
  if (badge) {
    if (data.open) {
      badge.textContent = '🟢 OPEN';
      badge.className = 'status-badge open';
    } else {
      badge.textContent = '🔴 CLOSE';
      badge.className = 'status-badge close';
    }
  }
}, 30000);
