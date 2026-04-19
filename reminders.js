// ===== SUPABASE SETUP =====
const SUPABASE_URL = 'https://elcyebukretkvlwiutcd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsY3llYnVrcmV0a3Zsd2l1dGNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTE5MjIsImV4cCI6MjA5MDk4NzkyMn0.upensdcqZOeK2-TXDc-SvIqXFhpXSNv-QsToBe5bS88';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== DB LAYER =====
const DB = {
  async getReminders() {
    const { data, error } = await sb.from('reminders').select('*').order('created_at');
    if (error) { console.error('getReminders:', error); return []; }
    return (data || []).map(r => ({
      id: r.id, name: r.name, description: r.description,
      type: r.type || 'scheduled',
      frequency: r.frequency, customInterval: r.custom_interval,
      timeOfDay: r.time_of_day, timeOfDay2: r.time_of_day_2,
      flexibleCycle: r.flexible_cycle, cycleConfig: r.cycle_config,
      showOnHome: r.show_on_home !== false,
      importance: r.importance || 'medium',
      completedAt: r.completed_at || null,
      active: r.active, startDate: r.start_date
    }));
  },

  async saveReminder(r) {
    const row = {
      id: r.id, name: r.name, description: r.description,
      type: r.type || 'scheduled',
      frequency: r.frequency, custom_interval: r.customInterval,
      time_of_day: r.timeOfDay, time_of_day_2: r.timeOfDay2,
      flexible_cycle: r.flexibleCycle, cycle_config: r.cycleConfig,
      show_on_home: r.showOnHome !== false,
      importance: r.importance || 'medium',
      completed_at: r.completedAt || null,
      active: r.active, start_date: r.startDate
    };
    const { error } = await sb.from('reminders').upsert(row);
    if (error) { console.error('saveReminder:', error); throw error; }
  },

  async deleteReminder(id) {
    await sb.from('reminder_logs').delete().eq('reminder_id', id);
    const { error } = await sb.from('reminders').delete().eq('id', id);
    if (error) console.error('deleteReminder:', error);
  },

  async getAllLogs() {
    const { data, error } = await sb.from('reminder_logs').select('*').order('date');
    if (error) { console.error('getAllLogs:', error); return []; }
    return data || [];
  },

  async logCompletion(reminderId, date, doseIndex, notes) {
    const { error } = await sb.from('reminder_logs').upsert({
      reminder_id: reminderId, date, dose_index: doseIndex,
      completed: true, completed_at: new Date().toISOString(),
      notes: notes || null
    }, { onConflict: 'reminder_id,date,dose_index' });
    if (error) console.error('logCompletion:', error);
  },

  async deleteLog(reminderId, date, doseIndex) {
    await sb.from('reminder_logs').delete()
      .eq('reminder_id', reminderId).eq('date', date).eq('dose_index', doseIndex);
  }
};

// ===== UTILITIES =====
const U = {
  id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  fmt(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); },
  daysBetween(a, b) { return Math.floor((b - a) / 86400000); },
  addDays(dateStr, n) {
    const d = this.parseDate(dateStr);
    d.setDate(d.getDate() + n);
    return this.fmt(d);
  },
  formatDisplay(dateStr) {
    return this.parseDate(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  },
  freqLabel(r) {
    if (r.flexibleCycle && r.cycleConfig) {
      const iv = r.cycleConfig.intervalValue;
      const iu = r.cycleConfig.intervalUnit === 'weeks'
        ? (iv === 1 ? 'week' : 'weeks')
        : (iv === 1 ? 'day' : 'days');
      return `Every ${iv} ${iu} · ${r.cycleConfig.windowDays}d window`;
    }
    switch (r.frequency) {
      case 'daily': return 'Daily';
      case 'twice_daily': return 'Twice Daily';
      case 'once_weekly': return 'Once Weekly';
      case 'custom': {
        const cfg = r.customInterval || {};
        const v = cfg.value || 1;
        const u = cfg.unit === 'weeks' ? (v === 1 ? 'week' : 'weeks') : (v === 1 ? 'day' : 'days');
        return `Every ${v} ${u}`;
      }
      default: return r.frequency;
    }
  },

  // Compute history of windows for a flexible-cycle reminder.
  // rLogs: pre-filtered logs for this reminder (from reminder_logs table).
  // Returns array of window objects up to and including the current/next window.
  computeWindowHistory(reminder, rLogs) {
    if (!reminder.flexibleCycle || !reminder.cycleConfig) return [];
    const { intervalValue, intervalUnit, windowDays } = reminder.cycleConfig;
    const intervalDays = intervalUnit === 'weeks' ? intervalValue * 7 : intervalValue;
    const completions = (rLogs || []).filter(l => l.completed);

    let windowStart = reminder.startDate;
    const today = this.today();
    const windows = [];
    let safety = 0;

    while (windowStart <= today && safety < 1000) {
      safety++;
      const windowEnd = this.addDays(windowStart, windowDays - 1);
      // Search the full interval period — a retroactive log anywhere in the period
      // (not just within the window) counts and advances the schedule from that date.
      const periodEnd = this.addDays(windowStart, intervalDays - 1);
      const completion = completions.find(l => l.date >= windowStart && l.date <= periodEnd);

      windows.push({
        windowStart,
        windowEnd,
        completed: !!completion,
        completionDate: completion ? completion.date : null,
        isCurrent: windowStart <= today && windowEnd >= today,
        isPast: windowEnd < today
      });

      windowStart = completion
        ? this.addDays(completion.date, intervalDays)
        : this.addDays(windowStart, intervalDays);
    }

    // Append the next upcoming window if we advanced past today
    if (windowStart > today) {
      const windowEnd = this.addDays(windowStart, windowDays - 1);
      windows.push({
        windowStart, windowEnd,
        completed: false, completionDate: null,
        isCurrent: false, isPast: false
      });
    }

    return windows;
  },

  // Returns true if this reminder is due (or the window is open) on dateStr.
  isReminderDue(reminder, dateStr, rLogs) {
    if (!reminder.active) return false;
    if (dateStr < reminder.startDate) return false;

    if (reminder.flexibleCycle && reminder.cycleConfig) {
      const windows = this.computeWindowHistory(reminder, rLogs);
      return windows.some(w => dateStr >= w.windowStart && dateStr <= w.windowEnd);
    }

    const date = this.parseDate(dateStr);
    const start = this.parseDate(reminder.startDate);

    switch (reminder.frequency) {
      case 'daily':
      case 'twice_daily':
        return true;
      case 'once_weekly':
        return date.getDay() === start.getDay();
      case 'custom': {
        const cfg = reminder.customInterval || {};
        const interval = (cfg.unit === 'weeks' ? cfg.value * 7 : cfg.value) || 1;
        const diff = this.daysBetween(start, date);
        return diff >= 0 && diff % interval === 0;
      }
      default: return true;
    }
  },

  isCompleted(reminderId, date, doseIndex, logs) {
    return (logs || []).some(l =>
      l.reminder_id === reminderId && l.date === date &&
      l.dose_index === (doseIndex || 0) && l.completed
    );
  },

  // For calendar rendering: returns the status of a date for a specific reminder.
  // Returns: 'completed' | 'missed' | 'in-window' | 'scheduled' | 'off' | 'window-upcoming' | 'due-today'
  getDayStatus(reminder, dateStr, rLogs, allLogs) {
    if (!reminder.active && dateStr > reminder.startDate) return 'off';
    const today = this.today();
    const isPast = dateStr < today;
    const isToday = dateStr === today;
    const logsToCheck = allLogs || rLogs;

    // A logged completion on ANY date shows as completed — check first before schedule logic.
    const doses = reminder.frequency === 'twice_daily' ? 2 : 1;
    let takenCount = 0;
    for (let i = 0; i < doses; i++) {
      if (this.isCompleted(reminder.id, dateStr, i, logsToCheck)) takenCount++;
    }
    if (takenCount > 0) return 'completed';

    if (reminder.flexibleCycle && reminder.cycleConfig) {
      const windows = this.computeWindowHistory(reminder, rLogs);
      const win = windows.find(w => dateStr >= w.windowStart && dateStr <= w.windowEnd);
      if (!win) return 'off';
      if (win.isCurrent) return 'in-window';
      if (win.isPast) return 'missed';
      return 'window-upcoming';
    }

    const due = this.isReminderDue(reminder, dateStr, rLogs);
    if (!due) return 'off';
    if (isPast) return 'missed';
    if (isToday) return 'due-today';
    return 'scheduled';
  },

  formatTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    return `${hr}:${String(m).padStart(2,'0')} ${ampm}`;
  }
};

