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
  const { data, error } = await sb.from('reminders').select('*').order('created_at');
  if (error) return [];
  return (data || []).map(r => ({
    id: r.id, name: r.name, frequency: r.frequency,
    type: r.type || 'scheduled',
    customInterval: r.custom_interval, timeOfDay: r.time_of_day, timeOfDay2: r.time_of_day_2,
    flexibleCycle: r.flexible_cycle, cycleConfig: r.cycle_config,
    showOnHome: r.show_on_home !== false,
    importance: r.importance || 'medium',
    completedAt: r.completed_at || null,
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

async function getTodaysWorkout(todayStr) {
  // Fetch active split
  const { data: splits, error: sErr } = await sb.from('workout_splits')
    .select('*').eq('is_active', true).limit(1);
  if (sErr || !splits?.length) return null;
  const split = splits[0];

  // Fetch its days
  const { data: days, error: dErr } = await sb.from('split_days')
    .select('*').eq('split_id', split.id).order('order_index');
  if (dErr || !days?.length) return null;

  // Compute scheduled day
  const dayKeys = ['sun','mon','tue','wed','thu','fri','sat'];
  let day = null;
  if (split.schedule_type === 'days_of_week') {
    const [y, m, d] = todayStr.split('-').map(Number);
    const key = dayKeys[new Date(y, m-1, d).getDay()];
    day = days.find(x => x.day_key === key);
  } else {
    if (!split.sequential_anchor_date) return null;
    const [y1,m1,d1] = split.sequential_anchor_date.split('-').map(Number);
    const [y2,m2,d2] = todayStr.split('-').map(Number);
    const diff = Math.floor((new Date(y2,m2-1,d2) - new Date(y1,m1-1,d1)) / 86400000);
    if (diff < 0) return null;
    day = days[diff % days.length];
  }
  if (!day) return null;
  if (day.is_rest) return { isRest: true, dayName: day.name, splitName: split.name };

  // Fetch workouts for that day
  const { data: workouts, error: wErr } = await sb.from('workouts')
    .select('*').eq('split_day_id', day.id).order('order_index');
  if (wErr || !workouts?.length) return { isRest: false, dayName: day.name, splitName: split.name, workouts: [] };

  // Fetch today's logs to know which are done/in-progress
  const { data: logs } = await sb.from('workout_logs')
    .select('id,workout_id,completed_at').eq('date', todayStr);
  const logByWorkout = {};
  (logs || []).forEach(l => { logByWorkout[l.workout_id] = l; });

  return {
    isRest: false, dayName: day.name, splitName: split.name,
    workouts: workouts.map(w => {
      const log = logByWorkout[w.id];
      return {
        id: w.id, name: w.name, muscleGroups: w.muscle_groups || [],
        logId: log?.id || null,
        completed: !!log?.completed_at,
        inProgress: !!log && !log.completed_at
      };
    })
  };
}

async function getOverdueContacts(today) {
  const { data, error } = await sb.from('contacts')
    .select('id,name,relationship,contact_method,next_contact_date,show_on_home')
    .eq('stay_in_contact', true)
    .eq('show_on_home', true)
    .lte('next_contact_date', today);
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

function renderReminders(supplements, suppLogs, weightLogged, today, customReminders, reminderLogsToday, allReminderLogs, overdueContacts, todaysWorkout) {
  const container = document.getElementById('reminders-list');
  let html = '';

  // --- Today's workout (Fitness) ---
  if (todaysWorkout && !todaysWorkout.isRest && todaysWorkout.workouts?.length) {
    for (const w of todaysWorkout.workouts) {
      if (w.completed) continue;
      const muscles = w.muscleGroups.slice(0, 3).join(', ');
      const badge = w.inProgress
        ? `<span class="card-badge badge-yellow">In Progress</span>`
        : `<span class="card-badge" style="background:rgba(74,222,128,0.15);color:var(--accent);">Ready</span>`;
      const href = w.inProgress && w.logId
        ? `fitness.html?mode=workouts&view=track&id=${encodeURIComponent(w.logId)}`
        : `fitness.html?mode=workouts`;
      html += `
        <a href="${href}" class="home-reminder-item" style="margin-bottom:6px;">
          <div class="home-reminder-dot" style="background:var(--accent);"></div>
          <div class="home-reminder-info">
            <span class="home-reminder-name">🏋️ ${w.name}</span>
            <span class="home-reminder-dose">${todaysWorkout.dayName}${muscles ? ' · ' + muscles : ''}</span>
          </div>
          ${badge}
        </a>`;
    }
  }

  // --- Overdue contacts (Networking) ---
  for (const c of (overdueContacts || [])) {
    const daysOver = Math.round((new Date(today) - new Date(c.next_contact_date)) / 86400000);
    const method = { text: '💬', call: '📞', meet: '🤝' }[c.contact_method] || '👤';
    html += `
      <a href="networking.html" class="home-reminder-item" style="margin-bottom:6px;">
        <div class="home-reminder-dot" style="background:#a78bfa;"></div>
        <div class="home-reminder-info">
          <span class="home-reminder-name">${method} ${c.name}</span>
          <span class="home-reminder-dose">${daysOver === 0 ? 'Due today' : daysOver + 'd overdue'} · Networking</span>
        </div>
        <span class="card-badge" style="background:rgba(167,139,250,0.15);color:#a78bfa;">Reach out</span>
      </a>`;
  }

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

  // --- Standing reminders (show_on_home = true, not yet completed) ---
  const impOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const standingDue = (customReminders || [])
    .filter(r => r.type === 'standing' && !r.completedAt && r.showOnHome)
    .sort((a, b) => (impOrder[a.importance] ?? 2) - (impOrder[b.importance] ?? 2));
  for (const r of standingDue) {
    const impColors = { critical: 'var(--danger)', high: '#fb923c', medium: 'var(--accent-blue)', low: 'var(--text-muted)' };
    const dotColor = impColors[r.importance] || 'var(--accent-blue)';
    html += `
      <a href="reminders.html" class="home-reminder-item" style="margin-bottom:6px;">
        <div class="home-reminder-dot" style="background:${dotColor};"></div>
        <div class="home-reminder-info">
          <span class="home-reminder-name">${r.name}</span>
          <span class="home-reminder-dose">Standing · ${r.importance.charAt(0).toUpperCase()+r.importance.slice(1)}</span>
        </div>
        <span class="card-badge badge-blue">Open</span>
      </a>`;
  }

  // --- Scheduled custom reminders ---
  for (const r of (customReminders || [])) {
    if (r.type === 'standing') continue;
    if (!r.active) continue;
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
  const [supplements, suppLogs, weightLogged, customReminders, reminderLogsToday, allReminderLogs, overdueContacts, todaysWorkout] = await Promise.all([
    getSupplements(),
    getLogsForDate(today),
    getWeightLoggedToday(today),
    getCustomReminders(),
    getReminderLogsForDate(today),
    getAllReminderLogs(),
    getOverdueContacts(today),
    getTodaysWorkout(today).catch(() => null)
  ]);

  renderGreeting();
  renderHeaderDate();
  renderReminders(supplements, suppLogs, weightLogged, today, customReminders, reminderLogsToday, allReminderLogs, overdueContacts, todaysWorkout);

  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('app-header').style.display = '';
  document.getElementById('main-content').style.display = '';
}

Auth.guard().then(init);
