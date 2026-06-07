// Planner uscite Malaga Erasmus — 10 luglio / 13 agosto 2026
const PLANNER_KEY = 'uscitePlannerMalaga2026';
const FAVORITES_KEY = 'favoritesMalaga2026';
let START_DATE = '2026-07-10';
let END_DATE = '2026-08-13';

function setErasmusDates(start, end) {
  if (start) START_DATE = start;
  if (end) END_DATE = end;
}

function getSavedPlans() {
  try {
    return JSON.parse(localStorage.getItem(PLANNER_KEY) || '[]');
  } catch {
    return [];
  }
}

function savePlans(plans) {
  localStorage.setItem(PLANNER_KEY, JSON.stringify(plans));
}

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveFavorites(favs) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

function toggleFavorite(placeId) {
  const favs = getFavorites();
  const i = favs.indexOf(placeId);
  if (i >= 0) favs.splice(i, 1);
  else favs.push(placeId);
  saveFavorites(favs);
  return favs.includes(placeId);
}

function isFavorite(placeId) {
  return getFavorites().includes(placeId);
}

function addPlan({ date, time, placeId, title, note }) {
  const plans = getSavedPlans();
  plans.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date,
    time: time || '',
    placeId: placeId || '',
    title: title || 'Uscita libera',
    note: note || '',
    done: false
  });
  plans.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  savePlans(plans);
}

function updatePlan(id, patch) {
  const plans = getSavedPlans().map(p => (p.id === id ? { ...p, ...patch } : p));
  savePlans(plans);
}

function removePlan(id) {
  savePlans(getSavedPlans().filter(p => p.id !== id));
}

function clearAllPlans() {
  if (confirm('Eliminare tutte le uscite pianificate?')) {
    savePlans([]);
  }
}

function getDateRange() {
  const dates = [];
  const current = new Date(START_DATE + 'T12:00:00');
  const end = new Date(END_DATE + 'T12:00:00');
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function formatDateIT(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
}

function exportPlansJSON() {
  const blob = new Blob([JSON.stringify(getSavedPlans(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'planner-malaga-2026.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importPlansJSON(file, onDone) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error('Formato non valido');
      savePlans(data);
      onDone?.();
    } catch {
      alert('File JSON non valido.');
    }
  };
  reader.readAsText(file);
}

window.planner = {
  getSavedPlans,
  addPlan,
  updatePlan,
  removePlan,
  clearAllPlans,
  getDateRange,
  formatDateIT,
  exportPlansJSON,
  importPlansJSON,
  toggleFavorite,
  isFavorite,
  getFavorites,
  setErasmusDates,
  get START_DATE() { return START_DATE; },
  get END_DATE() { return END_DATE; }
};
