// Shopping list: what the week's meals need, less what's in the pantry, rounded up to whole packs.
import { ING, AISLES, STORES } from './data/ingredients.js';
import { state, iso, today, parseIso } from './store.js';
import { getRecipe, priceInfo, recipeNeeds } from './recipes.js';
import { formatBase, formatQty } from './units.js';

// Every meal that needs cooking, with the quantities it needs (pack units).
export function mealNeeds(meal) {
  if (!meal || !meal.recipeId) return {};
  if (meal.kind === 'reheat' || meal.kind === 'leftover') return {};
  const r = getRecipe(meal.recipeId);
  if (!r) return {};
  const skip = meal.kind === 'reuse' && meal.from && r.uses ? new Set(r.uses.replaces || []) : null;
  return recipeNeeds(r, (meal.servings || r.serves) + (meal.extraServings || 0), { skip, extra: (meal.makes || []).map(m => ({ scale: m.scale, portions: m.portions })) });
}

export function weekMeals(week) {
  const out = [];
  if (!week) return out;
  week.days.forEach((day, di) => {
    for (const [slot, meal] of Object.entries(day.meals || {})) {
      if (!meal || !meal.recipeId) continue;
      if (day.mode !== 'cook' && day.mode !== 'event' && slot === 'dinner') continue;
      out.push({ day, di, slot, meal });
    }
  });
  return out;
}

// Pantry quantities by ingredient id (pack units).
export function pantryTotals() {
  const t = {};
  for (const p of state.pantry) {
    if (!p.ingId || !(p.qty > 0)) continue;
    t[p.ingId] = (t[p.ingId] || 0) + p.qty;
  }
  return t;
}

export function buildList(week, opts = {}) {
  const store = opts.store || state.setup.primaryStore;
  const needs = {};
  const usedBy = {};
  for (const { meal, day } of weekMeals(week)) {
    // Meals in the past that are already cooked don't need buying again.
    if (opts.fromToday && parseIso(day.date) < today()) continue;
    const n = mealNeeds(meal);
    const r = getRecipe(meal.recipeId);
    for (const [id, q] of Object.entries(n)) {
      needs[id] = (needs[id] || 0) + q;
      (usedBy[id] = usedBy[id] || new Set()).add(r ? r.name : '');
    }
  }
  const pantry = opts.ignorePantry ? {} : pantryTotals();
  const sl = (state.shopping[week.key] = state.shopping[week.key] || { checked: {}, extras: [], removed: {}, packs: {}, done: false });
  const items = [];
  const staples = [];
  let total = 0;
  for (const [id, need] of Object.entries(needs)) {
    const ing = ING[id];
    if (!ing) continue;
    const have = pantry[id] || 0;
    const toBuy = Math.max(0, need - have);
    const isStaple = state.setup.assumeStaples && (ing.staple || ing.spice);
    if (isStaple) { staples.push({ id, name: ing.name, need, have }); continue; }
    const p = priceInfo(id, store);
    // A sliver short (we round packs down by up to 5%) still counts as covered, so a finished shop leaves nothing behind.
    if (toBuy <= need * 0.02 || toBuy < 0.01 || (have > 0 && toBuy <= p.packSize * 0.05)) {
      if (have > 0) items.push({ id, key: id, name: ing.name, aisle: ing.aisle, need, have, toBuy: 0, packs: 0, cost: 0, inPantry: true, usedBy: [...usedBy[id]] });
      continue;
    }
    let packs = Math.ceil(toBuy / p.packSize - 0.05);
    if (packs < 1) packs = 1;
    if (sl.packs[id] != null) packs = sl.packs[id];
    const removed = !!sl.removed[id];
    const cost = removed ? 0 : packs * p.packPrice;
    total += cost;
    items.push({ id, key: id, name: ing.name, aisle: ing.aisle, need, have, toBuy, packs, packSize: p.packSize, packPrice: p.packPrice, cost, custom: p.custom, removed, checked: !!sl.checked[id], usedBy: [...usedBy[id]] });
  }
  for (const ex of sl.extras) {
    total += Number(ex.cost) || 0;
    items.push({ key: ex.id, extra: true, name: ex.name, aisle: ex.aisle || 'Other', qtyText: ex.qty || '', cost: Number(ex.cost) || 0, checked: !!sl.checked[ex.id], packs: 1 });
  }
  items.sort((a, b) => AISLES.indexOf(a.aisle) - AISLES.indexOf(b.aisle) || a.name.localeCompare(b.name));
  return { items, staples, total, store, state: sl };
}

