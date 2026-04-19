// ===== SUPABASE SETUP =====
const SUPABASE_URL = 'https://elcyebukretkvlwiutcd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsY3llYnVrcmV0a3Zsd2l1dGNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTE5MjIsImV4cCI6MjA5MDk4NzkyMn0.upensdcqZOeK2-TXDc-SvIqXFhpXSNv-QsToBe5bS88';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const DEFAULTS_KEY = 'weight_tracker_defaults';

// ===== UTILITIES =====
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getDefaults() {
  try {
    return JSON.parse(localStorage.getItem(DEFAULTS_KEY)) || { time_of_day: 'morning', meal_context: 'pre_meal' };
  } catch {
    return { time_of_day: 'morning', meal_context: 'pre_meal' };
  }
}

function saveDefaults(d) {
  localStorage.setItem(DEFAULTS_KEY, JSON.stringify(d));
}

function timeLabel(t) {
  return { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' }[t] || t;
}

function mealLabel(m) {
  return { pre_meal: 'Pre-meal', post_meal: 'Post-meal' }[m] || m;
}

// ===== DATA =====
async function getWeightLogs() {
  const { data, error } = await sb.from('weight_logs')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) { console.error('getWeightLogs:', error); return []; }
  return data || [];
}

async function saveWeightLog(entry) {
  const { error } = await sb.from('weight_logs').insert(entry);
  if (error) { console.error('saveWeightLog:', error); return { ok: false, message: error.message }; }
  return { ok: true };
}

async function deleteWeightLog(id) {
  const { error } = await sb.from('weight_logs').delete().eq('id', id);
  if (error) console.error('deleteWeightLog:', error);
}

// ===== STATE =====
let allLogs = [];
let activeTab = 'log';
let activeMode = 'weight';
let workoutInitialized = false;
let graphChart = null;
let calDate = new Date();
let selectedCalDay = null;
let graphPeriod = '1M';
let graphCustomStart = '';
let graphCustomEnd = '';

