// The cookbook: browse, filter and search recipes (bundled, your own, online), and add your own.
import { state, save, uid } from '../store.js';
import { ING, INGREDIENTS } from '../data/ingredients.js';
import { allRecipes, recipeArt, costPerServe, totalTime, flags, suits, rememberTransient } from '../recipes.js';
import { CUISINES, EQUIPMENT, UNITS } from '../recipes-core.js';
import { searchOnline, randomMeals } from '../online.js';
import { matchIngredient } from '../ocr.js';
import { money } from '../units.js';
import { esc, openSheet, toast } from '../ui.js';
import { render as renderApp, go } from '../app.js';

const f = { q: '', meal: 'all', cuisine: '', quick: false, veg: false, kids: false, fav: false, fits: true, sort: 'name', source: 'all' };
let onlineResults = null, onlineBusy = false, onlineErr = '';

function usage() {
  const u = {};
  for (const h of state.history) if (h.recipeId) u[h.recipeId] = (u[h.recipeId] || 0) + 1;
  return u;
}

function filtered() {
  const u = usage();
  let list = allRecipes().filter(r => {
    if (f.source !== 'all' && r.source !== f.source) return false;
    if (f.meal !== 'all' && !(r.meal || []).includes(f.meal)) return false;
    if (f.cuisine && r.cuisine !== f.cuisine) return false;
    if (f.quick && totalTime(r) > 30) return false;
    if (f.veg && !flags(r).vegetarian) return false;
    if (f.kids && !r.kidFriendly) return false;
    if (f.fav && !((state.ratings[r.id] || {}).stars >= 4)) return false;
    if (f.fits && !suits(r, state.setup, { ignoreCuisine: true }).ok) return false;
    if (f.q) {
      const hay = (r.name + ' ' + r.cuisine + ' ' + (r.tags || []).join(' ') + ' ' + r.ingredients.map(l => l.id ? ING[l.id] && ING[l.id].name : l.text).join(' ')).toLowerCase();
      if (!f.q.toLowerCase().split(/\s+/).every(w => hay.includes(w))) return false;
    }
    return true;
  });
  const by = {
    name: (a, b) => a.name.localeCompare(b.name),
    used: (a, b) => (u[b.id] || 0) - (u[a.id] || 0) || a.name.localeCompare(b.name),
    rating: (a, b) => ((state.ratings[b.id] || {}).stars || 0) - ((state.ratings[a.id] || {}).stars || 0) || a.name.localeCompare(b.name),
    cost: (a, b) => (costPerServe(a) ?? 99) - (costPerServe(b) ?? 99),
    time: (a, b) => totalTime(a) - totalTime(b),
  }[f.sort];
  return { list: list.sort(by), u };
}

export function card(r, u = {}) {
  const cps = costPerServe(r);
  const rt = state.ratings[r.id];
  return `<a class="rcard" href="#/recipe/${encodeURIComponent(r.id)}" style="text-decoration:none">
    <div class="pic">${recipeArt(r, 160)}</div>
    <div class="body"><div class="name">${esc(r.name)}</div>
      <div class="meta"><span>⏱ ${totalTime(r)}${r.approxTime ? '?' : ''} min</span>${cps != null ? `<span>${money(cps)}/serve</span>` : ''}${rt && rt.stars ? `<span>${'★'.repeat(rt.stars)}</span>` : ''}${u[r.id] ? `<span>×${u[r.id]}</span>` : ''}</div>
      <div class="meta"><span>${esc(r.cuisine)}</span>${r.source === 'online' ? '<span>🌐</span>' : r.source === 'mine' ? '<span>✏️ Mine</span>' : ''}</div>
    </div></a>`;
}

