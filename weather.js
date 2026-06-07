// Meteo Malaga — Open-Meteo (gratuito, senza API key)
const MALAGA = { lat: 36.7213, lng: -4.4214 };
const TZ = 'Europe/Madrid';

const WMO = {
  0: { label: 'Sereno', emoji: '☀️', outdoor: 'ottimo' },
  1: { label: 'Prevalentemente sereno', emoji: '🌤️', outdoor: 'ottimo' },
  2: { label: 'Parzialmente nuvoloso', emoji: '⛅', outdoor: 'buono' },
  3: { label: 'Nuvoloso', emoji: '☁️', outdoor: 'discreto' },
  45: { label: 'Nebbia', emoji: '🌫️', outdoor: 'attenzione' },
  48: { label: 'Nebbia gelata', emoji: '🌫️', outdoor: 'attenzione' },
  51: { label: 'Pioviggine leggera', emoji: '🌦️', outdoor: 'coperto' },
  53: { label: 'Pioviggine', emoji: '🌦️', outdoor: 'coperto' },
  55: { label: 'Pioviggine intensa', emoji: '🌧️', outdoor: 'coperto' },
  61: { label: 'Pioggia leggera', emoji: '🌧️', outdoor: 'coperto' },
  63: { label: 'Pioggia', emoji: '🌧️', outdoor: 'coperto' },
  65: { label: 'Pioggia forte', emoji: '🌧️', outdoor: 'evita esterno' },
  71: { label: 'Neve leggera', emoji: '🌨️', outdoor: 'raro estate' },
  73: { label: 'Neve', emoji: '🌨️', outdoor: 'raro estate' },
  75: { label: 'Neve forte', emoji: '🌨️', outdoor: 'raro estate' },
  80: { label: 'Rovesci leggeri', emoji: '🌦️', outdoor: 'coperto' },
  81: { label: 'Rovesci', emoji: '🌧️', outdoor: 'coperto' },
  82: { label: 'Rovesci forti', emoji: '⛈️', outdoor: 'evita esterno' },
  95: { label: 'Temporale', emoji: '⛈️', outdoor: 'evita esterno' },
  96: { label: 'Temporale con grandine', emoji: '⛈️', outdoor: 'evita esterno' },
  99: { label: 'Temporale forte', emoji: '⛈️', outdoor: 'evita esterno' }
};

function wmo(code) {
  return WMO[code] || { label: 'Variabile', emoji: '🌡️', outdoor: 'discreto' };
}

function isErasmusDay(iso, start, end) {
  if (!start || !end) return false;
  return iso >= start && iso <= end;
}