// ===== MODE SWITCHING =====
async function switchFitnessMode(mode) {
  activeMode = mode;
  document.querySelectorAll('.fitness-mode-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  const weightMode = document.getElementById('weight-mode');
  const workoutMode = document.getElementById('workout-mode');
  const weightTabs = document.getElementById('fitness-tabs');
  const workoutTabs = document.getElementById('workout-tabs');

  if (mode === 'weight') {
    weightMode.style.display = '';
    workoutMode.style.display = 'none';
    weightTabs.style.display = '';
    workoutTabs.style.display = 'none';
  } else {
    weightMode.style.display = 'none';
    workoutMode.style.display = '';
    weightTabs.style.display = 'none';
    workoutTabs.style.display = '';
    if (!workoutInitialized && typeof W !== 'undefined') {
      workoutInitialized = true;
      await W.init();
    } else if (typeof W !== 'undefined') {
      W.switchView(W.currentView || 'today');
    }
  }
}

// ===== TAB SWITCHING =====
function switchFitnessTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.fitness-tab[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('#weight-mode .view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + tab).classList.add('active');
  if (tab === 'calendar') renderCalendarView();
  else if (tab === 'graph') renderGraphView();
}

// ===== LOG TAB =====
function renderLogForm() {
  const defaults = getDefaults();
  document.getElementById('weight-log-form').innerHTML = `
    <div class="fitness-form-card">
      <div class="form-group">
        <label class="form-label">Weight</label>
        <div class="weight-input-wrap">
          <input type="number" id="weight-input" class="form-input weight-input"
            step="0.1" min="0" max="999" placeholder="0.0" inputmode="decimal">
          <span class="weight-unit">lbs</span>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Time of Day</label>
        <div class="checkbox-group">
          ${['morning','afternoon','night'].map(t => `
            <button class="checkbox-option${defaults.time_of_day === t ? ' selected' : ''}"
              data-group="time" data-value="${t}" onclick="selectOption(this,'time')">
              ${timeLabel(t)}
            </button>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Meal</label>
        <div class="checkbox-group">
          <button class="checkbox-option${defaults.meal_context === 'pre_meal' ? ' selected' : ''}"
            data-group="meal" data-value="pre_meal" onclick="selectOption(this,'meal')">
            Pre-meal
          </button>
          <button class="checkbox-option${defaults.meal_context === 'post_meal' ? ' selected' : ''}"
            data-group="meal" data-value="post_meal" onclick="selectOption(this,'meal')">
            Post-meal
          </button>
        </div>
      </div>
      <button class="btn btn-primary" id="log-btn" style="width:100%;justify-content:center;" onclick="logWeight()">
        Log Weight
      </button>
    </div>`;
}

function selectOption(btn, group) {
  btn.closest('.checkbox-group').querySelectorAll('.checkbox-option').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function renderTodayEntries(todayLogs) {
  const el = document.getElementById('today-entries');
  if (!todayLogs.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="fitness-section-label">TODAY</div>
    ${todayLogs.map(l => `
      <div class="weight-entry-card">
        <div class="weight-entry-main">
          <span class="weight-entry-value">${Number(l.weight).toFixed(1)}</span>
          <span class="weight-entry-unit">lbs</span>
        </div>
        <div class="weight-entry-meta">
          <span class="card-badge badge-blue">${timeLabel(l.time_of_day)}</span>
          <span class="card-badge ${l.meal_context === 'pre_meal' ? 'badge-yellow' : 'badge-green'}">${mealLabel(l.meal_context)}</span>
        </div>
        <button class="btn-icon" onclick="confirmDelete('${l.id}')"
          style="color:var(--text-muted);font-size:20px;line-height:1;">&times;</button>
      </div>`).join('')}`;
}

function renderHistory() {
  const el = document.getElementById('weight-history');
  const todayStr = today();
  const past = allLogs.filter(l => l.date !== todayStr);
  if (!past.length) { el.innerHTML = ''; return; }

  const byDate = {};
  for (const l of past) {
    if (!byDate[l.date]) byDate[l.date] = [];
    byDate[l.date].push(l);
  }

  const sortedDates = Object.keys(byDate).sort().reverse().slice(0, 14);
  let html = '<div class="fitness-section-label" style="margin-top:8px;">RECENT HISTORY</div>';

  for (const date of sortedDates) {
    const entries = byDate[date];
    const avg = Math.round((entries.reduce((a, l) => a + Number(l.weight), 0) / entries.length) * 10) / 10;
    const d = new Date(date + 'T12:00:00');
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const badge = entries.length > 1
      ? `<span class="card-badge badge-blue">${entries.length} entries</span>`
      : `<span class="card-badge ${entries[0].meal_context === 'pre_meal' ? 'badge-yellow' : 'badge-green'}">${mealLabel(entries[0].meal_context)}</span>`;

    html += `
      <div class="weight-history-row">
        <div>
          <span class="weight-history-date">${label}</span>
          <span class="weight-history-sub">${entries.length > 1
            ? `${timeLabel(entries[entries.length-1].time_of_day)} – ${timeLabel(entries[0].time_of_day)}`
            : timeLabel(entries[0].time_of_day)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${badge}
          <span class="weight-history-value">${avg.toFixed(1)} <span style="font-size:11px;color:var(--text-muted);">lbs</span></span>
        </div>
      </div>`;
  }
  el.innerHTML = html;
}

function renderLogTab() {
  const todayStr = today();
  const todayLogs = allLogs.filter(l => l.date === todayStr);
  renderLogForm();
  renderTodayEntries(todayLogs);
  renderHistory();
}

async function logWeight() {
  const input = document.getElementById('weight-input');
  const weight = parseFloat(input.value);
  if (!weight || weight <= 0 || weight > 999) {
    input.style.borderColor = 'var(--danger)';
    input.focus();
    setTimeout(() => { input.style.borderColor = ''; }, 1500);
    return;
  }

  const timeBtn = document.querySelector('[data-group="time"].selected');
  const mealBtn = document.querySelector('[data-group="meal"].selected');
  const time_of_day = timeBtn?.dataset.value || 'morning';
  const meal_context = mealBtn?.dataset.value || 'pre_meal';

  saveDefaults({ time_of_day, meal_context });

  const btn = document.getElementById('log-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  const entry = {
    id: genId(),
    date: today(),
    weight: Math.round(weight * 10) / 10,
    time_of_day,
    meal_context
  };

  const result = await saveWeightLog(entry);
  if (result.ok) {
    allLogs.unshift(entry);
    input.value = '';
    if (activeTab === 'log') renderLogTab();
    else if (activeTab === 'calendar') renderCalendarView();
    else if (activeTab === 'graph') renderGraphView();
  } else {
    btn.textContent = 'Log Weight';
    btn.disabled = false;
    showFormError('log-btn', result.message);
  }
}

async function confirmDelete(id) {
  if (!confirm('Delete this entry?')) return;
  await deleteWeightLog(id);
  allLogs = allLogs.filter(l => l.id !== id);
  if (activeTab === 'log') renderLogTab();
  else if (activeTab === 'calendar') renderCalendarView();
  else if (activeTab === 'graph') renderGraphView();
}

// ===== CALENDAR TAB =====
function renderCalendarView() {
  const year = calDate.getFullYear();
  const month = calDate.getMonth();
  const monthLabel = calDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const byDate = {};
  for (const l of allLogs) {
    if (!byDate[l.date]) byDate[l.date] = [];
    byDate[l.date].push(l);
  }

  const todayStr = today();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // No wrapping div — .view already provides padding
  let html = `
    <div class="calendar-header">
      <button class="btn-icon" onclick="calPrevMonth()">&#8249;</button>
      <h2>${monthLabel}</h2>
      <button class="btn-icon" onclick="calNextMonth()">&#8250;</button>
    </div>
    <div class="calendar-grid">
      ${['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => `<div class="cal-day-label">${d}</div>`).join('')}
      ${Array(firstDayOfWeek).fill('<div class="cal-day empty"></div>').join('')}`;

  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
    const entries = byDate[dateStr];
    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;
    const isSelected = dateStr === selectedCalDay;

    let cls = 'cal-day weight-cal-day';
    if (isSelected) cls += ' selected';
    else if (entries) cls += ' has-weight';
    else if (isFuture) cls += ' off-cycle';
    if (isToday && !isSelected) cls += ' today';

    const avg = entries
      ? Math.round((entries.reduce((a, l) => a + Number(l.weight), 0) / entries.length) * 10) / 10
      : null;

    html += `<div class="${cls}" onclick="selectCalDay('${dateStr}')">
      <span class="cal-day-num">${dayNum}</span>
      ${avg !== null ? `<span class="cal-weight-mini">${avg.toFixed(1)}</span>` : ''}
    </div>`;
  }

  html += `</div><div id="cal-day-detail" class="calendar-detail"></div>`;

  document.getElementById('view-calendar').innerHTML = html;
  if (selectedCalDay) renderCalDayDetail(selectedCalDay, byDate[selectedCalDay] || []);
}

function calPrevMonth() {
  calDate.setMonth(calDate.getMonth() - 1);
  selectedCalDay = null;
  renderCalendarView();
}

function calNextMonth() {
  calDate.setMonth(calDate.getMonth() + 1);
  selectedCalDay = null;
  renderCalendarView();
}

function selectCalDay(dateStr) {
  selectedCalDay = selectedCalDay === dateStr ? null : dateStr;
  renderCalendarView();
}

function renderCalDayDetail(dateStr, entries) {
  const el = document.getElementById('cal-day-detail');
  const d = new Date(dateStr + 'T12:00:00');
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const shortLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const isFuture = dateStr > today();
  const defaults = getDefaults();

  let html = `<div class="cal-detail-date">${label}</div>`;

  // Existing entries
  if (entries.length) {
    const avg = Math.round((entries.reduce((a, l) => a + Number(l.weight), 0) / entries.length) * 10) / 10;
    if (entries.length > 1) {
      html += `<div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">
        Average: <strong style="color:var(--warning);">${avg.toFixed(1)} lbs</strong>
      </div>`;
    }
    html += entries.map(l => `
      <div class="weight-entry-card" style="margin-bottom:6px;">
        <div class="weight-entry-main">
          <span class="weight-entry-value">${Number(l.weight).toFixed(1)}</span>
          <span class="weight-entry-unit">lbs</span>
        </div>
        <div class="weight-entry-meta">
          <span class="card-badge badge-blue">${timeLabel(l.time_of_day)}</span>
          <span class="card-badge ${l.meal_context === 'pre_meal' ? 'badge-yellow' : 'badge-green'}">${mealLabel(l.meal_context)}</span>
        </div>
        <button class="btn-icon" onclick="confirmDelete('${l.id}')"
          style="color:var(--text-muted);font-size:20px;line-height:1;">&times;</button>
      </div>`).join('');
  }

  // Log form for any non-future day
  if (!isFuture) {
    html += `
      <div style="margin-top:${entries.length ? '14px' : '0'};">
        <div class="fitness-section-label">${entries.length ? 'ADD ENTRY' : 'LOG WEIGHT'}</div>
        <div class="cal-log-row">
          <div class="weight-input-wrap" style="flex:1;">
            <input type="number" id="cal-weight-input" class="form-input weight-input"
              step="0.1" min="0" max="999" placeholder="0.0" inputmode="decimal"
              style="font-size:22px !important;">
            <span class="weight-unit">lbs</span>
          </div>
        </div>
        <div class="form-group" style="margin-top:10px;">
          <label class="form-label">Time of Day</label>
          <div class="checkbox-group">
            ${['morning','afternoon','night'].map(t => `
              <button class="checkbox-option${defaults.time_of_day === t ? ' selected' : ''}"
                data-group="cal-time" data-value="${t}" onclick="selectOption(this,'cal-time')">
                ${timeLabel(t)}
              </button>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Meal</label>
          <div class="checkbox-group">
            <button class="checkbox-option${defaults.meal_context === 'pre_meal' ? ' selected' : ''}"
              data-group="cal-meal" data-value="pre_meal" onclick="selectOption(this,'cal-meal')">
              Pre-meal
            </button>
            <button class="checkbox-option${defaults.meal_context === 'post_meal' ? ' selected' : ''}"
              data-group="cal-meal" data-value="post_meal" onclick="selectOption(this,'cal-meal')">
              Post-meal
            </button>
          </div>
        </div>
        <button class="btn btn-primary" id="cal-log-btn"
          style="width:100%;justify-content:center;"
          onclick="logWeightForDate('${dateStr}')">
          Log for ${shortLabel}
        </button>
      </div>`;
  } else {
    if (!entries.length) {
      html += `<p style="color:var(--text-muted);font-size:13px;margin-top:4px;">No entries for this day.</p>`;
    }
  }

  el.innerHTML = html;
}

async function logWeightForDate(dateStr) {
  const input = document.getElementById('cal-weight-input');
  const weight = parseFloat(input.value);

  if (!weight || weight <= 0 || weight > 999) {
    input.style.borderColor = 'var(--danger)';
    input.focus();
    setTimeout(() => { input.style.borderColor = ''; }, 1500);
    return;
  }

  const timeBtn = document.querySelector('[data-group="cal-time"].selected');
  const mealBtn = document.querySelector('[data-group="cal-meal"].selected');
  const time_of_day = timeBtn?.dataset.value || 'morning';
  const meal_context = mealBtn?.dataset.value || 'pre_meal';

  saveDefaults({ time_of_day, meal_context });

  const btn = document.getElementById('cal-log-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  const entry = {
    id: genId(),
    date: dateStr,
    weight: Math.round(weight * 10) / 10,
    time_of_day,
    meal_context
  };

  const result = await saveWeightLog(entry);
  if (result.ok) {
    allLogs.push(entry);
    allLogs.sort((a, b) => b.date.localeCompare(a.date));
    renderCalendarView();
  } else {
    btn.textContent = 'Try again';
    btn.disabled = false;
    showFormError('cal-log-btn', result.message);
  }
}

// ===== GRAPH TAB =====
function linearRegression(xArr, yArr) {
  const n = xArr.length;
  if (n < 2) return null;
  const meanX = xArr.reduce((a, b) => a + b, 0) / n;
  const meanY = yArr.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xArr[i] - meanX) * (yArr[i] - meanY);
    den += (xArr[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

function getGraphRange() {
  if (graphPeriod === 'Custom') {
    return { start: graphCustomStart, end: graphCustomEnd || today() };
  }
  const end = new Date();
  const start = new Date(end);
  switch (graphPeriod) {
    case '1W': start.setDate(end.getDate() - 7); break;
    case '1M': start.setMonth(end.getMonth() - 1); break;
    case '3M': start.setMonth(end.getMonth() - 3); break;
    case '6M': start.setMonth(end.getMonth() - 6); break;
    case '1Y': start.setFullYear(end.getFullYear() - 1); break;
  }
  return { start: fmtDate(start), end: fmtDate(end) };
}

function setGraphPeriod(p) {
  graphPeriod = p;
  if (p === 'Custom' && !graphCustomStart) {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    graphCustomStart = fmtDate(d);
    graphCustomEnd = today();
  }
  renderGraphView();
}

function applyCustomRange() {
  graphCustomStart = document.getElementById('custom-start').value;
  graphCustomEnd = document.getElementById('custom-end').value;
  renderGraphView();
}

function renderGraphView() {
  const range = getGraphRange();
  if (!range.start) return;

  const filtered = allLogs.filter(l => l.date >= range.start && l.date <= range.end);

  const byDate = {};
  for (const l of filtered) {
    if (!byDate[l.date]) byDate[l.date] = [];
    byDate[l.date].push(Number(l.weight));
  }
  const dates = Object.keys(byDate).sort();
  const yValues = dates.map(d => {
    const vals = byDate[d];
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  });
  const labels = dates.map(d => {
    const [, m, day] = d.split('-');
    return `${parseInt(m)}/${parseInt(day)}`;
  });

  const xIndices = dates.map((_, i) => i);
  const reg = yValues.length >= 2 ? linearRegression(xIndices, yValues) : null;

  const avg = yValues.length ? Math.round((yValues.reduce((a, b) => a + b, 0) / yValues.length) * 10) / 10 : 0;
  const min = yValues.length ? Math.min(...yValues) : 0;
  const max = yValues.length ? Math.max(...yValues) : 0;
  const trendPerWeek = reg ? Math.round(reg.slope * 7 * 10) / 10 : 0;
  const trendColor = trendPerWeek < 0 ? 'var(--accent)' : trendPerWeek > 0 ? 'var(--danger)' : 'var(--text-muted)';
  const trendSign = trendPerWeek > 0 ? '+' : '';

  const periodBtns = ['1W','1M','3M','6M','1Y','Custom'].map(p => `
    <button class="graph-period-btn${graphPeriod === p ? ' active' : ''}" onclick="setGraphPeriod('${p}')">${p}</button>
  `).join('');

  const customBlock = graphPeriod === 'Custom' ? `
    <div style="margin-top:12px;">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">From</label>
          <input type="date" id="custom-start" class="form-input" style="font-size:13px;" value="${graphCustomStart}">
        </div>
        <div class="form-group">
          <label class="form-label">To</label>
          <input type="date" id="custom-end" class="form-input" style="font-size:13px;" value="${graphCustomEnd}">
        </div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="applyCustomRange()">Apply</button>
    </div>` : '';

  const emptyBlock = `
    <div class="empty-state" style="padding:48px 0;">
      <p>Not enough data for this period.</p>
    </div>`;

  const statsAndChart = yValues.length >= 2 ? `
    <div class="graph-stats">
      <div class="graph-stat">
        <span class="graph-stat-value">${avg.toFixed(1)}</span>
        <span class="graph-stat-label">Avg (lbs)</span>
      </div>
      <div class="graph-stat">
        <span class="graph-stat-value">${min.toFixed(1)}</span>
        <span class="graph-stat-label">Min (lbs)</span>
      </div>
      <div class="graph-stat">
        <span class="graph-stat-value">${max.toFixed(1)}</span>
        <span class="graph-stat-label">Max (lbs)</span>
      </div>
      <div class="graph-stat">
        <span class="graph-stat-value" style="color:${trendColor};">${trendSign}${trendPerWeek.toFixed(1)}</span>
        <span class="graph-stat-label">lbs/week</span>
      </div>
    </div>
    <div style="height:240px;margin:16px 0 4px;">
      <canvas id="graph-canvas"></canvas>
    </div>
    <div class="graph-legend">
      <span class="graph-legend-item">
        <span class="graph-legend-swatch" style="background:#fbbf24;"></span> Weight
      </span>
      <span class="graph-legend-item">
        <span class="graph-legend-swatch" style="background:rgba(255,255,255,0.3);border-top:2px dashed rgba(255,255,255,0.3);background:none;width:20px;display:inline-block;"></span> Trend
      </span>
    </div>` : emptyBlock;

  document.getElementById('view-graph').innerHTML = `
    <div style="padding:16px 20px;">
      <div class="graph-periods">${periodBtns}</div>
      ${customBlock}
      ${statsAndChart}
    </div>`;

  if (yValues.length >= 2) buildGraphChart(labels, yValues, xIndices, reg);
}

function buildGraphChart(labels, yValues, xIndices, reg) {
  if (graphChart) { graphChart.destroy(); graphChart = null; }

  const trendLine = reg ? xIndices.map(x => Math.round((reg.slope * x + reg.intercept) * 10) / 10) : null;
  const datasets = [{
    label: 'Weight',
    data: yValues,
    borderColor: '#fbbf24',
    backgroundColor: 'rgba(251,191,36,0.07)',
    borderWidth: 2,
    pointRadius: yValues.length > 60 ? 0 : 3,
    pointBackgroundColor: '#fbbf24',
    tension: 0.3,
    fill: true,
    order: 2
  }];

  if (trendLine) {
    datasets.push({
      label: 'Trend',
      data: trendLine,
      borderColor: 'rgba(255,255,255,0.4)',
      borderWidth: 2,
      borderDash: [5, 4],
      pointRadius: 0,
      fill: false,
      tension: 0,
      order: 1
    });
  }

  graphChart = new Chart(document.getElementById('graph-canvas'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(19,19,31,0.95)',
          borderColor: 'rgba(42,42,62,1)',
          borderWidth: 1,
          titleColor: '#94a3b8',
          bodyColor: '#e2e8f0',
          callbacks: {
            label: ctx => ctx.dataset.label === 'Trend'
              ? `Trend: ${ctx.raw} lbs`
              : `Weight: ${ctx.raw} lbs`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: 8 }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#64748b', font: { size: 11 }, callback: v => v + ' lbs' }
        }
      }
    }
  });
}

// ===== ERROR HELPER =====
function showFormError(btnId, message) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const existing = btn.parentNode.querySelector('.form-save-error');
  if (existing) existing.remove();
  const err = document.createElement('p');
  err.className = 'form-save-error';
  err.textContent = message || 'Could not save to database.';
  btn.insertAdjacentElement('afterend', err);
}

// ===== INIT =====
async function init() {
  // Check table accessibility before loading
  const { error: tableError } = await sb.from('weight_logs').select('id').limit(0);

  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('app-header').style.display = '';
  document.getElementById('fitness-mode-tabs').style.display = '';
  document.getElementById('fitness-tabs').style.display = '';
  document.getElementById('main-content').style.display = '';

  if (tableError) {
    document.getElementById('view-log').innerHTML = `
      <div class="db-setup-card">
        <div class="db-setup-title">Database setup required</div>
        <p class="db-setup-desc">
          The <code>weight_logs</code> table is missing or inaccessible in Supabase.<br><br>
          Go to your <strong>Supabase dashboard → SQL Editor</strong> and run:
        </p>
        <pre class="db-setup-sql">create table weight_logs (
  id text primary key,
  date date not null,
  weight numeric(5,1) not null,
  time_of_day text not null,
  meal_context text not null,
  created_at timestamptz default now()
);
alter table weight_logs disable row level security;</pre>
        <p class="db-setup-error">Error: ${tableError.message}</p>
        <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="location.reload()">
          Retry after running SQL
        </button>
      </div>`;
    return;
  }

  allLogs = await getWeightLogs();
  renderLogTab();

  // Deep-link: ?mode=workouts or ?view=track&id=...
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode');
  const view = params.get('view');
  const id = params.get('id');
  if (mode === 'workouts' || view) {
    await switchFitnessMode('workouts');
    if (view === 'track' && id && typeof W !== 'undefined') {
      W.Track.open(id);
    } else if (view && typeof W !== 'undefined') {
      W.switchView(view);
    }
  }
}

init();
