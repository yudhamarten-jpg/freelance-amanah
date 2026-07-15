// Clock update
function updateClock() {
  const now = new Date();
  const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const str = days[now.getDay()] + ', ' + 
              now.getDate() + ' ' + months[now.getMonth()] + ' ' + 
              now.getFullYear() + ' | ' +
              String(now.getHours()).padStart(2,'0') + ':' +
              String(now.getMinutes()).padStart(2,'0') + ':' +
              String(now.getSeconds()).padStart(2,'0');
  const el = document.getElementById('clockDisplay');
  if (el) el.textContent = str;
}

setInterval(updateClock, 1000);
updateClock();

// Admin login modal
function showAdminLogin() {
  document.getElementById('adminModal').style.display = 'flex';
  document.getElementById('adminError').textContent = '';
}

function closeAdminLogin() {
  document.getElementById('adminModal').style.display = 'none';
}

async function loginAdmin() {
  const password = document.getElementById('adminPassword').value;
  const errorEl = document.getElementById('adminError');
  
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    
    if (data.success) {
      window.location.href = '/admin';
    } else {
      errorEl.textContent = data.message || 'Password salah!';
    }
  } catch (e) {
    errorEl.textContent = 'Gagal terhubung ke server';
  }
}

// Enter key for login
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && document.getElementById('adminModal').style.display === 'flex') {
    loginAdmin();
  }
});
