// ===== SUPABASE + AUTH GUARD =====
// Shared by every page: provides `sb` (the Supabase client) and `Auth.guard()`,
// which blocks the page behind a login form until a valid session exists.
const SUPABASE_URL = 'https://elcyebukretkvlwiutcd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsY3llYnVrcmV0a3Zsd2l1dGNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTE5MjIsImV4cCI6MjA5MDk4NzkyMn0.upensdcqZOeK2-TXDc-SvIqXFhpXSNv-QsToBe5bS88';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const Auth = {
  async guard() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) return;
    await this._showLogin();
  },

  _showLogin() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = 'auth-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:#0a0a12;display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
      overlay.innerHTML = `
        <div style="width:100%;max-width:320px;">
          <h1 style="font-size:24px;font-weight:700;margin-bottom:4px;color:#e5e7eb;text-align:center;">SupTrack</h1>
          <p style="color:#6b7280;font-size:13px;text-align:center;margin-bottom:24px;">Sign in to continue</p>
          <input id="auth-email" type="email" placeholder="Email" autocomplete="username" style="width:100%;box-sizing:border-box;padding:12px 14px;margin-bottom:10px;border-radius:8px;border:1px solid #27272a;background:#18181b;color:#e5e7eb;font-size:14px;">
          <input id="auth-password" type="password" placeholder="Password" autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:12px 14px;margin-bottom:14px;border-radius:8px;border:1px solid #27272a;background:#18181b;color:#e5e7eb;font-size:14px;">
          <button id="auth-submit" style="width:100%;padding:12px;border-radius:8px;border:none;background:#22c55e;color:#0a0a12;font-weight:600;font-size:14px;cursor:pointer;">Sign In</button>
          <p id="auth-error" style="color:#f87171;font-size:12px;text-align:center;margin-top:10px;min-height:16px;"></p>
        </div>`;
      document.body.appendChild(overlay);

      const emailInput = overlay.querySelector('#auth-email');
      const passInput = overlay.querySelector('#auth-password');
      const errorEl = overlay.querySelector('#auth-error');
      const submitBtn = overlay.querySelector('#auth-submit');

      const attempt = async () => {
        errorEl.textContent = '';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';
        const { error } = await sb.auth.signInWithPassword({
          email: emailInput.value.trim(),
          password: passInput.value
        });
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
        if (error) {
          errorEl.textContent = 'Incorrect email or password.';
          return;
        }
        overlay.remove();
        resolve();
      };

      submitBtn.onclick = attempt;
      passInput.onkeydown = (e) => { if (e.key === 'Enter') attempt(); };
      emailInput.onkeydown = (e) => { if (e.key === 'Enter') passInput.focus(); };
      emailInput.focus();
    });
  },

  async signOut() {
    await sb.auth.signOut();
    location.reload();
  }
};
