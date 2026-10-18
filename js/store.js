// App state: one object saved to localStorage. Every change goes through save().
const KEY = 'mealplanner.v1';
let listeners = [];

export function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

export function defaultState() {
  return {
    version: 1,
    deviceId: uid(),
    setup: {
      done: false,
      adults: 2,
      children: [],              // [{ age: 6, name: '' }]
      allergies: [],             // allergen keys
      avoid: [],                 // free words or ingredient ids to avoid
      diet: 'none',              // none | vegetarian | pescatarian | vegan
      postcode: '',
      state: '',
      location: null,            // { lat, lon, name }
      stores: ['coles', 'woolworths', 'aldi'],
      primaryStore: 'coles',
      units: 'metric',
      equipment: ['stovetop', 'oven', 'microwave', 'bbq', 'slow-cooker', 'blender'],
      likedCuisines: [],
      dislikedCuisines: [],
      spiceTolerance: 2,
      meals: { breakfast: false, lunch: false, dinner: true },
      assumeStaples: true,
      weekStart: 1,              // 0 Sunday, 1 Monday, 6 Saturday
      theme: 'farmhouse',
      textSize: 'normal',
      online: true,
      weather: true,
      defaultTime: 45,
    },
    budget: {
      weekly: 250,
      extras: { drinks: 30, takeawayCount: 1, takeawayEach: 45, diningCount: 0, diningEach: 90, other: 0 },
    },
    weeks: {},
    pantry: [],
    prices: {},                  // { ingId: { store: { packSize, packPrice, date, source } } }
    shopping: {},                // { weekKey: { checked:{}, extras:[], removed:{}, packs:{}, done:false } }
    history: [],                 // [{ id, date, slot, recipeId, name, servings, cost, cooked }]
    ratings: {},                 // { recipeId: { stars, again, note, updated } }
    customRecipes: [],
    savedOnline: [],
    onlinePool: { items: [], fetched: 0 },
    weather: { fetched: 0, days: [], place: '' },
    deleted: [],                 // ids of removed pantry items / recipes, so a partner's merge doesn't bring them back
    updatedAt: Date.now(),
  };
}

function deepMerge(base, saved) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return saved === undefined ? base : saved;
  const out = { ...base };
  for (const k of Object.keys(saved || {})) {
    if (k in base && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && saved[k] && typeof saved[k] === 'object' && !Array.isArray(saved[k])) {
      out[k] = deepMerge(base[k], saved[k]);
    } else out[k] = saved[k];
  }
  return out;
}

export let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return deepMerge(defaultState(), JSON.parse(raw));
  } catch (e) { console.warn('Could not load saved data', e); }
  return defaultState();
}

let saveTimer = null;
export function save(immediate = false) {
  state.updatedAt = Date.now();
  const write = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.error(e); window.dispatchEvent(new CustomEvent('mp-storage-error')); }
  };
  clearTimeout(saveTimer);
  if (immediate) write(); else saveTimer = setTimeout(write, 150);
  listeners.forEach(fn => fn());
}

export function replaceState(next) {
  state = deepMerge(defaultState(), next);
  save(true);
}

export function onChange(fn) { listeners.push(fn); }

// Ask the browser to keep our data even when storage runs low (Safari honours this for home-screen apps).
export async function requestPersistence() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {}
  return false;
}

// ---------- dates ----------
export function iso(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
export function parseIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
export function weekStartFor(date, weekStart = state.setup.weekStart) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() - weekStart + 7) % 7;
  return addDays(d, -diff);
}
export function weekKeyFor(date) { return iso(weekStartFor(date)); }
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Southern hemisphere seasons (Australia).
export function seasonFor(date) {
  const m = date.getMonth();
  if (m === 11 || m <= 1) return 'summer';
  if (m <= 4) return 'autumn';
  if (m <= 7) return 'winter';
  return 'spring';
}

// ---------- household ----------
// Portion size relative to an adult, by child age.
export function portionForAge(age) {
  if (age < 4) return 0.4;
  if (age < 9) return 0.6;
  if (age < 14) return 0.8;
  return 1;
}
export function householdServings(setup = state.setup) {
  const kids = (setup.children || []).reduce((s, c) => s + portionForAge(Number(c.age) || 0), 0);
  return Math.max(1, setup.adults + kids);
}
export function householdPeople(setup = state.setup) {
  return Math.max(1, setup.adults + (setup.children || []).length);
}
export function hasYoungKids(setup = state.setup) {
  return (setup.children || []).some(c => Number(c.age) < 12);
}

export function newWeek(key) {
  const start = parseIso(key);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    days.push({
      date: iso(d),
      mode: 'cook',             // cook | takeaway | dining | skip | event
      time: weekend ? 90 : state.setup.defaultTime,
      effort: 'any',            // easy | any | project
      cuisine: '',
      event: null,              // { name, theme, guests, courses: [] }
      meals: {},                // slot -> meal
      note: '',
    });
  }
  return {
    key, days,
    prefs: { cuisines: [], style: 'mix', leftoverLunches: false, online: false, guests: 0 },
    budgetOverride: null,
    generated: false,
    updatedAt: Date.now(),
  };
}

export function getWeek(key, create = true) {
  if (!state.weeks[key] && create) state.weeks[key] = newWeek(key);
  return state.weeks[key];
}
