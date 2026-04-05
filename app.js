// ===== SUPABASE SETUP =====
const SUPABASE_URL = 'https://elcyebukretkvlwiutcd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsY3llYnVrcmV0a3Zsd2l1dGNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTE5MjIsImV4cCI6MjA5MDk4NzkyMn0.upensdcqZOeK2-TXDc-SvIqXFhpXSNv-QsToBe5bS88';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== DATA LAYER =====
const DB = {
  // -- Supplements --
  async getSupplements() {
    const { data, error } = await sb.from('supplements').select('*').order('created_at');
    if (error) { console.error('getSupplements:', error); return []; }
    // Map DB columns to JS camelCase
    return data.map(r => ({
      id: r.id, name: r.name, type: r.type, dosage: r.dosage,
      frequency: r.frequency, timing: r.timing, cycle: r.cycle,
      purpose: r.purpose, startDate: r.start_date, active: r.active,
      modifications: r.modifications || []
    }));
  },

  async saveSupplement(s) {
    const row = {
      id: s.id, name: s.name, type: s.type, dosage: s.dosage,
      frequency: s.frequency, timing: s.timing, cycle: s.cycle,
      purpose: s.purpose, start_date: s.startDate, active: s.active,
      modifications: s.modifications || []
    };
    const { error } = await sb.from('supplements').upsert(row);
    if (error) console.error('saveSupplement:', error);
  },

  async deleteSupplement(id) {
    await sb.from('daily_logs').delete().eq('supplement_id', id);
    const { error } = await sb.from('supplements').delete().eq('id', id);
    if (error) console.error('deleteSupplement:', error);
  },

  // -- Daily Logs --
  async getLogsForDate(dateStr) {
    const { data, error } = await sb.from('daily_logs').select('*').eq('date', dateStr);
    if (error) { console.error('getLogsForDate:', error); return {}; }
    const logs = {};
    data.forEach(r => {
      const key = r.supplement_id + (r.dose_index > 0 ? '_' + r.dose_index : '');
      logs[key] = { taken: r.taken, time: r.taken_at };
    });
    return logs;
  },

  async getLogsForRange(startDate, endDate) {
    const { data, error } = await sb.from('daily_logs').select('*')
      .gte('date', startDate).lte('date', endDate);
    if (error) { console.error('getLogsForRange:', error); return {}; }
    const logs = {};
    data.forEach(r => {
      if (!logs[r.date]) logs[r.date] = {};
      const key = r.supplement_id + (r.dose_index > 0 ? '_' + r.dose_index : '');
      logs[r.date][key] = { taken: r.taken, time: r.taken_at };
    });
    return logs;
  },

  async getAllLogs() {
    const { data, error } = await sb.from('daily_logs').select('*');
    if (error) { console.error('getAllLogs:', error); return {}; }
    const logs = {};
    data.forEach(r => {
      if (!logs[r.date]) logs[r.date] = {};
      const key = r.supplement_id + (r.dose_index > 0 ? '_' + r.dose_index : '');
      logs[r.date][key] = { taken: r.taken, time: r.taken_at };
    });
    return logs;
  },

  async toggleLog(dateStr, supplementId, doseIndex, taken) {
    const { error } = await sb.from('daily_logs').upsert({
      date: dateStr,
      supplement_id: supplementId,
      dose_index: doseIndex,
      taken: taken,
      taken_at: taken ? new Date().toISOString() : null
    }, { onConflict: 'date,supplement_id,dose_index' });
    if (error) console.error('toggleLog:', error);
  },

  // -- Health Metrics --
  async getMetrics() {
    const { data, error } = await sb.from('health_metrics').select('*').order('created_at');
    if (error) { console.error('getMetrics:', error); return []; }
    return data.map(r => ({
      id: r.id, name: r.name, unit: r.unit,
      linkedSupplements: r.linked_supplements || []
    }));
  },

  async getMetricWithEntries(metricId) {
    const { data: metric } = await sb.from('health_metrics').select('*').eq('id', metricId).single();
    const { data: entries } = await sb.from('metric_entries').select('*')
      .eq('metric_id', metricId).order('date');
    return {
      id: metric.id, name: metric.name, unit: metric.unit,
      linkedSupplements: metric.linked_supplements || [],
      entries: (entries || []).map(e => ({ date: e.date, method: e.method, value: Number(e.value), unit: e.unit }))
    };
  },

  async saveMetric(m) {
    const row = { id: m.id, name: m.name, unit: m.unit, linked_supplements: m.linkedSupplements || [] };
    const { error } = await sb.from('health_metrics').upsert(row);
    if (error) console.error('saveMetric:', error);
  },

  async deleteMetric(id) {
    const { error } = await sb.from('health_metrics').delete().eq('id', id);
    if (error) console.error('deleteMetric:', error);
  },

  async addMetricEntry(metricId, entry) {
    const { error } = await sb.from('metric_entries').insert({
      metric_id: metricId, date: entry.date, method: entry.method,
      value: entry.value, unit: entry.unit
    });
    if (error) console.error('addMetricEntry:', error);
  }
};

