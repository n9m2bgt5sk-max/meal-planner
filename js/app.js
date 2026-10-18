// App shell: navigation, routing, theme, and housekeeping on start.
import { state, save, requestPersistence, iso, today, parseIso, weekKeyFor } from './store.js';
import { getRecipe, costPerServe } from './recipes.js';
import { refreshWeather } from './weather.js';
import { closeAllSheets, toast } from './ui.js';
import { startSync } from './cloud.js';
import * as plan from './views/plan.js';
import * as recipe from './views/recipe.js';
import * as cookbook from './views/cookbook.js';
import * as shop from './views/shop.js';
import * as pantry from './views/pantry.js';
import * as more from './views/more.js';
import * as setup from './views/setup.js';

const NAV = [
  { href: '#/plan', key: 'plan', ico: '🗓️', label: 'Plan' },
  { href: '#/cookbook', key: 'cookbook', ico: '📖', label: 'Cookbook' },
  { href: '#/shop', key: 'shop', ico: '🛒', label: 'Shopping' },
  { href: '#/pantry', key: 'pantry', ico: '🥫', label: 'Pantry' },
  { href: '#/more', key: 'more', ico: '☰', label: 'More' },
];

const ROUTES = {
  plan: plan, recipe: recipe, cookbook: cookbook, shop: shop, prices: shop, pantry: pantry,
  more: more, budget: more, history: more, settings: more, help: more, backup: more, sync: more, join: more, setup: setup,
};
const NAV_FOR = { recipe: 'cookbook', prices: 'shop', budget: 'more', history: 'more', settings: 'more', help: 'more', backup: 'more', sync: 'more', join: 'more', setup: 'more' };

export function applyLook() {
  document.documentElement.dataset.theme = state.setup.theme || 'farmhouse';
  document.documentElement.dataset.text = state.setup.textSize || 'normal';
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fbf4e8';
}

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { name: parts[0] || 'plan', args: parts.slice(1), params };
}

let current = null;
export function render(keepScroll = true) {
  const main = document.getElementById('main');
  const route = parseRoute();
  if (!state.setup.done && !['setup', 'help', 'join', 'backup', 'sync'].includes(route.name)) { location.replace('#/setup'); return; }
  const view = ROUTES[route.name] || plan;
  const sameView = current && current.name === route.name && current.args.join('/') === route.args.join('/');
  const y = window.scrollY;
  main.innerHTML = view.render(route);
  if (view.bind) view.bind(main, route);
  const navKey = NAV_FOR[route.name] || route.name;
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.key === navKey));
  document.querySelector('.nav').classList.toggle('hidden', route.name === 'setup' && !state.setup.done);
  if (keepScroll && sameView) window.scrollTo(0, y); else window.scrollTo(0, 0);
  current = route;
}

export function go(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}

// Past planned meals become history automatically, so "how often" counts stay right without extra taps.
function recordHistory() {
  const t = iso(today());
  const have = new Set(state.history.map(h => h.id));
  let added = 0;
  for (const week of Object.values(state.weeks)) {
    for (const day of week.days) {
      if (day.date >= t) continue;
      if (day.mode !== 'cook' && day.mode !== 'event') {
        const id = `${day.date}|dinner|${day.mode}`;
        if (!have.has(id) && (day.mode === 'takeaway' || day.mode === 'dining')) { state.history.push({ id, date: day.date, slot: 'dinner', recipeId: null, name: day.mode === 'takeaway' ? 'Takeaway' : 'Dining out', mode: day.mode }); added++; }
      }
      for (const [slot, m] of Object.entries(day.meals || {})) {
        if (!m || !m.recipeId) continue;
        if (day.mode !== 'cook' && day.mode !== 'event' && slot === 'dinner') continue;
        const id = `${day.date}|${slot}|${m.recipeId}`;
        if (have.has(id)) continue;
        const r = getRecipe(m.recipeId);
        state.history.push({ id, date: day.date, slot, recipeId: m.recipeId, name: r ? r.name : m.recipeId, servings: m.servings, cost: r ? (costPerServe(r) || 0) * m.servings : 0, cooked: !!m.cooked, kind: m.kind });
        have.add(id);
        added++;
      }
    }
  }
  if (added) { state.history.sort((a, b) => a.date.localeCompare(b.date)); save(); }
}

function buildShell() {
  document.getElementById('app').innerHTML = `
    <nav class="nav" aria-label="Main">
      <div class="brand">Meal Planner</div>
      ${NAV.map(n => `<a href="${n.href}" data-key="${n.key}"><span class="ico" aria-hidden="true">${n.ico}</span><span>${n.label}</span></a>`).join('')}
    </nav>
    <main class="main" id="main"></main>`;
}

async function start() {
  applyLook();
  buildShell();
  recordHistory();
  window.addEventListener('hashchange', () => { closeAllSheets(); render(false); });
  window.addEventListener('mp-storage-error', () => toast('Storage is full – export a backup and clear old history.'));
  render(false);
  requestPersistence();
  window.addEventListener('mp-remote-change', () => { applyLook(); recordHistory(); if (!document.querySelector('.sheet-wrap, .cookmode')) render(); });
  startSync();
  if (state.setup.done && state.setup.weather) {
    refreshWeather().then(ok => { if (ok && (parseRoute().name === 'plan')) render(); });
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !window.__noSW) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

window.mp = { get state() { return state; }, render, go };
start();
export { weekKeyFor, parseIso };
