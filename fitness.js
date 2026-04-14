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
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const sinceStr = `${since.getFullYear()}-${String(since.getMonth()+1).padStart(2,'0')}-${String(since.getDate()).padStart(2,'0')}`;

  const { data, error } = await sb.from('weight_logs')
    .select('*')
    .gte('date', sinceStr)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) { console.error('getWeightLogs:', error); return []; }
  return data || [];
}

async function saveWeightLog(entry) {
  const { error } = await sb.from('weight_logs').insert(entry);
  if (error) { console.error('saveWeightLog:', error); return false; }
  return true;
}

async function deleteWeightLog(id) {
  const { error } = await sb.from('weight_logs').delete().eq('id', id);
  if (error) console.error('deleteWeightLog:', error);
}

// ===== STATE =====
let allLogs = [];
let weightChart = null;

// ===== TAB SWITCHING =====
function switchFitnessTab(tab) {
  document.querySelectorAll('.fitness-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + tab).classList.add('active');
}

// ===== RENDER: LOG FORM =====
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

// ===== RENDER: TODAY ENTRIES =====
function renderTodayEntries(todayLogs) {
  const el = document.getElementById('today-entries');
  if (!todayLogs.length) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="fitness-section-label">TODAY</div>
    ${todayLogs.map(l => `
      <div class="weight-entry-card">
        <div class="weight-entry-main">
          <span class="weight-entry-value">${l.weight.toFixed(1)}</span>
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

// ===== RENDER: CHART =====
function renderChart() {
  const container = document.getElementById('weight-chart-container');
  if (allLogs.length < 2) { container.style.display = 'none'; return; }
  container.style.display = '';

  // Average weight per day, last 30 days
  const byDate = {};
  for (const l of allLogs) {
    if (!byDate[l.date]) byDate[l.date] = [];
    byDate[l.date].push(l.weight);
  }
  const dates = Object.keys(byDate).sort().slice(-30);
  const weights = dates.map(d => {
    const vals = byDate[d];
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  });
  const labels = dates.map(d => {
    const [, m, day] = d.split('-');
    return `${parseInt(m)}/${parseInt(day)}`;
  });

  if (weightChart) { weightChart.destroy(); weightChart = null; }
  weightChart = new Chart(document.getElementById('weight-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: weights,
        borderColor: '#fbbf24',
        backgroundColor: 'rgba(251,191,36,0.08)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#fbbf24',
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#64748b', font: { size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: '#64748b',
            font: { size: 11 },
            callback: v => v + ' lbs'
          }
        }
      }
    }
  });
}

// ===== RENDER: HISTORY =====
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
  let html = '<div class="fitness-section-label">HISTORY</div>';

  for (const date of sortedDates) {
    const entries = byDate[date];
    const avg = Math.round((entries.reduce((a, l) => a + l.weight, 0) / entries.length) * 10) / 10;
    const d = new Date(date + 'T12:00:00');
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const badge = entries.length > 1
      ? `<span class="card-badge badge-blue">${entries.length} entries</span>`
      : `<span class="card-badge ${entries[0].meal_context === 'pre_meal' ? 'badge-yellow' : 'badge-green'}">${mealLabel(entries[0].meal_context)}</span>`;

    html += `
      <div class="weight-history-row">
        <div>
          <span class="weight-history-date">${label}</span>
          ${entries.length > 1 ? `<span class="weight-history-sub">${timeLabel(entries[entries.length-1].time_of_day)} – ${timeLabel(entries[0].time_of_day)}</span>` : `<span class="weight-history-sub">${timeLabel(entries[0].time_of_day)}</span>`}
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${badge}
          <span class="weight-history-value">${avg.toFixed(1)} <span style="font-size:11px;color:var(--text-muted);">lbs</span></span>
        </div>
      </div>`;
  }

  el.innerHTML = html;
}

// ===== ACTIONS =====
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

  const ok = await saveWeightLog(entry);
  if (ok) {
    allLogs.unshift(entry);
    input.value = '';
    renderWeightView();
  } else {
    btn.textContent = 'Log Weight';
    btn.disabled = false;
  }
}

async function confirmDelete(id) {
  if (!confirm('Delete this entry?')) return;
  await deleteWeightLog(id);
  allLogs = allLogs.filter(l => l.id !== id);
  renderWeightView();
}

// ===== MAIN RENDER =====
function renderWeightView() {
  const todayStr = today();
  const todayLogs = allLogs.filter(l => l.date === todayStr);
  renderLogForm();
  renderTodayEntries(todayLogs);
  renderChart();
  renderHistory();
}

// ===== INIT =====
async function init() {
  allLogs = await getWeightLogs();
  renderWeightView();

  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('app-header').style.display = '';
  document.getElementById('fitness-tabs').style.display = '';
  document.getElementById('main-content').style.display = '';
}

init();