// ===== UTILITIES =====
const U = {
  id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
  today() { return this.fmt(new Date()); },
  fmt(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },
  parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); },
  daysBetween(a, b) { return Math.floor((b - a) / 86400000); },
  formatDisplay(dateStr) {
    const d = this.parseDate(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  },
  timingLabel(t) {
    const m = { water_soluble: 'With Water', fat_soluble: 'With Fatty Meal', pre_workout: 'Pre-Workout', post_workout: 'Post-Workout', before_bed: 'Before Bed' };
    return m[t] || t;
  },
  timingIcon(t) {
    const m = { water_soluble: '💧', fat_soluble: '🥑', pre_workout: '⚡', post_workout: '🏋️', before_bed: '🌙' };
    return m[t] || '💊';
  },
  freqLabel(f) {
    const m = { once_daily: 'Once Daily', twice_daily: 'Twice Daily', once_weekly: 'Once Weekly' };
    return m[f] || f;
  },
  cycleLabel(c) {
    if (!c || c.type === 'continuous') return 'Continuous';
    return `${c.onDays} days on / ${c.offDays} days off`;
  },
  isScheduled(supp, dateStr) {
    const start = this.parseDate(supp.startDate);
    const date = this.parseDate(dateStr);
    if (date < start) return false;
    if (!supp.active) return false;
    if (supp.cycle && supp.cycle.type === 'cycle') {
      const cycleStart = supp.cycle.startDate ? this.parseDate(supp.cycle.startDate) : start;
      const totalCycle = supp.cycle.onDays + supp.cycle.offDays;
      const dayNum = ((this.daysBetween(cycleStart, date) % totalCycle) + totalCycle) % totalCycle;
      if (dayNum >= supp.cycle.onDays) return false;
    }
    if (supp.frequency === 'once_weekly') {
      return date.getDay() === start.getDay();
    }
    return true;
  },
  dosesPerDay(supp) { return supp.frequency === 'twice_daily' ? 2 : 1; },
  doseLabels(supp) {
    if (supp.frequency === 'twice_daily') return ['Morning', 'Evening'];
    return [''];
  },
  // Parse supplement ID and dose index from a log key
  parseKey(key) {
    const parts = key.split('_');
    if (parts.length > 1) {
      const doseIndex = parseInt(parts.pop());
      return { suppId: parts.join('_'), doseIndex };
    }
    return { suppId: key, doseIndex: 0 };
  },
  // Get the supplement's state as it was on a specific date
  getStateAtDate(supp, dateStr) {
    const targetDate = new Date(dateStr + 'T23:59:59');
    const mods = supp.modifications || [];
    // Find the latest modification AFTER the target date
    // and use its snapshot (which represents the state BEFORE that change)
    // We go through modifications in reverse to find the earliest one after the target
    const sortedMods = mods.slice().sort((a, b) => new Date(a.date) - new Date(b.date));

    // Start with current state
    let state = {
      name: supp.name, type: supp.type, dosage: supp.dosage,
      frequency: supp.frequency, timing: supp.timing, cycle: supp.cycle,
      purpose: supp.purpose, active: supp.active
    };

    // Walk backwards through modifications: for each mod that happened AFTER the target date,
    // roll back to the snapshot (the state before that change)
    for (let i = sortedMods.length - 1; i >= 0; i--) {
      const mod = sortedMods[i];
      if (new Date(mod.date) > targetDate && mod.snapshot) {
        state = { ...mod.snapshot };
      }
    }

    return state;
  }
};

