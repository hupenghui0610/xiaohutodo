(function () {
  const state = { user: null, users: [] };
  const $ = (id) => document.getElementById(id);

  function injectUi() {
    const style = document.createElement('style');
    style.textContent = `
      .account-modal{position:fixed;inset:0;z-index:1200;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:18px}
      .account-modal.hidden{display:none}
      .account-dialog{width:min(720px,100%);max-height:88vh;overflow:auto;background:#111827;border:1px solid rgba(148,163,184,.35);border-radius:18px;padding:24px;color:#e5e7eb;box-shadow:0 24px 70px rgba(0,0,0,.45)}
      .account-dialog--small{width:min(440px,100%)}
      .account-dialog h2{margin:0 0 8px;font-size:20px}.account-dialog p{color:#94a3b8;font-size:13px}
      .account-form{display:grid;gap:12px;margin-top:18px}.account-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
      .account-error{min-height:20px;color:#fca5a5;font-size:13px}.account-success{color:#86efac;font-size:13px;white-space:pre-wrap}
      .account-table{width:100%;border-collapse:collapse;margin-top:18px;font-size:13px}.account-table th,.account-table td{padding:10px 8px;border-bottom:1px solid rgba(148,163,184,.2);text-align:left}
      .account-table__actions{display:flex;gap:6px;flex-wrap:wrap}.btn-account{border:1px solid rgba(148,163,184,.35);background:rgba(15,23,42,.7);color:#e5e7eb;border-radius:8px;padding:6px 10px;cursor:pointer}
      .btn-account:hover{border-color:#60a5fa}.btn-account:disabled{opacity:.5;cursor:not-allowed}
      .temporary-password{padding:12px;border-radius:10px;background:#052e16;color:#bbf7d0;font-family:monospace;word-break:break-all}
    `;
    document.head.appendChild(style);

    document.body.insertAdjacentHTML('beforeend', `
      <div class="account-modal hidden" id="passwordModal">
        <div class="account-dialog account-dialog--small">
          <h2 id="passwordModalTitle">修改密码</h2>
          <p id="passwordModalHint">新密码长度须为 10-72 个字符。</p>
          <form class="account-form" id="passwordForm">
            <input class="input" id="currentPassword" type="password" autocomplete="current-password" placeholder="当前密码" required>
            <input class="input" id="newPassword" type="password" autocomplete="new-password" placeholder="新密码" minlength="10" maxlength="72" required>
            <input class="input" id="confirmPassword" type="password" autocomplete="new-password" placeholder="再次输入新密码" required>
            <div class="account-error" id="passwordError"></div>
            <div class="account-actions">
              <button class="btn btn-ghost" type="button" id="passwordCancelBtn">取消</button>
              <button class="btn btn-primary" type="submit">保存并重新登录</button>
            </div>
          </form>
        </div>
      </div>
      <div class="account-modal hidden" id="adminModal">
        <div class="account-dialog">
          <h2>账号管理</h2>
          <p>创建、停用或重置账号。临时密码只会显示一次。</p>
          <form class="account-form" id="createUserForm">
            <input class="input" id="newUsername" autocomplete="off" placeholder="用户名：3-32 位小写字母、数字或下划线" required>
            <select class="input" id="newUserRole"><option value="user">普通用户</option><option value="admin">管理员</option></select>
            <div><button class="btn btn-primary" type="submit">创建账号并生成临时密码</button></div>
          </form>
          <div class="account-error" id="adminError"></div>
          <div class="account-success" id="adminSuccess"></div>
          <table class="account-table">
            <thead><tr><th>用户名</th><th>角色</th><th>状态</th><th>最后登录</th><th>操作</th></tr></thead>
            <tbody id="userTableBody"></tbody>
          </table>
          <div class="account-actions"><button class="btn btn-ghost" type="button" id="adminCloseBtn">关闭</button></div>
        </div>
      </div>
    `);
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || '请求失败');
    return data;
  }

  function showLogin(message = '') {
    $('loginOverlay').classList.remove('hidden');
    $('mainApp').style.display = 'none';
    $('loginError').textContent = message;
    if (window.D1Storage) window.D1Storage.reset();
  }

  function showApp(user) {
    state.user = user;
    $('loginOverlay').classList.add('hidden');
    $('mainApp').style.display = '';
    $('currentAccount').textContent = user.username;
    $('adminUsersBtn').style.display = user.role === 'admin' ? '' : 'none';
    if (window.__todoAppInit) window.__todoAppInit();
  }

  function openPasswordModal(forced = false) {
    $('passwordModal').classList.remove('hidden');
    $('passwordCancelBtn').style.display = forced ? 'none' : '';
    $('passwordModalTitle').textContent = forced ? '首次登录请修改密码' : '修改密码';
    $('passwordModalHint').textContent = forced
      ? '当前密码是管理员提供的临时密码。修改完成后需要重新登录。'
      : '新密码长度须为 10-72 个字符。';
    $('passwordError').textContent = '';
    $('currentPassword').focus();
  }

  async function bootstrap() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_username');
    try {
      const data = await request('/api/auth/me');
      if (data.user.mustChangePassword) {
        state.user = data.user;
        showLogin('');
        $('loginOverlay').classList.add('hidden');
        openPasswordModal(true);
        return;
      }
      showApp(data.user);
    } catch {
      showLogin('');
    }
  }

  async function handleLogin() {
    const username = $('loginUsername').value.trim().toLowerCase();
    const password = $('loginPassword').value;
    if (!username || !password) {
      $('loginError').textContent = '请输入账号和密码';
      return;
    }
    $('loginBtn').disabled = true;
    $('loginBtn').textContent = '登录中...';
    try {
      const data = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      $('loginPassword').value = '';
      if (data.user.mustChangePassword) {
        state.user = data.user;
        $('loginOverlay').classList.add('hidden');
        openPasswordModal(true);
      } else {
        showApp(data.user);
      }
    } catch (exception) {
      $('loginError').textContent = exception.message;
    } finally {
      $('loginBtn').disabled = false;
      $('loginBtn').textContent = '登 录';
    }
  }

  async function logout() {
    try {
      await request('/api/auth/logout', { method: 'POST', body: '{}' });
    } finally {
      location.reload();
    }
  }

  function renderUsers() {
    $('userTableBody').innerHTML = '';
    for (const user of state.users) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(user.username)}</td>
        <td>${user.role === 'admin' ? '管理员' : '普通用户'}</td>
        <td>${user.status === 'active' ? '有效' : '已停用'}${user.mustChangePassword ? ' · 待改密' : ''}</td>
        <td>${user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '从未'}</td>
        <td class="account-table__actions"></td>`;
      const actions = row.lastElementChild;
      const statusButton = document.createElement('button');
      statusButton.className = 'btn-account';
      statusButton.textContent = user.status === 'active' ? '停用' : '启用';
      statusButton.disabled = user.id === state.user.id;
      statusButton.onclick = () => changeUserStatus(user);
      const resetButton = document.createElement('button');
      resetButton.className = 'btn-account';
      resetButton.textContent = '重置密码';
      resetButton.disabled = user.id === state.user.id;
      resetButton.onclick = () => resetPassword(user);
      actions.append(statusButton, resetButton);
      $('userTableBody').appendChild(row);
    }
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  async function loadUsers() {
    const data = await request('/api/admin/users');
    state.users = data.users;
    renderUsers();
  }

  async function openAdmin() {
    $('adminModal').classList.remove('hidden');
    $('adminError').textContent = '';
    $('adminSuccess').textContent = '';
    try {
      await loadUsers();
    } catch (exception) {
      $('adminError').textContent = exception.message;
    }
  }

  async function changeUserStatus(user) {
    const status = user.status === 'active' ? 'disabled' : 'active';
    if (status === 'disabled' && !confirm(`确认停用账号 ${user.username}？`)) return;
    try {
      await request(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadUsers();
    } catch (exception) {
      $('adminError').textContent = exception.message;
    }
  }

  async function resetPassword(user) {
    if (!confirm(`确认重置账号 ${user.username} 的密码？`)) return;
    try {
      const data = await request(`/api/admin/users/${encodeURIComponent(user.id)}/reset-password`, {
        method: 'POST',
        body: '{}',
      });
      $('adminSuccess').innerHTML = `账号 ${escapeHtml(user.username)} 的临时密码：<div class="temporary-password">${escapeHtml(data.temporaryPassword)}</div>`;
      await loadUsers();
    } catch (exception) {
      $('adminError').textContent = exception.message;
    }
  }

  injectUi();
  $('loginBtn').addEventListener('click', handleLogin);
  $('loginPassword').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') handleLogin();
  });
  $('loginUsername').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') $('loginPassword').focus();
  });
  $('logoutBtn').addEventListener('click', logout);
  $('changePasswordBtn').addEventListener('click', () => openPasswordModal(false));
  $('adminUsersBtn').addEventListener('click', openAdmin);
  $('adminCloseBtn').addEventListener('click', () => $('adminModal').classList.add('hidden'));
  $('passwordCancelBtn').addEventListener('click', () => $('passwordModal').classList.add('hidden'));
  $('passwordForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const currentPassword = $('currentPassword').value;
    const newPassword = $('newPassword').value;
    if (newPassword !== $('confirmPassword').value) {
      $('passwordError').textContent = '两次输入的新密码不一致';
      return;
    }
    try {
      await request('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      alert('密码已修改，请重新登录');
      location.reload();
    } catch (exception) {
      $('passwordError').textContent = exception.message;
    }
  });
  $('createUserForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('adminError').textContent = '';
    try {
      const data = await request('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          username: $('newUsername').value.trim().toLowerCase(),
          role: $('newUserRole').value,
        }),
      });
      $('adminSuccess').innerHTML = `账号 ${escapeHtml(data.user.username)} 已创建，临时密码：<div class="temporary-password">${escapeHtml(data.temporaryPassword)}</div>`;
      $('newUsername').value = '';
      await loadUsers();
    } catch (exception) {
      $('adminError').textContent = exception.message;
    }
  });
  window.addEventListener('auth-required', () => location.reload());
  window.addEventListener('password-change-required', () => openPasswordModal(true));
  bootstrap();
})();