async function fetchForecast() {
  const params = new URLSearchParams({
    latitude: MALAGA.lat,
    longitude: MALAGA.lng,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
    timezone: TZ,
    forecast_days: '16'
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error('Meteo non disponibile');
  return res.json();
}

function formatDayIT(iso) {
  const d = new Date(iso + 'T12:00:00');
  return {
    weekday: d.toLocaleDateString('it-IT', { weekday: 'short' }),
    date: d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
  };
}

function outdoorBadge(level) {
  const map = {
    ottimo: { text: 'Ottimo per gite', cls: 'weather-badge--good' },
    buono: { text: 'Buono all\'aperto', cls: 'weather-badge--good' },
    discreto: { text: 'Misto', cls: 'weather-badge--mid' },
    coperto: { text: 'Meglio al coperto', cls: 'weather-badge--rain' },
    'evita esterno': { text: 'Resta in città', cls: 'weather-badge--rain' },
    attenzione: { text: 'Visibilità ridotta', cls: 'weather-badge--mid' }
  };
  return map[level] || map.discreto;
}

function renderTips(tips, erasmus) {
  if (!tips) return '';
  return `
    <div class="weather-tips-grid">
      <div class="weather-panel">
        <h3 class="weather-panel-title">${tips.season.title}</h3>
        <p class="text-sm text-[#B23B3B] font-semibold mb-2">🌡️ ${tips.season.tempRange}</p>
        <ul class="weather-list">${tips.season.highlights.map(h => `<li>${h}</li>`).join('')}</ul>
      </div>
      <div class="weather-panel">
        <h3 class="weather-panel-title">🎒 Cosa portare</h3>
        <ul class="weather-list">${tips.packing.map(p => `<li>${p}</li>`).join('')}</ul>
      </div>
      <div class="weather-panel weather-panel--wide">
        <h3 class="weather-panel-title">📋 Pianifica in base al meteo</h3>
        <div class="space-y-2">
          ${tips.planning.map(p => `
            <div class="weather-plan-row">
              <span class="weather-plan-cond">${p.condition}</span>
              <span class="weather-plan-tip">${p.tip}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    <p class="text-xs text-gray-500 mt-4 text-center">
      Previsioni: <a href="${tips.links[1].url}" target="_blank" rel="noopener" class="underline">Open-Meteo</a> ·
      Ufficiale: <a href="${tips.links[0].url}" target="_blank" rel="noopener" class="underline">AEMET</a>
      ${erasmus?.start ? ` · Periodo Erasmus evidenziato (${erasmus.start} → ${erasmus.end})` : ''}
    </p>
  `;
}

function renderDaily(daily, erasmus) {
  const { time, weather_code, temperature_2m_max, temperature_2m_min, precipitation_sum, precipitation_probability_max, wind_speed_10m_max } = daily;
  return time.map((iso, i) => {
    const w = wmo(weather_code[i]);
    const badge = outdoorBadge(w.outdoor);
    const { weekday, date } = formatDayIT(iso);
    const erasmusDay = isErasmusDay(iso, erasmus?.start, erasmus?.end);
    const rain = precipitation_probability_max[i] ?? 0;
    return `
      <article class="weather-day ${erasmusDay ? 'weather-day--erasmus' : ''} ${rain >= 60 ? 'weather-day--rainy' : ''}">
        ${erasmusDay ? '<span class="weather-day-tag">Erasmus</span>' : ''}
        <div class="weather-day-wd">${weekday}</div>
        <div class="weather-day-date">${date}</div>
        <div class="weather-day-emoji">${w.emoji}</div>
        <div class="weather-day-label">${w.label}</div>
        <div class="weather-day-temps">
          <span class="weather-tmax">${Math.round(temperature_2m_max[i])}°</span>
          <span class="weather-tmin">${Math.round(temperature_2m_min[i])}°</span>
        </div>
        <div class="weather-day-meta">
          <span>💧 ${rain}%</span>
          <span>🌬️ ${Math.round(wind_speed_10m_max[i])} km/h</span>
        </div>
        <span class="weather-badge ${badge.cls}">${badge.text}</span>
      </article>
    `;
  }).join('');
}

function renderCurrent(current) {
  const w = wmo(current.weather_code);
  return `
    <div class="weather-now">
      <div class="weather-now-main">
        <span class="weather-now-emoji">${w.emoji}</span>
        <div>
          <div class="weather-now-temp">${Math.round(current.temperature_2m)}°C</div>
          <div class="weather-now-label">${w.label}</div>
          <div class="text-sm opacity-80">Percepita ${Math.round(current.apparent_temperature)}°C · Málaga</div>
        </div>
      </div>
      <div class="weather-now-stats">
        <div><span class="stat-k">Umidità</span><span class="stat-v">${current.relative_humidity_2m}%</span></div>
        <div><span class="stat-k">Vento</span><span class="stat-v">${Math.round(current.wind_speed_10m)} km/h</span></div>
        <div><span class="stat-k">Pioggia ora</span><span class="stat-v">${current.precipitation} mm</span></div>
      </div>
    </div>
  `;
}

function pickBestDays(daily) {
  const scores = daily.time.map((iso, i) => ({
    iso,
    score: (daily.precipitation_probability_max[i] ?? 50) - (daily.weather_code[i] >= 61 ? 30 : 0),
    ...formatDayIT(iso),
    w: wmo(daily.weather_code[i])
  }));
  const best = [...scores].sort((a, b) => a.score - b.score).slice(0, 3);
  const worst = [...scores].sort((a, b) => b.score - a.score).slice(0, 2);
  return { best, worst };
}

async function initWeather(rootEl, options = {}) {
  if (!rootEl) return;
  rootEl.innerHTML = '<div class="text-center text-gray-400 py-12">Caricamento previsioni…</div>';

  let tips = null;
  try {
    const base = options.basePath || '/';
    const tRes = await fetch(`${base}data/weather-tips.json`);
    if (tRes.ok) tips = await tRes.json();
  } catch (_) { /* tips opzionali */ }

  const erasmus = options.erasmus || null;

  try {
    const data = await fetchForecast();
    const { best, worst } = pickBestDays(data.daily);
    const updated = new Date().toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });

    rootEl.innerHTML = `
      ${renderCurrent(data.current)}
      <div class="weather-picks">
        <div class="weather-pick weather-pick--good">
          <strong>☀️ Migliori giorni (prossimi 16)</strong>
          <span>${best.map(d => `${d.weekday} ${d.date}`).join(' · ')}</span>
        </div>
        <div class="weather-pick weather-pick--rain">
          <strong>🌧️ Più piovosi</strong>
          <span>${worst.map(d => `${d.weekday} ${d.date}`).join(' · ')}</span>
        </div>
      </div>
      <h3 class="weather-section-title">Previsione 16 giorni</h3>
      <div class="weather-days-scroll">${renderDaily(data.daily, erasmus)}</div>
      ${renderTips(tips, erasmus)}
      <p class="text-xs text-gray-400 text-center mt-2">Aggiornato: ${updated}</p>
    `;
  } catch (e) {
    rootEl.innerHTML = `
      <div class="empty-state">
        <span class="text-4xl">🌧️</span>
        <p>Impossibile caricare le previsioni in tempo reale.</p>
        <p class="text-sm text-gray-500 mt-2">Controlla la connessione o visita <a href="https://www.aemet.es/es/eltiempo/prediccion/municipios/malaga-id29067" target="_blank" rel="noopener" class="underline">AEMET</a>.</p>
      </div>
      ${tips ? renderTips(tips, erasmus) : ''}
    `;
    console.error(e);
  }
}

window.MalagaWeather = { init: initWeather };