// ===== MAIN APP =====
const App = {
  currentTab: 'active',
  _remindersCache: null,
  _allLogs: null,

  async init() {
    this._remindersCache = await DB.getReminders();
    this._allLogs = await DB.getAllLogs();

    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('app-header').style.display = '';
    document.getElementById('reminders-tabs').style.display = '';
    document.getElementById('main-content').style.display = '';

    await this.Active.render();
  },

  switchTab(tab) {
    if (tab === 'detail') return; // detail is navigated to via show()
    this.currentTab = tab;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + tab).classList.add('active');
    document.querySelectorAll('.reminders-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab)
    );
    if (tab === 'active') this.Active.render();
    else if (tab === 'calendar') this.Calendar.render();
    else if (tab === 'standing') this.Standing.render();
  },

  showDetail() {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-detail').classList.add('active');
    // tabs keep their state so user can navigate back
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

  async refresh() {
    this._remindersCache = await DB.getReminders();
    this._allLogs = await DB.getAllLogs();
  },

  // ===== ACTIVE VIEW =====
  Active: {
    async render() {
      const today = U.today();
      const reminders = App._remindersCache || [];
      const logs = App._allLogs || [];

      // Determine due items for today (scheduled reminders only)
      const dueItems = [];
      for (const r of reminders) {
        if (r.type === 'standing') continue;
        if (!r.active) continue;
        const rLogs = logs.filter(l => l.reminder_id === r.id);
        if (!U.isReminderDue(r, today, rLogs)) continue;
        const doses = r.frequency === 'twice_daily' ? 2 : 1;
        for (let i = 0; i < doses; i++) {
          const completed = U.isCompleted(r.id, today, i, logs);
          dueItems.push({ reminder: r, doseIndex: i, completed });
        }
      }

      // Due section
      let dueHtml = '';
      if (dueItems.length === 0) {
        dueHtml = `<div class="home-reminder-done">
          <span style="font-size:24px;">✓</span>
          <span>All caught up for today</span>
        </div>`;
      } else {
        for (const { reminder, doseIndex, completed } of dueItems) {
          const doses = reminder.frequency === 'twice_daily' ? 2 : 1;
          const doseLabel = doses > 1 ? (doseIndex === 0 ? ' · Morning' : ' · Evening') : '';
          const timeStr = doseIndex === 0 ? U.formatTime(reminder.timeOfDay) : U.formatTime(reminder.timeOfDay2);
          const timeTag = timeStr ? `<span class="reminder-time-tag">${timeStr}</span>` : '';

          dueHtml += `<div class="reminder-due-item ${completed ? 'reminder-done' : ''}" id="ri-${reminder.id}-${doseIndex}">
            <button class="reminder-check-btn ${completed ? 'checked' : ''}"
              onclick="App.Active.toggle('${reminder.id}', '${today}', ${doseIndex})">
              ${completed ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
            </button>
            <div class="reminder-item-info" onclick="App.Detail.show('${reminder.id}')">
              <div class="reminder-item-name">${reminder.name}${doseLabel}</div>
              <div class="reminder-item-detail">${U.freqLabel(reminder)}${timeStr ? ' · ' + timeStr : ''}</div>
            </div>
            <span class="card-badge ${completed ? 'badge-green' : 'badge-yellow'}">${completed ? 'Done' : 'Pending'}</span>
          </div>`;
        }
      }

      // All reminders list (scheduled only)
      const active = reminders.filter(r => r.type !== 'standing' && r.active);
      const inactive = reminders.filter(r => r.type !== 'standing' && !r.active);

      const reminderCard = (r) => {
        const rLogs = logs.filter(l => l.reminder_id === r.id);
        const dueToday = U.isReminderDue(r, today, rLogs);
        const doneToday = dueToday && U.isCompleted(r.id, today, 0, logs);
        let badge;
        if (!r.active) badge = '<span class="card-badge badge-red">Paused</span>';
        else if (doneToday) badge = '<span class="card-badge badge-green">Done</span>';
        else if (dueToday) badge = '<span class="card-badge badge-yellow">Pending</span>';
        else badge = '<span class="card-badge badge-blue">Scheduled</span>';

        const timeDisplay = r.timeOfDay ? U.formatTime(r.timeOfDay) : '';
        return `<div class="card" onclick="App.Detail.show('${r.id}')">
          <div class="card-header">
            <span class="card-title">${r.name}</span>${badge}
          </div>
          <div class="card-subtitle">${U.freqLabel(r)}${timeDisplay ? ' · ' + timeDisplay : ''}</div>
          ${r.description ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;">${r.description}</div>` : ''}
        </div>`;
      };

      let listHtml = '';
      if (active.length > 0) {
        listHtml += active.map(reminderCard).join('');
      }
      if (inactive.length > 0) {
        listHtml += `<div class="fitness-section-label" style="margin:20px 0 10px;">PAUSED</div>`;
        listHtml += inactive.map(reminderCard).join('');
      }
      if (reminders.filter(r => r.type !== 'standing').length === 0) {
        listHtml = `<div class="empty-state" style="padding:32px 0;">
          <p style="font-size:15px;margin-bottom:16px;">No scheduled reminders yet.</p>
          <button class="btn btn-primary" onclick="App.openAddModal()">+ Add a Reminder</button>
        </div>`;
      }

      document.getElementById('view-active').innerHTML = `
        <div class="view-header">
          <h2>Reminders</h2>
          <button class="btn btn-primary btn-sm" onclick="App.openAddModal()">+ Add</button>
        </div>

        <div class="fitness-section-label" style="margin-bottom:10px;">TODAY · ${U.formatDisplay(today).toUpperCase()}</div>
        <div style="margin-bottom:24px;">${dueHtml}</div>

        ${reminders.length > 0 ? `<div class="fitness-section-label" style="margin-bottom:10px;">ALL REMINDERS</div>` : ''}
        ${listHtml}
      `;
    },

    async toggle(reminderId, date, doseIndex) {
      const completed = U.isCompleted(reminderId, date, doseIndex, App._allLogs);
      if (completed) {
        await DB.deleteLog(reminderId, date, doseIndex);
      } else {
        await DB.logCompletion(reminderId, date, doseIndex, null);
      }
      await App.refresh();
      await this.render();
    }
  },

  // ===== STANDING REMINDERS VIEW =====
  Standing: {
    _importanceOrder: { critical: 0, high: 1, medium: 2, low: 3 },

    render() {
      const all = (App._remindersCache || []).filter(r => r.type === 'standing');
      const pending = all
        .filter(r => !r.completedAt)
        .sort((a, b) => (this._importanceOrder[a.importance] ?? 2) - (this._importanceOrder[b.importance] ?? 2));
      const completed = all
        .filter(r => !!r.completedAt)
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

      const badge = (imp) => {
        const map = {
          critical: ['badge-critical', 'Critical'],
          high:     ['badge-high',     'High'],
          medium:   ['badge-blue',     'Medium'],
          low:      ['badge-low',      'Low']
        };
        const [cls, label] = map[imp] || map.medium;
        return `<span class="card-badge ${cls}">${label}</span>`;
      };

      const card = (r) => {
        const doneStyle = r.completedAt ? 'opacity:0.5;' : '';
        const doneLine = r.completedAt
          ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Completed ${U.formatDisplay(r.completedAt.slice(0,10))}</div>`
          : '';
        return `<div class="card" style="${doneStyle}cursor:default;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
            <div style="flex:1;" onclick="App.Detail.show('${r.id}')">
              <div style="font-size:15px;font-weight:600;">${r.name}</div>
              ${r.description ? `<div style="font-size:12px;color:var(--text-muted);margin-top:3px;">${r.description}</div>` : ''}
              ${doneLine}
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
              ${badge(r.importance)}
              ${!r.completedAt
                ? `<button class="btn btn-primary btn-sm" onclick="App.Standing.markComplete('${r.id}')">Mark Done</button>`
                : `<button class="btn btn-secondary btn-sm" onclick="App.Standing.markIncomplete('${r.id}')">Undo</button>`
              }
            </div>
          </div>
        </div>`;
      };

      let html = `<div class="view-header">
        <h2>Standing</h2>
        <button class="btn btn-primary btn-sm" onclick="App.openAddModal(null,'standing')">+ Add</button>
      </div>`;

      if (pending.length === 0 && completed.length === 0) {
        html += `<div class="empty-state" style="padding:32px 0;">
          <p style="font-size:15px;margin-bottom:16px;">No standing reminders yet.</p>
          <button class="btn btn-primary" onclick="App.openAddModal(null,'standing')">+ Add a Standing Reminder</button>
        </div>`;
      } else {
        if (pending.length > 0) {
          html += pending.map(card).join('');
        } else {
          html += `<div class="home-reminder-done" style="margin-bottom:20px;">
            <span style="font-size:20px;">✓</span><span>All standing reminders completed</span>
          </div>`;
        }
        if (completed.length > 0) {
          html += `<div class="fitness-section-label" style="margin:20px 0 10px;">COMPLETED</div>`;
          html += completed.map(card).join('');
        }
      }

      document.getElementById('view-standing').innerHTML = html;
    },

    async markComplete(id) {
      const { error } = await sb.from('reminders')
        .update({ completed_at: new Date().toISOString() }).eq('id', id);
      if (error) { console.error('markComplete:', error); return; }
      await App.refresh();
      this.render();
    },

    async markIncomplete(id) {
      const { error } = await sb.from('reminders')
        .update({ completed_at: null }).eq('id', id);
      if (error) { console.error('markIncomplete:', error); return; }
      await App.refresh();
      this.render();
    }
  },

  // ===== CALENDAR VIEW =====
  Calendar: {
    _calDate: new Date(),
    _selectedDate: null,

    async render() {
      const d = this._calDate;
      const year = d.getFullYear(), month = d.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstDay = new Date(year, month, 1).getDay();
      const today = U.today();
      const reminders = App._remindersCache || [];
      const logs = App._allLogs || [];

      const monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      // Build calendar grid
      let gridHtml = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
        .map(l => `<div class="cal-day-label">${l}</div>`).join('');

      for (let i = 0; i < firstDay; i++) gridHtml += '<div class="cal-day empty"></div>';

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const isPast = dateStr < today;
        const isToday = dateStr === today;
        const isSel = dateStr === this._selectedDate;

        // Determine aggregate status for all active reminders
        let totalDue = 0, totalDone = 0, hasWindow = false;
        for (const r of reminders) {
          if (!r.active) continue;
          const rLogs = logs.filter(l => l.reminder_id === r.id);
          const status = U.getDayStatus(r, dateStr, rLogs, logs);
          if (status === 'off' || status === 'scheduled' || status === 'window-upcoming') continue;
          if (status === 'completed') { totalDue++; totalDone++; }
          else if (status === 'missed' || status === 'due-today') totalDue++;
          else if (status === 'in-window') { hasWindow = true; }
        }

        let cls = 'cal-day';
        if (isToday) cls += ' today';
        if (isSel) cls += ' selected';

        if (totalDue > 0 && (isPast || isToday)) {
          if (totalDone === totalDue) cls += ' perfect';
          else if (totalDone > 0) cls += ' partial';
          else cls += ' missed';
        } else if (hasWindow && !isSel) {
          cls += ' scheduled';
        }

        gridHtml += `<div class="${cls}" onclick="App.Calendar.selectDay('${dateStr}')">${day}</div>`;
      }

      // Day detail
      let dayDetailHtml = '';
      if (this._selectedDate) {
        dayDetailHtml = this._buildDayDetail(this._selectedDate, reminders, logs);
      }

      document.getElementById('view-calendar').innerHTML = `
        <div class="calendar-header">
          <button class="btn-icon" onclick="App.Calendar.prevMonth()">&#8249;</button>
          <h2>${monthLabel}</h2>
          <button class="btn-icon" onclick="App.Calendar.nextMonth()">&#8250;</button>
        </div>
        <div class="calendar-grid">${gridHtml}</div>
        <div style="display:flex;gap:16px;margin-top:8px;margin-bottom:16px;font-size:11px;color:var(--text-muted);">
          <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:3px;background:var(--accent-dim);display:inline-block"></span> Done</span>
          <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:3px;background:var(--danger-dim);display:inline-block"></span> Missed</span>
          <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:3px;background:var(--accent-blue-dim);display:inline-block"></span> Window</span>
        </div>
        ${dayDetailHtml}
      `;
    },

    _buildDayDetail(dateStr, reminders, logs) {
      const today = U.today();
      const isPast = dateStr < today;
      const isToday = dateStr === today;

      let html = `<div class="cal-detail-date">${U.formatDisplay(dateStr)}</div>`;
      let hasAnything = false;

      for (const r of reminders) {
        if (!r.active) continue;
        const rLogs = logs.filter(l => l.reminder_id === r.id);
        const status = U.getDayStatus(r, dateStr, rLogs, logs);
        if (status === 'off' || status === 'window-upcoming') continue;
        hasAnything = true;

        let badge;
        if (status === 'completed') badge = '<span class="card-badge badge-green">Done</span>';
        else if (status === 'missed') badge = '<span class="card-badge badge-red">Missed</span>';
        else if (status === 'in-window') badge = '<span class="card-badge badge-blue">In Window</span>';
        else if (status === 'due-today') badge = '<span class="card-badge badge-yellow">Pending</span>';
        else badge = '<span class="card-badge badge-blue">Scheduled</span>';

        html += `<div class="card" style="cursor:default;margin-bottom:8px;">
          <div class="card-header">
            <span class="card-title" style="font-size:14px;">${r.name}</span>${badge}
          </div>
          <div class="card-subtitle">${U.freqLabel(r)}</div>
        </div>`;

        // Allow toggling completion on any date
        if (isPast || isToday) {
          const doses = r.frequency === 'twice_daily' ? 2 : 1;
          for (let i = 0; i < doses; i++) {
            const done = U.isCompleted(r.id, dateStr, i, logs);
            const doseLabel = doses > 1 ? (i === 0 ? 'Morning' : 'Evening') : '';
            html += `<button class="btn ${done ? 'btn-secondary' : 'btn-secondary'} btn-sm"
              style="margin-top:-4px;margin-bottom:8px;font-size:12px;${done ? 'color:var(--accent);border-color:var(--accent);' : ''}"
              onclick="App.Calendar.toggleDate('${r.id}','${dateStr}',${i})">
              ${done ? '✓ ' : ''}${doseLabel ? doseLabel + ' · ' : ''}${done ? 'Undo' : 'Mark Done'}
            </button>`;
          }
        }
      }

      if (!hasAnything) {
        html += '<p class="text-muted" style="font-size:13px;">No reminders scheduled on this day.</p>';
      }

      return html;
    },

    async toggleDate(reminderId, date, doseIndex) {
      const done = U.isCompleted(reminderId, date, doseIndex, App._allLogs);
      if (done) await DB.deleteLog(reminderId, date, doseIndex);
      else await DB.logCompletion(reminderId, date, doseIndex, null);
      await App.refresh();
      await this.render();
    },

    selectDay(dateStr) {
      this._selectedDate = this._selectedDate === dateStr ? null : dateStr;
      this.render();
    },

    prevMonth() { this._calDate.setMonth(this._calDate.getMonth() - 1); this.render(); },
    nextMonth() { this._calDate.setMonth(this._calDate.getMonth() + 1); this.render(); }
  },

  // ===== DETAIL VIEW =====
  Detail: {
    _reminderId: null,
    _calDate: new Date(),
    _selectedDate: null,

    async show(id) {
      this._reminderId = id;
      this._calDate = new Date();
      this._selectedDate = null;
      await App.refresh();
      App.showDetail();
      this._render();
    },

    _render() {
      const reminder = (App._remindersCache || []).find(r => r.id === this._reminderId);
      if (!reminder) { App.switchTab('active'); return; }

      // Standing reminders get a simplified detail view
      if (reminder.type === 'standing') {
        const importanceLabels = { critical: '🔴 Critical', high: '🟠 High', medium: '🔵 Medium', low: '⚪ Low' };
        const impBadgeClass = { critical: 'badge-critical', high: 'badge-high', medium: 'badge-blue', low: 'badge-low' };
        const html = `
          <button class="btn-back" onclick="App.switchTab('standing')">&#8249; Back</button>
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:20px;">
            <div style="flex:1;">
              <h2 style="font-size:22px;font-weight:700;line-height:1.2;">${reminder.name}</h2>
              ${reminder.description ? `<p style="font-size:13px;color:var(--text-secondary);margin-top:6px;">${reminder.description}</p>` : ''}
            </div>
            <span class="card-badge ${impBadgeClass[reminder.importance]||'badge-blue'}" style="flex-shrink:0;margin-top:4px;">
              ${importanceLabels[reminder.importance]||'Medium'}
            </span>
          </div>
          <div class="detail-section">
            <div class="detail-section-title">Details</div>
            <div class="detail-row">
              <span class="detail-label">Type</span>
              <span class="detail-value">Standing Reminder</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Show on Home</span>
              <span class="detail-value">${reminder.showOnHome ? 'Yes' : 'No'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Created</span>
              <span class="detail-value">${U.formatDisplay(reminder.startDate)}</span>
            </div>
            ${reminder.completedAt ? `<div class="detail-row">
              <span class="detail-label">Completed</span>
              <span class="detail-value text-accent">${U.formatDisplay(reminder.completedAt.slice(0,10))}</span>
            </div>` : ''}
          </div>
          <div class="form-actions">
            ${!reminder.completedAt
              ? `<button class="btn btn-primary" onclick="App.Standing.markComplete('${reminder.id}');App.switchTab('standing')">Mark as Done</button>`
              : `<button class="btn btn-secondary" onclick="App.Standing.markIncomplete('${reminder.id}');App.switchTab('standing')">Mark as Incomplete</button>`
            }
            <button class="btn btn-secondary" onclick="App.openAddModal('${reminder.id}')">Edit</button>
          </div>
        `;
        document.getElementById('detail-content').innerHTML = html;
        return;
      }
      const logs = App._allLogs || [];
      const rLogs = logs.filter(l => l.reminder_id === reminder.id);
      const today = U.today();

      // Compute stats
      let totalDue = 0, totalDone = 0, streak = 0, streakBroken = false;
      const start = U.parseDate(reminder.startDate);
      const todayDate = new Date(); todayDate.setHours(0,0,0,0);

      if (!reminder.flexibleCycle) {
        for (let d = new Date(start); d <= todayDate; d.setDate(d.getDate() + 1)) {
          const ds = U.fmt(d);
          if (!U.isReminderDue(reminder, ds, rLogs)) continue;
          const doses = reminder.frequency === 'twice_daily' ? 2 : 1;
          let allDone = true;
          for (let i = 0; i < doses; i++) {
            if (!U.isCompleted(reminder.id, ds, i, logs)) allDone = false;
          }
          totalDue++;
          if (allDone) totalDone++;
        }
        // Streak: from today backwards
        for (let d = new Date(todayDate); d >= start; d.setDate(d.getDate() - 1)) {
          const ds = U.fmt(d);
          if (!U.isReminderDue(reminder, ds, rLogs)) continue;
          const doses = reminder.frequency === 'twice_daily' ? 2 : 1;
          let allDone = true;
          for (let i = 0; i < doses; i++) {
            if (!U.isCompleted(reminder.id, ds, i, logs)) allDone = false;
          }
          if (allDone && !streakBroken) streak++;
          else streakBroken = true;
        }
      } else {
        const windows = U.computeWindowHistory(reminder, rLogs);
        totalDue = windows.filter(w => w.isPast || w.isCurrent).length;
        totalDone = windows.filter(w => w.completed).length;
        // Streak = consecutive completed windows
        const past = windows.filter(w => w.isPast || w.isCurrent).reverse();
        for (const w of past) {
          if (w.completed) streak++;
          else break;
        }
      }

      const consistency = totalDue > 0 ? Math.round((totalDone / totalDue) * 100) : 0;

      // Build calendar
      const calHtml = this._buildCalendar(reminder, rLogs, logs);

      // Selected day detail
      let dayDetailHtml = '';
      if (this._selectedDate) {
        dayDetailHtml = this._buildDayDetail(reminder, this._selectedDate, rLogs, logs);
      }

      // Schedule summary
      let scheduleInfo = '';
      if (reminder.flexibleCycle && reminder.cycleConfig) {
        const windows = U.computeWindowHistory(reminder, rLogs);
        const current = windows.find(w => w.isCurrent);
        const next = windows.find(w => !w.isPast && !w.isCurrent);
        if (current) {
          scheduleInfo = `<div class="detail-row">
            <span class="detail-label">Current Window</span>
            <span class="detail-value">${U.formatDisplay(current.windowStart)} – ${U.formatDisplay(current.windowEnd)}</span>
          </div>`;
        }
        if (next && !current) {
          scheduleInfo = `<div class="detail-row">
            <span class="detail-label">Next Window</span>
            <span class="detail-value">${U.formatDisplay(next.windowStart)}</span>
          </div>`;
        }
      }

      const html = `
        <button class="btn-back" onclick="App.switchTab('${App.currentTab}')">&#8249; Back</button>

        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;gap:12px;">
          <div style="flex:1">
            <h2 style="font-size:22px;font-weight:700;line-height:1.2;">${reminder.name}</h2>
            ${reminder.description ? `<p style="font-size:13px;color:var(--text-secondary);margin-top:6px;">${reminder.description}</p>` : ''}
          </div>
          <span class="card-badge ${reminder.active ? 'badge-green' : 'badge-red'}" style="flex-shrink:0;margin-top:4px;">
            ${reminder.active ? 'Active' : 'Paused'}
          </span>
        </div>

        <div class="detail-section">
          <div class="stat-grid">
            <div class="stat-box">
              <div class="stat-value text-accent">${consistency}%</div>
              <div class="stat-label">Consistency</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${streak}</div>
              <div class="stat-label">${reminder.flexibleCycle ? 'Window Streak' : 'Day Streak'}</div>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">Schedule</div>
          <div class="detail-row">
            <span class="detail-label">Frequency</span>
            <span class="detail-value">${U.freqLabel(reminder)}</span>
          </div>
          ${reminder.timeOfDay ? `<div class="detail-row">
            <span class="detail-label">Time</span>
            <span class="detail-value">${U.formatTime(reminder.timeOfDay)}${reminder.timeOfDay2 ? ' · ' + U.formatTime(reminder.timeOfDay2) : ''}</span>
          </div>` : ''}
          <div class="detail-row">
            <span class="detail-label">Started</span>
            <span class="detail-value">${U.formatDisplay(reminder.startDate)}</span>
          </div>
          ${scheduleInfo}
        </div>

        <div class="detail-section">
          <div class="detail-section-title">History</div>
          <div class="calendar-header" style="margin-bottom:12px;">
            <button class="btn-icon" onclick="App.Detail.calPrev()">&#8249;</button>
            <h2 id="detail-cal-label" style="font-size:16px;font-weight:600;"></h2>
            <button class="btn-icon" onclick="App.Detail.calNext()">&#8250;</button>
          </div>
          <div class="calendar-grid" id="detail-cal-grid"></div>
          <div style="display:flex;gap:16px;margin-top:8px;font-size:11px;color:var(--text-muted);">
            <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:3px;background:var(--accent-dim);display:inline-block"></span> Done</span>
            <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:3px;background:var(--danger-dim);display:inline-block"></span> Missed</span>
            <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:3px;background:rgba(251,191,36,0.2);display:inline-block"></span> Window</span>
          </div>
          <div id="detail-day-info" class="mt-16">${dayDetailHtml}</div>
        </div>

        <div class="form-actions">
          <button class="btn btn-secondary" onclick="App.openAddModal('${reminder.id}')">Edit Reminder</button>
        </div>
      `;

      document.getElementById('detail-content').innerHTML = html;
      this._updateCalendar(reminder, rLogs, logs);
    },

    _buildCalendar(reminder, rLogs, logs) { /* populated via _updateCalendar */ },

    _updateCalendar(reminder, rLogs, logs) {
      const d = this._calDate;
      const year = d.getFullYear(), month = d.getMonth();
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      document.getElementById('detail-cal-label').textContent = label;

      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const today = U.today();

      let html = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
        .map(l => `<div class="cal-day-label">${l}</div>`).join('');
      for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const status = U.getDayStatus(reminder, dateStr, rLogs, logs);
        let cls = 'cal-day';
        if (dateStr === today) cls += ' today';
        if (dateStr === this._selectedDate) cls += ' selected';

        if (status === 'completed') cls += ' perfect';
        else if (status === 'missed') cls += ' missed';
        else if (status === 'in-window') cls += ' reminder-in-window';
        else if (status === 'due-today') cls += ' reminder-due';
        else if (status === 'scheduled' || status === 'window-upcoming') cls += ' scheduled';

        html += `<div class="${cls}" onclick="App.Detail.selectDay('${dateStr}')">${day}</div>`;
      }

      document.getElementById('detail-cal-grid').innerHTML = html;
    },

    _buildDayDetail(reminder, dateStr, rLogs, logs) {
      const today = U.today();
      const isPast = dateStr < today;
      const isToday = dateStr === today;
      let html = `<div class="cal-detail-date">${U.formatDisplay(dateStr)}</div>`;

      // Future dates — display only, no editing
      if (dateStr > today) {
        const status = U.getDayStatus(reminder, dateStr, rLogs, logs);
        if (status === 'window-upcoming') {
          html += '<div style="margin-bottom:12px;"><span class="card-badge badge-blue">Upcoming Window</span></div>';
        } else if (status === 'scheduled') {
          html += '<div style="margin-bottom:12px;"><span class="card-badge badge-blue">Scheduled</span></div>';
        } else {
          html += '<p class="text-muted" style="font-size:13px;">Not scheduled on this day.</p>';
        }
        return html;
      }

      // Past / today — always allow marking done regardless of whether it was in a window.
      const status = U.getDayStatus(reminder, dateStr, rLogs, logs);
      const doses = reminder.frequency === 'twice_daily' ? 2 : 1;

      for (let i = 0; i < doses; i++) {
        const done = U.isCompleted(reminder.id, dateStr, i, logs);
        const doseLabel = doses > 1 ? (i === 0 ? 'Morning dose' : 'Evening dose') : '';

        let badge;
        if (done) badge = '<span class="card-badge badge-green">Done</span>';
        else if (status === 'in-window' || status === 'due-today') badge = '<span class="card-badge badge-yellow">Pending</span>';
        else if (status === 'missed') badge = '<span class="card-badge badge-red">Missed</span>';
        else badge = ''; // off-schedule date

        html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:14px;font-weight:500;">${doseLabel || reminder.name}</span>
          ${badge}
        </div>`;

        if (status === 'off' && !done) {
          html += `<p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Outside scheduled window — logging here will advance the forward schedule from this date.</p>`;
        }

        html += `<button class="btn ${done ? 'btn-secondary' : 'btn-primary'} btn-sm"
          style="margin-bottom:12px;"
          onclick="App.Detail.toggleDay('${reminder.id}','${dateStr}',${i})">
          ${done ? 'Undo completion' : 'Mark as done'}
        </button>`;
      }

      return html;
    },

    async toggleDay(reminderId, date, doseIndex) {
      const done = U.isCompleted(reminderId, date, doseIndex, App._allLogs);
      if (done) await DB.deleteLog(reminderId, date, doseIndex);
      else await DB.logCompletion(reminderId, date, doseIndex, null);
      await App.refresh();
      const reminder = App._remindersCache.find(r => r.id === this._reminderId);
      const rLogs = App._allLogs.filter(l => l.reminder_id === this._reminderId);
      this._updateCalendar(reminder, rLogs, App._allLogs);
      const dayEl = document.getElementById('detail-day-info');
      if (dayEl && this._selectedDate) {
        dayEl.innerHTML = this._buildDayDetail(reminder, this._selectedDate, rLogs, App._allLogs);
      }
    },

    selectDay(dateStr) {
      this._selectedDate = this._selectedDate === dateStr ? null : dateStr;
      const reminder = (App._remindersCache || []).find(r => r.id === this._reminderId);
      if (!reminder) return;
      const rLogs = (App._allLogs || []).filter(l => l.reminder_id === this._reminderId);
      this._updateCalendar(reminder, rLogs, App._allLogs || []);
      const dayEl = document.getElementById('detail-day-info');
      if (dayEl) {
        dayEl.innerHTML = this._selectedDate
          ? this._buildDayDetail(reminder, this._selectedDate, rLogs, App._allLogs)
          : '';
      }
    },

    calPrev() {
      this._calDate.setMonth(this._calDate.getMonth() - 1);
      const reminder = (App._remindersCache || []).find(r => r.id === this._reminderId);
      if (reminder) {
        const rLogs = (App._allLogs || []).filter(l => l.reminder_id === this._reminderId);
        this._updateCalendar(reminder, rLogs, App._allLogs || []);
      }
    },

    calNext() {
      this._calDate.setMonth(this._calDate.getMonth() + 1);
      const reminder = (App._remindersCache || []).find(r => r.id === this._reminderId);
      if (reminder) {
        const rLogs = (App._allLogs || []).filter(l => l.reminder_id === this._reminderId);
        this._updateCalendar(reminder, rLogs, App._allLogs || []);
      }
    }
  },

  // ===== ADD / EDIT FORM =====
  // defaultType: 'scheduled' | 'standing' — used when opening from the Standing tab
  openAddModal(editId, defaultType) {
    const isEdit = !!editId;
    const r = isEdit ? (this._remindersCache || []).find(x => x.id === editId) : null;

    const type = r?.type || defaultType || 'scheduled';
    const isStanding = type === 'standing';
    const freq = r?.frequency || 'daily';
    const ci = r?.customInterval || {};
    const cc = r?.cycleConfig || {};
    const hasTime = !!r?.timeOfDay;

    const showScheduled = !isStanding ? 'block' : 'none';
    const showStanding  = isStanding  ? 'block' : 'none';
    const showCustomInterval = freq === 'custom' ? 'grid' : 'none';
    const showTime2 = freq === 'twice_daily' ? 'block' : 'none';
    const showFlexSection = (freq === 'once_weekly' || freq === 'custom') ? 'block' : 'none';
    const showWindowRow = r?.flexibleCycle ? 'block' : 'none';
    const showTimeInputs = hasTime ? 'grid' : 'none';

    const html = `
      <div class="form-group">
        <label class="form-label">Name</label>
        <input class="form-input" id="f-name" placeholder="e.g. Call a friend" value="${r?.name || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="f-desc" placeholder="Optional details...">${r?.description || ''}</textarea>
      </div>

      ${!isEdit ? `
      <div class="form-group">
        <label class="form-label">Type</label>
        <div class="checkbox-group" id="f-type-group">
          <div class="checkbox-option ${!isStanding?'selected':''}" onclick="App.onTypeChange('scheduled')" id="f-type-scheduled">Scheduled</div>
          <div class="checkbox-option ${isStanding?'selected':''}"  onclick="App.onTypeChange('standing')"  id="f-type-standing">Standing</div>
        </div>
        <input type="hidden" id="f-type" value="${type}">
      </div>` : `<input type="hidden" id="f-type" value="${type}">`}

      <!-- SCHEDULED FIELDS -->
      <div id="f-scheduled-fields" style="display:${showScheduled}">
        <div class="form-group">
          <label class="form-label">Frequency</label>
          <select class="form-select" id="f-freq" onchange="App.onFreqChange()">
            <option value="daily" ${freq==='daily'?'selected':''}>Daily</option>
            <option value="twice_daily" ${freq==='twice_daily'?'selected':''}>Twice Daily</option>
            <option value="once_weekly" ${freq==='once_weekly'?'selected':''}>Once Weekly</option>
            <option value="custom" ${freq==='custom'?'selected':''}>Custom (every X days/weeks)</option>
          </select>
        </div>
        <div id="f-custom-row" class="form-row" style="display:${showCustomInterval}">
          <div class="form-group">
            <label class="form-label">Every</label>
            <input class="form-input" id="f-interval-val" type="number" min="1" value="${ci.value || 1}">
          </div>
          <div class="form-group">
            <label class="form-label">Unit</label>
            <select class="form-select" id="f-interval-unit">
              <option value="days" ${ci.unit==='days'?'selected':''}>Days</option>
              <option value="weeks" ${ci.unit==='weeks'||!ci.unit?'selected':''}>Weeks</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Time of Day</label>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;color:var(--text-secondary);">
              <input type="checkbox" id="f-time-specific" ${hasTime?'checked':''} onchange="App.onTimeSpecificChange()">
              Specify time
            </label>
          </div>
          <div id="f-time-inputs" class="form-row" style="display:${showTimeInputs}">
            <div class="form-group" style="margin-bottom:0;">
              <input class="form-input" id="f-time" type="time" value="${r?.timeOfDay || '09:00'}">
            </div>
            <div class="form-group" id="f-time2-group" style="display:${showTime2};margin-bottom:0;">
              <label class="form-label">Second Time</label>
              <input class="form-input" id="f-time2" type="time" value="${r?.timeOfDay2 || '21:00'}">
            </div>
          </div>
        </div>
        <div id="f-flex-section" style="display:${showFlexSection}">
          <div class="form-group">
            <label class="form-label" style="margin-bottom:8px;">Flexible Window</label>
            <div style="display:flex;align-items:center;gap:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;">
              <div style="flex:1;">
                <div style="font-size:14px;font-weight:600;">Enable flexible window</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Complete anytime within a window of days per cycle</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="f-flex-cycle" ${r?.flexibleCycle?'checked':''} onchange="App.onFlexCycleChange()">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
          <div id="f-window-row" class="form-group" style="display:${showWindowRow}">
            <label class="form-label">Window Length (days)</label>
            <input class="form-input" id="f-window-days" type="number" min="1" max="30"
              value="${cc.windowDays || 3}" placeholder="e.g. 3">
            <p style="font-size:11px;color:var(--text-muted);margin-top:4px;">Days you have each cycle to complete this reminder</p>
          </div>
        </div>
        ${isEdit ? `
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="f-active">
            <option value="true" ${r?.active?'selected':''}>Active</option>
            <option value="false" ${!r?.active?'selected':''}>Paused</option>
          </select>
        </div>` : ''}
      </div>

      <!-- STANDING FIELDS -->
      <div id="f-standing-fields" style="display:${showStanding}">
        <div class="form-group">
          <label class="form-label">Importance</label>
          <select class="form-select" id="f-importance">
            <option value="critical" ${(r?.importance||'medium')==='critical'?'selected':''}>🔴 Critical</option>
            <option value="high"     ${(r?.importance||'medium')==='high'    ?'selected':''}>🟠 High</option>
            <option value="medium"   ${(r?.importance||'medium')==='medium'  ?'selected':''}>🔵 Medium</option>
            <option value="low"      ${(r?.importance||'medium')==='low'     ?'selected':''}>⚪ Low</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" style="margin-bottom:8px;">Show on Home Page</label>
          <div style="display:flex;align-items:center;gap:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;">
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:600;">Show on home page</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Appears in Today's Reminders on the home screen</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="f-show-home" ${r?.showOnHome !== false ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.saveReminder('${editId||''}')">${isEdit?'Update':'Add Reminder'}</button>
      </div>
      ${isEdit ? `<div class="form-actions mt-8">
        <button class="btn btn-danger btn-sm" onclick="App.deleteReminder('${editId}')">Delete Reminder</button>
      </div>` : ''}
    `;

    this.openModal(isEdit ? 'Edit Reminder' : 'New Reminder', html);
  },

  onTypeChange(type) {
    document.getElementById('f-type').value = type;
    document.getElementById('f-type-scheduled').classList.toggle('selected', type === 'scheduled');
    document.getElementById('f-type-standing').classList.toggle('selected', type === 'standing');
    document.getElementById('f-scheduled-fields').style.display = type === 'scheduled' ? 'block' : 'none';
    document.getElementById('f-standing-fields').style.display  = type === 'standing'  ? 'block' : 'none';
  },

  onTimeSpecificChange() {
    const checked = document.getElementById('f-time-specific').checked;
    document.getElementById('f-time-inputs').style.display = checked ? 'grid' : 'none';
  },

  onFreqChange() {
    const freq = document.getElementById('f-freq').value;
    document.getElementById('f-custom-row').style.display = freq === 'custom' ? 'grid' : 'none';
    const timeInputs = document.getElementById('f-time-inputs');
    const timeSpecific = document.getElementById('f-time-specific');
    if (timeInputs && timeSpecific?.checked) {
      const t2 = document.getElementById('f-time2-group');
      if (t2) t2.style.display = freq === 'twice_daily' ? 'block' : 'none';
    }
    const showFlex = freq === 'once_weekly' || freq === 'custom';
    document.getElementById('f-flex-section').style.display = showFlex ? 'block' : 'none';
    if (!showFlex) {
      const fc = document.getElementById('f-flex-cycle');
      if (fc) fc.checked = false;
      document.getElementById('f-window-row').style.display = 'none';
    }
  },

  onFlexCycleChange() {
    const checked = document.getElementById('f-flex-cycle').checked;
    document.getElementById('f-window-row').style.display = checked ? 'block' : 'none';
  },

  async saveReminder(editId) {
    const name = document.getElementById('f-name').value.trim();
    if (!name) { alert('Please enter a name.'); return; }

    const type = document.getElementById('f-type')?.value || 'scheduled';
    const description = document.getElementById('f-desc').value.trim();
    const existing = editId ? (this._remindersCache || []).find(r => r.id === editId) : null;

    let reminder;

    if (type === 'standing') {
      const importance = document.getElementById('f-importance')?.value || 'medium';
      const showOnHome = document.getElementById('f-show-home')?.checked !== false;
      reminder = {
        id: editId || U.id(),
        name, description: description || null,
        type: 'standing',
        frequency: 'standing', customInterval: null,
        timeOfDay: null, timeOfDay2: null,
        flexibleCycle: false, cycleConfig: null,
        importance, showOnHome,
        completedAt: existing?.completedAt || null,
        active: true,
        startDate: existing?.startDate || U.today()
      };
    } else {
      const freq = document.getElementById('f-freq').value;
      const timeSpecific = document.getElementById('f-time-specific')?.checked;
      const timeOfDay = timeSpecific ? (document.getElementById('f-time')?.value || null) : null;
      const timeOfDay2 = (timeSpecific && freq === 'twice_daily')
        ? (document.getElementById('f-time2')?.value || null)
        : null;

      let customInterval = null;
      if (freq === 'custom') {
        const val = parseInt(document.getElementById('f-interval-val')?.value) || 1;
        const unit = document.getElementById('f-interval-unit')?.value || 'days';
        customInterval = { value: val, unit };
      }

      const flexEl = document.getElementById('f-flex-cycle');
      const flexibleCycle = flexEl ? flexEl.checked : false;
      let cycleConfig = null;
      if (flexibleCycle && (freq === 'once_weekly' || freq === 'custom')) {
        const windowDays = parseInt(document.getElementById('f-window-days')?.value) || 3;
        if (freq === 'once_weekly') {
          cycleConfig = { intervalValue: 1, intervalUnit: 'weeks', windowDays };
        } else {
          const val = parseInt(document.getElementById('f-interval-val')?.value) || 1;
          const unit = document.getElementById('f-interval-unit')?.value || 'days';
          cycleConfig = { intervalValue: val, intervalUnit: unit, windowDays };
        }
      }

      const active = editId ? document.getElementById('f-active')?.value !== 'false' : true;
      reminder = {
        id: editId || U.id(),
        name, description: description || null,
        type: 'scheduled',
        frequency: freq, customInterval,
        timeOfDay, timeOfDay2,
        flexibleCycle, cycleConfig,
        importance: existing?.importance || 'medium',
        showOnHome: existing?.showOnHome !== false,
        completedAt: null,
        active,
        startDate: existing?.startDate || U.today()
      };
    }

    try {
      await DB.saveReminder(reminder);
      this.closeModal();
      await this.refresh();
      if (editId && this.currentTab === 'detail') {
        await this.Detail.show(editId);
      } else if (type === 'standing') {
        this.switchTab('standing');
      } else {
        this.switchTab('active');
      }
    } catch (e) {
      alert('Failed to save. Please try again.');
    }
  },

  async deleteReminder(id) {
    if (!confirm('Delete this reminder and all its history?')) return;
    await DB.deleteReminder(id);
    this.closeModal();
    await this.refresh();
    this.switchTab('active');
  }
};

// ===== INIT =====
App.init();
