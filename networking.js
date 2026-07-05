// ===== DB =====
const DB = {
  async getContacts() {
    const { data, error } = await sb.from('contacts').select('*').order('name');
    if (error) { console.error('getContacts:', error); return []; }
    return (data || []).map(r => ({
      id: r.id, name: r.name, relationship: r.relationship,
      description: r.description, phone: r.phone || null,
      stayInContact: r.stay_in_contact,
      contactFrequency: r.contact_frequency, contactMethod: r.contact_method,
      showOnHome: r.show_on_home, nextContactDate: r.next_contact_date,
      createdAt: r.created_at
    }));
  },

  async saveContact(c) {
    const { error } = await sb.from('contacts').upsert({
      id: c.id, name: c.name, relationship: c.relationship,
      description: c.description, phone: c.phone || null,
      stay_in_contact: c.stayInContact,
      contact_frequency: c.contactFrequency, contact_method: c.contactMethod,
      show_on_home: c.showOnHome, next_contact_date: c.nextContactDate
    }, { onConflict: 'id' });
    if (error) { console.error('saveContact:', error); throw error; }
  },

  async deleteContact(id) {
    await sb.from('contact_logs').delete().eq('contact_id', id);
    const { error } = await sb.from('contacts').delete().eq('id', id);
    if (error) console.error('deleteContact:', error);
  },

  async getLogsForContact(contactId) {
    const { data, error } = await sb.from('contact_logs').select('*')
      .eq('contact_id', contactId).order('date', { ascending: false });
    if (error) { console.error('getLogsForContact:', error); return []; }
    return data || [];
  },

  async getAllLogs() {
    const { data, error } = await sb.from('contact_logs').select('*').order('date', { ascending: false });
    if (error) { console.error('getAllLogs:', error); return []; }
    return data || [];
  },

  async saveLog(log) {
    let error;
    if (log.id) {
      ({ error } = await sb.from('contact_logs').update({
        date: log.date, method: log.method, description: log.description
      }).eq('id', log.id));
    } else {
      ({ error } = await sb.from('contact_logs').insert({
        contact_id: log.contactId, date: log.date,
        method: log.method, description: log.description
      }));
    }
    if (error) { console.error('saveLog:', error); throw error; }
  },

  async deleteLog(id) {
    const { error } = await sb.from('contact_logs').delete().eq('id', id);
    if (error) console.error('deleteLog:', error);
  },

  async updateNextContact(contactId, nextDate) {
    const { error } = await sb.from('contacts')
      .update({ next_contact_date: nextDate }).eq('id', contactId);
    if (error) console.error('updateNextContact:', error);
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
  formatDisplay(dateStr) {
    return this.parseDate(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  },
  formatShort(dateStr) {
    return this.parseDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  daysUntil(dateStr) {
    const today = this.parseDate(this.today());
    const d = this.parseDate(dateStr);
    return Math.ceil((d - today) / 86400000);
  },
  addInterval(dateStr, freq) {
    const d = this.parseDate(dateStr);
    if (freq.unit === 'months') d.setMonth(d.getMonth() + freq.value);
    else if (freq.unit === 'weeks') d.setDate(d.getDate() + freq.value * 7);
    else d.setDate(d.getDate() + freq.value);
    return this.fmt(d);
  },
  freqLabel(freq) {
    if (!freq) return '';
    const v = freq.value, u = freq.unit;
    const unit = v === 1 ? u.replace(/s$/, '') : u;
    return `Every ${v} ${unit}`;
  },
  methodLabel(m) {
    return { text: 'Text', call: 'Call', meet: 'Meet' }[m] || m || '';
  },
  methodIcon(m) {
    return { text: '💬', call: '📞', meet: '🤝' }[m] || '📋';
  },
  isOverdue(contact) {
    if (!contact.stayInContact || !contact.nextContactDate) return false;
    return contact.nextContactDate <= this.today();
  },
  daysOverdue(contact) {
    if (!contact.nextContactDate) return 0;
    return -this.daysUntil(contact.nextContactDate);
  }
};

// ===== APP =====
const App = {
  currentTab: 'contacts',
  _contacts: null,
  _allLogs: null,

  async init() {
    this._contacts = await DB.getContacts();
    this._allLogs = await DB.getAllLogs();
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('app-header').style.display = '';
    document.getElementById('net-tabs').style.display = '';
    document.getElementById('main-content').style.display = '';
    await this.Contacts.render();
  },

  switchTab(tab) {
    if (tab === 'detail') return;
    this.currentTab = tab;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + tab).classList.add('active');
    document.querySelectorAll('.net-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab)
    );
    if (tab === 'contacts') this.Contacts.render();
    else if (tab === 'tocontact') this.ToContact.render();
  },

  showDetail() {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-detail').classList.add('active');
  },

  openModal(title, body) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-overlay').classList.add('active');
    document.getElementById('modal').classList.add('active');
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    document.getElementById('modal').classList.remove('active');
  },

  async refresh() {
    this._contacts = await DB.getContacts();
    this._allLogs = await DB.getAllLogs();
  },

  // ===== CONTACTS LIST =====
  Contacts: {
    render() {
      const all = App._contacts || [];
      const logs = App._allLogs || [];
      const today = U.today();

      const lastContact = (c) => {
        const cLogs = logs.filter(l => l.contact_id === c.id);
        return cLogs.length ? cLogs[0] : null; // already sorted desc
      };

      const card = (c) => {
        const last = lastContact(c);
        const overdue = U.isOverdue(c);
        const daysOver = overdue ? U.daysOverdue(c) : 0;
        let badge = '';
        if (overdue) {
          badge = `<span class="card-badge badge-red">${daysOver === 0 ? 'Due Today' : daysOver + 'd overdue'}</span>`;
        } else if (c.stayInContact && c.nextContactDate) {
          const until = U.daysUntil(c.nextContactDate);
          badge = `<span class="card-badge badge-blue">In ${until}d</span>`;
        }
        return `<div class="card" onclick="App.Detail.show('${c.id}')">
          <div class="card-header">
            <span class="card-title">${c.name}</span>${badge}
          </div>
          <div class="card-subtitle">
            ${last ? `${U.methodIcon(last.method)} Last contact: ${U.formatShort(last.date)}` : 'No contact logged'}
            ${c.stayInContact ? ` · ${U.freqLabel(c.contactFrequency)}` : ''}
          </div>
          ${c.description ? `<div style="font-size:12px;color:var(--text-muted);margin-top:5px;">${c.description}</div>` : ''}
        </div>`;
      };

      const personal = all.filter(c => c.relationship === 'personal');
      const professional = all.filter(c => c.relationship === 'professional');

      let html = `<div class="view-header">
        <h2>Contacts</h2>
        <button class="btn btn-primary btn-sm" onclick="App.openAddModal()">+ Add</button>
      </div>`;

      if (all.length === 0) {
        html += `<div class="empty-state" style="padding:32px 0;">
          <p style="font-size:15px;margin-bottom:16px;">No contacts yet.</p>
          <button class="btn btn-primary" onclick="App.openAddModal()">+ Add Your First Contact</button>
        </div>`;
      } else {
        if (personal.length > 0) {
          html += `<div class="fitness-section-label" style="margin-bottom:10px;">PERSONAL</div>`;
          html += personal.map(card).join('');
        }
        if (professional.length > 0) {
          html += `<div class="fitness-section-label" style="margin:${personal.length?'20px':'0'} 0 10px;">PROFESSIONAL</div>`;
          html += professional.map(card).join('');
        }
      }

      document.getElementById('view-contacts').innerHTML = html;
    }
  },

  // ===== TO CONTACT =====
  ToContact: {
    render() {
      const contacts = (App._contacts || []).filter(c => c.stayInContact && c.nextContactDate);
      const logs = App._allLogs || [];
      const today = U.today();

      const overdue = contacts
        .filter(c => c.nextContactDate < today)
        .sort((a, b) => a.nextContactDate.localeCompare(b.nextContactDate));
      const dueToday = contacts.filter(c => c.nextContactDate === today);
      const upcoming = contacts
        .filter(c => c.nextContactDate > today)
        .sort((a, b) => a.nextContactDate.localeCompare(b.nextContactDate))
        .slice(0, 5);

      const card = (c, isOverdue) => {
        const last = (logs.filter(l => l.contact_id === c.id))[0];
        const daysAgo = last ? Math.round((new Date() - new Date(last.date)) / 86400000) : null;
        const daysOver = isOverdue ? U.daysOverdue(c) : null;
        return `<div class="card net-contact-card" onclick="App.Detail.show('${c.id}')">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
            <div style="flex:1;">
              <div style="font-size:15px;font-weight:700;">${c.name}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">
                ${c.relationship.charAt(0).toUpperCase()+c.relationship.slice(1)}
                ${c.contactMethod ? ' · Pref: ' + U.methodLabel(c.contactMethod) : ''}
              </div>
              ${last ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Last: ${U.formatShort(last.date)} · ${U.methodIcon(last.method)} ${U.methodLabel(last.method)}</div>` : '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">No contact logged</div>'}
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
              ${isOverdue
                ? `<span class="card-badge badge-red">${daysOver === 0 ? 'Today' : daysOver + 'd overdue'}</span>`
                : `<span class="card-badge badge-yellow">Due Today</span>`}
              <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();App.openLogModal('${c.id}')">
                Mark Contacted
              </button>
            </div>
          </div>
        </div>`;
      };

      const upcomingCard = (c) => {
        const until = U.daysUntil(c.nextContactDate);
        return `<div class="card" onclick="App.Detail.show('${c.id}')">
          <div class="card-header">
            <span class="card-title">${c.name}</span>
            <span class="card-badge badge-blue">In ${until}d</span>
          </div>
          <div class="card-subtitle">${U.formatShort(c.nextContactDate)} · ${U.freqLabel(c.contactFrequency)}</div>
        </div>`;
      };

      let html = `<div class="view-header" style="margin-bottom:16px;">
        <h2>To Contact</h2>
        <span style="font-size:12px;color:var(--text-muted);font-family:'JetBrains Mono',monospace;">${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
      </div>`;

      if (overdue.length === 0 && dueToday.length === 0) {
        html += `<div class="home-reminder-done" style="margin-bottom:20px;">
          <span style="font-size:20px;">✓</span><span>All caught up — no overdue contacts</span>
        </div>`;
      } else {
        if (overdue.length > 0) {
          html += `<div class="fitness-section-label" style="margin-bottom:10px;">OVERDUE</div>`;
          html += overdue.map(c => card(c, true)).join('');
        }
        if (dueToday.length > 0) {
          html += `<div class="fitness-section-label" style="margin:${overdue.length?'20px':'0'} 0 10px;">DUE TODAY</div>`;
          html += dueToday.map(c => card(c, false)).join('');
        }
      }

      if (upcoming.length > 0) {
        html += `<div class="fitness-section-label" style="margin:${(overdue.length||dueToday.length)?'24px':'0'} 0 10px;">UPCOMING</div>`;
        html += upcoming.map(upcomingCard).join('');
      }

      if ((App._contacts || []).filter(c => c.stayInContact).length === 0) {
        html += `<div class="empty-state" style="padding:32px 0;">
          <p style="font-size:14px;">No contacts set to stay in touch with.<br>Add a contact and enable "Stay in Contact".</p>
        </div>`;
      }

      document.getElementById('view-tocontact').innerHTML = html;
    }
  },

  // ===== DETAIL VIEW =====
  Detail: {
    _contactId: null,
    _calDate: new Date(),
    _selectedDate: null,

    async show(id) {
      this._contactId = id;
      this._calDate = new Date();
      this._selectedDate = null;
      await App.refresh();
      App.showDetail();
      this._render();
    },

    _render() {
      const c = (App._contacts || []).find(x => x.id === this._contactId);
      if (!c) { App.switchTab('contacts'); return; }
      const logs = (App._allLogs || []).filter(l => l.contact_id === c.id);
      const lastLog = logs[0];
      const today = U.today();
      const overdue = U.isOverdue(c);

      let statusBadge = '';
      if (c.stayInContact && c.nextContactDate) {
        if (overdue) {
          statusBadge = `<span class="card-badge badge-red">${U.daysOverdue(c) === 0 ? 'Due Today' : U.daysOverdue(c) + 'd overdue'}</span>`;
        } else {
          statusBadge = `<span class="card-badge badge-blue">In ${U.daysUntil(c.nextContactDate)}d</span>`;
        }
      }

      const html = `
        <button class="btn-back" onclick="App.switchTab('${App.currentTab}')">&#8249; Back</button>

        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:20px;">
          <div style="flex:1;">
            <h2 style="font-size:22px;font-weight:700;">${c.name}</h2>
            <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">
              ${c.relationship.charAt(0).toUpperCase()+c.relationship.slice(1)}
              ${c.contactMethod ? ' · Prefers ' + U.methodIcon(c.contactMethod) + ' ' + U.methodLabel(c.contactMethod) : ''}
            </div>
            ${c.description ? `<p style="font-size:13px;color:var(--text-secondary);margin-top:8px;">${c.description}</p>` : ''}
            ${c.phone ? `<a href="tel:${c.phone.replace(/\s/g,'')}" style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-size:14px;font-weight:600;color:var(--accent-blue);text-decoration:none;">📞 ${c.phone}</a>` : ''}
          </div>
          ${statusBadge}
        </div>

        ${c.stayInContact ? `
        <div class="detail-section">
          <div class="detail-section-title">Contact Schedule</div>
          <div class="detail-row"><span class="detail-label">Frequency</span><span class="detail-value">${U.freqLabel(c.contactFrequency)}</span></div>
          ${lastLog ? `<div class="detail-row"><span class="detail-label">Last Contact</span><span class="detail-value">${U.formatShort(lastLog.date)} · ${U.methodIcon(lastLog.method)} ${U.methodLabel(lastLog.method)}</span></div>` : ''}
          ${c.nextContactDate ? `<div class="detail-row"><span class="detail-label">Next Contact</span><span class="detail-value ${overdue?'text-danger':''}">${U.formatShort(c.nextContactDate)}</span></div>` : ''}
        </div>
        <div class="form-actions" style="margin-bottom:24px;">
          <button class="btn btn-primary" onclick="App.openLogModal('${c.id}')">Mark as Contacted</button>
        </div>` : ''}

        <div class="detail-section">
          <div class="detail-section-title">Contact History</div>
          <div class="calendar-header" style="margin-bottom:12px;">
            <button class="btn-icon" onclick="App.Detail.calPrev()">&#8249;</button>
            <h2 id="net-cal-label" style="font-size:16px;font-weight:600;"></h2>
            <button class="btn-icon" onclick="App.Detail.calNext()">&#8250;</button>
          </div>
          <div class="calendar-grid" id="net-cal-grid"></div>
          <div id="net-day-info" class="mt-16"></div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">All Interactions</div>
          <div id="net-log-list">${this._buildLogList(logs)}</div>
          <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="App.openLogModal('${c.id}', null, '')">+ Add Past Interaction</button>
        </div>

        <div class="form-actions" style="margin-top:8px;">
          <button class="btn btn-secondary" onclick="App.openAddModal('${c.id}')">Edit Contact</button>
        </div>
      `;

      document.getElementById('detail-content').innerHTML = html;
      this._updateCalendar(c, logs);
    },

    _buildLogList(logs) {
      if (!logs.length) return '<p class="text-muted" style="font-size:13px;">No interactions logged yet.</p>';
      return logs.slice(0, 20).map(l => `
        <div class="net-log-row">
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">${U.methodIcon(l.method)} ${U.methodLabel(l.method)} · ${U.formatShort(l.date)}</div>
            ${l.description ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:3px;">${l.description}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button class="btn btn-secondary btn-sm" onclick="App.openLogModal('${l.contact_id}', ${l.id})">Edit</button>
            <button class="btn btn-secondary btn-sm" style="color:var(--danger);" onclick="App.deleteLog(${l.id})">×</button>
          </div>
        </div>`).join('');
    },

    _updateCalendar(contact, logs) {
      const d = this._calDate;
      const year = d.getFullYear(), month = d.getMonth();
      document.getElementById('net-cal-label').textContent =
        d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      const logsByDate = {};
      logs.forEach(l => { logsByDate[l.date] = logsByDate[l.date] || []; logsByDate[l.date].push(l); });

      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const today = U.today();

      let html = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
        .map(l => `<div class="cal-day-label">${l}</div>`).join('');
      for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

      for (let day = 1; day <= daysInMonth; day++) {
        const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        let cls = 'cal-day';
        if (ds === today) cls += ' today';
        if (ds === this._selectedDate) cls += ' selected';
        if (logsByDate[ds]) cls += ' perfect';
        html += `<div class="${cls}" onclick="App.Detail.selectDay('${ds}')">${day}</div>`;
      }

      document.getElementById('net-cal-grid').innerHTML = html;

      if (this._selectedDate) {
        this._renderDayInfo(contact, this._selectedDate, logs);
      }
    },

    _renderDayInfo(contact, dateStr, logs) {
      const el = document.getElementById('net-day-info');
      if (!el) return;
      const today = U.today();
      const dayLogs = logs.filter(l => l.date === dateStr);

      let html = `<div class="cal-detail-date">${U.formatDisplay(dateStr)}</div>`;

      if (dayLogs.length) {
        dayLogs.forEach(l => {
          html += `<div class="net-log-row" style="margin-bottom:10px;">
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:600;">${U.methodIcon(l.method)} ${U.methodLabel(l.method)}</div>
              ${l.description ? `<div style="font-size:13px;color:var(--text-secondary);margin-top:3px;">${l.description}</div>` : ''}
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-secondary btn-sm" onclick="App.openLogModal('${l.contact_id}', ${l.id})">Edit</button>
              <button class="btn btn-secondary btn-sm" style="color:var(--danger);" onclick="App.deleteLog(${l.id})">×</button>
            </div>
          </div>`;
        });
      } else if (dateStr <= today) {
        html += `<p class="text-muted" style="font-size:13px;margin-bottom:8px;">No interaction logged on this day.</p>`;
      } else {
        html += `<p class="text-muted" style="font-size:13px;">Future date.</p>`;
        el.innerHTML = html; return;
      }

      if (dateStr <= today) {
        html += `<button class="btn btn-secondary btn-sm" onclick="App.openLogModal('${contact.id}', null, '${dateStr}')">
          + Add interaction on this date
        </button>`;
      }

      el.innerHTML = html;
    },

    selectDay(dateStr) {
      this._selectedDate = this._selectedDate === dateStr ? null : dateStr;
      const c = (App._contacts || []).find(x => x.id === this._contactId);
      if (!c) return;
      const logs = (App._allLogs || []).filter(l => l.contact_id === c.id);
      this._updateCalendar(c, logs);
    },

    calPrev() {
      this._calDate.setMonth(this._calDate.getMonth() - 1);
      const c = (App._contacts || []).find(x => x.id === this._contactId);
      if (c) this._updateCalendar(c, (App._allLogs||[]).filter(l=>l.contact_id===c.id));
    },
    calNext() {
      this._calDate.setMonth(this._calDate.getMonth() + 1);
      const c = (App._contacts || []).find(x => x.id === this._contactId);
      if (c) this._updateCalendar(c, (App._allLogs||[]).filter(l=>l.contact_id===c.id));
    }
  },

  // ===== ADD / EDIT CONTACT FORM =====
  openAddModal(editId) {
    const isEdit = !!editId;
    const c = isEdit ? (this._contacts || []).find(x => x.id === editId) : null;
    const rel = c?.relationship || 'personal';
    const cf = c?.contactFrequency || {};
    const hasFreq = !!c?.stayInContact;

    const html = `
      <div class="form-group">
        <label class="form-label">Name</label>
        <input class="form-input" id="f-name" placeholder="Full name" value="${c?.name || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Relationship</label>
        <div class="checkbox-group">
          <div class="checkbox-option ${rel==='personal'?'selected':''}" id="f-rel-personal" onclick="App.onRelChange('personal')">Personal</div>
          <div class="checkbox-option ${rel==='professional'?'selected':''}" id="f-rel-professional" onclick="App.onRelChange('professional')">Professional</div>
        </div>
        <input type="hidden" id="f-rel" value="${rel}">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="f-desc" placeholder="How you know them, notes...">${c?.description || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Phone Number</label>
        <input class="form-input" id="f-phone" type="tel" placeholder="+1 (555) 000-0000" value="${c?.phone || ''}">
      </div>

      <div class="form-group">
        <label class="form-label" style="margin-bottom:8px;">Stay in Contact</label>
        <div style="display:flex;align-items:center;gap:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;">
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;">Track contact cadence</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Get reminded when it's time to reach out</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="f-stay" ${hasFreq?'checked':''} onchange="App.onStayChange()">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div id="f-contact-options" style="display:${hasFreq?'block':'none'}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Every</label>
            <input class="form-input" id="f-freq-val" type="number" min="1" value="${cf.value || 1}">
          </div>
          <div class="form-group">
            <label class="form-label">Unit</label>
            <select class="form-select" id="f-freq-unit">
              <option value="days"   ${cf.unit==='days'  ?'selected':''}>Days</option>
              <option value="weeks"  ${cf.unit==='weeks' ?'selected':''}>Weeks</option>
              <option value="months" ${cf.unit==='months'||!cf.unit?'selected':''}>Months</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Preferred Method</label>
          <div class="checkbox-group" id="f-method-group">
            ${['text','call','meet'].map(m => `
              <div class="checkbox-option ${(c?.contactMethod||'')===m?'selected':''}"
                id="f-method-${m}" onclick="App.onMethodChange('${m}')">
                ${U.methodIcon(m)} ${U.methodLabel(m)}
              </div>`).join('')}
          </div>
          <input type="hidden" id="f-method" value="${c?.contactMethod || ''}">
        </div>
        <div class="form-group">
          <label class="form-label" style="margin-bottom:8px;">Show on Home Page</label>
          <div style="display:flex;align-items:center;gap:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;">
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:600;">Show in Today's Reminders</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Appears on home page when overdue</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="f-home" ${c?.showOnHome?'checked':''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <div class="form-group" style="margin-top:4px;">
        <label class="form-label">Last Contact (optional)</label>
        <input class="form-input" id="f-last-date" type="date" value="${isEdit ? '' : U.today()}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Method</label>
          <select class="form-select" id="f-last-method">
            <option value="">— none —</option>
            <option value="text">💬 Text</option>
            <option value="call">📞 Call</option>
            <option value="meet">🤝 Meet</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="f-last-desc" placeholder="What did you talk about?"></textarea>
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.saveContact('${editId||''}')">${isEdit?'Update':'Add Contact'}</button>
      </div>
      ${isEdit ? `<div class="form-actions mt-8">
        <button class="btn btn-danger btn-sm" onclick="App.deleteContact('${editId}')">Delete Contact</button>
      </div>` : ''}
    `;
    this.openModal(isEdit ? 'Edit Contact' : 'New Contact', html);
  },

  onRelChange(val) {
    document.getElementById('f-rel').value = val;
    document.getElementById('f-rel-personal').classList.toggle('selected', val === 'personal');
    document.getElementById('f-rel-professional').classList.toggle('selected', val === 'professional');
  },

  onStayChange() {
    const on = document.getElementById('f-stay').checked;
    document.getElementById('f-contact-options').style.display = on ? 'block' : 'none';
  },

  onMethodChange(val) {
    document.getElementById('f-method').value = val;
    ['text','call','meet'].forEach(m =>
      document.getElementById('f-method-' + m)?.classList.toggle('selected', m === val)
    );
  },

  async saveContact(editId) {
    const name = document.getElementById('f-name').value.trim();
    if (!name) { alert('Please enter a name.'); return; }

    const relationship = document.getElementById('f-rel').value;
    const description = document.getElementById('f-desc').value.trim() || null;
    const phone = document.getElementById('f-phone')?.value.trim() || null;
    const stayInContact = document.getElementById('f-stay').checked;
    const showOnHome = document.getElementById('f-home')?.checked || false;
    const contactMethod = document.getElementById('f-method')?.value || null;

    let contactFrequency = null;
    if (stayInContact) {
      const val = parseInt(document.getElementById('f-freq-val')?.value) || 1;
      const unit = document.getElementById('f-freq-unit')?.value || 'months';
      contactFrequency = { value: val, unit };
    }

    const lastDate = document.getElementById('f-last-date')?.value;
    const lastMethod = document.getElementById('f-last-method')?.value;
    const lastDesc = document.getElementById('f-last-desc')?.value.trim();

    const existing = editId ? (this._contacts || []).find(c => c.id === editId) : null;

    // Compute next contact date from last contact date + frequency
    let nextContactDate = existing?.nextContactDate || null;
    if (stayInContact && contactFrequency && lastDate) {
      nextContactDate = U.addInterval(lastDate, contactFrequency);
    } else if (stayInContact && contactFrequency && !lastDate && !nextContactDate) {
      nextContactDate = U.addInterval(U.today(), contactFrequency);
    }

    const contact = {
      id: editId || U.id(),
      name, relationship, description, phone,
      stayInContact, contactFrequency, contactMethod,
      showOnHome, nextContactDate
    };

    try {
      await DB.saveContact(contact);

      // Log the initial contact if date + method provided
      if (lastDate && lastMethod) {
        await DB.saveLog({
          contactId: contact.id,
          date: lastDate,
          method: lastMethod,
          description: lastDesc || null
        });
      }

      this.closeModal();
      await this.refresh();
      if (editId) await this.Detail.show(editId);
      else this.switchTab('contacts');
    } catch (e) {
      alert('Failed to save. Please try again.');
    }
  },

  async deleteContact(id) {
    if (!confirm('Delete this contact and all their history?')) return;
    await DB.deleteContact(id);
    this.closeModal();
    await this.refresh();
    this.switchTab('contacts');
  },

  // ===== LOG / MARK AS CONTACTED MODAL =====
  openLogModal(contactId, editLogId, prefillDate) {
    const c = (this._contacts || []).find(x => x.id === contactId);
    if (!c) return;

    let existingLog = null;
    if (editLogId) {
      existingLog = (this._allLogs || []).find(l => l.id === editLogId);
    }

    const isEdit = !!existingLog;
    const date = existingLog?.date || prefillDate || U.today();
    const method = existingLog?.method || c.contactMethod || '';
    const desc = existingLog?.description || '';

    const html = `
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
        ${isEdit ? 'Edit interaction with' : 'Log contact with'} <strong style="color:var(--text);">${c.name}</strong>
      </p>
      <div class="form-group">
        <label class="form-label">Date</label>
        <input class="form-input" id="fl-date" type="date" value="${date}">
      </div>
      <div class="form-group">
        <label class="form-label">Method</label>
        <div class="checkbox-group" id="fl-method-group">
          ${['text','call','meet'].map(m => `
            <div class="checkbox-option ${method===m?'selected':''}"
              id="fl-method-${m}" onclick="App.onLogMethodChange('${m}')">
              ${U.methodIcon(m)} ${U.methodLabel(m)}
            </div>`).join('')}
        </div>
        <input type="hidden" id="fl-method" value="${method}">
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="fl-desc" placeholder="What did you talk about?">${desc}</textarea>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.saveLog('${contactId}', ${editLogId||'null'})">${isEdit ? 'Update' : 'Save'}</button>
      </div>
    `;
    this.openModal(isEdit ? 'Edit Interaction' : 'Mark as Contacted', html);
  },

  onLogMethodChange(val) {
    document.getElementById('fl-method').value = val;
    ['text','call','meet'].forEach(m =>
      document.getElementById('fl-method-' + m)?.classList.toggle('selected', m === val)
    );
  },

  async saveLog(contactId, editLogId) {
    const date = document.getElementById('fl-date').value;
    const method = document.getElementById('fl-method').value;
    const description = document.getElementById('fl-desc').value.trim() || null;

    if (!date) { alert('Please select a date.'); return; }
    if (!method) { alert('Please select a method.'); return; }

    try {
      await DB.saveLog({
        id: editLogId || undefined,
        contactId, date, method, description
      });

      // Update next_contact_date if this is the most recent log and contact has frequency
      const c = (this._contacts || []).find(x => x.id === contactId);
      if (c?.stayInContact && c?.contactFrequency) {
        const logs = await DB.getLogsForContact(contactId);
        const mostRecent = logs[0]; // already desc by date
        if (mostRecent && mostRecent.date >= (c.nextContactDate || '')) {
          const next = U.addInterval(mostRecent.date, c.contactFrequency);
          await DB.updateNextContact(contactId, next);
        }
      }

      this.closeModal();
      await this.refresh();

      if (this.currentTab === 'detail' || document.getElementById('view-detail').classList.contains('active')) {
        await this.Detail.show(contactId);
      } else {
        this.switchTab(this.currentTab);
      }
    } catch (e) {
      alert('Failed to save. Please try again.');
    }
  },

  async deleteLog(logId) {
    if (!confirm('Delete this interaction?')) return;
    await DB.deleteLog(logId);
    await this.refresh();
    const c = (this._contacts || []).find(x => x.id === this.Detail._contactId);
    if (c) await this.Detail.show(c.id);
  }
};

Auth.guard().then(() => App.init());
