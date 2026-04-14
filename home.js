// ===== SUPABASE SETUP =====
const SUPABASE_URL = 'https://elcyebukretkvlwiutcd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsY3llYnVrcmV0a3Zsd2l1dGNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTE5MjIsImV4cCI6MjA5MDk4NzkyMn0.upensdcqZOeK2-TXDc-SvIqXFhpXSNv-QsToBe5bS88';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== UTILITIES (subset of app.js) =====
const U = {
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); },
  daysBetween(a, b) { return Math.floor((b - a) / 86400000); },
  isScheduled(supp, dateStr) {
    const start = this.parseDate(supp.startDate);
    const date = this.parseDate(dateStr);
    if (date < start || !supp.active) return false;
    if (supp.cycle && supp.cycle.type === 'cycle') {
      const cycleStart = supp.cycle.startDate ? this.parseDate(supp.cycle.startDate) : start;
      const total = supp.cycle.onDays + supp.cycle.offDays;
      const dayNum = ((this.daysBetween(cycleStart, date) % total) + total) % total;
      if (dayNum >= supp.cycle.onDays) return false;
    }
    if (supp.frequency === 'once_weekly') {
      return date.getDay() === start.getDay();
    }
    return true;
  },
  timingLabel(t) {
    const m = { water_soluble: 'With Water', fat_soluble: 'With Fatty Meal', pre_workout: 'Pre-Workout', post_workout: 'Post-Workout', before_bed: 'Before Bed' };
    return m[t] || t;
  },
  timingIcon(t) {
    const m = { water_soluble: '💧', fat_soluble: '🥑', pre_workout: '⚡', post_workout: '🏋️', before_bed: '🌙' };
    return m[t] || '💊';
  }
};

// ===== DATA =====
async function getSupplements() {
  const { data, error } = await sb.from('supplements').select('*').order('created_at');
  if (error) return [];
  return data.map(r => ({
    id: r.id, name: r.name, type: r.type, dosage: r.dosage,
    frequency: r.frequency, timing: r.timing, cycle: r.cycle,
    startDate: r.start_date, active: r.active
  }));
}

async function getLogsForDate(dateStr) {
  const { data, error } = await sb.from('daily_logs').select('*').eq('date', dateStr);
  if (error) return {};
  const logs = {};
  (data || []).forEach(r => {
    const key = r.supplement_id + (r.dose_index > 0 ? '_' + r.dose_index : '');
    logs[key] = { taken: r.taken };
  });
  return logs;
}

async function getWeightLoggedToday(dateStr) {
  const { data, error } = await sb.from('weight_logs').select('id').eq('date', dateStr).limit(1);
  if (error) return false;
  return (data || []).length > 0;
}

// ===== RENDER =====
function renderGreeting() {
  const hour = new Date().getHours();
  let greeting;
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';
  else greeting = 'Good evening';

  const d = new Date();
  const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  document.getElementById('greeting-text').textContent = greeting;
  document.getElementById('greeting-sub').textContent = `${dayName}, ${dateStr}`;
}

function renderHeaderDate() {
  const d = new Date();
  document.getElementById('header-date').textContent =
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderReminders(supplements, suppLogs, weightLogged, today) {
  const container = document.getElementById('reminders-list');
  let html = '';

  // --- Weight reminder ---
  if (!weightLogged) {
    html += `
      <a href="fitness.html" class="home-reminder-item" style="margin-bottom:10px;">
        <div class="home-reminder-dot" style="background:var(--warning);"></div>
        <div class="home-reminder-info">
          <span class="home-reminder-name">Log your weight</span>
          <span class="home-reminder-dose">Daily check-in · Fitness</span>
        </div>
        <span class="card-badge badge-yellow">Pending</span>
      </a>`;
  }

  // --- Supplement reminders ---
  const pending = [];
  for (const s of supplements) {
    if (!U.isScheduled(s, today)) continue;
    const doses = s.frequency === 'twice_daily' ? 2 : 1;
    for (let i = 0; i < doses; i++) {
      const key = s.id + (i > 0 ? '_' + i : '');
      if (!suppLogs[key]?.taken) {
        pending.push({
          name: s.name,
          dosage: s.dosage,
          timing: s.timing,
          doseLabel: doses > 1 ? (i === 0 ? ' · Morning' : ' · Evening') : ''
        });
      }
    }
  }

  if (pending.length > 0) {
    const groups = {};
    for (const item of pending) {
      const t = item.timing || 'other';
      if (!groups[t]) groups[t] = [];
      groups[t].push(item);
    }
    const timingOrder = ['water_soluble', 'fat_soluble', 'pre_workout', 'post_workout', 'before_bed', 'other'];
    for (const timing of timingOrder) {
      if (!groups[timing]) continue;
      html += `<div class="home-reminder-group">
        <div class="timing-label">${U.timingIcon(timing)} ${U.timingLabel(timing)}</div>`;
      for (const item of groups[timing]) {
        html += `
          <a href="supplements.html" class="home-reminder-item">
            <div class="home-reminder-dot"></div>
            <div class="home-reminder-info">
              <span class="home-reminder-name">${item.name}${item.doseLabel}</span>
              <span class="home-reminder-dose">${item.dosage || ''}</span>
            </div>
            <span class="card-badge badge-yellow">Pending</span>
          </a>`;
      }
      html += `</div>`;
    }
  }

  if (!html) {
    html = `<div class="home-reminder-done">
      <span style="font-size:24px;">✓</span>
      <span>All caught up for today</span>
    </div>`;
  }

  container.innerHTML = html;
}

// ===== INIT =====
async function init() {
  const today = U.today();
  const [supplements, suppLogs, weightLogged] = await Promise.all([
    getSupplements(),
    getLogsForDate(today),
    getWeightLoggedToday(today)
  ]);

  renderGreeting();
  renderHeaderDate();
  renderReminders(supplements, suppLogs, weightLogged, today);

  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('app-header').style.display = '';
  document.getElementById('main-content').style.display = '';
}

init();
