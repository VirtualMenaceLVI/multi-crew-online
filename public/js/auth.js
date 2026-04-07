/**
 * auth.js
 * Handles homescreen authentication UI.
 * Dev mode: username "admin" + password "admin" grants access.
 */

const Auth = (() => {
  let _currentPlayer = null;

  function getPlayer() { return _currentPlayer; }
  function isLoggedIn() { return _currentPlayer !== null; }

  /**
   * Attempt to restore session from sessionStorage on page load.
   */
  async function tryRestoreSession() {
    const token = ApiClient.getToken();
    if (!token) return false;
    try {
      const data = await ApiClient.getMe();
      _currentPlayer = data.player;
      return true;
    } catch {
      ApiClient.setToken(null);
      return false;
    }
  }

  /**
   * Show the homescreen auth UI.
   */
  function showHomescreen() {
    Router.navigate('home');
  }

  /**
   * Bind auth form events.
   */
  function init() {
    // Tab switching
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`form-${target}`).classList.add('active');
        document.getElementById('login-error').textContent = '';
        if (document.getElementById('register-error')) document.getElementById('register-error').textContent = '';
      });
    });

    // Login form submit
    const loginForm = document.getElementById('form-login');
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      if (!username || !password) return;
      await handleLogin(username, password);
    });

    // Register form submit
    const registerForm = document.getElementById('form-register');
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username  = document.getElementById('reg-username').value.trim();
      const password  = document.getElementById('reg-password').value;
      const password2 = document.getElementById('reg-password2').value;
      const display   = document.getElementById('reg-display').value.trim();
      if (password !== password2) {
        showAuthError('Passwords do not match.');
        return;
      }
      await handleRegister(username, password, display);
    });
  }

  async function handleLogin(username, password) {
    const submitBtn = document.querySelector('#form-login .auth-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'AUTHENTICATING...';
    showAuthError('');

    try {
      const data = await ApiClient.login(username, password);
      _currentPlayer = data.player;
      UI.showToast(`Welcome back, ${data.player.displayName || data.player.username}!`, 'success');
      Router.navigate('station-select');
    } catch (err) {
      showAuthError(err.message || 'Authentication failed.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'ENGAGE';
    }
  }

  async function handleRegister(username, password, displayName) {
    const submitBtn = document.querySelector('#form-register .auth-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'CREATING ACCOUNT...';
    showAuthError('');

    try {
      const data = await ApiClient.register(username, password, displayName);
      _currentPlayer = data.player;
      UI.showToast(`Account created! Welcome, ${data.player.displayName || data.player.username}!`, 'success');
      Router.navigate('station-select');
    } catch (err) {
      showAuthError(err.message || 'Registration failed.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'CREATE ACCOUNT';
    }
  }

  async function logout() {
    try { await ApiClient.logout(); } catch {}
    _currentPlayer = null;
    GameState.reset();
    Router.navigate('home');
    UI.showToast('Logged out.', 'info');
  }

  function showAuthError(msg) {
    // Show in whichever error div is currently visible
    const loginErr = document.getElementById('login-error');
    const regErr   = document.getElementById('register-error');
    const isLogin  = document.getElementById('form-login')?.classList.contains('active');
    if (isLogin && loginErr) { loginErr.textContent = msg; if (regErr) regErr.textContent = ''; }
    else if (regErr)         { regErr.textContent = msg;   if (loginErr) loginErr.textContent = ''; }
  }

  return { init, tryRestoreSession, showHomescreen, getPlayer, isLoggedIn, logout };
})();
