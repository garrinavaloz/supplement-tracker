// ===== WORKOUT TRACKER =====
const W = {
  _splits: [], _days: [], _workouts: [], _exercises: [], _logs: [], _setLogs: [],
  currentView: 'today',
  currentSplitId: null, currentDayId: null, currentWorkoutId: null,
  currentLogId: null,
  historyExercise: null, historyPeriod: '1M', historyMode: 'set',
  historyCustomStart: '', historyCustomEnd: '',
  historyChart: null,
  consistencyDate: new Date(),
  consistencySelected: null,

  DAY_KEYS: ['sun','mon','tue','wed','thu','fri','sat'],
  DAY_LABELS: { sun:'Sunday', mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday', sat:'Saturday' },
  MUSCLE_GROUPS: ['Chest','Back','Shoulders','Biceps','Triceps','Forearms','Quads','Hamstrings','Glutes','Calves','Core','Cardio'],

  id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
  today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; },
  parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); },
  fmtDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; },
  formatDisplay(s) { return this.parseDate(s).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' }); },
  formatShort(s) { return this.parseDate(s).toLocaleDateString('en-US', { month:'short', day:'numeric' }); },

  escape(s) { return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); },

  // ===== DB =====
  DB: {
    async getSplits() {
      const { data, error } = await sb.from('workout_splits').select('*').order('created_at');
      if (error) { console.error('getSplits:', error); return []; }
      return (data || []).map(r => ({
        id: r.id, name: r.name, scheduleType: r.schedule_type,
        isActive: r.is_active, sequentialAnchorDate: r.sequential_anchor_date
      }));
    },
    async saveSplit(s) {
      const { error } = await sb.from('workout_splits').upsert({
        id: s.id, name: s.name, schedule_type: s.scheduleType,
        is_active: s.isActive, sequential_anchor_date: s.sequentialAnchorDate || null
      }, { onConflict: 'id' });
      if (error) { console.error('saveSplit:', error); throw error; }
    },
    async setActiveSplit(splitId) {
      await sb.from('workout_splits').update({ is_active: false }).neq('id', 'none');
      const { error } = await sb.from('workout_splits').update({ is_active: true }).eq('id', splitId);
      if (error) { console.error('setActiveSplit:', error); throw error; }
    },
    async deleteSplit(id) {
      const { error } = await sb.from('workout_splits').delete().eq('id', id);
      if (error) console.error('deleteSplit:', error);
    },
    async getDays() {
      const { data, error } = await sb.from('split_days').select('*').order('order_index');
      if (error) { console.error('getDays:', error); return []; }
      return (data || []).map(r => ({
        id: r.id, splitId: r.split_id, dayKey: r.day_key, name: r.name,
        orderIndex: r.order_index, isRest: r.is_rest
      }));
    },
    async saveDay(d) {
      const { error } = await sb.from('split_days').upsert({
        id: d.id, split_id: d.splitId, day_key: d.dayKey, name: d.name,
        order_index: d.orderIndex, is_rest: d.isRest
      }, { onConflict: 'id' });
      if (error) { console.error('saveDay:', error); throw error; }
    },
    async deleteDay(id) {
      const { error } = await sb.from('split_days').delete().eq('id', id);
      if (error) console.error('deleteDay:', error);
    },
    async deleteDaysForSplit(splitId) {
      await sb.from('split_days').delete().eq('split_id', splitId);
    },
    async getWorkouts() {
      const { data, error } = await sb.from('workouts').select('*').order('order_index');
      if (error) { console.error('getWorkouts:', error); return []; }
      return (data || []).map(r => ({
        id: r.id, splitDayId: r.split_day_id, name: r.name,
        muscleGroups: r.muscle_groups || [], timeOfDay: r.time_of_day,
        notes: r.notes, orderIndex: r.order_index, isTemplate: r.is_template
      }));
    },
    async saveWorkout(w) {
      const { error } = await sb.from('workouts').upsert({
        id: w.id, split_day_id: w.splitDayId || null, name: w.name,
        muscle_groups: w.muscleGroups || [], time_of_day: w.timeOfDay,
        notes: w.notes, order_index: w.orderIndex, is_template: w.isTemplate || false
      }, { onConflict: 'id' });
      if (error) { console.error('saveWorkout:', error); throw error; }
    },
    async deleteWorkout(id) {
      const { error } = await sb.from('workouts').delete().eq('id', id);
      if (error) console.error('deleteWorkout:', error);
    },
    async getExercises() {
      const { data, error } = await sb.from('workout_exercises').select('*').order('order_index');
      if (error) { console.error('getExercises:', error); return []; }
      return (data || []).map(r => ({
        id: r.id, workoutId: r.workout_id, name: r.name,
        sets: r.sets, reps: r.reps, weight: r.weight,
        isBodyweight: r.is_bodyweight, notes: r.notes,
        orderIndex: r.order_index, isTemplate: r.is_template,
        exerciseType: r.exercise_type || 'lift',
        cardioType: r.cardio_type || null,
        duration: r.duration || null,
        intensity: r.intensity || null
      }));
    },
    async saveExercise(e) {
      const { error } = await sb.from('workout_exercises').upsert({
        id: e.id, workout_id: e.workoutId || null, name: e.name,
        sets: e.sets, reps: e.reps, weight: e.weight || null,
        is_bodyweight: e.isBodyweight || false, notes: e.notes,
        order_index: e.orderIndex, is_template: e.isTemplate || false,
        exercise_type: e.exerciseType || 'lift',
        cardio_type: e.cardioType || null,
        duration: e.duration || null,
        intensity: e.intensity || null
      }, { onConflict: 'id' });
      if (error) { console.error('saveExercise:', error); throw error; }
    },
    async deleteExercise(id) {
      const { error } = await sb.from('workout_exercises').delete().eq('id', id);
      if (error) console.error('deleteExercise:', error);
    },
    async getLogs() {
      const { data, error } = await sb.from('workout_logs').select('*').order('date', { ascending: false });
      if (error) { console.error('getLogs:', error); return []; }
      return (data || []).map(r => ({
        id: r.id, date: r.date, splitId: r.split_id, splitDayId: r.split_day_id,
        workoutId: r.workout_id, workoutName: r.workout_name, notes: r.notes,
        startedAt: r.started_at, completedAt: r.completed_at
      }));
    },
    async saveLog(l) {
      const { error } = await sb.from('workout_logs').upsert({
        id: l.id, date: l.date, split_id: l.splitId || null,
        split_day_id: l.splitDayId || null, workout_id: l.workoutId || null,
        workout_name: l.workoutName, notes: l.notes,
        started_at: l.startedAt, completed_at: l.completedAt
      }, { onConflict: 'id' });
      if (error) { console.error('saveLog:', error); throw error; }
    },
    async deleteLog(id) {
      const { error } = await sb.from('workout_logs').delete().eq('id', id);
      if (error) console.error('deleteLog:', error);
    },
    async getSetLogs() {
      const { data, error } = await sb.from('set_logs').select('*').order('id');
      if (error) { console.error('getSetLogs:', error); return []; }
      return (data || []).map(r => ({
        id: r.id, workoutLogId: r.workout_log_id, exerciseId: r.exercise_id,
        exerciseName: r.exercise_name, exerciseOrder: r.exercise_order,
        setNumber: r.set_number, weight: r.weight, isBodyweight: r.is_bodyweight,
        reps: r.reps, notes: r.notes,
        exerciseType: r.exercise_type || 'lift',
        duration: r.duration || null,
        intensity: r.intensity || null
      }));
    },
    async saveSetLog(s) {
      const row = {
        workout_log_id: s.workoutLogId, exercise_id: s.exerciseId || null,
        exercise_name: s.exerciseName, exercise_order: s.exerciseOrder || 0,
        set_number: s.setNumber, weight: s.weight, is_bodyweight: s.isBodyweight || false,
        reps: s.reps, notes: s.notes,
        exercise_type: s.exerciseType || 'lift',
        duration: s.duration || null,
        intensity: s.intensity || null
      };
      let error;
      if (s.id) {
        ({ error } = await sb.from('set_logs').update(row).eq('id', s.id));
      } else {
        const { data, error: e } = await sb.from('set_logs').insert(row).select().single();
        error = e;
        if (data) return data.id;
      }
      if (error) { console.error('saveSetLog:', error); throw error; }
      return s.id;
    },
    async deleteSetLog(id) {
      const { error } = await sb.from('set_logs').delete().eq('id', id);
      if (error) console.error('deleteSetLog:', error);
    }
  },

  async refresh() {
    const [splits, days, workouts, exercises, logs, setLogs] = await Promise.all([
      this.DB.getSplits(), this.DB.getDays(), this.DB.getWorkouts(),
      this.DB.getExercises(), this.DB.getLogs(), this.DB.getSetLogs()
    ]);
    this._splits = splits; this._days = days; this._workouts = workouts;
    this._exercises = exercises; this._logs = logs; this._setLogs = setLogs;
  },

  async init() {
    await this.refresh();
    this.switchView('today');
  },

  switchView(view, opts = {}) {
    this.currentView = view;
    document.querySelectorAll('.workout-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.wtab === view)
    );
    if (view === 'today') this.Today.render();
    else if (view === 'splits') this.Splits.render();
    else if (view === 'splitDetail') this.SplitDetail.render();
    else if (view === 'dayDetail') this.DayDetail.render();
    else if (view === 'workoutDetail') this.WorkoutDetail.render();
    else if (view === 'track') this.Track.render();
    else if (view === 'history') this.History.render();
    else if (view === 'consistency') this.Consistency.render();
  },

  // ===== MODAL =====
  openModal(title, body) {
    let overlay = document.getElementById('w-modal-overlay');
    let modal = document.getElementById('w-modal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'w-modal-overlay';
      overlay.className = 'modal-overlay';
      overlay.onclick = () => W.closeModal();
      document.body.appendChild(overlay);
      modal = document.createElement('div');
      modal.id = 'w-modal';
      modal.className = 'modal';
      modal.innerHTML = `<div class="modal-header"><h3 id="w-modal-title"></h3><button class="btn-icon modal-close" onclick="W.closeModal()">&times;</button></div><div id="w-modal-body" class="modal-body"></div>`;
      document.body.appendChild(modal);
    }
    document.getElementById('w-modal-title').textContent = title;
    document.getElementById('w-modal-body').innerHTML = body;
    overlay.classList.add('active');
    modal.classList.add('active');
  },
  closeModal() {
    document.getElementById('w-modal-overlay')?.classList.remove('active');
    document.getElementById('w-modal')?.classList.remove('active');
  },

  // ===== SCHEDULE HELPERS =====
  activeSplit() { return this._splits.find(s => s.isActive); },

  daysForSplit(splitId) {
    return this._days.filter(d => d.splitId === splitId).sort((a, b) => a.orderIndex - b.orderIndex);
  },

  workoutsForDay(dayId) {
    return this._workouts.filter(w => w.splitDayId === dayId).sort((a, b) => a.orderIndex - b.orderIndex);
  },

  exercisesForWorkout(workoutId) {
    return this._exercises.filter(e => e.workoutId === workoutId).sort((a, b) => a.orderIndex - b.orderIndex);
  },

  // Get split day scheduled for a given date
  dayForDate(dateStr) {
    const split = this.activeSplit();
    if (!split) return null;
    const days = this.daysForSplit(split.id);
    if (!days.length) return null;
    if (split.scheduleType === 'days_of_week') {
      const dow = this.parseDate(dateStr).getDay();
      const key = this.DAY_KEYS[dow];
      return days.find(d => d.dayKey === key) || null;
    } else {
      // sequential
      if (!split.sequentialAnchorDate) return null;
      const diff = Math.floor((this.parseDate(dateStr) - this.parseDate(split.sequentialAnchorDate)) / 86400000);
      if (diff < 0) return null;
      const pos = diff % days.length;
      return days[pos];
    }
  },

  // ===== TODAY VIEW =====
  Today: {
    render() {
      const el = document.getElementById('view-wt-content');
      const today = W.today();
      const split = W.activeSplit();

      let html = '';

      if (!split) {
        html = `
          <div class="empty-state" style="padding:32px 20px;text-align:center;">
            <p style="font-size:15px;margin-bottom:16px;">No active split set.</p>
            <button class="btn btn-primary" onclick="W.switchView('splits')">Go to Splits</button>
          </div>`;
        el.innerHTML = html;
        return;
      }

      const day = W.dayForDate(today);

      // Header
      html += `<div style="padding:16px 20px 0;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div>
            <div class="fitness-section-label" style="margin-bottom:2px;">TODAY</div>
            <div style="font-size:15px;font-weight:600;">${new Date().toLocaleDateString('en-US',{weekday:'long', month:'long', day:'numeric'})}</div>
          </div>
          <span class="card-badge badge-blue">${W.escape(split.name)}</span>
        </div>
      </div>`;

      if (!day) {
        html += `<div style="padding:0 20px;"><div class="empty-state" style="padding:24px 0;"><p>No scheduled day for today.</p></div></div>`;
        el.innerHTML = html;
        return;
      }

      if (day.isRest) {
        html += `<div style="padding:0 20px;">
          <div class="workout-rest-card">
            <div style="font-size:28px;">🛌</div>
            <div style="font-size:18px;font-weight:700;margin-top:4px;">Rest Day</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">${W.escape(day.name)}</div>
          </div>
        </div>`;
        el.innerHTML = html;
        return;
      }

      const workouts = W.workoutsForDay(day.id);
      const todaysLogs = W._logs.filter(l => l.date === today);

      html += `<div style="padding:0 20px;">
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">Scheduled: <strong style="color:var(--text);">${W.escape(day.name)}</strong></div>`;

      if (!workouts.length) {
        html += `<div class="empty-state" style="padding:16px 0;">
          <p style="font-size:13px;margin-bottom:12px;">No exercises set up for this day.</p>
          <button class="btn btn-secondary btn-sm" onclick="W.DayWorkout.open('${day.id}')">Set up exercises</button>
        </div>`;
      } else {
        for (const w of workouts) {
          const log = todaysLogs.find(l => l.workoutId === w.id);
          const completed = !!log?.completedAt;
          const inProgress = log && !log.completedAt;
          const exs = W.exercisesForWorkout(w.id);
          const muscleBadges = (w.muscleGroups||[]).slice(0,3).map(m => `<span class="w-muscle-chip">${W.escape(m)}</span>`).join('');
          const statusBadge = completed ? `<span class="card-badge badge-green">✓ Done</span>`
            : inProgress ? `<span class="card-badge badge-yellow">In Progress</span>` : '';

          html += `<div class="workout-today-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
              <div style="flex:1;">
                <div style="font-size:17px;font-weight:700;">${W.escape(w.name)}</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">
                  ${exs.length} exercise${exs.length===1?'':'s'}${w.timeOfDay ? ' · ' + W.escape(w.timeOfDay) : ''}
                </div>
                ${muscleBadges ? `<div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;">${muscleBadges}</div>` : ''}
              </div>
              ${statusBadge}
            </div>
            <div style="display:flex;gap:8px;margin-top:12px;">
              ${completed
                ? `<button class="btn btn-secondary btn-sm" style="flex:1;" onclick="W.Track.open('${log.id}')">View Workout</button>`
                : inProgress
                  ? `<button class="btn btn-primary btn-sm" style="flex:1;" onclick="W.Track.open('${log.id}')">Continue</button>`
                  : `<button class="btn btn-primary btn-sm" style="flex:1;" onclick="W.Track.start('${w.id}')">Start Workout</button>`}
              <button class="btn btn-secondary btn-sm" onclick="W.WorkoutDetail.show('${w.id}')">Details</button>
            </div>
          </div>`;
        }
      }

      html += `</div>`;
      el.innerHTML = html;
    }
  },

  // ===== SPLITS LIST =====
  Splits: {
    render() {
      const el = document.getElementById('view-wt-content');
      let html = `<div style="padding:16px 20px;">
        <div class="view-header">
          <h2>Splits</h2>
          <button class="btn btn-primary btn-sm" onclick="W.Splits.openAddModal()">+ Add Split</button>
        </div>`;

      if (!W._splits.length) {
        html += `<div class="empty-state" style="padding:32px 0;">
          <p style="font-size:15px;margin-bottom:16px;">No splits yet.</p>
          <button class="btn btn-primary" onclick="W.Splits.openAddModal()">+ Create Your First Split</button>
        </div>`;
      } else {
        for (const s of W._splits) {
          const days = W.daysForSplit(s.id);
          const active = s.isActive;
          const schedType = s.scheduleType === 'days_of_week' ? 'Days of week' : `${days.length}-day sequential`;
          html += `<div class="card workout-split-card${active?' active':''}" onclick="W.Splits.show('${s.id}')">
            <div class="card-header">
              <span class="card-title">${W.escape(s.name)}</span>
              ${active ? `<span class="card-badge badge-green">Active</span>` : ''}
            </div>
            <div class="card-subtitle">${schedType} · ${days.length} day${days.length===1?'':'s'}</div>
            <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
              ${days.slice(0, 7).map(d => `<span class="w-day-chip${d.isRest?' rest':''}">${W.escape(d.name)}</span>`).join('')}
            </div>
          </div>`;
        }
      }

      html += `</div>`;
      el.innerHTML = html;
    },

    show(splitId) {
      W.currentSplitId = splitId;
      W.switchView('splitDetail');
    },

    openAddModal(editId) {
      const isEdit = !!editId;
      const s = isEdit ? W._splits.find(x => x.id === editId) : null;
      const scheduleType = s?.scheduleType || 'days_of_week';
      const existingDays = isEdit ? W.daysForSplit(editId) : [];

      // For days_of_week: show 7 day rows. For sequential: list of days the user defines.
      const html = `
        <div class="form-group">
          <label class="form-label">Split Name</label>
          <input class="form-input" id="sp-name" placeholder="e.g., Push Pull Legs" value="${W.escape(s?.name || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Schedule Type</label>
          <div class="checkbox-group">
            <div class="checkbox-option ${scheduleType==='days_of_week'?'selected':''}" id="sp-type-dow" onclick="W.Splits.onTypeChange('days_of_week')">Days of Week</div>
            <div class="checkbox-option ${scheduleType==='sequential'?'selected':''}" id="sp-type-seq" onclick="W.Splits.onTypeChange('sequential')">Sequential</div>
          </div>
          <p style="font-size:11px;color:var(--text-muted);margin-top:6px;">
            Days of Week: each day of the week is assigned a workout.<br>
            Sequential: N-day cycle repeating regardless of weekday.
          </p>
        </div>
        <div id="sp-schedule-wrap"></div>
        <div class="form-group">
          <div style="display:flex;align-items:center;gap:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;">
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:600;">Set as Active</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">This split drives today's workout.</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="sp-active" ${s?.isActive?'checked':''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" onclick="W.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="W.Splits.save('${editId||''}')">${isEdit?'Update':'Create Split'}</button>
        </div>
        ${isEdit?`<div class="form-actions mt-8"><button class="btn btn-danger btn-sm" onclick="W.Splits.remove('${editId}')">Delete Split</button></div>`:''}
      `;

      W.openModal(isEdit ? 'Edit Split' : 'New Split', html);

      // seed schedule input
      W.Splits._editingDays = existingDays.map(d => ({
        id: d.id, name: d.name, dayKey: d.dayKey, isRest: d.isRest, orderIndex: d.orderIndex
      }));
      W.Splits._renderSchedule(scheduleType);
    },

    _editingDays: [],

    onTypeChange(type) {
      document.getElementById('sp-type-dow').classList.toggle('selected', type === 'days_of_week');
      document.getElementById('sp-type-seq').classList.toggle('selected', type === 'sequential');
      W.Splits._renderSchedule(type);
    },

    _renderSchedule(type) {
      const wrap = document.getElementById('sp-schedule-wrap');
      if (!wrap) return;

      if (type === 'days_of_week') {
        // Show 7 rows, one per day
        const byKey = {};
        W.Splits._editingDays.forEach(d => { byKey[d.dayKey] = d; });
        let html = `<div class="form-group"><label class="form-label">Days</label>`;
        W.DAY_KEYS.forEach((key, i) => {
          const existing = byKey[key];
          const name = existing?.name || '';
          const rest = existing?.isRest || false;
          html += `<div class="w-sched-row">
            <div class="w-sched-day-label">${W.DAY_LABELS[key].slice(0,3)}</div>
            <input class="form-input w-sched-name" data-daykey="${key}" placeholder="Workout name (e.g., Push)" value="${W.escape(name)}" style="flex:1;">
            <label class="w-sched-rest">
              <input type="checkbox" data-daykey="${key}" ${rest?'checked':''}> Rest
            </label>
          </div>`;
        });
        html += `</div>`;
        wrap.innerHTML = html;
      } else {
        // sequential - list of days
        let html = `<div class="form-group">
          <label class="form-label">Sequential Days (in order)</label>
          <div id="sp-seq-list"></div>
          <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="W.Splits._addSeqDay()">+ Add Day</button>
          <p style="font-size:11px;color:var(--text-muted);margin-top:6px;">The cycle repeats from the top after the last day.</p>
        </div>
        <div class="form-group">
          <label class="form-label">Cycle Start Date</label>
          <input class="form-input" type="date" id="sp-anchor" value="${W.today()}">
          <p style="font-size:11px;color:var(--text-muted);margin-top:4px;">Day 1 begins on this date.</p>
        </div>`;
        wrap.innerHTML = html;
        W.Splits._renderSeqList();
      }
    },

    _addSeqDay() {
      W.Splits._editingDays.push({ id: W.id(), name: '', dayKey: String(W.Splits._editingDays.length), isRest: false, orderIndex: W.Splits._editingDays.length });
      W.Splits._renderSeqList();
    },

    _removeSeqDay(idx) {
      W.Splits._editingDays.splice(idx, 1);
      W.Splits._editingDays.forEach((d, i) => { d.orderIndex = i; d.dayKey = String(i); });
      W.Splits._renderSeqList();
    },

    _moveSeqDay(idx, dir) {
      const target = idx + dir;
      if (target < 0 || target >= W.Splits._editingDays.length) return;
      const arr = W.Splits._editingDays;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      arr.forEach((d, i) => { d.orderIndex = i; d.dayKey = String(i); });
      W.Splits._renderSeqList();
    },

    _renderSeqList() {
      const list = document.getElementById('sp-seq-list');
      if (!list) return;
      if (!W.Splits._editingDays.length) {
        list.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No days yet. Click "Add Day".</p>`;
        return;
      }
      list.innerHTML = W.Splits._editingDays.map((d, i) => `
        <div class="w-sched-row" data-idx="${i}">
          <div class="w-sched-day-label">${i+1}</div>
          <input class="form-input w-sched-name" data-idx="${i}" placeholder="Day name (e.g., Push)" value="${W.escape(d.name)}" style="flex:1;">
          <label class="w-sched-rest">
            <input type="checkbox" data-idx="${i}" ${d.isRest?'checked':''}> Rest
          </label>
          <button class="btn-icon btn-sm" onclick="W.Splits._moveSeqDay(${i},-1)" title="Up" style="font-size:14px;">▲</button>
          <button class="btn-icon btn-sm" onclick="W.Splits._moveSeqDay(${i},1)" title="Down" style="font-size:14px;">▼</button>
          <button class="btn-icon btn-sm" onclick="W.Splits._removeSeqDay(${i})" style="color:var(--danger);">×</button>
        </div>
      `).join('');
    },

    async save(editId) {
      const name = document.getElementById('sp-name').value.trim();
      if (!name) { alert('Enter a split name.'); return; }

      const scheduleType = document.getElementById('sp-type-dow').classList.contains('selected') ? 'days_of_week' : 'sequential';
      const isActive = document.getElementById('sp-active').checked;
      let anchorDate = null;

      // Build days from UI state
      let days = [];
      if (scheduleType === 'days_of_week') {
        const nameInputs = document.querySelectorAll('.w-sched-name[data-daykey]');
        const restInputs = document.querySelectorAll('input[type=checkbox][data-daykey]');
        const existingByKey = {};
        W.Splits._editingDays.forEach(d => { existingByKey[d.dayKey] = d; });
        nameInputs.forEach((inp, i) => {
          const dayKey = inp.dataset.daykey;
          const dayName = inp.value.trim();
          const rest = Array.from(restInputs).find(r => r.dataset.daykey === dayKey)?.checked || false;
          if (!dayName && !rest) return; // skip empty days
          const existing = existingByKey[dayKey];
          days.push({
            id: existing?.id || W.id(),
            dayKey, name: dayName || 'Rest',
            orderIndex: W.DAY_KEYS.indexOf(dayKey),
            isRest: rest
          });
        });
      } else {
        // sequential: read from editing state, pulling updated names/rest
        anchorDate = document.getElementById('sp-anchor')?.value || W.today();
        const nameInputs = document.querySelectorAll('#sp-seq-list .w-sched-name');
        const restInputs = document.querySelectorAll('#sp-seq-list input[type=checkbox]');
        nameInputs.forEach((inp, i) => {
          const idx = Number(inp.dataset.idx);
          const d = W.Splits._editingDays[idx];
          if (!d) return;
          d.name = inp.value.trim() || (d.isRest ? 'Rest' : 'Day '+(idx+1));
          d.isRest = restInputs[idx]?.checked || false;
          days.push({ ...d, orderIndex: idx, dayKey: String(idx) });
        });
      }

      if (!days.length) { alert('Add at least one day.'); return; }

      const splitId = editId || W.id();
      const split = {
        id: splitId, name, scheduleType, isActive,
        sequentialAnchorDate: scheduleType === 'sequential' ? anchorDate : null
      };

      try {
        await W.DB.saveSplit(split);
        // Delete old days and re-save (simpler than diffing)
        await W.DB.deleteDaysForSplit(splitId);
        for (const d of days) await W.DB.saveDay({ ...d, splitId });
        if (isActive) await W.DB.setActiveSplit(splitId);
        W.closeModal();
        await W.refresh();
        if (editId) W.switchView('splitDetail');
        else W.switchView('splits');
      } catch (e) {
        alert('Failed to save split.');
      }
    },

    async remove(id) {
      if (!confirm('Delete this split and all its days/workouts? (Workout logs will be preserved.)')) return;
      await W.DB.deleteSplit(id);
      W.closeModal();
      await W.refresh();
      W.switchView('splits');
    },

    async toggleActive(splitId) {
      const split = W._splits.find(s => s.id === splitId);
      if (!split) return;
      if (split.isActive) {
        await W.DB.saveSplit({ ...split, isActive: false });
      } else {
        await W.DB.setActiveSplit(splitId);
      }
      await W.refresh();
      W.switchView(W.currentView);
    }
  },

  // ===== SPLIT DETAIL =====
  SplitDetail: {
    render() {
      const el = document.getElementById('view-wt-content');
      const split = W._splits.find(s => s.id === W.currentSplitId);
      if (!split) { W.switchView('splits'); return; }
      const days = W.daysForSplit(split.id);

      let html = `<div style="padding:16px 20px;">
        <button class="btn-back" onclick="W.switchView('splits')">&#8249; Back to Splits</button>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;">
          <div>
            <h2 style="font-size:22px;font-weight:700;">${W.escape(split.name)}</h2>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${split.scheduleType === 'days_of_week' ? 'Days of Week' : `${days.length}-day sequential`}${split.sequentialAnchorDate ? ' · starts ' + W.formatShort(split.sequentialAnchorDate) : ''}</div>
          </div>
          ${split.isActive ? `<span class="card-badge badge-green">Active</span>` : `<button class="btn btn-secondary btn-sm" onclick="W.Splits.toggleActive('${split.id}')">Set Active</button>`}
        </div>
        <div style="display:flex;gap:8px;margin-bottom:20px;">
          <button class="btn btn-secondary btn-sm" onclick="W.Splits.openAddModal('${split.id}')">Edit Split</button>
        </div>`;

      if (!days.length) {
        html += `<div class="empty-state" style="padding:24px 0;"><p>No days configured.</p></div>`;
      } else {
        html += `<div class="fitness-section-label">SPLIT DAYS</div>`;
        for (const d of days) {
          const workout = W._workouts.find(w => w.splitDayId === d.id);
          const exCount = workout ? W.exercisesForWorkout(workout.id).length : 0;
          const muscleBadges = workout ? (workout.muscleGroups||[]).slice(0,3).map(m => `<span class="w-muscle-chip">${W.escape(m)}</span>`).join('') : '';
          const wLabel = split.scheduleType === 'days_of_week' ? W.DAY_LABELS[d.dayKey] : `Day ${d.orderIndex + 1}`;
          html += `<div class="card" onclick="${d.isRest ? '' : `W.DayWorkout.open('${d.id}')`}" style="${d.isRest ? '' : 'cursor:pointer;'}">
            <div class="card-header">
              <span class="card-title">${W.escape(d.name)}</span>
              ${d.isRest ? `<span class="card-badge" style="background:rgba(100,116,139,0.15);color:var(--text-muted);">Rest</span>` : `<span class="card-badge badge-blue">${exCount} exercise${exCount===1?'':'s'}</span>`}
            </div>
            <div class="card-subtitle">${wLabel}</div>
            ${muscleBadges ? `<div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;">${muscleBadges}</div>` : ''}
          </div>`;
        }
      }

      html += `</div>`;
      el.innerHTML = html;
    }
  },

  // ===== DAY DETAIL =====
  DayDetail: {
    show(dayId) {
      W.currentDayId = dayId;
      W.switchView('dayDetail');
    },
    async openFromToday(dayId) {
      W.currentDayId = dayId;
      W.currentSplitId = W._days.find(d => d.id === dayId)?.splitId || null;
      W.switchView('dayDetail');
    },
    render() {
      const el = document.getElementById('view-wt-content');
      const day = W._days.find(d => d.id === W.currentDayId);
      if (!day) { W.switchView('splits'); return; }
      const split = W._splits.find(s => s.id === day.splitId);
      const workouts = W.workoutsForDay(day.id);

      const wLabel = split?.scheduleType === 'days_of_week' ? W.DAY_LABELS[day.dayKey] : `Day ${day.orderIndex + 1}`;

      let html = `<div style="padding:16px 20px;">
        <button class="btn-back" onclick="W.currentSplitId='${split?.id||''}';W.switchView('splitDetail')">&#8249; Back</button>
        <div style="margin-bottom:16px;">
          <h2 style="font-size:22px;font-weight:700;">${W.escape(day.name)}</h2>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${W.escape(split?.name||'')} · ${wLabel}${day.isRest ? ' · Rest day' : ''}</div>
        </div>`;

      if (!day.isRest) {
        html += `<div class="view-header">
          <h3 style="font-size:15px;">Workouts</h3>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="W.Workout.openTemplatePicker('${day.id}')">From Template</button>
            <button class="btn btn-primary btn-sm" onclick="W.Workout.openAddModal('${day.id}')">+ Add</button>
          </div>
        </div>`;

        if (!workouts.length) {
          html += `<div class="empty-state" style="padding:24px 0;"><p style="font-size:13px;margin-bottom:12px;">No workouts yet.</p></div>`;
        } else {
          for (const w of workouts) {
            const exs = W.exercisesForWorkout(w.id);
            const muscleBadges = (w.muscleGroups||[]).map(m => `<span class="w-muscle-chip">${W.escape(m)}</span>`).join('');
            html += `<div class="card" onclick="W.WorkoutDetail.show('${w.id}')" style="cursor:pointer;">
              <div class="card-header">
                <span class="card-title">${w.orderIndex+1}. ${W.escape(w.name)}</span>
                <span class="card-badge badge-blue">${exs.length} ex</span>
              </div>
              <div class="card-subtitle">${w.timeOfDay ? W.escape(w.timeOfDay) : 'Anytime'}${w.notes ? ' · ' + W.escape(w.notes.slice(0, 40)) + (w.notes.length>40?'…':'') : ''}</div>
              ${muscleBadges ? `<div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;">${muscleBadges}</div>` : ''}
            </div>`;
          }
        }
      } else {
        html += `<div class="workout-rest-card"><div style="font-size:28px;">🛌</div><div style="font-size:16px;font-weight:700;margin-top:4px;">Rest Day</div></div>`;
      }

      html += `</div>`;
      el.innerHTML = html;
    }
  },

  // ===== DAY → WORKOUT BRIDGE =====
  DayWorkout: {
    async open(dayId) {
      const day = W._days.find(d => d.id === dayId);
      if (!day) return;
      W.currentDayId = dayId;
      W.currentSplitId = day.splitId;
      let workout = W._workouts.find(w => w.splitDayId === dayId);
      if (!workout) {
        const id = W.id();
        await W.DB.saveWorkout({
          id, splitDayId: dayId, name: day.name,
          muscleGroups: [], timeOfDay: null, notes: null,
          orderIndex: 0, isTemplate: false
        });
        await W.refresh();
        workout = W._workouts.find(w => w.id === id);
      }
      W.currentWorkoutId = workout.id;
      W.switchView('workoutDetail');
    }
  },

  // ===== WORKOUT BUILDER =====
  Workout: {
    openAddModal(splitDayId, editId) {
      const isEdit = !!editId;
      const w = isEdit ? W._workouts.find(x => x.id === editId) : null;
      const workoutsInDay = W.workoutsForDay(splitDayId);
      const currentOrderIdx = w ? w.orderIndex : workoutsInDay.length;
      const maxOrder = isEdit ? workoutsInDay.length : workoutsInDay.length + 1;

      let orderOpts = '';
      for (let i = 0; i < maxOrder; i++) {
        orderOpts += `<option value="${i}" ${currentOrderIdx===i?'selected':''}>${i+1}</option>`;
      }

      const muscleChips = W.MUSCLE_GROUPS.map(m => {
        const on = w?.muscleGroups?.includes(m);
        return `<div class="checkbox-option w-mg-chip ${on?'selected':''}" data-mg="${m}" onclick="W.Workout._toggleMG(this)">${m}</div>`;
      }).join('');

      const html = `
        <div class="form-group">
          <label class="form-label">Workout Name</label>
          <input class="form-input" id="w-name" placeholder="e.g., Chest & Triceps" value="${W.escape(w?.name || '')}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Order</label>
            <select class="form-select" id="w-order">${orderOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Time of Day</label>
            <input class="form-input" id="w-time" placeholder="e.g., Morning, 6pm" value="${W.escape(w?.timeOfDay || '')}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Target Muscle Groups</label>
          <div class="checkbox-group" style="flex-wrap:wrap;">${muscleChips}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-textarea" id="w-notes" placeholder="Any additional notes...">${W.escape(w?.notes || '')}</textarea>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" onclick="W.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="W.Workout.save('${splitDayId}','${editId||''}')">${isEdit?'Update':'Create Workout'}</button>
        </div>
        ${isEdit?`<div class="form-actions mt-8"><button class="btn btn-danger btn-sm" onclick="W.Workout.remove('${editId}','${splitDayId}')">Delete Workout</button></div>`:''}
      `;
      W.openModal(isEdit ? 'Edit Workout' : 'New Workout', html);
    },

    _toggleMG(el) {
      el.classList.toggle('selected');
    },

    async save(splitDayId, editId) {
      const name = document.getElementById('w-name').value.trim();
      if (!name) { alert('Enter a workout name.'); return; }

      const orderIndex = parseInt(document.getElementById('w-order').value);
      const timeOfDay = document.getElementById('w-time').value.trim() || null;
      const notes = document.getElementById('w-notes').value.trim() || null;
      const muscleGroups = Array.from(document.querySelectorAll('.w-mg-chip.selected')).map(el => el.dataset.mg);

      const id = editId || W.id();
      const existing = W._workouts.find(x => x.id === editId);
      const prevOrder = existing?.orderIndex;

      try {
        await W.DB.saveWorkout({
          id, splitDayId, name, muscleGroups, timeOfDay, notes, orderIndex, isTemplate: false
        });

        // Reorder siblings if order changed
        if (editId && prevOrder !== orderIndex) {
          await W.Workout._reorderSiblings(splitDayId, id, prevOrder, orderIndex);
        } else if (!editId) {
          // new workout inserted at orderIndex - bump siblings at >= orderIndex
          const siblings = W._workouts.filter(x => x.splitDayId === splitDayId && x.id !== id && x.orderIndex >= orderIndex);
          for (const s of siblings) {
            await W.DB.saveWorkout({ ...s, orderIndex: s.orderIndex + 1 });
          }
        }

        W.closeModal();
        await W.refresh();
        W.switchView('workoutDetail');
      } catch (e) { alert('Failed to save workout.'); }
    },

    async _reorderSiblings(splitDayId, movingId, oldIdx, newIdx) {
      const all = W._workouts.filter(x => x.splitDayId === splitDayId && x.id !== movingId)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      // Remove moving, then insert at newIdx
      const reordered = [...all];
      // Build new order: reordered with moving at newIdx
      const result = [];
      let placed = false;
      for (let i = 0; i < reordered.length + 1; i++) {
        if (i === newIdx) { placed = true; continue; }
        const src = reordered[placed ? i - 1 : i];
        if (src) result.push(src);
      }
      // Now save siblings with new indices
      for (let i = 0; i < result.length; i++) {
        const expected = i >= newIdx ? i + 1 : i;
        if (result[i].orderIndex !== expected) {
          await W.DB.saveWorkout({ ...result[i], orderIndex: expected });
        }
      }
    },

    async remove(id, splitDayId) {
      if (!confirm('Delete this workout and all its exercises? (Logs preserved.)')) return;
      await W.DB.deleteWorkout(id);
      W.closeModal();
      await W.refresh();
      const day = W._days.find(d => d.id === splitDayId);
      if (day) W.currentSplitId = day.splitId;
      W.switchView('splitDetail');
    },

    openTemplatePicker(splitDayId) {
      // Show list of existing workouts across all days; copy selected one to this day
      const all = W._workouts.filter(w => w.splitDayId); // any non-null day
      const unique = [];
      const seen = new Set();
      for (const w of all) {
        const key = w.name + '|' + (w.muscleGroups||[]).join(',');
        if (!seen.has(key)) { seen.add(key); unique.push(w); }
      }

      if (!unique.length) {
        W.openModal('Templates', `<p>No workouts exist yet to use as templates.</p>
          <div class="form-actions"><button class="btn btn-primary" onclick="W.closeModal()">OK</button></div>`);
        return;
      }

      const items = unique.map(w => {
        const exs = W.exercisesForWorkout(w.id);
        return `<div class="card" onclick="W.Workout._applyTemplate('${w.id}','${splitDayId}')" style="cursor:pointer;">
          <div class="card-header"><span class="card-title">${W.escape(w.name)}</span><span class="card-badge badge-blue">${exs.length} ex</span></div>
          <div class="card-subtitle">${(w.muscleGroups||[]).join(', ') || '—'}</div>
        </div>`;
      }).join('');

      W.openModal('Copy from Template', `<p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Select a workout to copy into this day:</p>${items}`);
    },

    async _applyTemplate(sourceWorkoutId, targetDayId) {
      const src = W._workouts.find(w => w.id === sourceWorkoutId);
      if (!src) return;
      const newWorkoutId = W.id();
      const siblings = W.workoutsForDay(targetDayId);
      try {
        await W.DB.saveWorkout({
          id: newWorkoutId, splitDayId: targetDayId, name: src.name,
          muscleGroups: [...(src.muscleGroups||[])], timeOfDay: src.timeOfDay,
          notes: src.notes, orderIndex: siblings.length, isTemplate: false
        });
        // Copy exercises
        const srcExs = W.exercisesForWorkout(sourceWorkoutId);
        for (let i = 0; i < srcExs.length; i++) {
          const e = srcExs[i];
          await W.DB.saveExercise({
            id: W.id(), workoutId: newWorkoutId, name: e.name,
            sets: e.sets, reps: e.reps, weight: e.weight,
            isBodyweight: e.isBodyweight, notes: e.notes,
            orderIndex: i, isTemplate: false
          });
        }
        W.closeModal();
        await W.refresh();
        W.currentWorkoutId = newWorkoutId;
        W.switchView('workoutDetail');
      } catch (e) { alert('Failed to copy template.'); }
    }
  },

  // ===== WORKOUT DETAIL =====
  WorkoutDetail: {
    show(workoutId) {
      W.currentWorkoutId = workoutId;
      const w = W._workouts.find(x => x.id === workoutId);
      if (w) {
        W.currentDayId = w.splitDayId;
        const day = W._days.find(d => d.id === w.splitDayId);
        if (day) W.currentSplitId = day.splitId;
      }
      W.switchView('workoutDetail');
    },
    goBack() {
      const workout = W._workouts.find(w => w.id === W.currentWorkoutId);
      if (workout) {
        const day = W._days.find(d => d.id === workout.splitDayId);
        if (day) W.currentSplitId = day.splitId;
      }
      W.switchView('splitDetail');
    },
    render() {
      const el = document.getElementById('view-wt-content');
      const workout = W._workouts.find(w => w.id === W.currentWorkoutId);
      if (!workout) { W.switchView('splits'); return; }
      const exs = W.exercisesForWorkout(workout.id);
      const day = W._days.find(d => d.id === workout.splitDayId);
      const split = day ? W._splits.find(s => s.id === day.splitId) : null;
      const muscleBadges = (workout.muscleGroups||[]).map(m => `<span class="w-muscle-chip">${W.escape(m)}</span>`).join('');

      let html = `<div style="padding:16px 20px;">
        <button class="btn-back" onclick="W.WorkoutDetail.goBack()">&#8249; Back</button>
        <div style="margin-bottom:12px;">
          <h2 style="font-size:22px;font-weight:700;">${W.escape(workout.name)}</h2>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${split ? W.escape(split.name) + ' · ' : ''}${workout.timeOfDay ? W.escape(workout.timeOfDay) + ' · ' : ''}${exs.length} exercise${exs.length===1?'':'s'}</div>
          ${muscleBadges ? `<div style="margin-top:10px;display:flex;gap:4px;flex-wrap:wrap;">${muscleBadges}</div>` : ''}
          ${workout.notes ? `<p style="font-size:13px;color:var(--text-secondary);margin-top:10px;">${W.escape(workout.notes)}</p>` : ''}
        </div>
        <div style="display:flex;gap:8px;margin-bottom:20px;">
          <button class="btn btn-secondary btn-sm" onclick="W.Workout.openAddModal('${workout.splitDayId}','${workout.id}')">Edit Workout</button>
          <button class="btn btn-primary btn-sm" onclick="W.Track.start('${workout.id}')">Start Workout</button>
        </div>

        <div class="view-header">
          <h3 style="font-size:15px;">Exercises</h3>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="W.Exercise.openTemplatePicker('${workout.id}')">From Template</button>
            <button class="btn btn-primary btn-sm" onclick="W.Exercise.openAddModal('${workout.id}')">+ Add</button>
          </div>
        </div>`;

      if (!exs.length) {
        html += `<div class="empty-state" style="padding:24px 0;"><p style="font-size:13px;">No exercises yet.</p></div>`;
      } else {
        for (const e of exs) {
          const wStr = e.isBodyweight ? 'Bodyweight' : (e.weight ? `${e.weight} lbs` : '—');
          html += `<div class="card workout-ex-card" onclick="W.Exercise.openAddModal('${workout.id}','${e.id}')" style="cursor:pointer;">
            <div class="card-header"><span class="card-title">${e.orderIndex+1}. ${W.escape(e.name)}</span></div>
            <div class="w-ex-stats">
              <div><span class="w-ex-stat-val">${e.sets}</span><span class="w-ex-stat-lbl">sets</span></div>
              <div><span class="w-ex-stat-val">${e.reps}</span><span class="w-ex-stat-lbl">reps</span></div>
              <div><span class="w-ex-stat-val">${wStr}</span><span class="w-ex-stat-lbl">start</span></div>
            </div>
            ${e.notes ? `<div style="font-size:12px;color:var(--text-muted);margin-top:8px;">${W.escape(e.notes)}</div>` : ''}
          </div>`;
        }
      }

      html += `</div>`;
      el.innerHTML = html;
    }
  },

  // ===== EXERCISE BUILDER =====
  Exercise: {
    openAddModal(workoutId, editId) {
      const isEdit = !!editId;
      const e = isEdit ? W._exercises.find(x => x.id === editId) : null;
      const siblings = W.exercisesForWorkout(workoutId);
      const currentOrderIdx = e ? e.orderIndex : siblings.length;
      const maxOrder = isEdit ? siblings.length : siblings.length + 1;

      let orderOpts = '';
      for (let i = 0; i < maxOrder; i++) {
        orderOpts += `<option value="${i}" ${currentOrderIdx===i?'selected':''}>${i+1}</option>`;
      }

      const isCardio = e?.exerciseType === 'cardio';
      const isBw = e?.isBodyweight || false;
      const CARDIO_TYPES = ['Cycling', 'Elliptical', 'Running', 'Other'];

      const html = `
        <div class="form-group">
          <label class="form-label">Exercise Name</label>
          <input class="form-input" id="e-name" placeholder="e.g., Bench Press" value="${W.escape(e?.name || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <div class="checkbox-group">
            <div class="checkbox-option ${!isCardio?'selected':''}" id="e-type-lift" onclick="W.Exercise._setType('lift')">Lift</div>
            <div class="checkbox-option ${isCardio?'selected':''}" id="e-type-cardio" onclick="W.Exercise._setType('cardio')">Cardio</div>
          </div>
        </div>
        <div id="e-lift-fields" style="display:${isCardio?'none':'block'};">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Order</label>
              <select class="form-select" id="e-order">${orderOpts}</select>
            </div>
            <div class="form-group">
              <label class="form-label">Sets</label>
              <input class="form-input" id="e-sets" type="number" min="1" value="${e?.sets || 3}">
            </div>
            <div class="form-group">
              <label class="form-label">Reps</label>
              <input class="form-input" id="e-reps" type="number" min="1" value="${e?.reps || 10}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Starting Weight</label>
            <div style="display:flex;align-items:center;gap:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:8px;">
              <div style="flex:1;font-size:14px;font-weight:600;">Bodyweight</div>
              <label class="toggle-switch"><input type="checkbox" id="e-bw" ${isBw?'checked':''} onchange="W.Exercise._toggleBw()"><span class="toggle-slider"></span></label>
            </div>
            <div id="e-weight-wrap" style="display:${isBw?'none':'block'};">
              <div class="weight-input-wrap">
                <input class="form-input" id="e-weight" type="number" step="0.5" min="0" placeholder="0" value="${e?.weight || ''}">
                <span class="weight-unit">lbs</span>
              </div>
            </div>
          </div>
        </div>
        <div id="e-cardio-fields" style="display:${isCardio?'block':'none'};">
          <div class="form-group">
            <label class="form-label">Cardio Type</label>
            <div class="checkbox-group" style="flex-wrap:wrap;">
              ${CARDIO_TYPES.map(t => `<div class="checkbox-option ${(e?.cardioType||'').toLowerCase()===t.toLowerCase()?'selected':''}" data-ctype="${t}" onclick="W.Exercise._setCardioType(this)">${t}</div>`).join('')}
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Duration (min)</label>
              <input class="form-input" id="e-duration" type="number" min="1" placeholder="30" value="${e?.duration || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Intensity</label>
              <input class="form-input" id="e-intensity" placeholder="e.g., Level 8, Moderate" value="${W.escape(e?.intensity || '')}">
            </div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-textarea" id="e-notes" placeholder="Form cues, tempo, etc.">${W.escape(e?.notes || '')}</textarea>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" onclick="W.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="W.Exercise.save('${workoutId}','${editId||''}')">${isEdit?'Update':'Add Exercise'}</button>
        </div>
        ${isEdit?`<div class="form-actions mt-8"><button class="btn btn-danger btn-sm" onclick="W.Exercise.remove('${editId}','${workoutId}')">Delete Exercise</button></div>`:''}
      `;
      W.openModal(isEdit ? 'Edit Exercise' : 'New Exercise', html);
    },

    _setType(type) {
      document.getElementById('e-type-lift').classList.toggle('selected', type === 'lift');
      document.getElementById('e-type-cardio').classList.toggle('selected', type === 'cardio');
      document.getElementById('e-lift-fields').style.display = type === 'lift' ? 'block' : 'none';
      document.getElementById('e-cardio-fields').style.display = type === 'cardio' ? 'block' : 'none';
    },

    _setCardioType(el) {
      document.querySelectorAll('[data-ctype]').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    },

    _toggleBw() {
      const on = document.getElementById('e-bw').checked;
      document.getElementById('e-weight-wrap').style.display = on ? 'none' : 'block';
    },

    async save(workoutId, editId) {
      const name = document.getElementById('e-name').value.trim();
      if (!name) { alert('Enter exercise name.'); return; }
      const exerciseType = document.getElementById('e-type-cardio').classList.contains('selected') ? 'cardio' : 'lift';

      let sets, reps, isBodyweight, weight, orderIndex, cardioType, duration, intensity;
      if (exerciseType === 'cardio') {
        sets = 1; reps = null; isBodyweight = false; weight = null; orderIndex = 0;
        const ctypeEl = document.querySelector('[data-ctype].selected');
        cardioType = ctypeEl ? ctypeEl.dataset.ctype : null;
        duration = parseInt(document.getElementById('e-duration').value) || null;
        intensity = document.getElementById('e-intensity').value.trim() || null;
        // get order from existing or end of list
        const existing2 = W._exercises.find(x => x.id === editId);
        orderIndex = existing2 ? existing2.orderIndex : W.exercisesForWorkout(workoutId).length;
      } else {
        sets = parseInt(document.getElementById('e-sets').value) || 3;
        reps = parseInt(document.getElementById('e-reps').value) || 10;
        isBodyweight = document.getElementById('e-bw').checked;
        weight = isBodyweight ? null : (parseFloat(document.getElementById('e-weight').value) || null);
        orderIndex = parseInt(document.getElementById('e-order').value);
        cardioType = null; duration = null; intensity = null;
      }
      const notes = document.getElementById('e-notes').value.trim() || null;

      const id = editId || W.id();
      const existing = W._exercises.find(x => x.id === editId);
      const prevOrder = existing?.orderIndex;

      try {
        await W.DB.saveExercise({
          id, workoutId, name, sets, reps, weight, isBodyweight, notes, orderIndex, isTemplate: false,
          exerciseType, cardioType, duration, intensity
        });

        if (editId && prevOrder !== orderIndex) {
          await W.Exercise._reorderSiblings(workoutId, id, prevOrder, orderIndex);
        } else if (!editId) {
          const siblings = W._exercises.filter(x => x.workoutId === workoutId && x.id !== id && x.orderIndex >= orderIndex);
          for (const s of siblings) await W.DB.saveExercise({ ...s, orderIndex: s.orderIndex + 1 });
        }

        W.closeModal();
        await W.refresh();
        W.switchView('workoutDetail');
      } catch (e) { alert('Failed to save exercise.'); }
    },

    async _reorderSiblings(workoutId, movingId, oldIdx, newIdx) {
      const all = W._exercises.filter(x => x.workoutId === workoutId && x.id !== movingId)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      for (let i = 0; i < all.length; i++) {
        const expected = i >= newIdx ? i + 1 : i;
        if (all[i].orderIndex !== expected) {
          await W.DB.saveExercise({ ...all[i], orderIndex: expected });
        }
      }
    },

    async remove(id, workoutId) {
      if (!confirm('Delete this exercise?')) return;
      await W.DB.deleteExercise(id);
      W.closeModal();
      await W.refresh();
      W.currentWorkoutId = workoutId;
      W.switchView('workoutDetail');
    },

    openTemplatePicker(workoutId) {
      // All exercises by name (deduped)
      const seen = new Map();
      for (const e of W._exercises) {
        if (!seen.has(e.name)) seen.set(e.name, e);
      }
      const list = Array.from(seen.values());
      if (!list.length) {
        W.openModal('Templates', `<p>No exercises exist yet to use as templates.</p>
          <div class="form-actions"><button class="btn btn-primary" onclick="W.closeModal()">OK</button></div>`);
        return;
      }

      const items = list.map(e => {
        const wStr = e.isBodyweight ? 'BW' : (e.weight ? `${e.weight} lbs` : '—');
        return `<div class="card" onclick="W.Exercise._applyTemplate('${e.id}','${workoutId}')" style="cursor:pointer;">
          <div class="card-header"><span class="card-title">${W.escape(e.name)}</span></div>
          <div class="card-subtitle">${e.sets}×${e.reps} · ${wStr}${e.notes?' · '+W.escape(e.notes.slice(0,30))+(e.notes.length>30?'…':''):''}</div>
        </div>`;
      }).join('');

      W.openModal('Copy Exercise', `<p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Pick an existing exercise to copy:</p>${items}`);
    },

    async _applyTemplate(sourceExId, targetWorkoutId) {
      const src = W._exercises.find(e => e.id === sourceExId);
      if (!src) return;
      const siblings = W.exercisesForWorkout(targetWorkoutId);
      try {
        await W.DB.saveExercise({
          id: W.id(), workoutId: targetWorkoutId, name: src.name,
          sets: src.sets, reps: src.reps, weight: src.weight,
          isBodyweight: src.isBodyweight, notes: src.notes,
          orderIndex: siblings.length, isTemplate: false
        });
        W.closeModal();
        await W.refresh();
        W.switchView('workoutDetail');
      } catch (e) { alert('Failed to copy template.'); }
    }
  },

  // ===== TRACKING =====
  Track: {
    async start(workoutId) {
      const w = W._workouts.find(x => x.id === workoutId);
      if (!w) return;
      // Check for existing in-progress log today
      const today = W.today();
      const existing = W._logs.find(l => l.date === today && l.workoutId === workoutId && !l.completedAt);
      if (existing) { W.Track.open(existing.id); return; }

      const newLog = {
        id: W.id(), date: today,
        splitId: W._splits.find(s => s.id === (W._days.find(d => d.id === w.splitDayId)?.splitId))?.id || null,
        splitDayId: w.splitDayId, workoutId: w.id, workoutName: w.name,
        notes: null, startedAt: new Date().toISOString(), completedAt: null
      };
      try {
        await W.DB.saveLog(newLog);
        // Seed set_logs from planned sets
        const exs = W.exercisesForWorkout(w.id);
        for (let i = 0; i < exs.length; i++) {
          const e = exs[i];
          if (e.exerciseType === 'cardio') {
            await W.DB.saveSetLog({
              workoutLogId: newLog.id, exerciseId: e.id, exerciseName: e.name,
              exerciseOrder: i, setNumber: 1, weight: null,
              isBodyweight: false, reps: null, notes: null,
              exerciseType: 'cardio', duration: null, intensity: null
            });
          } else {
            for (let s = 1; s <= (e.sets || 1); s++) {
              await W.DB.saveSetLog({
                workoutLogId: newLog.id, exerciseId: e.id, exerciseName: e.name,
                exerciseOrder: i, setNumber: s, weight: null,
                isBodyweight: e.isBodyweight, reps: null, notes: null,
                exerciseType: 'lift', duration: null, intensity: null
              });
            }
          }
        }
        await W.refresh();
        W.Track.open(newLog.id);
      } catch (e) { alert('Failed to start workout.'); }
    },

    open(logId) {
      W.currentLogId = logId;
      W.switchView('track');
    },

    render() {
      const el = document.getElementById('view-wt-content');
      const log = W._logs.find(l => l.id === W.currentLogId);
      if (!log) { W.switchView('today'); return; }

      const setLogs = W._setLogs.filter(s => s.workoutLogId === log.id);
      // Group by exercise_name + order
      const groups = {};
      for (const s of setLogs) {
        const key = s.exerciseOrder + '|' + s.exerciseName;
        if (!groups[key]) groups[key] = { order: s.exerciseOrder, name: s.exerciseName, exerciseId: s.exerciseId, exerciseType: s.exerciseType || 'lift', sets: [] };
        groups[key].sets.push(s);
      }
      const groupArr = Object.values(groups).sort((a, b) => a.order - b.order);
      groupArr.forEach(g => g.sets.sort((a, b) => a.setNumber - b.setNumber));

      const completed = !!log.completedAt;
      const plannedByEx = {};
      groupArr.forEach(g => {
        if (g.exerciseId) plannedByEx[g.name] = W._exercises.find(e => e.id === g.exerciseId);
      });

      let html = `<div style="padding:16px 20px;">
        <button class="btn-back" onclick="W.switchView('today')">&#8249; Back</button>
        <div style="margin-bottom:16px;">
          <h2 style="font-size:22px;font-weight:700;">${W.escape(log.workoutName)}</h2>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${W.formatDisplay(log.date)}${completed?' · ✓ Completed':' · In progress'}</div>
        </div>`;

      if (!groupArr.length) {
        html += `<div class="empty-state" style="padding:16px 0;"><p>No exercises logged yet.</p></div>`;
      }

      for (let i = 0; i < groupArr.length; i++) {
        const g = groupArr[i];
        const planned = plannedByEx[g.name];
        const isCardio = g.exerciseType === 'cardio';
        const completedSets = isCardio
          ? g.sets.filter(s => s.duration != null).length
          : g.sets.filter(s => s.reps != null && (s.isBodyweight || s.weight != null)).length;

        let statsHtml;
        if (isCardio) {
          const planDur = planned?.duration ? `${planned.duration} min` : '';
          const planInt = planned?.intensity ? W.escape(planned.intensity) : '';
          statsHtml = `
            ${planDur ? `<div><span class="w-ex-stat-val">${planDur}</span><span class="w-ex-stat-lbl">planned</span></div>` : ''}
            ${planInt ? `<div><span class="w-ex-stat-val">${planInt}</span><span class="w-ex-stat-lbl">intensity</span></div>` : ''}
            <div><span class="w-ex-stat-val" style="color:var(--accent);">${completedSets}/${g.sets.length}</span><span class="w-ex-stat-lbl">done</span></div>`;
        } else {
          const plannedReps = planned ? planned.reps : '';
          const plannedWt = planned ? (planned.isBodyweight ? 'BW' : (planned.weight ? planned.weight + ' lbs' : '—')) : '';
          statsHtml = `
            <div><span class="w-ex-stat-val">${g.sets.length}</span><span class="w-ex-stat-lbl">sets</span></div>
            ${plannedReps ? `<div><span class="w-ex-stat-val">${plannedReps}</span><span class="w-ex-stat-lbl">reps</span></div>` : ''}
            ${plannedWt ? `<div><span class="w-ex-stat-val">${plannedWt}</span><span class="w-ex-stat-lbl">start</span></div>` : ''}
            <div><span class="w-ex-stat-val" style="color:var(--accent);">${completedSets}/${g.sets.length}</span><span class="w-ex-stat-lbl">done</span></div>`;
        }

        html += `<div class="workout-track-ex">
          <div class="workout-track-ex-head" onclick="W.Track.toggleEx(${i})">
            <div style="flex:1;">
              <div style="font-size:16px;font-weight:700;">${i+1}. ${W.escape(g.name)}${isCardio?' <span style="font-size:11px;color:var(--text-muted);font-weight:400;">cardio</span>':''}</div>
              <div class="w-ex-stats" style="margin-top:6px;">${statsHtml}</div>
            </div>
            <div class="w-track-chev" id="w-track-chev-${i}">▾</div>
          </div>
          <div class="workout-track-sets" id="w-track-sets-${i}">
            ${g.sets.map((s, si) => W.Track._renderSetRow(s, si+1, planned)).join('')}
            <div style="display:flex;gap:6px;margin-top:8px;">
              ${isCardio ? '' : `<button class="btn btn-secondary btn-sm" style="flex:1;" onclick="W.Track.addSet('${g.sets[0]?.workoutLogId||log.id}','${W.escape(g.name)}', ${g.order}, '${g.exerciseId||''}')">+ Add Set</button>`}
              <button class="btn btn-secondary btn-sm" style="${isCardio?'flex:1;':''}color:var(--danger);" onclick="W.Track.removeExercise('${W.escape(g.name)}', ${g.order})">Remove</button>
            </div>
          </div>
        </div>`;
      }

      html += `<div style="margin-top:16px;">
        <button class="btn btn-secondary btn-sm" style="width:100%;justify-content:center;" onclick="W.Track.openAddExercise()">+ Add Exercise</button>
      </div>`;

      if (!completed) {
        html += `<div class="form-actions" style="margin-top:16px;">
          <button class="btn btn-primary" style="flex:1;" onclick="W.Track.complete()">✓ Complete Workout</button>
        </div>`;
      } else {
        html += `<div class="form-actions" style="margin-top:16px;">
          <button class="btn btn-secondary" onclick="W.Track.reopen()">Reopen</button>
          <button class="btn btn-danger" onclick="W.Track.deleteLog()">Delete Session</button>
        </div>`;
      }

      html += `</div>`;
      el.innerHTML = html;
    },

    _renderSetRow(s, displayNum, planned) {
      if (s.exerciseType === 'cardio') {
        const durVal = s.duration != null ? s.duration : '';
        const intVal = s.intensity || '';
        const pl = planned ? `${planned.duration || '?'} min · ${planned.intensity || '—'}` : '';
        return `<div class="workout-track-set-row" data-setid="${s.id}">
          <div class="workout-track-set-num">${displayNum}</div>
          <div class="workout-track-set-target">${pl}</div>
          <input type="number" class="form-input workout-track-set-input" placeholder="min" value="${durVal}" onchange="W.Track.updateSet(${s.id}, 'duration', this.value)">
          <span class="w-set-x">@</span>
          <input type="text" class="form-input workout-track-set-input" placeholder="intensity" value="${W.escape(intVal)}" onchange="W.Track.updateSet(${s.id}, 'intensity', this.value)">
          <button class="btn-icon btn-sm" onclick="W.Track.addSetNote(${s.id})" title="Notes" style="font-size:14px;">📝</button>
          <button class="btn-icon btn-sm" onclick="W.Track.deleteSet(${s.id})" style="color:var(--danger);">×</button>
        </div>`;
      }
      const weightVal = s.weight != null ? s.weight : '';
      const repsVal = s.reps != null ? s.reps : '';
      const bw = s.isBodyweight;
      const pl = planned ? `${planned.isBodyweight ? 'BW' : (planned.weight ? planned.weight + 'lbs' : '—')} × ${planned.reps}` : '';
      return `<div class="workout-track-set-row" data-setid="${s.id}">
        <div class="workout-track-set-num">${displayNum}</div>
        <div class="workout-track-set-target">${pl || ''}</div>
        <input type="number" step="0.5" class="form-input workout-track-set-input" placeholder="${bw?'BW':'lbs'}" value="${weightVal}" ${bw?'disabled':''} onchange="W.Track.updateSet(${s.id}, 'weight', this.value)">
        <span class="w-set-x">×</span>
        <input type="number" class="form-input workout-track-set-input" placeholder="reps" value="${repsVal}" onchange="W.Track.updateSet(${s.id}, 'reps', this.value)">
        <button class="btn-icon btn-sm" onclick="W.Track.addSetNote(${s.id})" title="Notes" style="font-size:14px;">📝</button>
        <button class="btn-icon btn-sm" onclick="W.Track.deleteSet(${s.id})" style="color:var(--danger);">×</button>
      </div>`;
    },

    toggleEx(i) {
      const el = document.getElementById('w-track-sets-'+i);
      const chev = document.getElementById('w-track-chev-'+i);
      if (el.style.display === 'none') { el.style.display = ''; chev.textContent = '▾'; }
      else { el.style.display = 'none'; chev.textContent = '▸'; }
    },

    async updateSet(setId, field, value) {
      const s = W._setLogs.find(x => x.id === setId);
      if (!s) return;
      if (field === 'weight') s.weight = value === '' ? null : parseFloat(value);
      else if (field === 'reps') s.reps = value === '' ? null : parseInt(value);
      else if (field === 'duration') s.duration = value === '' ? null : parseInt(value);
      else if (field === 'intensity') s.intensity = value.trim() || null;
      try {
        await W.DB.saveSetLog(s);
      } catch (e) { console.error(e); }
    },

    async addSetNote(setId) {
      const s = W._setLogs.find(x => x.id === setId);
      if (!s) return;
      const note = prompt('Set notes:', s.notes || '');
      if (note === null) return;
      s.notes = note.trim() || null;
      await W.DB.saveSetLog(s);
    },

    async addSet(workoutLogId, exerciseName, exerciseOrder, exerciseId) {
      const existing = W._setLogs.filter(s => s.workoutLogId === workoutLogId && s.exerciseName === exerciseName && s.exerciseOrder === exerciseOrder);
      const nextNum = existing.length ? Math.max(...existing.map(s => s.setNumber)) + 1 : 1;
      const isBw = existing[0]?.isBodyweight || false;
      try {
        await W.DB.saveSetLog({
          workoutLogId, exerciseId: exerciseId || null, exerciseName,
          exerciseOrder, setNumber: nextNum, weight: null,
          isBodyweight: isBw, reps: null, notes: null
        });
        await W.refresh();
        W.Track.render();
      } catch (e) { alert('Failed to add set.'); }
    },

    async deleteSet(setId) {
      if (!confirm('Delete this set?')) return;
      await W.DB.deleteSetLog(setId);
      await W.refresh();
      W.Track.render();
    },

    async removeExercise(exerciseName, exerciseOrder) {
      if (!confirm('Remove this exercise from the workout session?')) return;
      const toDelete = W._setLogs.filter(s => s.workoutLogId === W.currentLogId && s.exerciseName === exerciseName && s.exerciseOrder === exerciseOrder);
      for (const s of toDelete) await W.DB.deleteSetLog(s.id);
      await W.refresh();
      W.Track.render();
    },

    openAddExercise() {
      // Show modal: from template or new
      const seen = new Map();
      for (const e of W._exercises) { if (!seen.has(e.name)) seen.set(e.name, e); }
      const templates = Array.from(seen.values());

      const tmplHtml = templates.length ? templates.map(e => {
        const sub = e.exerciseType === 'cardio'
          ? `Cardio · ${e.cardioType||'—'}${e.duration?' · '+e.duration+' min':''}${e.intensity?' · '+e.intensity:''}`
          : `${e.sets}×${e.reps} · ${e.isBodyweight?'BW':(e.weight?e.weight+' lbs':'—')}`;
        return `<div class="card" onclick="W.Track._addFromTemplate('${e.id}')" style="cursor:pointer;">
          <div class="card-header"><span class="card-title">${W.escape(e.name)}</span></div>
          <div class="card-subtitle">${sub}</div>
        </div>`;
      }).join('') : '<p style="font-size:13px;color:var(--text-muted);">No templates yet.</p>';

      const html = `
        <div class="fitness-section-label">FROM TEMPLATE</div>
        ${tmplHtml}
        <div class="fitness-section-label" style="margin-top:16px;">OR ADD NEW</div>
        <div class="form-group">
          <label class="form-label">Exercise Name</label>
          <input class="form-input" id="t-ex-name" placeholder="e.g., Incline Press">
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <div class="checkbox-group">
            <div class="checkbox-option selected" id="t-ex-type-lift" onclick="W.Track._setExType('lift')">Lift</div>
            <div class="checkbox-option" id="t-ex-type-cardio" onclick="W.Track._setExType('cardio')">Cardio</div>
          </div>
        </div>
        <div id="t-ex-lift-fields">
          <div class="form-row">
            <div class="form-group"><label class="form-label">Sets</label><input class="form-input" id="t-ex-sets" type="number" min="1" value="3"></div>
            <div class="form-group"><label class="form-label">Reps</label><input class="form-input" id="t-ex-reps" type="number" min="1" value="10"></div>
          </div>
          <div class="form-group">
            <div style="display:flex;align-items:center;gap:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:8px;">
              <div style="flex:1;font-size:14px;font-weight:600;">Bodyweight</div>
              <label class="toggle-switch"><input type="checkbox" id="t-ex-bw" onchange="document.getElementById('t-ex-wt-wrap').style.display=this.checked?'none':'block'"><span class="toggle-slider"></span></label>
            </div>
            <div id="t-ex-wt-wrap">
              <div class="weight-input-wrap"><input class="form-input" id="t-ex-weight" type="number" step="0.5" placeholder="0"><span class="weight-unit">lbs</span></div>
            </div>
          </div>
        </div>
        <div id="t-ex-cardio-fields" style="display:none;">
          <div class="form-group">
            <label class="form-label">Cardio Type</label>
            <div class="checkbox-group" style="flex-wrap:wrap;">
              ${['Cycling','Elliptical','Running','Other'].map(t => `<div class="checkbox-option" data-tctype="${t}" onclick="W.Track._setCardioType(this)">${t}</div>`).join('')}
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Duration (min)</label><input class="form-input" id="t-ex-duration" type="number" min="1" placeholder="30"></div>
            <div class="form-group"><label class="form-label">Intensity</label><input class="form-input" id="t-ex-intensity" placeholder="e.g., Level 8"></div>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" onclick="W.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="W.Track._addNewExercise()">Add</button>
        </div>
      `;
      W.openModal('Add Exercise to Session', html);
    },

    async _addFromTemplate(sourceExId) {
      const src = W._exercises.find(e => e.id === sourceExId);
      if (!src) return;
      const log = W._logs.find(l => l.id === W.currentLogId);
      const setLogs = W._setLogs.filter(s => s.workoutLogId === log.id);
      const maxOrder = setLogs.length ? Math.max(...setLogs.map(s => s.exerciseOrder)) + 1 : 0;
      try {
        if (src.exerciseType === 'cardio') {
          await W.DB.saveSetLog({
            workoutLogId: log.id, exerciseId: src.id, exerciseName: src.name,
            exerciseOrder: maxOrder, setNumber: 1, weight: null,
            isBodyweight: false, reps: null, notes: null,
            exerciseType: 'cardio', duration: null, intensity: null
          });
        } else {
          for (let s = 1; s <= (src.sets || 1); s++) {
            await W.DB.saveSetLog({
              workoutLogId: log.id, exerciseId: src.id, exerciseName: src.name,
              exerciseOrder: maxOrder, setNumber: s, weight: null,
              isBodyweight: src.isBodyweight, reps: null, notes: null,
              exerciseType: 'lift', duration: null, intensity: null
            });
          }
        }
        W.closeModal();
        await W.refresh();
        W.Track.render();
      } catch (e) { alert('Failed to add exercise.'); }
    },

    _setExType(type) {
      document.getElementById('t-ex-type-lift').classList.toggle('selected', type === 'lift');
      document.getElementById('t-ex-type-cardio').classList.toggle('selected', type === 'cardio');
      document.getElementById('t-ex-lift-fields').style.display = type === 'lift' ? 'block' : 'none';
      document.getElementById('t-ex-cardio-fields').style.display = type === 'cardio' ? 'block' : 'none';
    },

    _setCardioType(el) {
      document.querySelectorAll('[data-tctype]').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    },

    async _addNewExercise() {
      const name = document.getElementById('t-ex-name').value.trim();
      if (!name) { alert('Enter exercise name.'); return; }
      const isCardio = document.getElementById('t-ex-type-cardio').classList.contains('selected');

      const log = W._logs.find(l => l.id === W.currentLogId);
      const setLogs = W._setLogs.filter(s => s.workoutLogId === log.id);
      const maxOrder = setLogs.length ? Math.max(...setLogs.map(s => s.exerciseOrder)) + 1 : 0;
      try {
        if (isCardio) {
          await W.DB.saveSetLog({
            workoutLogId: log.id, exerciseId: null, exerciseName: name,
            exerciseOrder: maxOrder, setNumber: 1, weight: null,
            isBodyweight: false, reps: null, notes: null,
            exerciseType: 'cardio', duration: null, intensity: null
          });
        } else {
          const sets = parseInt(document.getElementById('t-ex-sets').value) || 3;
          const isBw = document.getElementById('t-ex-bw').checked;
          for (let s = 1; s <= sets; s++) {
            await W.DB.saveSetLog({
              workoutLogId: log.id, exerciseId: null, exerciseName: name,
              exerciseOrder: maxOrder, setNumber: s, weight: null,
              isBodyweight: isBw, reps: null, notes: null,
              exerciseType: 'lift', duration: null, intensity: null
            });
          }
        }
        W.closeModal();
        await W.refresh();
        W.Track.render();
      } catch (e) { alert('Failed to add exercise.'); }
    },

    async complete() {
      const log = W._logs.find(l => l.id === W.currentLogId);
      if (!log) return;
      log.completedAt = new Date().toISOString();
      await W.DB.saveLog(log);
      await W.refresh();
      W.Track.render();
    },

    async reopen() {
      const log = W._logs.find(l => l.id === W.currentLogId);
      if (!log) return;
      log.completedAt = null;
      await W.DB.saveLog(log);
      await W.refresh();
      W.Track.render();
    },

    async deleteLog() {
      if (!confirm('Delete this workout session and all its sets?')) return;
      await W.DB.deleteLog(W.currentLogId);
      await W.refresh();
      W.switchView('today');
    }
  },

  // ===== HISTORY (per-exercise stats) =====
  History: {
    render() {
      const el = document.getElementById('view-wt-content');
      // Dedupe exercises by name from set_logs
      const names = Array.from(new Set(W._setLogs.map(s => s.exerciseName))).sort();

      let html = `<div style="padding:16px 20px;">
        <div class="view-header"><h2>Exercise History</h2></div>`;

      if (!names.length) {
        html += `<div class="empty-state" style="padding:32px 0;"><p>No workouts logged yet.</p></div></div>`;
        el.innerHTML = html;
        return;
      }

      const selected = W.historyExercise || names[0];
      W.historyExercise = selected;

      html += `<div class="form-group">
          <label class="form-label">Exercise</label>
          <select class="form-select" onchange="W.historyExercise=this.value; W.History.render()">
            ${names.map(n => `<option value="${W.escape(n)}" ${n===selected?'selected':''}>${W.escape(n)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Mode</label>
          <div class="checkbox-group">
            <div class="checkbox-option ${W.historyMode==='set'?'selected':''}" onclick="W.historyMode='set';W.History.render()">Per-Set (best set)</div>
            <div class="checkbox-option ${W.historyMode==='session'?'selected':''}" onclick="W.historyMode='session';W.History.render()">Per-Session (total)</div>
          </div>
        </div>
        <div class="graph-periods">
          ${['1W','1M','3M','6M','1Y','ALL','Custom'].map(p => `<button class="graph-period-btn${W.historyPeriod===p?' active':''}" onclick="W.History.setPeriod('${p}')">${p}</button>`).join('')}
        </div>`;

      if (W.historyPeriod === 'Custom') {
        html += `<div style="margin-top:12px;">
          <div class="form-row">
            <div class="form-group"><label class="form-label">From</label><input type="date" id="h-start" class="form-input" value="${W.historyCustomStart || ''}"></div>
            <div class="form-group"><label class="form-label">To</label><input type="date" id="h-end" class="form-input" value="${W.historyCustomEnd || ''}"></div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="W.History.applyCustom()">Apply</button>
        </div>`;
      }

      // Compute date range
      const range = W.History._getRange();
      // Filter sets for this exercise in range
      const relevantSets = W._setLogs.filter(s => {
        if (s.exerciseName !== selected) return false;
        const log = W._logs.find(l => l.id === s.workoutLogId);
        if (!log) return false;
        if (log.date < range.start || log.date > range.end) return false;
        if (s.reps == null || (!s.isBodyweight && s.weight == null)) return false; // only completed sets
        return true;
      });

      // Group by date
      const byDate = {};
      for (const s of relevantSets) {
        const log = W._logs.find(l => l.id === s.workoutLogId);
        const date = log.date;
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push(s);
      }

      // Compute dataset based on mode
      const dates = Object.keys(byDate).sort();
      const weightData = [], repsData = [], volumeData = [];
      for (const d of dates) {
        const sets = byDate[d];
        if (W.historyMode === 'set') {
          // best set = highest weight*reps
          let best = sets[0];
          let bestVol = (sets[0].weight || 0) * (sets[0].reps || 0);
          for (const s of sets) {
            const v = (s.weight || 0) * (s.reps || 0);
            if (v > bestVol) { bestVol = v; best = s; }
          }
          weightData.push(best.isBodyweight ? 0 : (best.weight || 0));
          repsData.push(best.reps || 0);
          volumeData.push(bestVol);
        } else {
          // session total
          let totalVol = 0, totalReps = 0, maxWt = 0;
          for (const s of sets) {
            const v = (s.weight || 0) * (s.reps || 0);
            totalVol += v;
            totalReps += s.reps || 0;
            if ((s.weight || 0) > maxWt) maxWt = s.weight || 0;
          }
          weightData.push(maxWt);
          repsData.push(totalReps);
          volumeData.push(totalVol);
        }
      }

      // PR calculations (across ALL time for this exercise, not just range)
      const allSetsForExPerfect = W._setLogs.filter(s => s.exerciseName === selected && s.reps != null);
      let prWeight = 0, prReps = 0, prVolume = 0, prDates = new Set();
      const byDateAll = {};
      for (const s of allSetsForExPerfect) {
        const log = W._logs.find(l => l.id === s.workoutLogId);
        if (!log) continue;
        if (!byDateAll[log.date]) byDateAll[log.date] = [];
        byDateAll[log.date].push(s);
      }

      // Track PR days: a day is a PR if it sets a new max in weight, reps, or volume (per-set best)
      let runningMaxWt = 0, runningMaxReps = 0, runningMaxVol = 0;
      const sortedDatesAll = Object.keys(byDateAll).sort();
      for (const d of sortedDatesAll) {
        const sets = byDateAll[d];
        let dayMaxWt = 0, dayMaxReps = 0, dayMaxVol = 0;
        for (const s of sets) {
          if ((s.weight || 0) > dayMaxWt) dayMaxWt = s.weight || 0;
          if ((s.reps || 0) > dayMaxReps) dayMaxReps = s.reps || 0;
          const v = (s.weight || 0) * (s.reps || 0);
          if (v > dayMaxVol) dayMaxVol = v;
        }
        let isPr = false;
        if (dayMaxWt > runningMaxWt) { runningMaxWt = dayMaxWt; isPr = true; }
        if (dayMaxReps > runningMaxReps) { runningMaxReps = dayMaxReps; isPr = true; }
        if (dayMaxVol > runningMaxVol) { runningMaxVol = dayMaxVol; isPr = true; }
        if (isPr) prDates.add(d);
      }
      prWeight = runningMaxWt; prReps = runningMaxReps; prVolume = runningMaxVol;

      html += `<div class="graph-stats" style="margin-top:16px;">
        <div class="graph-stat"><span class="graph-stat-value">${prWeight || '—'}</span><span class="graph-stat-label">PR lbs</span></div>
        <div class="graph-stat"><span class="graph-stat-value">${prReps || '—'}</span><span class="graph-stat-label">PR reps</span></div>
        <div class="graph-stat"><span class="graph-stat-value">${prVolume || '—'}</span><span class="graph-stat-label">PR vol</span></div>
        <div class="graph-stat"><span class="graph-stat-value">${dates.length}</span><span class="graph-stat-label">sessions</span></div>
      </div>`;

      if (dates.length < 2) {
        html += `<div class="empty-state" style="padding:32px 0;"><p>Need at least 2 sessions for a graph.</p></div>`;
      } else {
        html += `<div class="form-group" style="margin-top:12px;">
          <label class="form-label">Metric</label>
          <div class="checkbox-group">
            <div class="checkbox-option ${W.historyMetric==='weight'?'selected':''}" onclick="W.historyMetric='weight';W.History.render()">Weight</div>
            <div class="checkbox-option ${W.historyMetric==='reps'?'selected':''}" onclick="W.historyMetric='reps';W.History.render()">Reps</div>
            <div class="checkbox-option ${W.historyMetric==='volume'||!W.historyMetric?'selected':''}" onclick="W.historyMetric='volume';W.History.render()">Volume</div>
          </div>
        </div>
        <div style="height:240px;margin:12px 0 4px;"><canvas id="w-history-canvas"></canvas></div>`;
      }

      // PR Calendar (show recent month with PR highlights)
      html += `<div style="margin-top:24px;">
        <div class="fitness-section-label">PR CALENDAR</div>
        <div class="calendar-header">
          <button class="btn-icon" onclick="W.History.calPrev()">&#8249;</button>
          <h2 id="w-hist-cal-label" style="font-size:16px;font-weight:600;"></h2>
          <button class="btn-icon" onclick="W.History.calNext()">&#8250;</button>
        </div>
        <div class="calendar-grid" id="w-hist-cal-grid"></div>
      </div>`;

      html += `</div>`;
      el.innerHTML = html;

      // After DOM is ready, draw graph
      if (dates.length >= 2) {
        const metric = W.historyMetric || 'volume';
        const yValues = metric === 'weight' ? weightData : metric === 'reps' ? repsData : volumeData;
        const labels = dates.map(d => {
          const [,m,dd] = d.split('-');
          return `${parseInt(m)}/${parseInt(dd)}`;
        });
        W.History._drawGraph(labels, yValues, metric);
      }

      // Draw PR calendar
      W.History._drawPrCalendar(prDates, byDateAll);
    },

    setPeriod(p) {
      W.historyPeriod = p;
      if (p === 'Custom' && !W.historyCustomStart) {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        W.historyCustomStart = W.fmtDate(d);
        W.historyCustomEnd = W.today();
      }
      W.History.render();
    },

    applyCustom() {
      W.historyCustomStart = document.getElementById('h-start').value;
      W.historyCustomEnd = document.getElementById('h-end').value;
      W.History.render();
    },

    _getRange() {
      if (W.historyPeriod === 'ALL') return { start: '0000-01-01', end: '9999-12-31' };
      if (W.historyPeriod === 'Custom') return { start: W.historyCustomStart, end: W.historyCustomEnd || W.today() };
      const end = new Date(); const start = new Date(end);
      switch (W.historyPeriod) {
        case '1W': start.setDate(end.getDate() - 7); break;
        case '1M': start.setMonth(end.getMonth() - 1); break;
        case '3M': start.setMonth(end.getMonth() - 3); break;
        case '6M': start.setMonth(end.getMonth() - 6); break;
        case '1Y': start.setFullYear(end.getFullYear() - 1); break;
      }
      return { start: W.fmtDate(start), end: W.fmtDate(end) };
    },

    _linearReg(xs, ys) {
      const n = xs.length; if (n < 2) return null;
      const mx = xs.reduce((a,b)=>a+b,0)/n, my = ys.reduce((a,b)=>a+b,0)/n;
      let num=0, den=0;
      for (let i=0;i<n;i++){ num += (xs[i]-mx)*(ys[i]-my); den += (xs[i]-mx)**2; }
      return { slope: den===0?0:num/den, intercept: my - (den===0?0:num/den)*mx };
    },

    _drawGraph(labels, yValues, metric) {
      if (W.historyChart) { W.historyChart.destroy(); W.historyChart = null; }
      const canvas = document.getElementById('w-history-canvas');
      if (!canvas) return;
      const xs = yValues.map((_,i)=>i);
      const reg = yValues.length >= 2 ? W.History._linearReg(xs, yValues) : null;
      const trend = reg ? xs.map(x => Math.round((reg.slope*x + reg.intercept)*10)/10) : null;
      const color = metric === 'weight' ? '#fbbf24' : metric === 'reps' ? '#60a5fa' : '#a78bfa';
      const datasets = [{
        label: metric, data: yValues, borderColor: color,
        backgroundColor: color + '1a', borderWidth: 2,
        pointRadius: yValues.length > 60 ? 0 : 3, pointBackgroundColor: color,
        tension: 0.3, fill: true, order: 2
      }];
      if (trend) datasets.push({
        label: 'Trend', data: trend, borderColor: 'rgba(255,255,255,0.4)',
        borderWidth: 2, borderDash: [5,4], pointRadius: 0, fill: false, tension: 0, order: 1
      });
      W.historyChart = new Chart(canvas, {
        type: 'line', data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          plugins: { legend: { display: false }, tooltip: {
            backgroundColor: 'rgba(19,19,31,0.95)', borderColor: 'rgba(42,42,62,1)',
            borderWidth: 1, titleColor: '#94a3b8', bodyColor: '#e2e8f0'
          }},
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: 8 }},
            y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 11 }}}
          }
        }
      });
    },

    _calDate: new Date(),

    calPrev() { W.History._calDate.setMonth(W.History._calDate.getMonth()-1); W.History.render(); },
    calNext() { W.History._calDate.setMonth(W.History._calDate.getMonth()+1); W.History.render(); },

    _drawPrCalendar(prDates, byDateAll) {
      const grid = document.getElementById('w-hist-cal-grid');
      const label = document.getElementById('w-hist-cal-label');
      if (!grid) return;
      const d = W.History._calDate;
      const year = d.getFullYear(), month = d.getMonth();
      label.textContent = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month+1, 0).getDate();
      const today = W.today();
      let html = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(l => `<div class="cal-day-label">${l}</div>`).join('');
      for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';
      for (let day = 1; day <= daysInMonth; day++) {
        const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        let cls = 'cal-day';
        if (ds === today) cls += ' today';
        if (prDates.has(ds)) cls += ' perfect';
        else if (byDateAll[ds]) cls += ' has-weight';
        html += `<div class="${cls}">${day}${prDates.has(ds)?'<span class="cal-pr-star">★</span>':''}</div>`;
      }
      grid.innerHTML = html;
    }
  },

  // ===== CONSISTENCY CALENDAR =====
  Consistency: {
    render() {
      const el = document.getElementById('view-wt-content');
      const d = W.consistencyDate;
      const year = d.getFullYear(), month = d.getMonth();
      const monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      const completedByDate = {};
      for (const log of W._logs) {
        if (!log.completedAt) continue;
        if (!completedByDate[log.date]) completedByDate[log.date] = [];
        completedByDate[log.date].push(log);
      }

      // Compute week starts within this month to show per-week frequency
      const today = W.today();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month+1, 0).getDate();

      // Muscle groups hit this month
      const muscleCount = {};
      let workoutsThisMonth = 0;
      for (const ds in completedByDate) {
        const [y, mo] = ds.split('-').map(Number);
        if (y !== year || mo - 1 !== month) continue;
        for (const log of completedByDate[ds]) {
          workoutsThisMonth++;
          const w = W._workouts.find(x => x.id === log.workoutId);
          if (w?.muscleGroups) {
            for (const mg of w.muscleGroups) {
              muscleCount[mg] = (muscleCount[mg] || 0) + 1;
            }
          }
        }
      }

      let html = `<div style="padding:16px 20px;">
        <div class="view-header"><h2>Workout Calendar</h2></div>
        <div class="graph-stats">
          <div class="graph-stat"><span class="graph-stat-value">${workoutsThisMonth}</span><span class="graph-stat-label">this month</span></div>
          <div class="graph-stat"><span class="graph-stat-value">${Object.keys(muscleCount).length}</span><span class="graph-stat-label">muscle groups</span></div>
          <div class="graph-stat"><span class="graph-stat-value">${(workoutsThisMonth / Math.max(1, new Date(year,month+1,0).getDate() / 7)).toFixed(1)}</span><span class="graph-stat-label">/ week avg</span></div>
        </div>

        <div class="calendar-header" style="margin-top:16px;">
          <button class="btn-icon" onclick="W.Consistency.prev()">&#8249;</button>
          <h2>${monthLabel}</h2>
          <button class="btn-icon" onclick="W.Consistency.next()">&#8250;</button>
        </div>
        <div class="calendar-grid">
          ${['Su','Mo','Tu','We','Th','Fr','Sa'].map(l => `<div class="cal-day-label">${l}</div>`).join('')}
          ${Array(firstDay).fill('<div class="cal-day empty"></div>').join('')}`;

      for (let day = 1; day <= daysInMonth; day++) {
        const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const logs = completedByDate[ds] || [];
        const isToday = ds === today;
        const isSelected = ds === W.consistencySelected;
        let cls = 'cal-day workout-cal-day';
        if (logs.length) cls += ' perfect';
        if (isToday && !isSelected) cls += ' today';
        if (isSelected) cls += ' selected';
        html += `<div class="${cls}" onclick="W.Consistency.select('${ds}')">${day}${logs.length ? '<span class="cal-workout-dot"></span>' : ''}</div>`;
      }

      html += `</div><div id="w-consist-detail" style="margin-top:16px;"></div>`;

      // Muscle group breakdown
      const mgEntries = Object.entries(muscleCount).sort((a,b)=>b[1]-a[1]);
      if (mgEntries.length) {
        html += `<div style="margin-top:20px;">
          <div class="fitness-section-label">MUSCLE GROUP FREQUENCY (this month)</div>
          ${mgEntries.map(([mg, n]) => `<div class="w-mg-bar">
            <div class="w-mg-bar-label">${W.escape(mg)}</div>
            <div class="w-mg-bar-track"><div class="w-mg-bar-fill" style="width:${Math.min(100, n/Math.max(...Object.values(muscleCount))*100)}%;"></div></div>
            <div class="w-mg-bar-count">${n}</div>
          </div>`).join('')}
        </div>`;
      }

      html += `</div>`;
      el.innerHTML = html;

      if (W.consistencySelected) W.Consistency._renderDayDetail(W.consistencySelected, completedByDate[W.consistencySelected] || []);
    },

    prev() { W.consistencyDate.setMonth(W.consistencyDate.getMonth()-1); W.consistencySelected = null; W.Consistency.render(); },
    next() { W.consistencyDate.setMonth(W.consistencyDate.getMonth()+1); W.consistencySelected = null; W.Consistency.render(); },

    select(ds) {
      W.consistencySelected = W.consistencySelected === ds ? null : ds;
      W.Consistency.render();
    },

    _renderDayDetail(ds, logs) {
      const el = document.getElementById('w-consist-detail');
      if (!el) return;
      if (!logs.length) {
        el.innerHTML = `<div class="cal-detail-date">${W.formatDisplay(ds)}</div><p class="text-muted" style="font-size:13px;">No workout logged.</p>`;
        return;
      }
      let html = `<div class="cal-detail-date">${W.formatDisplay(ds)}</div>`;
      for (const log of logs) {
        const w = W._workouts.find(x => x.id === log.workoutId);
        const mg = w?.muscleGroups || [];
        const sets = W._setLogs.filter(s => s.workoutLogId === log.id);
        const completedSets = sets.filter(s => s.reps != null);
        const exNames = [...new Set(sets.map(s => s.exerciseName))];
        html += `<div class="card" onclick="W.Track.open('${log.id}')" style="cursor:pointer;">
          <div class="card-header"><span class="card-title">${W.escape(log.workoutName)}</span><span class="card-badge badge-green">${completedSets.length} sets</span></div>
          <div class="card-subtitle">${exNames.length} exercises${mg.length?' · '+mg.join(', '):''}</div>
        </div>`;
      }
      el.innerHTML = html;
    }
  }
};