// ===== MAIN APP =====
const App = {
  currentTab: 'today',
  calendarDate: new Date(),
  _suppsCache: null,

  async init() {
    // Preload supplements into cache
    this._suppsCache = await DB.getSupplements();

    // Hide loading, show app
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('app-header').style.display = '';
    document.getElementById('main-content').style.display = '';
    document.getElementById('bottom-nav').style.display = '';

    this.renderHeaderDate();
    await this.switchTab('today');
  },

  renderHeaderDate() {
    const d = new Date();
    document.getElementById('header-date').textContent =
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  async switchTab(tab) {
    const isSubView = tab === 'supplement-detail' || tab === 'metric-detail';
    this.currentTab = tab;

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + tab).classList.add('active');

    if (!isSubView) {
      document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
      });
    }

    if (tab === 'today') await this.Today.render();
    else if (tab === 'calendar') await this.Calendar.render();
    else if (tab === 'supplements') await this.Supplements.render();
    else if (tab === 'metrics') await this.Metrics.render();
  },

  openModal(title, bodyHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-overlay').classList.add('active');
    document.getElementById('modal').classList.add('active');
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    document.getElementById('modal').classList.remove('active');
  },

  async refreshSuppsCache() {
    this._suppsCache = await DB.getSupplements();
  },

  // ===== TODAY VIEW =====
  Today: {
    async render() {
      await App.refreshSuppsCache();
      const supps = App._suppsCache;
      const todayStr = U.today();
      const scheduled = supps.filter(s => U.isScheduled(s, todayStr));
      const container = document.getElementById('today-list');
      const empty = document.getElementById('today-empty');

      if (scheduled.length === 0) {
        container.innerHTML = '';
        empty.style.display = 'block';
        document.getElementById('today-progress').innerHTML = '';
        return;
      }
      empty.style.display = 'none';

      const logs = await DB.getLogsForDate(todayStr);

      const groups = { pre_workout: [], water_soluble: [], fat_soluble: [], post_workout: [], before_bed: [] };

      scheduled.forEach(s => {
        const doses = U.dosesPerDay(s);
        for (let i = 0; i < doses; i++) {
          const key = s.id + (doses > 1 ? '_' + i : '');
          const taken = logs[key]?.taken || false;
          const doseLabel = doses > 1 ? U.doseLabels(s)[i] : '';
          groups[s.timing].push({ supp: s, key, taken, doseLabel, doseIndex: i });
        }
      });

      let html = '';
      let totalDoses = 0, takenDoses = 0;

      for (const [timing, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        html += `<div class="timing-group">
          <div class="timing-label">${U.timingIcon(timing)} ${U.timingLabel(timing)}</div>`;

        items.forEach(item => {
          totalDoses++;
          if (item.taken) takenDoses++;
          const checkedClass = item.taken ? 'checked' : '';
          const takenClass = item.taken ? 'taken' : '';
          const doseInfo = item.doseLabel ? ` · ${item.doseLabel}` : '';

          html += `<div class="today-item ${takenClass}" id="today-${item.key}">
            <button class="check-btn ${checkedClass}" onclick="App.Today.toggle('${item.supp.id}', ${item.doseIndex}, ${item.taken})">
              ${item.taken ? '✓' : ''}
            </button>
            <div class="today-item-info">
              <div class="today-item-name">${item.supp.name}</div>
              <div class="today-item-detail">${item.supp.dosage}${doseInfo}</div>
            </div>
          </div>`;
        });
        html += '</div>';
      }

      container.innerHTML = html;

      const pct = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 0;
      document.getElementById('today-progress').innerHTML =
        `<span class="progress-text" style="color: ${pct === 100 ? 'var(--accent)' : 'var(--text)'}">${pct}%</span>`;
    },

    async toggle(suppId, doseIndex, currentlyTaken) {
      const todayStr = U.today();
      await DB.toggleLog(todayStr, suppId, doseIndex, !currentlyTaken);
      await this.render();
    }
  },

  // ===== CALENDAR VIEW =====
  Calendar: {
    selectedDate: null,

    async render() {
      const d = App.calendarDate;
      const year = d.getFullYear(), month = d.getMonth();
      document.getElementById('calendar-month-label').textContent =
        d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const todayStr = U.today();

      await App.refreshSuppsCache();
      const supps = App._suppsCache;

      // Fetch logs for the entire month
      const startDate = `${year}-${String(month+1).padStart(2,'0')}-01`;
      const endDate = `${year}-${String(month+1).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`;
      const logs = await DB.getLogsForRange(startDate, endDate);

      let html = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
        .map(d => `<div class="cal-day-label">${d}</div>`).join('');

      for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        let cls = 'cal-day';
        if (dateStr === todayStr) cls += ' today';
        if (dateStr === this.selectedDate) cls += ' selected';

        const dateObj = U.parseDate(dateStr);
        const isPast = dateObj < new Date(new Date().setHours(0,0,0,0));
        const isToday = dateStr === todayStr;

        const scheduled = supps.filter(s => U.isScheduled(s, dateStr));
        if (scheduled.length > 0) {
          if (isPast || isToday) {
            let total = 0, taken = 0;
            scheduled.forEach(s => {
              const doses = U.dosesPerDay(s);
              for (let i = 0; i < doses; i++) {
                total++;
                const key = s.id + (doses > 1 ? '_' + i : '');
                if (logs[dateStr]?.[key]?.taken) taken++;
              }
            });
            if (taken === total && taken > 0) cls += ' perfect';
            else if (taken > 0) cls += ' partial';
            else if (isPast) cls += ' missed';
          } else {
            cls += ' scheduled';
          }
        } else if (isPast || isToday) {
          cls += ' off-cycle';
        }

        html += `<div class="${cls}" onclick="App.Calendar.selectDay('${dateStr}')">${day}</div>`;
      }

      document.getElementById('calendar-grid').innerHTML = html;
      if (this.selectedDate) await this.renderDayDetail(this.selectedDate);
    },

    async selectDay(dateStr) {
      this.selectedDate = dateStr;
      await this.render();
    },

    async renderDayDetail(dateStr) {
      const supps = App._suppsCache;
      const scheduled = supps.filter(s => U.isScheduled(s, dateStr));
      const dayLog = await DB.getLogsForDate(dateStr);

      const dateObj = U.parseDate(dateStr);
      const isPast = dateObj < new Date(new Date().setHours(0,0,0,0));
      const isToday = dateStr === U.today();

      let html = `<div class="cal-detail-date">${U.formatDisplay(dateStr)}</div>`;

      if (scheduled.length === 0) {
        html += '<p class="text-muted">No supplements scheduled.</p>';
      } else {
        scheduled.forEach(s => {
          const doses = U.dosesPerDay(s);
          for (let i = 0; i < doses; i++) {
            const key = s.id + (doses > 1 ? '_' + i : '');
            const taken = dayLog[key]?.taken || false;
            let badge;
            if (taken) {
              badge = '<span class="card-badge badge-green">Taken</span>';
            } else if (isPast) {
              badge = '<span class="card-badge badge-red">Missed</span>';
            } else if (isToday) {
              badge = '<span class="card-badge badge-yellow">Pending</span>';
            } else {
              badge = '<span class="card-badge badge-blue">Scheduled</span>';
            }
            const doseLabel = doses > 1 ? ` (${U.doseLabels(s)[i]})` : '';
            html += `<div class="card" style="cursor:default">
              <div class="card-header">
                <span class="card-title">${s.name}${doseLabel}</span>${badge}
              </div>
              <div class="card-subtitle">${s.dosage} · ${U.timingLabel(s.timing)}</div>
            </div>`;
          }
        });
      }

      document.getElementById('calendar-day-detail').innerHTML = html;
    },

    prevMonth() { App.calendarDate.setMonth(App.calendarDate.getMonth() - 1); this.render(); },
    nextMonth() { App.calendarDate.setMonth(App.calendarDate.getMonth() + 1); this.render(); },
  },

  // ===== SUPPLEMENTS VIEW =====
  Supplements: {
    async render() {
      await App.refreshSuppsCache();
      const supps = App._suppsCache;
      const container = document.getElementById('supplements-list');
      const empty = document.getElementById('supplements-empty');

      if (supps.length === 0) {
        container.innerHTML = '';
        empty.style.display = 'block';
        return;
      }
      empty.style.display = 'none';

      const colors = ['var(--accent-dim)', 'var(--accent-blue-dim)', 'var(--danger-dim)', 'rgba(251,191,36,0.15)'];
      container.innerHTML = supps.map((s, i) => {
        const statusBadge = s.active
          ? '<span class="card-badge badge-green">Active</span>'
          : '<span class="card-badge badge-red">Paused</span>';
        return `<div class="card" onclick="App.Supplements.showDetail('${s.id}')">
          <div class="supplement-card">
            <div class="supp-icon" style="background:${colors[i % colors.length]}">
              ${U.timingIcon(s.timing)}
            </div>
            <div class="supp-info">
              <div class="card-header">
                <span class="card-title">${s.name}</span>${statusBadge}
              </div>
              <div class="card-subtitle">${s.dosage} · ${U.freqLabel(s.frequency)} · ${U.cycleLabel(s.cycle)}</div>
            </div>
          </div>
        </div>`;
      }).join('');
    },

    openAddModal(editId) {
      const isEdit = !!editId;
      const supp = isEdit ? App._suppsCache.find(s => s.id === editId) : null;

      const html = `
        <div class="form-group">
          <label class="form-label">Supplement Name</label>
          <input class="form-input" id="f-name" placeholder="e.g. Vitamin D3" value="${supp?.name || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="f-type">
            <option value="">Select type...</option>
            ${['Vitamin','Mineral','Herb','Amino Acid','Probiotic','Omega/Fat','Protein','Other']
              .map(t => `<option value="${t}" ${supp?.type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Dosage</label>
          <input class="form-input" id="f-dosage" placeholder="e.g. 5000 IU" value="${supp?.dosage || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Frequency</label>
          <select class="form-select" id="f-freq">
            <option value="once_daily" ${supp?.frequency==='once_daily'?'selected':''}>Once Daily</option>
            <option value="twice_daily" ${supp?.frequency==='twice_daily'?'selected':''}>Twice Daily</option>
            <option value="once_weekly" ${supp?.frequency==='once_weekly'?'selected':''}>Once Weekly</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Timing</label>
          <select class="form-select" id="f-timing">
            <option value="water_soluble" ${supp?.timing==='water_soluble'?'selected':''}>💧 Water Soluble (with water)</option>
            <option value="fat_soluble" ${supp?.timing==='fat_soluble'?'selected':''}>🥑 Fat Soluble (with fatty meal)</option>
            <option value="pre_workout" ${supp?.timing==='pre_workout'?'selected':''}>⚡ Pre-Workout</option>
            <option value="post_workout" ${supp?.timing==='post_workout'?'selected':''}>🏋️ Post-Workout</option>
            <option value="before_bed" ${supp?.timing==='before_bed'?'selected':''}>🌙 Before Bed</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Cycle</label>
          <select class="form-select" id="f-cycle-type" onchange="App.Supplements.toggleCycleFields()">
            <option value="continuous" ${!supp?.cycle||supp?.cycle?.type==='continuous'?'selected':''}>Continuous (every day)</option>
            <option value="cycle" ${supp?.cycle?.type==='cycle'?'selected':''}>On/Off Cycle</option>
          </select>
        </div>
        <div id="cycle-fields" class="form-row" style="display:${supp?.cycle?.type==='cycle'?'grid':'none'}">
          <div class="form-group">
            <label class="form-label">Days On</label>
            <input class="form-input" id="f-cycle-on" type="number" min="1" value="${supp?.cycle?.onDays || 14}">
          </div>
          <div class="form-group">
            <label class="form-label">Days Off</label>
            <input class="form-input" id="f-cycle-off" type="number" min="1" value="${supp?.cycle?.offDays || 7}">
          </div>
          <div class="form-group" style="grid-column: 1 / -1;">
            <label class="form-label">Cycle Start Date</label>
            <input class="form-input" id="f-cycle-start" type="date" value="${supp?.cycle?.startDate || U.today()}">
            <p style="font-size:11px;color:var(--text-muted);margin-top:4px;">When did (or will) your current on-cycle begin?</p>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Purpose</label>
          <textarea class="form-textarea" id="f-purpose" placeholder="Why are you taking this?">${supp?.purpose || ''}</textarea>
        </div>
        ${isEdit ? `
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="f-active">
            <option value="true" ${supp.active?'selected':''}>Active</option>
            <option value="false" ${!supp.active?'selected':''}>Paused</option>
          </select>
        </div>` : ''}
        <div class="form-actions">
          <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="App.Supplements.save('${editId || ''}')">${isEdit ? 'Update' : 'Add Supplement'}</button>
        </div>
        ${isEdit ? `<div class="form-actions mt-8">
          <button class="btn btn-danger btn-sm" onclick="App.Supplements.remove('${editId}')">Delete Supplement</button>
        </div>` : ''}
      `;

      App.openModal(isEdit ? 'Edit Supplement' : 'Add Supplement', html);
    },

    toggleCycleFields() {
      const type = document.getElementById('f-cycle-type').value;
      document.getElementById('cycle-fields').style.display = type === 'cycle' ? 'grid' : 'none';
    },

    async save(editId) {
      const name = document.getElementById('f-name').value.trim();
      const type = document.getElementById('f-type').value;
      const dosage = document.getElementById('f-dosage').value.trim();
      const frequency = document.getElementById('f-freq').value;
      const timing = document.getElementById('f-timing').value;
      const cycleType = document.getElementById('f-cycle-type').value;
      const purpose = document.getElementById('f-purpose').value.trim();

      if (!name || !type || !dosage) { alert('Please fill in name, type, and dosage.'); return; }

      const cycle = cycleType === 'cycle'
        ? { type: 'cycle', onDays: parseInt(document.getElementById('f-cycle-on').value) || 14, offDays: parseInt(document.getElementById('f-cycle-off').value) || 7, startDate: document.getElementById('f-cycle-start').value || U.today() }
        : { type: 'continuous' };

      if (editId) {
        const old = App._suppsCache.find(s => s.id === editId);
        if (!old) return;
        const active = document.getElementById('f-active').value === 'true';

        const mods = old.modifications || [];
        const changes = [];
        if (old.name !== name) changes.push(`Name: ${old.name} → ${name}`);
        if (old.type !== type) changes.push(`Type: ${old.type} → ${type}`);
        if (old.dosage !== dosage) changes.push(`Dosage: ${old.dosage} → ${dosage}`);
        if (old.frequency !== frequency) changes.push(`Frequency: ${U.freqLabel(old.frequency)} → ${U.freqLabel(frequency)}`);
        if (old.timing !== timing) changes.push(`Timing: ${U.timingLabel(old.timing)} → ${U.timingLabel(timing)}`);
        if (old.active !== active) changes.push(`Status: ${old.active ? 'Active' : 'Paused'} → ${active ? 'Active' : 'Paused'}`);
        if (JSON.stringify(old.cycle) !== JSON.stringify(cycle)) changes.push(`Cycle: ${U.cycleLabel(old.cycle)} → ${U.cycleLabel(cycle)}`);
        if (old.purpose !== purpose) changes.push(`Purpose updated`);

        if (changes.length > 0) {
          // Store a snapshot of the old state before this change
          mods.push({
            date: new Date().toISOString(),
            changes,
            snapshot: {
              name: old.name, type: old.type, dosage: old.dosage,
              frequency: old.frequency, timing: old.timing, cycle: old.cycle,
              purpose: old.purpose, active: old.active
            }
          });
        }

        await DB.saveSupplement({ ...old, name, type, dosage, frequency, timing, cycle, purpose, active, modifications: mods });
      } else {
        await DB.saveSupplement({
          id: U.id(), name, type, dosage, frequency, timing, cycle, purpose,
          startDate: U.today(), active: true, modifications: []
        });
      }

      App.closeModal();
      await App.refreshSuppsCache();

      if (editId) {
        await this.showDetail(editId);
      } else {
        await this.render();
      }
    },

    async remove(id) {
      if (!confirm('Delete this supplement and all its logs?')) return;
      await DB.deleteSupplement(id);
      App.closeModal();
      await App.switchTab('supplements');
    },

    _detailCalDate: null,
    _detailSuppId: null,
    _detailSelectedDate: null,
    _detailLogs: null,

    async showDetail(id) {
      this._detailSuppId = id;
      this._detailCalDate = this._detailCalDate || new Date();
      this._detailSelectedDate = null;
      this._detailLogs = await DB.getAllLogs();

      await this._renderDetail();
    },

    async _renderDetail() {
      await App.refreshSuppsCache();
      const supp = App._suppsCache.find(s => s.id === this._detailSuppId);
      if (!supp) return;

      const logs = this._detailLogs;
      let totalDays = 0, takenDays = 0, currentStreak = 0;

      const start = U.parseDate(supp.startDate);
      const today = new Date(); today.setHours(0,0,0,0);

      // Calculate consistency
      for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
        const ds = U.fmt(d);
        if (!U.isScheduled(supp, ds)) continue;
        totalDays++;
        const doses = U.dosesPerDay(supp);
        let allTaken = true;
        for (let i = 0; i < doses; i++) {
          const key = supp.id + (doses > 1 ? '_' + i : '');
          if (!logs[ds]?.[key]?.taken) allTaken = false;
        }
        if (allTaken) takenDays++;
      }

      // Calculate current streak (from today backwards)
      for (let d = new Date(today); d >= start; d.setDate(d.getDate() - 1)) {
        const ds = U.fmt(d);
        if (!U.isScheduled(supp, ds)) continue;
        const doses = U.dosesPerDay(supp);
        let allTaken = true;
        for (let i = 0; i < doses; i++) {
          const key = supp.id + (doses > 1 ? '_' + i : '');
          if (!logs[ds]?.[key]?.taken) allTaken = false;
        }
        if (allTaken) currentStreak++;
        else break;
      }

      const consistency = totalDays > 0 ? Math.round((takenDays / totalDays) * 100) : 0;

      // Build full navigable calendar
      const calHtml = this._buildDetailCalendar(supp, logs);

      // Build selected day detail (historical)
      let dayDetailHtml = '';
      if (this._detailSelectedDate) {
        dayDetailHtml = this._buildDayDetail(supp, this._detailSelectedDate, logs);
      }

      // Modifications log
      let modHtml = '';
      if (supp.modifications && supp.modifications.length > 0) {
        modHtml = supp.modifications.slice().reverse().map(m =>
          `<div class="mod-entry">
            <div class="mod-date">${new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            <div>${m.changes.join(', ')}</div>
          </div>`
        ).join('');
      } else {
        modHtml = '<p class="text-muted">No modifications yet.</p>';
      }

      // Current details section (always shows current state)
      const html = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <div class="supp-icon" style="background:var(--accent-dim);width:48px;height:48px;font-size:22px">
            ${U.timingIcon(supp.timing)}
          </div>
          <div>
            <h2 style="font-size:22px;font-weight:700;">${supp.name}</h2>
            <p class="text-muted" style="font-size:13px">${supp.type} · ${supp.dosage}</p>
          </div>
        </div>

        <div class="detail-section">
          <div class="stat-grid">
            <div class="stat-box">
              <div class="stat-value text-accent">${consistency}%</div>
              <div class="stat-label">Consistency</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${currentStreak}</div>
              <div class="stat-label">Day Streak</div>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">History</div>
          <div class="calendar-header">
            <button class="btn-icon" onclick="App.Supplements.detailCalPrev()">&#8249;</button>
            <h2 id="detail-cal-label" style="font-size:16px;font-weight:600;"></h2>
            <button class="btn-icon" onclick="App.Supplements.detailCalNext()">&#8250;</button>
          </div>
          <div class="calendar-grid" id="detail-cal-grid"></div>
          <div style="display:flex;gap:16px;margin-top:8px;font-size:11px;color:var(--text-muted);">
            <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:3px;background:var(--accent-dim);display:inline-block"></span> Taken</span>
            <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:3px;background:var(--danger-dim);display:inline-block"></span> Missed</span>
            <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:3px;background:var(--accent-blue-dim);display:inline-block"></span> Scheduled</span>
          </div>
          <div id="detail-day-info" class="mt-16">${dayDetailHtml}</div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">Current Details</div>
          <div class="detail-row"><span class="detail-label">Frequency</span><span class="detail-value">${U.freqLabel(supp.frequency)}</span></div>
          <div class="detail-row"><span class="detail-label">Timing</span><span class="detail-value">${U.timingLabel(supp.timing)}</span></div>
          <div class="detail-row"><span class="detail-label">Cycle</span><span class="detail-value">${U.cycleLabel(supp.cycle)}</span></div>
          <div class="detail-row"><span class="detail-label">Started</span><span class="detail-value">${U.formatDisplay(supp.startDate)}</span></div>
          <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value">${supp.active ? '🟢 Active' : '🔴 Paused'}</span></div>
          <div class="detail-row"><span class="detail-label">Purpose</span><span class="detail-value" style="max-width:60%">${supp.purpose || '—'}</span></div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">Modification History</div>
          <div class="modification-log">${modHtml}</div>
        </div>

        <div class="form-actions">
          <button class="btn btn-secondary" onclick="App.Supplements.openAddModal('${supp.id}')">Edit Supplement</button>
        </div>
      `;

      document.getElementById('supplement-detail-content').innerHTML = html;

      // Render the calendar into its container
      this._updateDetailCalendar(supp, logs);

      // Only switch tab if we're not already on it (avoids re-scroll)
      if (App.currentTab !== 'supplement-detail') {
        App.switchTab('supplement-detail');
      }
    },

    _buildDetailCalendar(supp, logs) {
      // Called after DOM is built via _updateDetailCalendar
    },

    _updateDetailCalendar(supp, logs) {
      const d = this._detailCalDate;
      const year = d.getFullYear(), month = d.getMonth();
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      document.getElementById('detail-cal-label').textContent = label;

      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const todayStr = U.today();

      let html = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
        .map(d => `<div class="cal-day-label">${d}</div>`).join('');

      for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        let cls = 'cal-day';
        if (dateStr === todayStr) cls += ' today';
        if (dateStr === this._detailSelectedDate) cls += ' selected';

        const dateObj = U.parseDate(dateStr);
        const isPast = dateObj < new Date(new Date().setHours(0,0,0,0));
        const isToday = dateStr === todayStr;

        if (U.isScheduled(supp, dateStr)) {
          if (isPast || isToday) {
            const doses = U.dosesPerDay(supp);
            let allTaken = true;
            for (let i = 0; i < doses; i++) {
              const key = supp.id + (doses > 1 ? '_' + i : '');
              if (!logs[dateStr]?.[key]?.taken) allTaken = false;
            }
            if (allTaken) cls += ' perfect';
            else if (isPast) cls += ' missed';
          } else {
            cls += ' scheduled';
          }
        }

        html += `<div class="${cls}" onclick="App.Supplements.selectDetailDay('${dateStr}')">${day}</div>`;
      }

      document.getElementById('detail-cal-grid').innerHTML = html;
    },

    _buildDayDetail(supp, dateStr, logs) {
      const dateObj = U.parseDate(dateStr);
      const isPast = dateObj < new Date(new Date().setHours(0,0,0,0));
      const isToday = dateStr === U.today();

      // Get historical state at this date
      const stateAtDate = U.getStateAtDate(supp, dateStr);
      const wasScheduled = U.isScheduled(supp, dateStr);

      let html = `<div class="cal-detail-date">${U.formatDisplay(dateStr)}</div>`;

      if (!wasScheduled) {
        html += '<p class="text-muted" style="font-size:13px;">Not scheduled on this day.</p>';
        return html;
      }

      // Show status
      if (isPast || isToday) {
        const doses = U.dosesPerDay(supp);
        let takenCount = 0;
        for (let i = 0; i < doses; i++) {
          const key = supp.id + (doses > 1 ? '_' + i : '');
          if (logs[dateStr]?.[key]?.taken) takenCount++;
        }
        const badge = takenCount === doses
          ? '<span class="card-badge badge-green">Taken</span>'
          : takenCount > 0
            ? '<span class="card-badge badge-yellow">Partial</span>'
            : '<span class="card-badge badge-red">Missed</span>';
        html += `<div style="margin-bottom:12px">${badge}</div>`;
      } else {
        html += '<div style="margin-bottom:12px"><span class="card-badge badge-blue">Scheduled</span></div>';
      }

      // Show details as they were on this date
      html += `<div class="detail-section-title" style="margin-top:8px">Details on this date</div>`;
      html += `<div class="detail-row"><span class="detail-label">Dosage</span><span class="detail-value">${stateAtDate.dosage}</span></div>`;
      html += `<div class="detail-row"><span class="detail-label">Frequency</span><span class="detail-value">${U.freqLabel(stateAtDate.frequency)}</span></div>`;
      html += `<div class="detail-row"><span class="detail-label">Timing</span><span class="detail-value">${U.timingLabel(stateAtDate.timing)}</span></div>`;
      html += `<div class="detail-row"><span class="detail-label">Cycle</span><span class="detail-value">${U.cycleLabel(stateAtDate.cycle)}</span></div>`;
      html += `<div class="detail-row"><span class="detail-label">Purpose</span><span class="detail-value" style="max-width:60%">${stateAtDate.purpose || '—'}</span></div>`;

      return html;
    },

    selectDetailDay(dateStr) {
      this._detailSelectedDate = dateStr;
      const supp = App._suppsCache.find(s => s.id === this._detailSuppId);
      if (!supp) return;

      // Update calendar selection
      this._updateDetailCalendar(supp, this._detailLogs);

      // Update day detail
      const dayDetailHtml = this._buildDayDetail(supp, dateStr, this._detailLogs);
      document.getElementById('detail-day-info').innerHTML = dayDetailHtml;
    },

    detailCalPrev() {
      this._detailCalDate.setMonth(this._detailCalDate.getMonth() - 1);
      const supp = App._suppsCache.find(s => s.id === this._detailSuppId);
      if (supp) this._updateDetailCalendar(supp, this._detailLogs);
    },

    detailCalNext() {
      this._detailCalDate.setMonth(this._detailCalDate.getMonth() + 1);
      const supp = App._suppsCache.find(s => s.id === this._detailSuppId);
      if (supp) this._updateDetailCalendar(supp, this._detailLogs);
    }
  },

  // ===== METRICS VIEW =====
  Metrics: {
    chartInstances: {},

    async render() {
      const metrics = await DB.getMetrics();
      const container = document.getElementById('metrics-list');
      const empty = document.getElementById('metrics-empty');

      if (metrics.length === 0) {
        container.innerHTML = '';
        empty.style.display = 'block';
        return;
      }
      empty.style.display = 'none';

      // Fetch entry counts
      let html = '';
      for (const m of metrics) {
        const full = await DB.getMetricWithEntries(m.id);
        const latest = full.entries.length > 0 ? full.entries[full.entries.length - 1] : null;
        html += `<div class="card metric-card" onclick="App.Metrics.showDetail('${m.id}')">
          <div class="card-header">
            <span class="card-title">${m.name}</span>
            <span class="card-badge badge-blue">${full.entries.length} entries</span>
          </div>
          <div class="card-subtitle">${latest ? `Latest: ${latest.value} ${latest.unit || ''} (${U.formatDisplay(latest.date)})` : 'No entries yet'}</div>
        </div>`;
      }
      container.innerHTML = html;
    },

    openAddModal(editId) {
      const isEdit = !!editId;
      // For edit, we need the metric from cache — load it async
      this._openAddModalInner(editId, isEdit);
    },

    async _openAddModalInner(editId, isEdit) {
      let metric = null;
      if (isEdit) {
        metric = await DB.getMetricWithEntries(editId);
      }
      await App.refreshSuppsCache();

      const html = `
        <div class="form-group">
          <label class="form-label">Metric Name</label>
          <input class="form-input" id="f-metric-name" placeholder="e.g. Vitamin D Level" value="${metric?.name || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Unit of Measurement</label>
          <input class="form-input" id="f-metric-unit" placeholder="e.g. ng/mL, mg/dL, bpm" value="${metric?.unit || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Link to Supplements (optional)</label>
          <div class="checkbox-group" id="f-metric-supps">
            ${App._suppsCache.map(s => {
              const sel = metric?.linkedSupplements?.includes(s.id) ? 'selected' : '';
              return `<div class="checkbox-option ${sel}" data-id="${s.id}" onclick="this.classList.toggle('selected')">${s.name}</div>`;
            }).join('')}
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="App.Metrics.saveMetric('${editId || ''}')">${isEdit ? 'Update' : 'Create Metric'}</button>
        </div>
        ${isEdit ? `<div class="form-actions mt-8">
          <button class="btn btn-danger btn-sm" onclick="App.Metrics.removeMetric('${editId}')">Delete Metric</button>
        </div>` : ''}
      `;

      App.openModal(isEdit ? 'Edit Metric' : 'New Health Metric', html);
    },

    async saveMetric(editId) {
      const name = document.getElementById('f-metric-name').value.trim();
      const unit = document.getElementById('f-metric-unit').value.trim();
      if (!name) { alert('Please enter a metric name.'); return; }

      const linkedSupplements = Array.from(document.querySelectorAll('#f-metric-supps .selected'))
        .map(el => el.dataset.id);

      const id = editId || U.id();
      await DB.saveMetric({ id, name, unit, linkedSupplements });

      App.closeModal();
      await this.render();
    },

    async removeMetric(id) {
      if (!confirm('Delete this metric and all its data?')) return;
      await DB.deleteMetric(id);
      App.closeModal();
      await App.switchTab('metrics');
    },

    openAddEntry(metricId) {
      const html = `
        <div class="form-group">
          <label class="form-label">Date Measured</label>
          <input class="form-input" id="f-entry-date" type="date" value="${U.today()}">
        </div>
        <div class="form-group">
          <label class="form-label">Method of Measurement</label>
          <input class="form-input" id="f-entry-method" placeholder="e.g. Blood test, Home kit, Wearable">
        </div>
        <div class="form-group">
          <label class="form-label">Value</label>
          <input class="form-input" id="f-entry-value" type="number" step="any" placeholder="e.g. 45.2">
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="App.Metrics.saveEntry('${metricId}')">Save Entry</button>
        </div>
      `;
      App.openModal('Log Measurement', html);
    },

    async saveEntry(metricId) {
      const date = document.getElementById('f-entry-date').value;
      const method = document.getElementById('f-entry-method').value.trim();
      const value = parseFloat(document.getElementById('f-entry-value').value);

      if (!date || isNaN(value)) { alert('Please enter a date and value.'); return; }

      const metric = await DB.getMetricWithEntries(metricId);
      await DB.addMetricEntry(metricId, { date, method, value, unit: metric.unit });

      App.closeModal();
      await this.showDetail(metricId);
    },

    async showDetail(metricId) {
      const metric = await DB.getMetricWithEntries(metricId);
      if (!metric) return;

      await App.refreshSuppsCache();
      const linked = App._suppsCache.filter(s => metric.linkedSupplements?.includes(s.id));

      let entriesHtml = '';
      if (metric.entries.length > 0) {
        entriesHtml = metric.entries.slice().reverse().map(e =>
          `<div class="card" style="cursor:default">
            <div class="card-header">
              <span class="card-title">${e.value} ${e.unit || ''}</span>
              <span class="card-badge badge-blue">${U.formatDisplay(e.date)}</span>
            </div>
            <div class="card-subtitle">${e.method || 'No method recorded'}</div>
          </div>`
        ).join('');
      }

      const html = `
        <h2 style="font-size:22px;font-weight:700;margin-bottom:4px;">${metric.name}</h2>
        <p class="text-muted mb-8">${metric.unit ? `Measured in ${metric.unit}` : ''}</p>

        <button class="btn btn-primary btn-sm mb-8" onclick="App.Metrics.openAddEntry('${metric.id}')">+ Log Measurement</button>
        <button class="btn btn-secondary btn-sm mb-8" onclick="App.Metrics.openAddModal('${metric.id}')" style="margin-left:8px">Edit</button>

        ${metric.entries.length >= 2 ? `
        <div class="detail-section">
          <div class="detail-section-title">Trend</div>
          <div class="metric-chart-container"><canvas id="metric-chart"></canvas></div>
        </div>` : ''}

        ${linked.length > 0 ? `
        <div class="detail-section">
          <div class="detail-section-title">Linked Supplements</div>
          ${linked.map(s => `<div class="card" style="cursor:default">
            <div class="card-title">${s.name}</div>
            <div class="card-subtitle">${s.dosage} · Started ${U.formatDisplay(s.startDate)}</div>
          </div>`).join('')}
        </div>` : ''}

        <div class="detail-section">
          <div class="detail-section-title">All Entries (${metric.entries.length})</div>
          ${entriesHtml || '<p class="text-muted">No entries yet. Log your first measurement above.</p>'}
        </div>
      `;

      document.getElementById('metric-detail-content').innerHTML = html;
      App.switchTab('metric-detail');

      if (metric.entries.length >= 2) {
        setTimeout(() => this.renderChart(metric, linked), 100);
      }
    },

    renderChart(metric, linkedSupps) {
      const canvas = document.getElementById('metric-chart');
      if (!canvas) return;

      if (this.chartInstances[metric.id]) {
        this.chartInstances[metric.id].destroy();
      }

      const labels = metric.entries.map(e => U.formatDisplay(e.date));
      const data = metric.entries.map(e => e.value);

      const datasets = [{
        label: metric.name,
        data: data,
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96, 165, 250, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#60a5fa',
      }];

      this.chartInstances[metric.id] = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              ticks: { color: '#64748b', font: { size: 10 } },
              grid: { color: 'rgba(42,42,62,0.5)' }
            },
            y: {
              ticks: { color: '#64748b', font: { size: 10 } },
              grid: { color: 'rgba(42,42,62,0.5)' }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1a1a2e',
              titleColor: '#e2e8f0',
              bodyColor: '#94a3b8',
              borderColor: '#2a2a3e',
              borderWidth: 1,
            }
          }
        }
      });
    }
  }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => App.init());