// Totals for every store the user shops at, to point out the cheapest.
export function storeTotals(week) {
  return state.setup.stores.map(s => ({ store: s, name: STORES[s] ? STORES[s].name : s, total: buildList(week, { store: s }).total }));
}

export function itemQtyText(item, units = state.setup.units) {
  if (item.extra) return item.qtyText || '';
  if (item.inPantry) return `${formatBase(item.id, item.need, units)} (in pantry)`;
  const ing = ING[item.id];
  // A bag of loose produce reads as its weight ("1 kg bag"), not as a fraction of apples.
  const looseBag = ing.packUnit !== 'each' && ing.eachName && ing.aisle === 'Fruit & Veg' && item.packSize !== ing.each;
  const packTxt = looseBag ? `${formatQty(item.id, item.packSize, ing.packUnit, units)} bag` : formatBase(item.id, item.packSize, units);
  const needTxt = formatBase(item.id, item.toBuy, units);
  if (ing.packUnit === 'each' || ing.aisle === 'Fruit & Veg' && ing.eachName && item.packSize === ing.each) {
    return item.packs > 1 || ing.packUnit === 'each' ? `${item.packs} × ${packTxt}` : packTxt;
  }
  return `${item.packs} × ${packTxt}` + (Math.abs(item.packs * item.packSize - item.toBuy) / item.toBuy > 0.15 ? ` (need ${needTxt})` : '');
}

// Plain text for Reminders / sharing: one item per line, no headings, so each line becomes one reminder.
export function listAsLines(list, opts = {}) {
  const lines = [];
  for (const it of list.items) {
    if (it.removed || it.inPantry) continue;
    if (opts.uncheckedOnly && it.checked) continue;
    const q = itemQtyText(it);
    lines.push(q ? `${it.name} – ${q}` : it.name);
  }
  return lines;
}

export function listAsText(list, title) {
  const out = [title, ''];
  let aisle = null;
  for (const it of list.items) {
    if (it.removed || it.inPantry) continue;
    if (it.aisle !== aisle) { aisle = it.aisle; out.push('', aisle.toUpperCase()); }
    const q = itemQtyText(it);
    out.push(`☐ ${it.name}${q ? ' – ' + q : ''}${it.cost ? `  ($${it.cost.toFixed(2)})` : ''}`);
  }
  if (list.staples.length) {
    out.push('', 'CHECK YOU HAVE');
    for (const s of list.staples) out.push(`☐ ${s.name}`);
  }
  out.push('', `Estimated total: $${list.total.toFixed(2)} at ${STORES[list.store] ? STORES[list.store].name : list.store}`);
  return out.join('\n');
}

// After shopping: put everything bought into the pantry, so cooking can use it up and it isn't bought twice.
export function markShoppingDone(week) {
  const list = buildList(week);
  const t = iso(today());
  for (const it of list.items) {
    if (it.extra || it.removed || it.inPantry || !it.packs) continue;
    const ing = ING[it.id];
    const qty = it.packs * it.packSize;
    const loc = ing.flags.includes('frozen') ? 'freezer' : ['Meat & Seafood', 'Dairy & Eggs', 'Deli'].includes(ing.aisle) || (ing.aisle === 'Fruit & Veg' && ing.shelfDays < 10) ? 'fridge' : 'pantry';
    const exp = new Date(); exp.setDate(exp.getDate() + ing.shelfDays);
    state.pantry.push({ id: 'p' + Math.random().toString(36).slice(2, 9), ingId: it.id, name: ing.name, qty, location: loc, expiry: iso(exp), added: t, updated: Date.now() });
  }
  list.state.done = true;
  list.state.doneAt = Date.now();
}

// Take a cooked meal's ingredients out of the pantry.
export function deductFromPantry(meal) {
  const needs = mealNeeds(meal);
  for (const [id, q] of Object.entries(needs)) {
    let left = q;
    const items = state.pantry.filter(p => p.ingId === id && p.qty > 0).sort((a, b) => (a.expiry || '9').localeCompare(b.expiry || '9'));
    for (const p of items) {
      if (left <= 0) break;
      const take = Math.min(p.qty, left);
      p.qty -= take; left -= take; p.updated = Date.now();
    }
  }
  const before = state.pantry.length;
  const gone = state.pantry.filter(p => p.ingId && p.qty <= 0.01);
  state.pantry = state.pantry.filter(p => !(p.ingId && p.qty <= 0.01));
  state.deleted.push(...gone.map(p => p.id));
  return before - state.pantry.length;
}
