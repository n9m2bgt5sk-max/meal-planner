// Local forecast from Open-Meteo (free, no account). Falls back to the season when offline.
import { state, save } from './store.js';
import { STATE_COORDS, stateFromPostcode } from './data/ingredients.js';

export async function locate(postcode) {
  const st = stateFromPostcode(postcode);
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(postcode)}&count=10&language=en&format=json&countryCode=AU`);
    const data = await res.json();
    const hit = (data.results || []).find(r => (r.postcodes || []).includes(String(postcode))) || (data.results || [])[0];
    if (hit) return { lat: hit.latitude, lon: hit.longitude, name: hit.name + (hit.admin1 ? ', ' + hit.admin1 : '') };
  } catch (e) { /* offline: use the state capital */ }
  if (st && STATE_COORDS[st]) { const [lat, lon, name] = STATE_COORDS[st]; return { lat, lon, name: name + ' (approx.)' }; }
  return null;
}

export function deviceLocation() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Location is not available on this device'));
    navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lon: p.coords.longitude, name: 'My location' }), e => rej(e), { timeout: 15000, maximumAge: 3600000 });
  });
}

const CODES = { 0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Cloudy'], 45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'], 51: ['🌦️', 'Drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Drizzle'], 61: ['🌦️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'], 71: ['🌨️', 'Snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Snow'], 80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Heavy showers'], 95: ['⛈️', 'Storms'], 96: ['⛈️', 'Storms'], 99: ['⛈️', 'Storms'] };
export function weatherIcon(code) { return (CODES[code] || ['🌡️', ''])[0]; }
export function weatherText(code) { return (CODES[code] || ['', ''])[1]; }

export async function refreshWeather(force = false) {
  if (!state.setup.weather) return false;
  if (!force && Date.now() - state.weather.fetched < 3 * 3600 * 1000 && state.weather.days.length) return true;
  let loc = state.setup.location;
  if (!loc && state.setup.postcode) {
    loc = await locate(state.setup.postcode);
    if (loc) { state.setup.location = loc; }
  }
  if (!loc) return false;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=14`;
    const res = await fetch(url);
    const d = await res.json();
    if (!d.daily) return false;
    state.weather = {
      fetched: Date.now(), place: loc.name,
      days: d.daily.time.map((t, i) => ({ date: t, tmax: d.daily.temperature_2m_max[i], tmin: d.daily.temperature_2m_min[i], rain: d.daily.precipitation_probability_max[i] ?? 0, code: d.daily.weather_code[i] })),
    };
    save();
    return true;
  } catch (e) { return false; }
}