export function render() {
  const { list, u } = filtered();
  const chip = (k, label) => `<button class="chip ${f[k] ? 'on' : ''}" data-toggle="${k}" aria-pressed="${f[k]}">${label}</button>`;
  return `
  <div class="topbar"><h1>Cookbook</h1><div class="actions"><button class="btn primary" data-new>＋ Add my own recipe</button></div></div>
  <div class="card" style="margin-bottom:14px">
    <input type="search" name="q" value="${esc(f.q)}" placeholder="Search recipes or ingredients…" aria-label="Search recipes">
    <div class="seg" style="margin-top:12px" data-seg="meal">${[['all', 'All'], ['dinner', 'Dinners'], ['lunch', 'Lunches'], ['breakfast', 'Breakfasts'], ['side', 'Sides'], ['dessert', 'Desserts'], ['snack', 'Party']].map(([k, l]) => `<button class="${f.meal === k ? 'on' : ''}" data-val="${k}">${l}</button>`).join('')}</div>
    <div class="chips" style="margin-top:12px">${chip('quick', '⚡ 30 min or less')}${chip('veg', '🥦 Vegetarian')}${chip('kids', '👧 Kid friendly')}${chip('fav', '★ Favourites')}${chip('fits', '✅ Suits my household')}</div>
    <div class="grid two" style="margin-top:12px">
      <label class="field" style="margin:0"><span>Cuisine</span><select name="cuisine"><option value="">All cuisines</option>${CUISINES.map(c => `<option ${f.cuisine === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field" style="margin:0"><span>Sort by</span><select name="sort">${[['name', 'A to Z'], ['used', 'Most used'], ['rating', 'Top rated'], ['cost', 'Cheapest'], ['time', 'Quickest']].map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <div class="seg" style="margin-top:12px" data-seg="source">${[['all', 'Everything'], ['cookbook', 'Built-in'], ['mine', 'My recipes'], ['online', 'Saved online']].map(([k, l]) => `<button class="${f.source === k ? 'on' : ''}" data-val="${k}">${l}</button>`).join('')}</div>
  </div>
  <p class="small muted">${list.length} recipe${list.length === 1 ? '' : 's'}</p>
  <div class="grid cards">${list.map(r => card(r, u)).join('') || '<div class="empty" style="grid-column:1/-1"><div class="big">🔍</div><p>No recipes match. Try fewer filters.</p></div>'}</div>
  ${state.setup.online ? `
  <div class="section-title"><h2>🌐 Online recipes</h2></div>
  <div class="card">
    <div class="row nowrap"><input type="search" name="oq" placeholder="Search online, e.g. lasagne, curry, pavlova" aria-label="Search online recipes" value="${esc(onlineResults && onlineResults.q || '')}"><button class="btn" data-osearch>Search</button></div>
    <button class="btn soft small" style="margin-top:10px" data-random>🎲 Surprise me</button>
    <p class="tiny muted" style="margin:8px 0 0">From TheMealDB, a free recipe library. Costs and nutrition are estimates.</p>
  </div>
  <div id="online-results" style="margin-top:14px">${onlineBusy ? '<p class="muted">Searching…</p>' : onlineErr ? `<p class="muted">${esc(onlineErr)}</p>` : onlineResults ? `<div class="grid cards">${onlineResults.items.map(r => card(r)).join('') || '<p class="muted">No online recipes found.</p>'}</div>` : ''}</div>` : ''}`;
}

export function bind(root) {
  const q = root.querySelector('[name=q]');
  let t;
  q.oninput = () => { clearTimeout(t); t = setTimeout(() => { f.q = q.value.trim(); renderApp(); const n = document.querySelector('[name=q]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 350); };
  root.querySelectorAll('[data-seg]').forEach(seg => seg.querySelectorAll('button').forEach(b => b.onclick = () => { f[seg.dataset.seg] = b.dataset.val; renderApp(); }));
  root.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => { f[b.dataset.toggle] = !f[b.dataset.toggle]; renderApp(); });
  root.querySelector('[name=cuisine]').onchange = e => { f.cuisine = e.target.value; renderApp(); };
  root.querySelector('[name=sort]').onchange = e => { f.sort = e.target.value; renderApp(); };
  root.querySelector('[data-new]').onclick = () => editRecipeSheet(null);
  const os = root.querySelector('[data-osearch]');
  if (os) {
    const run = async (fn, label) => {
      onlineBusy = true; onlineErr = ''; renderApp();
      try { const items = await fn(); items.forEach(rememberTransient); onlineResults = { q: label, items }; }
      catch (e) { onlineErr = 'Couldn’t reach the online recipe library. Check your internet connection.'; }
      onlineBusy = false; renderApp();
    };
    const oq = root.querySelector('[name=oq]');
    os.onclick = () => { const v = oq.value.trim(); if (v) run(() => searchOnline(v), v); };
    oq.onkeydown = e => { if (e.key === 'Enter') os.click(); };
    root.querySelector('[data-random]').onclick = () => run(() => randomMeals(6), '');
  }
}

// ---------- your own recipe ----------
export function editRecipeSheet(existing) {
  const r = existing ? JSON.parse(JSON.stringify(existing)) : { id: null, name: '', description: '', cuisine: 'Australian', meal: ['dinner'], serves: 4, prep: 15, cook: 30, effort: 1, spice: 0, kidFriendly: true, equipment: ['stovetop'], tags: [], weather: 'any', ingredients: [{ id: '', qty: 1, unit: 'each' }], steps: [], tips: '', picture: ['🍽️'] };
  const ingName = l => l.id && ING[l.id] ? ING[l.id].name : (l.text || '');
  const rows = () => r.ingredients.map((l, i) => `<div class="row nowrap" style="margin-bottom:8px">
      <input type="text" list="ing-names" name="in-${i}" value="${esc(ingName(l))}" placeholder="Ingredient" aria-label="Ingredient ${i + 1}" class="grow" style="min-width:0">
      <input type="number" inputmode="decimal" name="iq-${i}" value="${l.qty || ''}" aria-label="Amount" style="width:84px;flex:0 0 84px">
      <select name="iu-${i}" aria-label="Unit" style="width:96px;flex:0 0 96px">${UNITS.map(u => `<option ${l.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select>
      <button class="icon-btn" data-delrow="${i}" aria-label="Remove ingredient ${i + 1}">✕</button></div>`).join('');
  const body = `
    <datalist id="ing-names">${INGREDIENTS.map(i => `<option value="${esc(i.name)}">`).join('')}</datalist>
    <label class="field"><span>Recipe name</span><input type="text" name="name" value="${esc(r.name)}" placeholder="e.g. Nan's chicken soup"></label>
    <label class="field"><span>Short description</span><input type="text" name="description" value="${esc(r.description)}"></label>
    <div class="grid two">
      <label class="field"><span>Cuisine</span><select name="cuisine">${CUISINES.map(c => `<option ${r.cuisine === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field"><span>Picture (emoji)</span><input type="text" name="picture" value="${esc((r.picture || []).join(' '))}" placeholder="🍲 🥕"></label>
      <label class="field"><span>Serves</span><input type="number" name="serves" value="${r.serves}" min="1"></label>
      <label class="field"><span>Effort</span><select name="effort">${[[1, 'Easy'], [2, 'Medium'], [3, 'Project']].map(([v, l]) => `<option value="${v}" ${r.effort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Prep (min)</span><input type="number" name="prep" value="${r.prep}" min="0"></label>
      <label class="field"><span>Cook (min)</span><input type="number" name="cook" value="${r.cook}" min="0"></label>
      <label class="field"><span>Spice</span><select name="spice">${[[0, 'None'], [1, 'Mild'], [2, 'Medium'], [3, 'Hot']].map(([v, l]) => `<option value="${v}" ${r.spice === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Best for</span><select name="weather">${[['any', 'Any weather'], ['hot', 'Hot days'], ['cold', 'Cold days']].map(([v, l]) => `<option value="${v}" ${r.weather === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <div class="field-label">Meal</div>
    <div class="chips" data-meals>${['breakfast', 'lunch', 'dinner', 'side', 'dessert', 'snack'].map(m => `<button class="chip ${r.meal.includes(m) ? 'on' : ''}" data-val="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div>
    <div class="field-label" style="margin-top:12px">Equipment</div>
    <div class="chips" data-equip>${EQUIPMENT.map(m => `<button class="chip ${r.equipment.includes(m) ? 'on' : ''}" data-val="${m}">${m.replace('-', ' ')}</button>`).join('')}</div>
    <label class="switch" style="margin-top:8px"><span>Kid friendly</span><input type="checkbox" name="kidFriendly" ${r.kidFriendly ? 'checked' : ''}><span class="track"></span></label>
    <label class="switch"><span>Good for batch cooking / freezing</span><input type="checkbox" name="batch" ${r.batch ? 'checked' : ''}><span class="track"></span></label>
    <h3 style="margin-top:14px">Ingredients</h3>
    <p class="small muted">Pick from the list where you can, so costs and nutrition are worked out. Anything else is kept as written.</p>
    <div id="rows">${rows()}</div>
    <button class="btn soft small" data-addrow>＋ Add ingredient</button>
    <label class="field" style="margin-top:14px"><span>Method (one step per line)</span><textarea name="steps" rows="7">${esc(r.steps.join('\n'))}</textarea></label>
    <label class="field"><span>Tip (optional)</span><input type="text" name="tips" value="${esc(r.tips || '')}"></label>`;
  const s = openSheet({ title: existing && existing.id ? 'Edit recipe' : 'New recipe', body, wide: true, foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save recipe</button>' });
  const el = s.el;
  const readRows = () => {
    r.ingredients = r.ingredients.map((l, i) => {
      const name = el.querySelector(`[name=in-${i}]`).value.trim();
      const qty = parseFloat(el.querySelector(`[name=iq-${i}]`).value) || 0;
      const unit = el.querySelector(`[name=iu-${i}]`).value;
      const exact = Object.values(ING).find(x => x.name.toLowerCase() === name.toLowerCase());
      const ing = exact || matchIngredient(name);
      return ing && exact ? { id: ing.id, qty, unit } : ing ? { id: ing.id, qty, unit, prep: name !== ing.name ? name : undefined } : { text: `${qty || ''} ${unit !== 'each' ? unit : ''} ${name}`.replace(/\s+/g, ' ').trim(), name, qty, unit };
    });
  };
  const bindRows = () => {
    el.querySelectorAll('[data-delrow]').forEach(b => b.onclick = () => { readRows(); r.ingredients.splice(+b.dataset.delrow, 1); el.querySelector('#rows').innerHTML = rows(); bindRows(); });
  };
  bindRows();
  el.querySelector('[data-addrow]').onclick = () => { readRows(); r.ingredients.push({ id: '', qty: 1, unit: 'each' }); el.querySelector('#rows').innerHTML = rows(); bindRows(); };
  const toggleChips = (sel, key) => el.querySelectorAll(`${sel} .chip`).forEach(c => c.onclick = () => { const v = c.dataset.val; r[key] = r[key].includes(v) ? r[key].filter(x => x !== v) : [...r[key], v]; c.classList.toggle('on'); });
  toggleChips('[data-meals]', 'meal');
  toggleChips('[data-equip]', 'equipment');
  el.querySelector('[data-save]').onclick = () => {
    readRows();
    const v = n => el.querySelector(`[name=${n}]`).value;
    r.name = v('name').trim();
    if (!r.name) { toast('Give your recipe a name'); return; }
    r.description = v('description'); r.cuisine = v('cuisine'); r.serves = Math.max(1, +v('serves') || 4);
    r.prep = +v('prep') || 0; r.cook = +v('cook') || 0; r.effort = +v('effort'); r.spice = +v('spice'); r.weather = v('weather');
    r.kidFriendly = el.querySelector('[name=kidFriendly]').checked; r.batch = el.querySelector('[name=batch]').checked; r.freezes = r.batch;
    r.picture = v('picture').split(/\s+/).filter(Boolean).slice(0, 3);
    if (!r.picture.length) r.picture = ['🍽️'];
    r.steps = v('steps').split('\n').map(x => x.trim()).filter(Boolean);
    r.tips = v('tips');
    r.ingredients = r.ingredients.filter(l => l.id || l.name || l.text).map(l => l.id ? l : { text: l.text });
    if (!r.meal.length) r.meal = ['dinner'];
    r.updated = Date.now();
    if (!r.id || !r.id.startsWith('my-')) r.id = 'my-' + uid();
    delete r.source;
    state.customRecipes = state.customRecipes.filter(x => x.id !== r.id);
    state.customRecipes.push(r);
    save(); s.close(); toast('Recipe saved'); go('#/recipe/' + r.id);
  };
}
