const ProgramUI = (() => {
  let state = {
    loading: true,
    message: '',
    session: null,
    profile: null,
    approved: [],
    proposals: [],
    editing: null,
    adminOpen: false,
    adminFilter: 'all',
    view: 'agenda',
    selectedDay: null,
    focusPlaceId: null
  };
  let unsubscribe = null;
  let programMap = null;

  const CATEGORY_META = window.MalagaMap?.CATEGORY_META || {};

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[ch]);

  const statusLabel = (status) => ({
    open: 'Bozza',
    approved: 'Approvata',
    closed: 'Chiusa',
    archived: 'Archiviata'
  })[status] || status;

  function categoryChip(category) {
    const m = CATEGORY_META[category];
    if (!m) return '';
    return `<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style="background:${m.color}22;color:${m.color}">${m.emoji} ${m.label}</span>`;
  }

  function approvedFiltered() {
    if (!state.selectedDay) return state.approved;
    return state.approved.filter(item => item.day_date === state.selectedDay);
  }

  function groupByDate(items) {
    const g = {};
    items.forEach(item => {
      if (!g[item.day_date]) g[item.day_date] = [];
      g[item.day_date].push(item);
    });
    return Object.keys(g).sort().map(date => ({ date, items: g[date] }));
  }

  async function load(root, ctx) {
    state.loading = true;
    render(root, ctx, false);

    const cfg = await window.MalagaSupabase.init();
    if (!cfg.ready) {
      state = { ...state, loading: false, message: cfg.error, session: null, profile: null, approved: [], proposals: [] };
      render(root, ctx, false);
      return;
    }

    if (!unsubscribe) unsubscribe = window.MalagaSupabase.onAuthChange(() => load(root, ctx));

    try {
      state.session = await window.MalagaSupabase.session();
      state.profile = state.session ? await window.MalagaSupabase.profile() : null;

      if (state.session && state.profile?.role !== 'admin') {
        await window.MalagaSupabase.signOut();
        state.session = null;
        state.profile = null;
        state.proposals = [];
        state.message = 'Accesso riservato ai tutor.';
      } else {
        state.proposals = state.profile?.role === 'admin'
          ? await window.MalagaSupabase.listProposals()
          : [];
      }

      state.approved = await window.MalagaSupabase.listApprovedProgram();
      state.loading = false;
    } catch (error) {
      state.loading = false;
      state.message = error.message || 'Errore nel caricamento del programma';
    }

    render(root, ctx, false);
  }

  function renderStats(ctx) {
    const today = new Date().toISOString().slice(0, 10);
    const days = new Set(state.approved.map(i => i.day_date)).size;
    const upcoming = state.approved.filter(i => i.day_date >= today).length;

    return `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div class="stat-card"><span class="stat-num">${state.approved.length}</span><span class="stat-label">Attività</span></div>
        <div class="stat-card stat-card--accent"><span class="stat-num">${days}</span><span class="stat-label">Giorni</span></div>
        <div class="stat-card"><span class="stat-num">${upcoming}</span><span class="stat-label">In arrivo</span></div>
        <div class="stat-card"><span class="stat-num">${countWithCoords(ctx)}</span><span class="stat-label">Su mappa</span></div>
      </div>
    `;
  }

  function countWithCoords(ctx) {
    if (!ctx) return 0;
    const seen = new Set();
    return state.approved.filter(i => {
      const place = i.place_id ? ctx.placeById(i.place_id) : null;
      if (!place?.lat || seen.has(place.id)) return false;
      seen.add(place.id);
      return true;
    }).length;
  }

  function renderDayPicker(ctx) {
    const dates = ctx.dates || [];
    const byDate = {};
    state.approved.forEach(item => { byDate[item.day_date] = (byDate[item.day_date] || 0) + 1; });
    return `
      <div class="day-picker-wrap">
        <div class="day-picker" id="program-day-picker">
          <button type="button" data-program-day="" class="day-chip ${!state.selectedDay ? 'day-chip--active' : ''}">Tutti</button>
          ${dates.map(d => {
            const dt = new Date(d + 'T12:00:00');
            const n = byDate[d] || 0;
            const active = state.selectedDay === d;
            return `<button type="button" data-program-day="${d}" class="day-chip ${active ? 'day-chip--active' : ''} ${n ? 'day-chip--has' : ''}">
              <span class="day-chip-wd">${dt.toLocaleDateString('it-IT', { weekday: 'short' })}</span>
              <span class="day-chip-n">${dt.getDate()}</span>
              ${n ? `<span class="day-chip-dot">${n}</span>` : ''}
            </button>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderViewTabs() {
    return `
      <div class="planner-view-tabs mt-4">
        <button type="button" data-program-view="agenda" class="planner-tab ${state.view === 'agenda' ? 'planner-tab--active' : ''}">📋 Agenda</button>
        <button type="button" data-program-view="calendar" class="planner-tab ${state.view === 'calendar' ? 'planner-tab--active' : ''}">📅 Calendario</button>
        <button type="button" data-program-view="map" class="planner-tab ${state.view === 'map' ? 'planner-tab--active' : ''}">🗺️ Mappa</button>
        <button type="button" data-program-view="detail" class="planner-tab ${state.view === 'detail' ? 'planner-tab--active' : ''}">ℹ️ Dettagli</button>
      </div>
    `;
  }

  function renderMainPanel(ctx) {
    if (!state.approved.length) {
      return `
        <div class="group-empty mt-4">
          <h3 class="group-panel-title mb-2">Nessun programma approvato</h3>
          <p class="text-sm">Appena un tutor pubblica un'attività, comparirà qui con calendario e mappa.</p>
        </div>
      `;
    }

    const panels = {
      agenda: renderAgendaView(ctx),
      calendar: renderCalendarView(ctx),
      map: renderMapPanel(),
      detail: renderDetailView(ctx)
    };

    return `
      ${renderViewTabs()}
      <div class="mt-4 space-y-4">
        ${Object.entries(panels).map(([id, html]) => `
          <div data-program-panel="${id}" class="${state.view !== id ? 'hidden' : ''}">${html}</div>
        `).join('')}
      </div>
    `;
  }

  function renderAgendaView(ctx) {
    const items = approvedFiltered();
    if (!items.length) {
      return `<div class="empty-state"><p>Nessuna attività in questo giorno.</p></div>`;
    }
    const groups = groupByDate(items);
    return groups.map(({ date, items: dayItems }) => `
      <div class="agenda-day">
        <h3 class="agenda-day-title">${ctx.formatDate(date)}</h3>
        <div class="space-y-3">
          ${dayItems.map(item => renderProgramCard(item, ctx)).join('')}
        </div>
      </div>
    `).join('');
  }

  function renderCalendarView(ctx) {
    const dates = ctx.dates || [];
    const byDate = {};
    state.approved.forEach(item => {
      if (!byDate[item.day_date]) byDate[item.day_date] = [];
      byDate[item.day_date].push(item);
    });
    const weeks = [];
    for (let i = 0; i < dates.length; i += 7) weeks.push(dates.slice(i, i + 7));

    return `
      <p class="text-xs text-gray-500 mb-3">Clicca un giorno per filtrare l'agenda. I giorni evidenziati hanno attività approvate.</p>
      <div class="cal-wrap">
        ${weeks.map((week, wi) => `
          <div class="cal-week">
            <div class="cal-week-label">Settimana ${wi + 1}</div>
            <div class="cal-grid">
              ${week.map(d => {
                const items = byDate[d] || [];
                const dt = new Date(d + 'T12:00:00');
                const sel = state.selectedDay === d;
                const titles = items.map(i => i.title).slice(0, 2).join(', ');
                return `<button type="button" data-program-cal-day="${d}" class="cal-cell ${items.length ? 'cal-cell--busy' : ''} ${sel ? 'cal-cell--sel' : ''}" title="${esc(titles)}">
                  <span class="cal-cell-d">${dt.getDate()}</span>
                  <span class="cal-cell-m">${dt.toLocaleDateString('it-IT', { month: 'short' })}</span>
                  ${items.length ? `<span class="cal-cell-n">${items.length} attività</span>` : ''}
                </button>`;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderMapPanel() {
    return `
      <div id="program-map" class="rounded-2xl border border-gray-100 overflow-hidden" style="height:380px"></div>
      <p class="text-xs text-gray-500 mt-2 text-center">Marker per le attività collegate a luoghi con coordinate nella guida.</p>
    `;
  }

  function renderDetailView(ctx) {
    const items = approvedFiltered();
    if (!items.length) {
      return `<div class="empty-state"><p>Nessuna attività da mostrare.</p></div>`;
    }
    return items.map(item => renderDetailCard(item, ctx)).join('');
  }

  function renderDetailCard(item, ctx) {
    const place = item.place_id ? ctx.placeById(item.place_id) : null;
    const loc = item.location || place?.location || '';
    return `
      <article class="proposal-card proposal-card--approved program-detail-card">
        <div class="flex flex-wrap justify-between gap-2">
          <div>
            <h4 class="font-bold text-[#6B1D2F] text-lg">${place?.icon ? esc(place.icon) + ' ' : ''}${esc(item.title)}</h4>
            <div class="proposal-meta">
              <span>📅 ${ctx.formatDate(item.day_date)}</span>
              ${loc ? `<span>📍 ${esc(loc)}</span>` : ''}
              ${place?.category ? categoryChip(place.category) : ''}
            </div>
          </div>
          <span class="proposal-badge">✓ Programma ufficiale</span>
        </div>
        ${item.description ? `
          <div class="program-detail-block mt-3">
            <h5 class="program-detail-label">Piano del giorno</h5>
            <p class="text-sm text-gray-700 leading-relaxed">${esc(item.description)}</p>
          </div>
        ` : ''}
        ${place ? `
          <div class="program-detail-block mt-3">
            <h5 class="program-detail-label">Luogo dalla guida</h5>
            <p class="text-sm font-semibold text-[#6B1D2F]">${esc(place.title)}</p>
            ${place.desc ? `<p class="text-sm text-gray-600 mt-1 leading-relaxed">${esc(place.desc)}</p>` : ''}
            <div class="proposal-meta mt-2">
              ${place.hours ? `<span>🕐 ${esc(place.hours)}</span>` : ''}
              ${place.location ? `<span>📍 ${esc(place.location)}</span>` : ''}
            </div>
          </div>
        ` : ''}
        <div class="flex flex-wrap gap-2 mt-3">
          ${place?.url ? `<a href="${place.url}" target="_blank" rel="noopener" class="plan-link">Sito ufficiale ↗</a>` : ''}
          ${place?.lat != null ? `<button type="button" data-program-focus-map="${place.id}" class="plan-link">Mostra sulla mappa</button>` : ''}
        </div>
      </article>
    `;
  }

  function renderProgramCard(item, ctx, admin = false) {
    const place = item.place_id ? ctx.placeById(item.place_id) : null;
    const loc = item.location || place?.location || '';
    return `
      <article class="proposal-card ${item.status === 'approved' ? 'proposal-card--approved' : ''}">
        <div class="flex flex-wrap justify-between gap-2">
          <div>
            <h4 class="font-bold text-[#6B1D2F] text-lg">${place?.icon ? esc(place.icon) + ' ' : ''}${esc(item.title)}</h4>
            <div class="proposal-meta">
              <span>${ctx.formatDate(item.day_date)}</span>
              ${loc ? `<span>${esc(loc)}</span>` : ''}
              ${place?.category ? categoryChip(place.category) : ''}
              ${admin ? `<span>${statusLabel(item.status)}</span>` : ''}
            </div>
          </div>
          <span class="proposal-badge">${admin ? statusLabel(item.status) : 'Scelto dai tutor'}</span>
        </div>
        ${item.description ? `<p class="text-sm text-gray-700 mt-2 leading-relaxed line-clamp-3">${esc(item.description)}</p>` : ''}
        ${place?.hours ? `<p class="text-xs text-gray-500 mt-1">🕐 ${esc(place.hours)}</p>` : ''}
        <div class="flex flex-wrap gap-2 mt-3">
          ${place?.url ? `<a href="${place.url}" target="_blank" rel="noopener" class="plan-link">Sito del luogo</a>` : ''}
          ${place?.lat != null ? `<button type="button" data-program-focus-map="${place.id}" class="plan-link">Mappa</button>` : ''}
          <button type="button" data-program-show-detail="${item.id}" class="plan-link">Dettagli</button>
        </div>
        ${admin ? `
          <div class="proposal-actions">
            <button type="button" data-program-edit="${item.id}" class="btn-secondary text-xs">Modifica</button>
            ${item.status !== 'approved' ? `<button type="button" data-program-approve="${item.id}" class="btn-secondary text-xs">Approva nel programma</button>` : ''}
          </div>
        ` : ''}
      </article>
    `;
  }

  function initProgramMap(ctx) {
    const el = document.getElementById('program-map');
    if (!el || typeof L === 'undefined') return;
    if (programMap) { programMap.remove(); programMap = null; }

    programMap = L.map('program-map').setView([36.7213, -4.4214], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(programMap);

    const bounds = [];
    const seen = new Set();
    state.approved.forEach(item => {
      const place = item.place_id ? ctx.placeById(item.place_id) : null;
      if (!place?.lat || seen.has(place.id)) return;
      seen.add(place.id);
      const dayItems = state.approved.filter(i => i.place_id === place.id);
      const popup = `
        <strong>${esc(place.icon)} ${esc(place.title)}</strong><br>
        ${dayItems.map(i => `<span style="font-size:12px">${esc(ctx.formatDate(i.day_date))}: ${esc(i.title)}</span>`).join('<br>')}
      `;
      L.marker([place.lat, place.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="font-size:24px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.35))">${place.icon}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 30]
        })
      }).addTo(programMap).bindPopup(popup);
      bounds.push([place.lat, place.lng]);
    });

    if (bounds.length) programMap.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
    if (state.focusPlaceId) {
      const place = ctx.placeById(state.focusPlaceId);
      if (place?.lat) programMap.setView([place.lat, place.lng], 16);
      state.focusPlaceId = null;
    }
    setTimeout(() => programMap?.invalidateSize(), 280);
  }

  function render(root, ctx, shouldLoad = true) {
    if (!root) return;
    if (shouldLoad) {
      load(root, ctx);
      return;
    }

    if (state.loading) {
      root.innerHTML = `<div class="group-panel text-center text-gray-500">Caricamento programma...</div>`;
      return;
    }

    if (!window.MalagaSupabase.state.ready) {
      root.innerHTML = renderSetupMissing();
      return;
    }

    const erasmus = ctx.dates?.length
      ? `${ctx.formatDate(ctx.dates[0])} – ${ctx.formatDate(ctx.dates[ctx.dates.length - 1])}`
      : '';

    root.innerHTML = `
      ${state.approved.length ? renderStats(ctx) : ''}
      ${state.approved.length ? `<p class="text-xs text-gray-500 mb-2">${esc(erasmus)} · programma ufficiale Erasmus</p>` : ''}
      ${state.approved.length ? renderDayPicker(ctx) : ''}
      <section class="mt-2">
        ${renderMainPanel(ctx)}
      </section>
      <footer id="program-admin-footer" class="program-admin-footer">
        ${renderAdminBox(ctx)}
      </footer>
    `;
    bind(root, ctx);
    if (state.view === 'map' && state.approved.length) initProgramMap(ctx);
  }

  function renderSetupMissing() {
    return `
      <div class="group-panel">
        <h3 class="group-panel-title">Programma non collegato</h3>
        <p class="text-sm text-gray-600 mt-2">Supabase è pronto nel codice. Manca solo la chiave pubblica in <code>data/supabase-config.json</code>.</p>
      </div>
    `;
  }

  function adminStats() {
    const proposals = state.proposals.filter(item => item.status !== 'archived');
    return {
      total: proposals.length,
      drafts: proposals.filter(item => item.status === 'open').length,
      approved: proposals.filter(item => item.status === 'approved').length,
      published: state.approved.length
    };
  }

  function renderAdminBox(ctx) {
    const expanded = state.adminOpen || state.profile?.role === 'admin';

    if (!expanded) {
      return `
        <div class="program-admin-bar">
          <button type="button" id="program-admin-toggle" class="program-admin-link">Gestione programma</button>
          ${state.message ? `<span class="program-admin-msg">${esc(state.message)}</span>` : ''}
        </div>
      `;
    }

    return `
      <div class="program-admin-expanded">
        ${state.profile?.role === 'admin' ? renderAdminArea(ctx) : renderAdminLogin()}
      </div>
    `;
  }

  function renderAdminLogin() {
    return `
      <div class="program-admin-panel">
        <div class="program-admin-panel-head">
          <p class="program-admin-panel-title">Accesso riservato</p>
          <button type="button" id="program-admin-close" class="program-admin-link">Chiudi</button>
        </div>
        ${state.message ? `<p class="program-admin-msg program-admin-msg--block">${esc(state.message)}</p>` : ''}
        <form id="program-login-form" class="program-admin-form">
          <label class="field-label" for="program-login-email">Email</label>
          <input type="email" id="program-login-email" required class="field-input" placeholder="tutor@email.it" autocomplete="username">
          <label class="field-label" for="program-login-password">Password</label>
          <input type="password" id="program-login-password" required minlength="6" class="field-input" placeholder="Password" autocomplete="current-password">
          <button type="submit" class="btn-primary mt-3 w-full sm:w-auto">Accedi</button>
        </form>
      </div>
    `;
  }

  function renderAdminFilterTabs() {
    const stats = adminStats();
    const tabs = [
      { id: 'all', label: 'Tutti', count: stats.total },
      { id: 'open', label: 'Bozze', count: stats.drafts },
      { id: 'approved', label: 'Approvati', count: stats.approved }
    ];
    return `
      <div class="program-admin-filters" role="tablist" aria-label="Filtra piani">
        ${tabs.map(tab => `
          <button type="button" data-admin-filter="${tab.id}" class="program-admin-filter ${state.adminFilter === tab.id ? 'program-admin-filter--active' : ''}" role="tab" aria-selected="${state.adminFilter === tab.id}">
            ${tab.label}${tab.count ? `<span class="program-admin-filter-count">${tab.count}</span>` : ''}
          </button>
        `).join('')}
      </div>
    `;
  }

  function filteredProposals() {
    const items = state.proposals.filter(item => item.status !== 'archived');
    if (state.adminFilter === 'open') return items.filter(item => item.status === 'open');
    if (state.adminFilter === 'approved') return items.filter(item => item.status === 'approved');
    return items;
  }

  function renderAdminArea(ctx) {
    const stats = adminStats();
    const list = filteredProposals();
    const name = state.profile.display_name || state.profile.email || 'Tutor';
    const initial = name.trim().charAt(0).toUpperCase() || 'T';

    return `
      <div class="program-admin-shell">
        <div class="program-admin-header">
          <div class="program-admin-user">
            <span class="program-admin-avatar" aria-hidden="true">${esc(initial)}</span>
            <div>
              <p class="program-admin-name">${esc(name)}</p>
              <span class="program-admin-role">Tutor · gestione programma</span>
            </div>
          </div>
          <button type="button" id="program-signout" class="program-admin-btn-ghost">Esci</button>
        </div>

        <div class="program-admin-kpis">
          <div class="program-admin-kpi">
            <span class="program-admin-kpi-num">${stats.drafts}</span>
            <span class="program-admin-kpi-label">Bozze</span>
          </div>
          <div class="program-admin-kpi program-admin-kpi--accent">
            <span class="program-admin-kpi-num">${stats.approved}</span>
            <span class="program-admin-kpi-label">Approvati</span>
          </div>
          <div class="program-admin-kpi">
            <span class="program-admin-kpi-num">${stats.published}</span>
            <span class="program-admin-kpi-label">In programma</span>
          </div>
        </div>

        <div class="program-admin-layout">
          <section class="program-admin-form-col" aria-labelledby="program-admin-form-title">
            <h4 id="program-admin-form-title" class="program-admin-section-title">${state.editing ? 'Modifica attività' : 'Nuova attività'}</h4>
            ${renderProposalForm(ctx)}
          </section>
          <section class="program-admin-list-col" aria-labelledby="program-admin-list-title">
            <div class="program-admin-list-head">
              <h4 id="program-admin-list-title" class="program-admin-section-title">Piani e bozze</h4>
              ${state.editing ? '<button type="button" id="program-new-plan" class="program-admin-btn-ghost">+ Nuovo</button>' : ''}
            </div>
            ${renderAdminFilterTabs()}
            <div class="program-admin-list space-y-3">
              ${list.length
                ? list.map(item => renderAdminProposalCard(item, ctx)).join('')
                : '<div class="group-empty">Nessun piano in questa categoria. Crea una nuova attività a sinistra.</div>'}
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function renderAdminProposalCard(item, ctx) {
    const place = item.place_id ? ctx.placeById(item.place_id) : null;
    const loc = item.location || place?.location || '';
    const isApproved = item.status === 'approved';
    return `
      <article class="program-admin-item ${isApproved ? 'program-admin-item--approved' : ''}">
        <div class="program-admin-item-main">
          <div class="program-admin-item-top">
            <h5 class="program-admin-item-title">${place?.icon ? esc(place.icon) + ' ' : ''}${esc(item.title)}</h5>
            <span class="program-admin-status program-admin-status--${esc(item.status)}">${statusLabel(item.status)}</span>
          </div>
          <p class="program-admin-item-meta">
            <span>📅 ${ctx.formatDate(item.day_date)}</span>
            ${loc ? `<span>📍 ${esc(loc)}</span>` : ''}
          </p>
          ${item.description ? `<p class="program-admin-item-desc">${esc(item.description)}</p>` : ''}
        </div>
        <div class="program-admin-item-actions">
          <button type="button" data-program-edit="${item.id}" class="program-admin-action">Modifica</button>
          ${!isApproved ? `<button type="button" data-program-approve="${item.id}" class="program-admin-action program-admin-action--primary">Pubblica</button>` : '<span class="program-admin-published">✓ Nel programma</span>'}
          <button type="button" data-program-delete="${item.id}" class="program-admin-action program-admin-action--danger">Elimina</button>
        </div>
      </article>
    `;
  }

  function renderProposalForm(ctx) {
    const edit = state.editing;
    const dates = ctx.dates.map(d => `<option value="${d}" ${edit?.day_date === d ? 'selected' : ''}>${ctx.formatDate(d)}</option>`).join('');
    const placeOptions = ctx.places.map(place => `<option value="${esc(place.id)}" ${edit?.place_id === place.id ? 'selected' : ''}>${esc(place.icon)} ${esc(place.title)}</option>`).join('');
    return `
      <form id="program-proposal-form" class="program-admin-form">
        <input type="hidden" id="program-proposal-id" value="${esc(edit?.id || '')}">
        <input type="hidden" id="program-proposal-status" value="${esc(edit?.status || 'open')}">
        <div class="program-admin-field">
          <label class="field-label" for="program-title">Titolo attività</label>
          <input type="text" id="program-title" required class="field-input" value="${esc(edit?.title || '')}" placeholder="Es. Gita a Kinsale">
        </div>
        <div class="program-admin-field">
          <label class="field-label" for="program-date">Data</label>
          <select id="program-date" required class="field-input">${dates}</select>
        </div>
        <div class="program-admin-field">
          <label class="field-label" for="program-place">Luogo dalla guida</label>
          <select id="program-place" class="field-input">
            <option value="">— Personalizzato —</option>
            ${placeOptions}
          </select>
        </div>
        <div class="program-admin-field">
          <label class="field-label" for="program-location">Luogo / ritrovo</label>
          <input type="text" id="program-location" class="field-input" value="${esc(edit?.location || '')}" placeholder="Es. Kent Station, ore 9:00">
        </div>
        <div class="program-admin-field">
          <label class="field-label" for="program-description">Descrizione</label>
          <textarea id="program-description" rows="4" class="field-input" placeholder="Orari, costi, cosa portare…">${esc(edit?.description || '')}</textarea>
        </div>
        <div class="program-admin-form-actions">
          <button type="submit" class="btn-primary program-admin-submit">${edit ? 'Salva modifiche' : 'Crea bozza'}</button>
          ${edit ? '<button type="button" id="program-cancel-edit" class="btn-secondary">Annulla</button>' : ''}
        </div>
      </form>
    `;
  }

  function bind(root, ctx) {
    root.querySelectorAll('[data-program-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.view = btn.dataset.programView;
        render(root, ctx, false);
      });
    });

    root.querySelector('#program-day-picker')?.addEventListener('click', e => {
      const chip = e.target.closest('[data-program-day]');
      if (!chip) return;
      state.selectedDay = chip.dataset.programDay || null;
      render(root, ctx, false);
    });

    root.querySelectorAll('[data-program-cal-day]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedDay = btn.dataset.programCalDay;
        state.view = 'agenda';
        render(root, ctx, false);
      });
    });

    root.querySelectorAll('[data-program-focus-map]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.focusPlaceId = btn.dataset.programFocusMap;
        state.view = 'map';
        render(root, ctx, false);
      });
    });

    root.querySelectorAll('[data-program-show-detail]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = state.approved.find(i => i.id === btn.dataset.programShowDetail);
        if (item) state.selectedDay = item.day_date;
        state.view = 'detail';
        render(root, ctx, false);
        root.querySelector(`[data-program-panel="detail"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    root.querySelector('#program-admin-toggle')?.addEventListener('click', () => {
      state.adminOpen = true;
      render(root, ctx, false);
    });

    root.querySelector('#program-admin-close')?.addEventListener('click', () => {
      state.adminOpen = false;
      state.message = '';
      render(root, ctx, false);
    });

    root.querySelector('#program-login-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      await run(root, ctx, async () => {
        await window.MalagaSupabase.signInWithPassword(
          root.querySelector('#program-login-email').value.trim(),
          root.querySelector('#program-login-password').value
        );
        const profile = await window.MalagaSupabase.profile();
        if (profile?.role !== 'admin' || profile?.status !== 'active') {
          await window.MalagaSupabase.signOut();
          throw new Error('Accesso riservato ai tutor.');
        }
        state.message = '';
      });
    });

    root.querySelector('#program-signout')?.addEventListener('click', async () => {
      await run(root, ctx, () => window.MalagaSupabase.signOut());
    });

    root.querySelector('#program-proposal-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const placeId = root.querySelector('#program-place').value;
      const place = placeId ? ctx.placeById(placeId) : null;
      await run(root, ctx, async () => {
        await window.MalagaSupabase.saveProposal({
          id: root.querySelector('#program-proposal-id').value || null,
          title: root.querySelector('#program-title').value.trim(),
          day_date: root.querySelector('#program-date').value,
          place_id: placeId || null,
          location: root.querySelector('#program-location').value.trim() || place?.title || '',
          description: root.querySelector('#program-description').value.trim(),
          status: root.querySelector('#program-proposal-status').value || 'open'
        });
        state.editing = null;
        window.App?.showToast?.('Piano salvato');
      });
    });

    root.querySelector('#program-cancel-edit')?.addEventListener('click', () => {
      state.editing = null;
      render(root, ctx, false);
    });

    root.querySelector('#program-new-plan')?.addEventListener('click', () => {
      state.editing = null;
      render(root, ctx, false);
      root.querySelector('#program-proposal-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    root.querySelectorAll('[data-admin-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.adminFilter = btn.dataset.adminFilter;
        render(root, ctx, false);
      });
    });

    root.querySelectorAll('[data-program-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.editing = state.proposals.find(item => item.id === btn.dataset.programEdit) || null;
        render(root, ctx, false);
        root.querySelector('#program-proposal-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    root.querySelectorAll('[data-program-approve]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Pubblicare questa attività nel programma ufficiale visibile a tutti?')) return;
        await run(root, ctx, async () => {
          await window.MalagaSupabase.approveProposal(btn.dataset.programApprove);
          window.App?.showToast?.('Programma aggiornato');
        });
      });
    });

    root.querySelectorAll('[data-program-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const item = state.proposals.find(i => i.id === btn.dataset.programDelete);
        const msg = item?.status === 'approved'
          ? 'Eliminare questa attività dal programma ufficiale? Non sarà più visibile agli studenti.'
          : 'Eliminare questa attività?';
        if (!confirm(msg)) return;
        await run(root, ctx, async () => {
          await window.MalagaSupabase.deleteProposal(btn.dataset.programDelete);
          if (state.editing?.id === btn.dataset.programDelete) state.editing = null;
          window.App?.showToast?.('Attività eliminata');
        });
      });
    });
  }

  async function run(root, ctx, action) {
    try {
      await action();
      await load(root, ctx);
    } catch (error) {
      state.message = error.message || 'Operazione non riuscita';
      window.App?.showToast?.(state.message);
      await load(root, ctx);
    }
  }

  function destroy() {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    if (programMap) { programMap.remove(); programMap = null; }
  }

  return { render, destroy };
})();

window.ProgramUI = ProgramUI;
window.GroupPlanningUI = ProgramUI;
