// ===== SUPABASE SETUP =====
const SUPABASE_URL = 'https://elcyebukretkvlwiutcd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsY3llYnVrcmV0a3Zsd2l1dGNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTE5MjIsImV4cCI6MjA5MDk4NzkyMn0.upensdcqZOeK2-TXDc-SvIqXFhpXSNv-QsToBe5bS88';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Flexible cycle window computation (mirrors reminders.js logic)
function computeWindowHistory(reminder, rLogs) {
  if (!reminder.flexibleCycle || !reminder.cycleConfig) return [];
  const { intervalValue, intervalUnit, windowDays } = reminder.cycleConfig;
  const intervalDays = intervalUnit === 'weeks' ? intervalValue * 7 : intervalValue;
  const completions = (rLogs || []).filter(l => l.completed);
  let windowStart = reminder.startDate;
  const today = U.today();
  const windows = [];
  let safety = 0;
  while (windowStart <= today && safety < 1000) {
    safety++;
    const ws = windowStart;
    const weDate = U.parseDate(ws);
    weDate.setDate(weDate.getDate() + windowDays - 1);
    const we = `${weDate.getFullYear()}-${String(weDate.getMonth()+1).padStart(2,'0')}-${String(weDate.getDate()).padStart(2,'0')}`;
    const completion = completions.find(l => l.date >= ws && l.date <= we);
    windows.push({ windowStart: ws, windowEnd: we, completed: !!completion, completionDate: completion?.date || null });
    if (completion) {
      const nd = U.parseDate(completion.date);
      nd.setDate(nd.getDate() + intervalDays);
      windowStart = `${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,'0')}-${String(nd.getDate()).padStart(2,'0')}`;
    } else {
      const nd = U.parseDate(ws);
      nd.setDate(nd.getDate() + intervalDays);
      windowStart = `${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,'0')}-${String(nd.getDate()).padStart(2,'0')}`;
    }
  }
  if (windowStart > today) {
    const weDate = U.parseDate(windowStart);
    weDate.setDate(weDate.getDate() + windowDays - 1);
    const we = `${weDate.getFullYear()}-${String(weDate.getMonth()+1).padStart(2,'0')}-${String(weDate.getDate()).padStart(2,'0')}`;
    windows.push({ windowStart, windowEnd: we, completed: false, completionDate: null });
  }
  return windows;
}

function isCustomReminderDue(reminder, dateStr, rLogs) {
  if (!reminder.active || dateStr < reminder.startDate) return false;
  if (reminder.flexibleCycle && reminder.cycleConfig) {
    const windows = computeWindowHistory(reminder, rLogs);
    return windows.some(w => dateStr >= w.windowStart && dateStr <= w.windowEnd);
  }
  const date = U.parseDate(dateStr);
  const start = U.parseDate(reminder.startDate);
  switch (reminder.frequency) {
    case 'daily': case 'twice_daily': return true;
    case 'once_weekly': return date.getDay() === start.getDay();
    case 'custom': {
      const cfg = reminder.customInterval || {};
      const interval = (cfg.unit === 'weeks' ? cfg.value * 7 : cfg.value) || 1;
      const diff = Math.floor((date - start) / 86400000);
      return diff >= 0 && diff % interval === 0;
    }
    default: return true;
  }
}

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

async function getCustomReminders() {
  const { data, error } = await sb.from('reminders').select('*').eq('active', true).order('created_at');
  if (error) return [];
  return (data || []).map(r => ({
    id: r.id, name: r.name, frequency: r.frequency,
    customInterval: r.custom_interval, timeOfDay: r.time_of_day, timeOfDay2: r.time_of_day_2,
    flexibleCycle: r.flexible_cycle, cycleConfig: r.cycle_config,
    active: r.active, startDate: r.start_date
  }));
}

async function getReminderLogsForDate(dateStr) {
  const { data, error } = await sb.from('reminder_logs').select('*').eq('date', dateStr).eq('completed', true);
  if (error) return {};
  const map = {};
  (data || []).forEach(l => { map[l.reminder_id + '_' + l.dose_index] = true; });
  return map;
}

async function getAllReminderLogs() {
  const { data, error } = await sb.from('reminder_logs').select('*').eq('completed', true);
  if (error) return [];
  return data || [];
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

function renderReminders(supplements, suppLogs, weightLogged, today, customReminders, reminderLogsToday, allReminderLogs) {
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

  // --- Custom reminders ---
  for (const r of (customReminders || [])) {
    const rLogs = (allReminderLogs || []).filter(l => l.reminder_id === r.id);
    if (!isCustomReminderDue(r, today, rLogs)) continue;
    const doses = r.frequency === 'twice_daily' ? 2 : 1;
    for (let i = 0; i < doses; i++) {
      const key = r.id + '_' + i;
      if (reminderLogsToday?.[key]) continue;
      const doseLabel = doses > 1 ? (i === 0 ? ' · Morning' : ' · Evening') : '';
      html += `
        <a href="reminders.html" class="home-reminder-item" style="margin-bottom:6px;">
          <div class="home-reminder-dot" style="background:var(--accent-blue);"></div>
          <div class="home-reminder-info">
            <span class="home-reminder-name">${r.name}${doseLabel}</span>
            <span class="home-reminder-dose">Reminder${r.timeOfDay ? ' · ' + r.timeOfDay : ''}</span>
          </div>
          <span class="card-badge badge-blue">Pending</span>
        </a>`;
    }
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
  const [supplements, suppLogs, weightLogged, customReminders, reminderLogsToday, allReminderLogs] = await Promise.all([
    getSupplements(),
    getLogsForDate(today),
    getWeightLoggedToday(today),
    getCustomReminders(),
    getReminderLogsForDate(today),
    getAllReminderLogs()
  ]);

  renderGreeting();
  renderHeaderDate();
  renderReminders(supplements, suppLogs, weightLogged, today, customReminders, reminderLogsToday, allReminderLogs);

  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('app-header').style.display = '';
  document.getElementById('main-content').style.display = '';
}

init();
