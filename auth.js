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
      overlay.style.cssText = 'position:fixed;inset:0;background:radial-gradient(ellipse 640px 320px at 20% 0%, rgba(74,222,128,0.1), transparent 60%), radial-gradient(ellipse 520px 300px at 100% 10%, rgba(96,165,250,0.08), transparent 60%), #07070d;display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;font-family:"Inter","DM Sans",-apple-system,sans-serif;';
      overlay.innerHTML = `
        <div style="width:100%;max-width:320px;background:#131320;border:1px solid #262638;border-radius:22px;padding:32px 26px;box-shadow:0 16px 48px -12px rgba(0,0,0,0.6);">
          <h1 style="font-family:'Sora','DM Sans',sans-serif;font-size:25px;font-weight:800;margin-bottom:5px;letter-spacing:-0.02em;text-align:center;background:linear-gradient(135deg,#4ade80 10%,#60a5fa 90%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">SupTrack</h1>
          <p style="color:#5f6b82;font-size:13px;text-align:center;margin-bottom:26px;">Sign in to continue</p>
          <input id="auth-email" type="email" placeholder="Email" autocomplete="username" style="width:100%;box-sizing:border-box;padding:12px 14px;margin-bottom:10px;border-radius:10px;border:1px solid #262638;background:#171726;color:#f1f5f9;font-size:14px;font-family:inherit;">
          <input id="auth-password" type="password" placeholder="Password" autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:12px 14px;margin-bottom:16px;border-radius:10px;border:1px solid #262638;background:#171726;color:#f1f5f9;font-size:14px;font-family:inherit;">
          <button id="auth-submit" style="width:100%;padding:12px;border-radius:10px;border:none;background:linear-gradient(135deg,#4ade80,#22c55e);color:#06210f;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;box-shadow:0 6px 20px -6px rgba(74,222,128,0.35);">Sign In</button>
          <p id="auth-error" style="color:#fb7185;font-size:12px;text-align:center;margin-top:12px;min-height:16px;"></p>
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
