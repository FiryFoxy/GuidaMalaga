// UI Planner migliorata
const PlannerUI = (() => {
  let state = { view: 'agenda', filter: 'upcoming', selectedDay: null };
  let miniMap = null;

  const CATEGORY_META = window.MalagaMap?.CATEGORY_META || {};

  function categoryChip(category) {
    const m = CATEGORY_META[category];
    if (!m) return '';
    return `<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style="background:${m.color}22;color:${m.color}">${m.emoji} ${m.label}</span>`;
  }

  function plansFiltered(plans) {
    const today = new Date().toISOString().slice(0, 10);
    return plans.filter(p => {
      if (state.selectedDay && p.date !== state.selectedDay) return false;
      if (state.filter === 'upcoming') return !p.done && p.date >= today;
      if (state.filter === 'done') return p.done;
      return true;
    });
  }

  function groupByDate(plans) {
    const g = {};
    plans.forEach(p => {
      if (!g[p.date]) g[p.date] = [];
      g[p.date].push(p);
    });
    return Object.keys(g).sort().map(date => ({ date, items: g[date] }));
  }

  function renderStats(plans) {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = plans.filter(p => !p.done && p.date >= today).length;
    const done = plans.filter(p => p.done).length;
    return `
      <div class="grid grid-cols-3 gap-3">
        <div class="stat-card"><span class="stat-num">${plans.length}</span><span class="stat-label">Totali</span></div>
        <div class="stat-card stat-card--accent"><span class="stat-num">${upcoming}</span><span class="stat-label">Da fare</span></div>
        <div class="stat-card"><span class="stat-num">${done}</span><span class="stat-label">Fatte</span></div>
      </div>
    `;
  }

  function renderDayPicker(dates, plans) {
    const byDate = {};
    plans.forEach(p => { byDate[p.date] = (byDate[p.date] || 0) + 1; });
    return `
      <div class="day-picker-wrap">
        <div class="day-picker" id="planner-day-picker">
          <button type="button" data-day="" class="day-chip ${!state.selectedDay ? 'day-chip--active' : ''}">Tutti</button>
          ${dates.map(d => {
            const dt = new Date(d + 'T12:00:00');
            const n = byDate[d] || 0;
            const active = state.selectedDay === d;
            return `<button type="button" data-day="${d}" class="day-chip ${active ? 'day-chip--active' : ''} ${n ? 'day-chip--has' : ''}">
              <span class="day-chip-wd">${dt.toLocaleDateString('it-IT', { weekday: 'short' })}</span>
              <span class="day-chip-n">${dt.getDate()}</span>
              ${n ? `<span class="day-chip-dot">${n}</span>` : ''}
            </button>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderAgenda(plans, placeById) {
    const filtered = plansFiltered(plans);
    if (!filtered.length) {
      return `<div class="empty-state">
        <span class="text-4xl mb-2">🗓️</span>
        <p>Nessuna uscita in questa vista.</p>
        <p class="text-sm text-gray-500 mt-1">Seleziona un giorno o aggiungi un'uscita dal form.</p>
      </div>`;
    }
    const groups = groupByDate(filtered);
    return groups.map(({ date, items }) => `
      <div class="agenda-day">
        <h4 class="agenda-day-title">${window.planner.formatDateIT(date)}</h4>
        <div class="space-y-2">
          ${items.map(p => renderPlanCard(p, placeById(p.placeId))).join('')}
        </div>
      </div>
    `).join('');
  }

  function renderPlanCard(p, place) {
    const icon = place?.icon || '📌';
    const cat = place?.category;
    return `
      <article class="plan-card ${p.done ? 'plan-card--done' : ''}" data-plan-id="${p.id}">
        <div class="plan-card-time">${p.time || '—'}</div>
        <div class="plan-card-body">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <span class="font-bold text-[#6B1D2F]">${icon} ${p.title}</span>
            ${cat ? categoryChip(cat) : ''}
          </div>
          ${p.note ? `<p class="text-sm text-gray-600">${p.note}</p>` : ''}
          <div class="flex flex-wrap gap-2 mt-2">
            ${place?.url ? `<a href="${place.url}" target="_blank" rel="noopener" class="plan-link">Sito ↗</a>` : ''}
            ${place?.lat != null ? `<button type="button" data-focus-map="${place.id}" class="plan-link">Mappa</button>` : ''}
          </div>
        </div>
        <div class="plan-card-actions">
          <button type="button" data-toggle-done="${p.id}" class="btn-icon" title="${p.done ? 'Segna da fare' : 'Completata'}">${p.done ? '↩' : '✓'}</button>
          <button type="button" data-remove-plan="${p.id}" class="btn-icon btn-icon--danger" title="Elimina">×</button>
        </div>
      </article>
    `;
  }

  function renderCalendarGrid(dates, plans) {
    const byDate = {};
    plans.forEach(p => {
      if (!byDate[p.date]) byDate[p.date] = [];
      byDate[p.date].push(p);
    });
    const weeks = [];
    for (let i = 0; i < dates.length; i += 7) weeks.push(dates.slice(i, i + 7));

    return weeks.map((week, wi) => `
      <div class="cal-week">
        <div class="cal-week-label">Settimana ${wi + 1}</div>
        <div class="cal-grid">
          ${week.map(d => {
            const items = byDate[d] || [];
            const dt = new Date(d + 'T12:00:00');
            const sel = state.selectedDay === d;
            return `<button type="button" data-cal-day="${d}" class="cal-cell ${items.length ? 'cal-cell--busy' : ''} ${sel ? 'cal-cell--sel' : ''}">
              <span class="cal-cell-d">${dt.getDate()}</span>
              <span class="cal-cell-m">${dt.toLocaleDateString('it-IT', { month: 'short' })}</span>
              ${items.length ? `<span class="cal-cell-n">${items.length} uscita${items.length > 1 ? 'e' : ''}</span>` : ''}
            </button>`;
          }).join('')}
        </div>
      </div>
    `).join('');
  }

  function bindEvents(ctx) {
    const { onRefresh, placeById, onAddFromMap } = ctx;

    document.querySelectorAll('.planner-tab').forEach(btn => {
      btn.onclick = () => {
        state.view = btn.dataset.plannerView;
        document.querySelectorAll('.planner-tab').forEach(b => b.classList.toggle('planner-tab--active', b === btn));
        document.querySelectorAll('[data-planner-panel]').forEach(p => {
          p.classList.toggle('hidden', p.dataset.plannerPanel !== state.view);
        });
        if (state.view === 'map-mini') initMiniMap(ctx);
        onRefresh();
      };
    });

    document.querySelectorAll('[data-filter]').forEach(btn => {
      btn.onclick = () => {
        state.filter = btn.dataset.filter;
        state.selectedDay = null;
        document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('filter-pill--active', b === btn));
        onRefresh();
      };
    });

    document.getElementById('planner-day-picker')?.addEventListener('click', e => {
      const chip = e.target.closest('[data-day]');
      if (!chip) return;
      state.selectedDay = chip.dataset.day || null;
      state.filter = 'all';
      onRefresh();
    });

    document.querySelectorAll('[data-cal-day]').forEach(btn => {
      btn.onclick = () => {
        state.selectedDay = btn.dataset.calDay;
        state.view = 'agenda';
        onRefresh();
      };
    });

    document.getElementById('planner-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const date = document.getElementById('planner-date').value;
      const time = document.getElementById('planner-time').value;
      const placeId = document.getElementById('planner-place').value;
      const note = document.getElementById('planner-note').value.trim();
      const place = placeId ? placeById(placeId) : null;
      window.planner.addPlan({
        date, time, placeId,
        title: place ? place.title : (note || 'Uscita libera'),
        note
      });
      window.App?.showToast?.('Uscita aggiunta al planner');
      e.target.reset();
      const dateSel = document.getElementById('planner-date');
      if (dateSel && state.selectedDay) dateSel.value = state.selectedDay;
      onRefresh();
    });

    document.getElementById('planner-export')?.addEventListener('click', () => window.planner.exportPlansJSON());
    document.getElementById('planner-import')?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) window.planner.importPlansJSON(file, () => { window.App?.showToast?.('Planner importato'); onRefresh(); });
    });
    document.getElementById('planner-clear')?.addEventListener('click', () => {
      window.planner.clearAllPlans();
      onRefresh();
    });

    document.querySelectorAll('[data-remove-plan]').forEach(btn => {
      btn.onclick = () => { window.planner.removePlan(btn.dataset.removePlan); onRefresh(); };
    });
    document.querySelectorAll('[data-toggle-done]').forEach(btn => {
      btn.onclick = () => {
        const plan = window.planner.getSavedPlans().find(p => p.id === btn.dataset.toggleDone);
        if (plan) window.planner.updatePlan(plan.id, { done: !plan.done });
        onRefresh();
      };
    });

    document.querySelectorAll('[data-focus-map]').forEach(btn => {
      btn.onclick = () => {
        const place = placeById(btn.dataset.focusMap);
        if (place) {
          state.view = 'map-mini';
          onRefresh();
          setTimeout(() => {
            if (miniMap && place.lat) miniMap.setView([place.lat, place.lng], 16);
          }, 400);
        }
      };
    });

    document.getElementById('planner-place')?.addEventListener('change', e => {
      const place = placeById(e.target.value);
      const note = document.getElementById('planner-note');
      if (place && note && !note.value) note.placeholder = `Note per ${place.title}…`;
    });
  }

  function initMiniMap(ctx) {
    const el = document.getElementById('planner-mini-map');
    if (!el || typeof L === 'undefined') return;
    if (miniMap) { miniMap.remove(); miniMap = null; }
    const plans = window.planner.getSavedPlans();
    const plannedPlaces = plans
      .map(p => p.placeId && ctx.placeById(p.placeId))
      .filter(p => p && p.lat != null);

    miniMap = L.map('planner-mini-map').setView([36.7213, -4.4214], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(miniMap);
    const bounds = [];
    plannedPlaces.forEach(place => {
      L.marker([place.lat, place.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="font-size:22px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))">${place.icon}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 28]
        })
      }).addTo(miniMap).bindPopup(place.title);
      bounds.push([place.lat, place.lng]);
    });
    if (bounds.length) miniMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    setTimeout(() => miniMap?.invalidateSize(), 250);
  }

  function render(ctx) {
    const root = document.getElementById('planner-root');
    if (!root) return;

    const plans = window.planner.getSavedPlans();
    const dates = window.planner.getDateRange();
    const { places, placeById } = ctx;

    const placeOptions = places.map(p =>
      `<option value="${p.id}">${p.icon} ${p.title}</option>`
    ).join('');

    const dateOptions = dates.map(d =>
      `<option value="${d}" ${state.selectedDay === d ? 'selected' : ''}>${window.planner.formatDateIT(d)}</option>`
    ).join('');

    const erasmus = window.planner.START_DATE && window.planner.END_DATE
      ? `${window.planner.formatDateIT(window.planner.START_DATE)} – ${window.planner.formatDateIT(window.planner.END_DATE)}`
      : '';

    root.innerHTML = `
      ${renderStats(plans)}

      <div class="flex flex-wrap gap-2 mt-4 mb-2">
        <button type="button" data-filter="upcoming" class="filter-pill ${state.filter === 'upcoming' ? 'filter-pill--active' : ''}">Da fare</button>
        <button type="button" data-filter="all" class="filter-pill ${state.filter === 'all' ? 'filter-pill--active' : ''}">Tutte</button>
        <button type="button" data-filter="done" class="filter-pill ${state.filter === 'done' ? 'filter-pill--active' : ''}">Completate</button>
      </div>

      ${renderDayPicker(dates, plans)}

      <div class="grid grid-cols-1 xl:grid-cols-5 gap-6 mt-6">
        <aside class="xl:col-span-2 space-y-4">
          <form id="planner-form" class="planner-form-card">
            <h3 class="planner-form-title">➕ Nuova uscita</h3>
            <p class="text-xs text-gray-500 mb-4">${erasmus}</p>
            <label class="field-label">Data</label>
            <select id="planner-date" required class="field-input">${dateOptions}</select>
            <label class="field-label">Orario</label>
            <input type="time" id="planner-time" class="field-input">
            <label class="field-label">Luogo dalla guida</label>
            <select id="planner-place" class="field-input">
              <option value="">— Personalizzata —</option>
              ${placeOptions}
            </select>
            <label class="field-label">Titolo / nota</label>
            <input type="text" id="planner-note" placeholder="Es. Aperitivo, cena di gruppo…" class="field-input">
            <button type="submit" class="btn-primary w-full mt-2">Aggiungi</button>
          </form>
          <div class="flex flex-wrap gap-2">
            <button type="button" id="planner-export" class="btn-secondary text-xs">Esporta</button>
            <label class="btn-secondary text-xs cursor-pointer">
              Importa <input type="file" id="planner-import" accept=".json" class="hidden">
            </label>
            <button type="button" id="planner-clear" class="btn-secondary text-xs text-red-700 border-red-200">Svuota</button>
          </div>
        </aside>

        <div class="xl:col-span-3">
          <div class="planner-view-tabs">
            <button type="button" data-planner-view="agenda" class="planner-tab ${state.view === 'agenda' ? 'planner-tab--active' : ''}">📋 Agenda</button>
            <button type="button" data-planner-view="calendar" class="planner-tab ${state.view === 'calendar' ? 'planner-tab--active' : ''}">📅 Calendario</button>
            <button type="button" data-planner-view="map-mini" class="planner-tab ${state.view === 'map-mini' ? 'planner-tab--active' : ''}">🗺️ Mappa uscite</button>
          </div>

          <div data-planner-panel="agenda" class="${state.view !== 'agenda' ? 'hidden' : ''} mt-4 agenda-list">
            ${renderAgenda(plans, placeById)}
          </div>
          <div data-planner-panel="calendar" class="${state.view !== 'calendar' ? 'hidden' : ''} mt-4 cal-wrap">
            ${renderCalendarGrid(dates, plans)}
          </div>
          <div data-planner-panel="map-mini" class="${state.view !== 'map-mini' ? 'hidden' : ''} mt-4">
            <div id="planner-mini-map" class="rounded-2xl border border-gray-100 overflow-hidden" style="height:360px"></div>
            <p class="text-xs text-gray-500 mt-2 text-center">Solo luoghi con coordinate e già nel planner</p>
          </div>
        </div>
      </div>

    `;

    bindEvents({ ...ctx, onRefresh: () => render(ctx) });

    if (state.view === 'map-mini') initMiniMap(ctx);
  }

  function destroy() {
    if (miniMap) { miniMap.remove(); miniMap = null; }
  }

  return { render, destroy, resetDay: () => { state.selectedDay = null; } };
})();

window.PlannerUI = PlannerUI;
