// Backup, restore, and "send to partner" merging.
import { state, replaceState, save, iso, today } from './store.js';

export function exportBlob() {
  const data = { app: 'meal-planner', exported: new Date().toISOString(), state };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}
export function exportName(kind = 'backup') {
  return `meal-planner-${kind}-${iso(today())}.json`;
}

export async function readFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || data.app !== 'meal-planner' || !data.state) throw new Error("This doesn't look like a Meal Planner file.");
  return data.state;
}

export function restore(incoming) {
  const keepDevice = state.deviceId;
  replaceState({ ...incoming, deviceId: keepDevice });
}

function byKey(list, key) { const m = new Map(); for (const x of list || []) m.set(key(x), x); return m; }

// Merge a partner's data into ours. Newer wins for each week, rating, price and pantry item;
// history and recipes are combined; our own household setup is kept.
export function merge(incoming) {
  const summary = { weeks: 0, ratings: 0, prices: 0, pantry: 0, history: 0, recipes: 0 };
  const deleted = new Set([...(state.deleted || []), ...(incoming.deleted || [])]);

  const newerWeeks = new Set();
  for (const [k, w] of Object.entries(incoming.weeks || {})) {
    const mine = state.weeks[k];
    if (!mine || (w.updatedAt || 0) > (mine.updatedAt || 0)) { state.weeks[k] = w; newerWeeks.add(k); summary.weeks++; }
  }
  for (const [k, sl] of Object.entries(incoming.shopping || {})) {
    const mine = state.shopping[k];
    // The shopping list follows its week: the device that touched the week last has the latest ticks.
    if (!mine || newerWeeks.has(k)) { state.shopping[k] = sl; continue; }
    if (state.weeks[k] && incoming.weeks && incoming.weeks[k] && (incoming.weeks[k].updatedAt || 0) < (state.weeks[k].updatedAt || 0)) continue;
    mine.checked = { ...mine.checked, ...sl.checked };
    const ex = byKey(mine.extras, x => x.id);
    for (const e of sl.extras || []) if (!ex.has(e.id)) mine.extras.push(e);
    mine.done = mine.done || sl.done;
  }
  for (const [id, r] of Object.entries(incoming.ratings || {})) {
    const mine = state.ratings[id];
    if (!mine || (r.updated || 0) > (mine.updated || 0)) { state.ratings[id] = r; summary.ratings++; }
  }
  for (const [id, stores] of Object.entries(incoming.prices || {})) {
    state.prices[id] = state.prices[id] || {};
    for (const [s, p] of Object.entries(stores)) {
      const mine = state.prices[id][s];
      if (!mine || (p.date || '') > (mine.date || '')) { state.prices[id][s] = p; summary.prices++; }
    }
  }
  const pantry = byKey(state.pantry, p => p.id);
  for (const p of incoming.pantry || []) {
    const mine = pantry.get(p.id);
    if (!mine || (p.updated || 0) > (mine.updated || 0)) { pantry.set(p.id, p); summary.pantry++; }
  }
  state.pantry = [...pantry.values()].filter(p => !deleted.has(p.id));
  const hist = byKey(state.history, h => h.id || `${h.date}|${h.slot}|${h.recipeId}`);
  for (const h of incoming.history || []) {
    const k = h.id || `${h.date}|${h.slot}|${h.recipeId}`;
    if (!hist.has(k)) { hist.set(k, h); summary.history++; }
  }
  state.history = [...hist.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const listName of ['customRecipes', 'savedOnline']) {
    const m = byKey(state[listName], r => r.id);
    for (const r of incoming[listName] || []) {
      const mine = m.get(r.id);
      if (!mine || (r.updated || 0) > (mine.updated || 0)) { m.set(r.id, r); summary.recipes++; }
    }
    state[listName] = [...m.values()].filter(r => !deleted.has(r.id));
  }
  state.deleted = [...deleted].slice(-500);
  save(true);
  return summary;
}
