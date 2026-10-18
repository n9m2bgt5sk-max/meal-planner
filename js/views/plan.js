// The week plan: days, meals, swaps, week setup, special occasions and the budget summary.
import { state, save, getWeek, weekKeyFor, parseIso, addDays, iso, today, DAY_NAMES, DAY_SHORT, MONTHS, householdServings, uid } from '../store.js';
import { getRecipe, recipeArt, costPerServe, totalTime, allRecipes, rememberTransient, suits } from '../recipes.js';
import { generateWeek, alternatives, swapMeal, replanDay, budgetFor, SLOT_LABEL, dayClimate, relink, fitToBudget, dayLabel } from '../planner.js';
import { buildList, deductFromPantry } from '../shopping.js';
import { CUISINES } from '../recipes-core.js';
import { EVENT_THEMES, EVENT_STYLES } from '../themes.js';
import { weatherIcon, weatherText, refreshWeather } from '../weather.js';
import { byArea, searchOnline, refreshPool } from '../online.js';
import { money } from '../units.js';
import { esc, openSheet, toast, stepperHtml, bindSteppers, switchHtml, confirmSheet } from '../ui.js';
import { render as renderApp, go } from '../app.js';

const MODES = { cook: ['🍳', 'Cook'], takeaway: ['🥡', 'Takeaway'], dining: ['🍽️', 'Dining out'], skip: ['🚪', 'Eating elsewhere'], event: ['🎉', 'Special occasion'] };
const TIMES = [[15, '15 min'], [20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '1 hour'], [90, '1½ hours'], [120, '2 hours'], [240, 'All day']];
const EFFORTS = [['easy', 'Easy'], ['any', 'Any'], ['project', 'Cooking project']];

let weekOffset = null;

// On the last day of a week, open on next week: that's the one to plan and shop for.
function defaultOffset() {
  const start = parseIso(weekKeyFor(today()));
  return (today() - start) / 86400000 >= 6 ? 1 : 0;
}

export function currentWeekKey() {
  if (weekOffset === null) weekOffset = defaultOffset();
  return weekKeyFor(addDays(today(), weekOffset * 7));
}

// New weeks get the household's usual takeaway / dining-out nights.
export function ensureWeek(key) {
  const fresh = !state.weeks[key];
  const w = getWeek(key);
  if (fresh) {
    const e = state.budget.extras;
    const order = (preferred) => preferred.map(dow => w.days.findIndex(d => parseIso(d.date).getDay() === dow)).filter(i => i >= 0);
    let ti = order([5, 4, 3, 2, 1, 0, 6]);
    for (let i = 0; i < Math.min(e.takeawayCount || 0, 7); i++) w.days[ti[i]].mode = 'takeaway';
    const di = order([6, 5, 0, 4, 3, 2, 1]).filter(i => w.days[i].mode === 'cook');
    for (let i = 0; i < Math.min(e.diningCount || 0, di.length); i++) w.days[di[i]].mode = 'dining';
    save();
  }
  return w;
}

function weekRange(w) {
  const a = parseIso(w.days[0].date), b = parseIso(w.days[6].date);
  const fmt = d => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  return `${fmt(a)} – ${fmt(b)}`;
}

function weekTitle() {
  return weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Next week' : weekOffset === -1 ? 'Last week' : weekOffset > 0 ? `In ${weekOffset} weeks` : `${-weekOffset} weeks ago`;
}

// ---------- render ----------
export function render(route) {
  if (weekOffset === null) weekOffset = defaultOffset();
  if (route && route.params.week) {
    const target = parseIso(route.params.week);
    weekOffset = Math.round((target - parseIso(weekKeyFor(today()))) / (7 * 86400000));
  }
  const w = ensureWeek(currentWeekKey());
  const b = budgetFor(w);
  const list = buildList(w);
  const spend = list.total;
  const pctG = b.total ? Math.min(100, (spend / b.total) * 100) : 0;
  const pctE = b.total ? Math.min(100 - pctG, (b.extras / b.total) * 100) : 0;
  const over = spend + b.extras - b.total;
  const t = iso(today());
  const hasMeals = w.days.some(d => Object.keys(d.meals || {}).length);

  return `
  <div class="topbar">
    <h1>${weekTitle()}</h1>
    <div class="week-nav">
      <button class="icon-btn" data-week="-1" aria-label="Previous week">‹</button>
      <span class="label small">${weekRange(w)}</span>
      <button class="icon-btn" data-week="1" aria-label="Next week">›</button>
    </div>
  </div>
  <div class="row" style="margin-bottom:14px">
    <button class="btn" data-week-setup>⚙️ Set up the week</button>
    <button class="btn primary" data-generate>${hasMeals ? '✨ Re-plan the week' : '✨ Plan my week'}</button>
    ${weekOffset !== defaultOffset() ? `<button class="btn ghost" data-week-today>Back to ${defaultOffset() ? 'next' : 'this'} week</button>` : ''}
  </div>

  <button class="card" data-budget style="display:block;width:100%;text-align:left;margin-bottom:16px;color:var(--ink)">
    <div class="row" style="justify-content:space-between">
      <b>Budget ${money(b.total)}</b>
      <span class="${over > 0 ? 'pill bad' : 'pill good'}">${over > 0 ? `${money(over)} over` : `${money(-over)} left`}</span>
    </div>
    <div class="budget-bar" style="margin-top:10px" aria-hidden="true">
      <div class="groc" style="width:${pctG}%"></div><div class="extra" style="width:${pctE}%"></div>${over > 0 ? `<div class="over" style="width:${Math.min(30, (over / Math.max(1, b.total)) * 100)}%"></div>` : ''}
    </div>
    <div class="legend"><span><i style="background:var(--accent)"></i>Groceries ${money(spend)}</span><span><i style="background:var(--accent2)"></i>Drinks, takeaway & eating out ${money(b.extras)}</span><span>${householdServings().toFixed(1)} serves a meal</span></div>
  </button>

  ${!hasMeals ? `<div class="card empty" style="margin-bottom:16px"><div class="big">🧺</div><h3>Nothing planned yet</h3><p>Tell us about the week (busy nights, takeaway, a party), or just tap <b>Plan my week</b>.</p></div>` : ''}

  <div class="days">${w.days.map((d, di) => dayCard(w, d, di, t)).join('')}</div>
  ${state.weather.place ? `<p class="tiny muted center" style="margin-top:16px">Weather for ${esc(state.weather.place)} from Open-Meteo.</p>` : ''}`;
}

function dayCard(w, d, di, t) {
  const date = parseIso(d.date);
  const cl = dayClimate(d.date);
  const wx = cl.w ? `<span class="wx" title="${esc(weatherText(cl.w.code))}">${weatherIcon(cl.w.code)} ${Math.round(cl.w.tmax)}°${cl.w.rain >= 50 ? ` · ${cl.w.rain}% rain` : ''}</span>` : '';
  const past = d.date < t;
  const [mIco, mLbl] = MODES[d.mode];
  const modeLbl = d.mode === 'cook' ? `${(TIMES.find(x => x[0] === d.time) || [0, d.time + ' min'])[1]}${d.effort !== 'any' ? ' · ' + (d.effort === 'easy' ? 'Easy' : 'Project') : ''}${d.cuisine ? ' · ' + d.cuisine : ''}` : d.mode === 'event' && d.event ? `${esc(d.event.name || 'Event')}` : mLbl;
  const meals = mealOrder(d).map(slot => mealRow(w, d, di, slot, past)).join('');
  const off = d.mode === 'takeaway' || d.mode === 'dining' || d.mode === 'skip'
    ? `<div class="day-off"><span class="big">${mIco}</span><div><b>${mLbl}</b><div class="small muted">${d.mode === 'takeaway' ? `${money(state.budget.extras.takeawayEach)} from the budget` : d.mode === 'dining' ? `${money(state.budget.extras.diningEach)} from the budget` : 'No dinner to cook'}</div></div></div>` : '';
  const emptyDinner = d.mode === 'cook' && state.setup.meals.dinner && !d.meals.dinner
    ? `<button class="btn soft block" data-choose="${di}|dinner">＋ Choose dinner</button>` : '';
  return `<section class="day ${d.date === t ? 'today' : ''} ${past ? 'past' : ''}" aria-label="${DAY_NAMES[date.getDay()]}">
    <div class="day-head">
      <span class="name">${DAY_NAMES[date.getDay()]}</span><span class="date">${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}</span>
      <span class="grow"></span>${wx}
      <button class="btn small soft" data-day="${di}" aria-label="${DAY_NAMES[date.getDay()]} settings">${mIco} ${modeLbl}</button>
    </div>
    <div class="day-body">${off}${meals}${emptyDinner}</div>
  </section>`;
}

function mealOrder(d) {
  const slots = Object.keys(d.meals || {});
  const order = ['breakfast', 'lunch', 'dinner', 'nibbles', 'nibbles2', 'brunch', 'brunch2', 'main', 'side', 'side2', 'dessert'];
  return slots.filter(s => !(s === 'dinner' && d.mode !== 'cook')).sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function mealRow(w, d, di, slot, past) {
  const m = d.meals[slot];
  const r = m && getRecipe(m.recipeId);
  if (!r) return `<div class="meal"><div class="thumb">❓</div><div><div class="slot">${SLOT_LABEL[slot.replace(/\d$/, '')]}</div><div>Recipe not found</div><button class="btn small" data-swap="${di}|${slot}">Choose another</button></div></div>`;
  const cps = costPerServe(r);
  const isFree = m.kind === 'reheat' || m.kind === 'leftover';
  const kindNote = m.kind === 'reheat' ? 'Reheat' : m.kind === 'leftover' ? 'Leftovers' : '';
  const cook = m.servings + (m.extraServings || 0);
  const rating = state.ratings[r.id];
  const link = `#/recipe/${encodeURIComponent(r.id)}?week=${w.key}&di=${di}&slot=${slot}`;
  const notes = [...(m.reasons || [])];
  if (m.makes && m.makes.length) notes.unshift(`Make extra ${m.makes[0].label} for ${dayLabel(w.days[m.makes[0].forDay])}`);
  if (m.extraServings) notes.unshift(`Cook ${cook} serves: ${m.extraServings} for later`);
  return `<div class="meal ${m.cooked ? 'done' : ''}">
    <a class="thumb" href="${link}" aria-label="Open ${esc(r.name)}">${recipeArt(r, 74)}</a>
    <div>
      <div class="slot">${SLOT_LABEL[slot.replace(/\d$/, '')]}${kindNote ? ` · ${kindNote}` : ''}${m.locked ? ' · 🔒' : ''}</div>
      <a class="title" href="${link}" style="text-decoration:none;display:block">${esc(r.name)}</a>
      <div class="meta"><span>⏱ ${isFree ? '10' : totalTime(r)}${r.approxTime && !isFree ? '?' : ''} min</span><span>👤 ${m.servings}</span>${cps != null ? `<span>${isFree ? 'Already bought' : `${money(cps)}/serve`}</span>` : ''}${rating && rating.stars ? `<span>${'★'.repeat(rating.stars)}</span>` : ''}</div>
      ${notes.length ? `<div class="why">${[...new Set(notes)].slice(0, 3).map(x => `<span class="pill accent">${esc(x)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="tools">
      <button class="btn small" data-swap="${di}|${slot}" aria-label="Swap ${esc(r.name)}">🔄 Swap</button>
      <button class="icon-btn ${m.locked ? 'on' : ''}" data-lock="${di}|${slot}" aria-label="${m.locked ? 'Unlock' : 'Keep'} ${esc(r.name)}" aria-pressed="${!!m.locked}">${m.locked ? '🔒' : '🔓'}</button>
      ${past || d.date === iso(today()) ? `<button class="btn small ${m.cooked ? 'soft' : ''}" data-cooked="${di}|${slot}">${m.cooked ? '✓ Cooked' : 'Mark cooked'}</button>` : ''}
      ${m.cooked ? `<span class="stars" role="group" aria-label="Rate ${esc(r.name)}">${[1, 2, 3, 4, 5].map(n => `<button class="${rating && rating.stars >= n ? 'on' : ''}" data-rate="${r.id}|${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}</span>` : ''}
      <button class="icon-btn" data-remove="${di}|${slot}" aria-label="Remove ${esc(r.name)}">✕</button>
    </div>
  </div>`;
}

// ---------- events ----------
export function bind(root, route) {
  const w = ensureWeek(currentWeekKey());
  const rerender = () => renderApp();
  root.querySelectorAll('[data-week]').forEach(b => b.onclick = () => { weekOffset += +b.dataset.week; history.replaceState(null, '', '#/plan'); rerender(); });
  const wt = root.querySelector('[data-week-today]');
  if (wt) wt.onclick = () => { weekOffset = defaultOffset(); history.replaceState(null, '', '#/plan'); rerender(); };
  root.querySelector('[data-generate]').onclick = () => planWeek(w);
  root.querySelector('[data-week-setup]').onclick = () => weekSetupSheet(w);
  root.querySelector('[data-budget]').onclick = () => budgetSheet(w);
  root.querySelectorAll('[data-day]').forEach(b => b.onclick = () => daySheet(w, +b.dataset.day));
  root.querySelectorAll('[data-swap]').forEach(b => b.onclick = () => { const [di, slot] = b.dataset.swap.split('|'); swapSheet(w, +di, slot); });
  root.querySelectorAll('[data-choose]').forEach(b => b.onclick = () => { const [di, slot] = b.dataset.choose.split('|'); swapSheet(w, +di, slot); });
  root.querySelectorAll('[data-lock]').forEach(b => b.onclick = () => { const [di, slot] = b.dataset.lock.split('|'); const m = w.days[+di].meals[slot]; m.locked = !m.locked; touch(w); rerender(); });
  root.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => {
    const [di, slot] = b.dataset.remove.split('|');
    const old = w.days[+di].meals[slot];
    delete w.days[+di].meals[slot]; relink(w); touch(w); rerender();
    toast('Meal removed', { label: 'Undo', run: () => { w.days[+di].meals[slot] = old; relink(w); touch(w); rerender(); } });
  });
  root.querySelectorAll('[data-cooked]').forEach(b => b.onclick = () => {
    const [di, slot] = b.dataset.cooked.split('|');
    const m = w.days[+di].meals[slot];
    m.cooked = !m.cooked;
    if (m.cooked) {
      const n = deductFromPantry(m);
      const h = state.history.find(x => x.date === w.days[+di].date && x.slot === slot && x.recipeId === m.recipeId);
      if (h) h.cooked = true;
      toast(n ? 'Nice! Used-up items cleared from the pantry.' : 'Marked as cooked – tap the stars to rate it.');
    }
    touch(w); rerender();
  });
  root.querySelectorAll('[data-rate]').forEach(b => b.onclick = () => {
    const [id, n] = b.dataset.rate.split('|');
    state.ratings[id] = { ...(state.ratings[id] || {}), stars: +n, again: +n > 1, updated: Date.now() };
    save(); rerender();
    toast(+n >= 4 ? 'We’ll suggest it more often 😊' : +n <= 2 ? 'Got it – we’ll suggest it less.' : 'Thanks for rating!');
  });
  if (route && route.params.fresh && !w.generated) { history.replaceState(null, '', '#/plan'); weekSetupSheet(w, true); }
}

function touch(w) { w.updatedAt = Date.now(); save(); }

async function planWeek(w) {
  const go_ = async () => {
    if (w.prefs.online && state.setup.online) {
      toast('Fetching online ideas…');
      try { const items = await refreshPool(w.prefs.cuisines.length ? w.prefs.cuisines : state.setup.likedCuisines); if (items.length) { state.onlinePool = { items, fetched: Date.now() }; } }
      catch (e) { toast('Online ideas unavailable – using your cookbook'); }
    }
    if (state.setup.weather) await Promise.race([refreshWeather(), new Promise(r => setTimeout(r, 4000))]);
    generateWeek(w);
    touch(w);
    renderApp();
    const b = budgetFor(w);
    const total = buildList(w, { fromToday: true }).total;
    toast(total > b.groceries ? `Planned! Shopping is ${money(total - b.groceries)} over the grocery budget.` : 'Your week is planned! 🎉');
  };
  const locked = w.days.some(d => Object.values(d.meals || {}).some(m => m && !m.locked));
  if (locked && w.generated) {
    if (!(await confirmSheet('Re-plan the week?', 'Meals you’ve locked 🔒 stay; everything else gets fresh suggestions.', 'Re-plan'))) return;
  }
  go_();
}

// ---------- week setup ----------
function weekSetupSheet(w, first = false) {
  const p = w.prefs;
  const dayRows = () => w.days.map((d, di) => {
    const date = parseIso(d.date);
    return `<div class="card flat" style="padding:12px;margin-bottom:10px">
      <div class="row" style="justify-content:space-between"><b>${DAY_NAMES[date.getDay()]} <span class="muted small">${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}</span></b>
        <select name="mode-${di}" aria-label="${DAY_NAMES[date.getDay()]} plan" style="width:auto;min-width:170px">${Object.entries(MODES).map(([k, [i, l]]) => `<option value="${k}" ${d.mode === k ? 'selected' : ''}>${i} ${l}</option>`).join('')}</select></div>
      <div class="grid two" style="margin-top:8px;${d.mode !== 'cook' ? 'display:none' : ''}" data-cookopts="${di}">
        <label class="field" style="margin:0"><span>Time to cook</span><select name="time-${di}">${TIMES.map(([v, l]) => `<option value="${v}" ${d.time === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field" style="margin:0"><span>Effort</span><select name="effort-${di}">${EFFORTS.map(([v, l]) => `<option value="${v}" ${d.effort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field" style="margin:0"><span>Cuisine</span><select name="cuisine-${di}"><option value="">Any</option>${CUISINES.filter(c => c !== 'Other').map(c => `<option ${d.cuisine === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      </div>
      ${d.mode === 'event' ? `<div class="row" style="margin-top:8px"><span class="pill accent">🎉 ${esc(d.event ? d.event.name || 'Special occasion' : 'Special occasion')}</span><button class="btn small" data-event="${di}">Event details</button></div>` : ''}
    </div>`;
  }).join('');
  const body = () => `
    ${first ? '<div class="notice" style="margin-bottom:14px">👋 Tell us how this week looks. Defaults are fine too, just tap <b>Plan my week</b>.</div>' : ''}
    <div class="field-label">Cuisines you feel like this week</div>
    <div class="chips" data-group="wc">${CUISINES.filter(c => c !== 'Other').map(c => `<button class="chip ${p.cuisines.includes(c) ? 'on' : ''}" data-val="${c}" aria-pressed="${p.cuisines.includes(c)}">${c}</button>`).join('')}</div>
    <div class="field-label" style="margin-top:16px">Cooking style</div>
    <div class="seg" data-style>${[['individual', 'Cook each night'], ['mix', 'Some batch cooking'], ['bulk', 'Bulk cook & reheat']].map(([k, l]) => `<button class="${p.style === k ? 'on' : ''}" data-val="${k}">${l}</button>`).join('')}</div>
    <p class="small muted" style="margin-top:6px">Batch cooking makes a big pot on a roomy day and reheats it on your busiest nights.</p>
    ${state.setup.meals.lunch ? switchHtml('leftoverLunches', p.leftoverLunches, 'Leftovers for lunch', 'Cook a bit extra at dinner for the next day’s lunch.') : ''}
    ${state.setup.online ? switchHtml('online', p.online, 'Include online recipe ideas', 'Mixes in recipes from the online library (needs internet).') : ''}
    <label class="field" style="margin-top:8px"><span>Budget for this week (leave empty for your usual ${money(state.budget.weekly)})</span><input type="number" inputmode="decimal" name="override" value="${w.budgetOverride ?? ''}" placeholder="${state.budget.weekly}"></label>
    <h3 style="margin-top:18px">Day by day</h3>
    <div id="dayrows">${dayRows()}</div>`;
  const s = openSheet({ title: 'Set up the week', body: body(), wide: true, foot: '<button class="btn" data-close>Done</button><button class="btn primary" data-plan>✨ Plan my week</button>', onClose: () => renderApp() });
  const bindAll = () => {
    const el = s.el;
    el.querySelectorAll('[data-group=wc] .chip').forEach(c => c.onclick = () => {
      const k = c.dataset.val; p.cuisines = p.cuisines.includes(k) ? p.cuisines.filter(x => x !== k) : [...p.cuisines, k];
      c.classList.toggle('on'); c.setAttribute('aria-pressed', p.cuisines.includes(k)); touch(w);
    });
    el.querySelectorAll('[data-style] button').forEach(b => b.onclick = () => { p.style = b.dataset.val; el.querySelectorAll('[data-style] button').forEach(x => x.classList.toggle('on', x === b)); touch(w); });
    const ll = el.querySelector('[name=leftoverLunches]'); if (ll) ll.onchange = e => { p.leftoverLunches = e.target.checked; touch(w); };
    const on = el.querySelector('[name=online]'); if (on) on.onchange = e => { p.online = e.target.checked; touch(w); };
    el.querySelector('[name=override]').onchange = e => { w.budgetOverride = e.target.value === '' ? null : Math.max(0, +e.target.value); touch(w); };
    bindDayRows();
  };
  const bindDayRows = () => {
    const el = s.el;
    w.days.forEach((d, di) => {
      el.querySelector(`[name=mode-${di}]`).onchange = e => {
        d.mode = e.target.value;
        if (d.mode === 'event') { d.event = d.event || { name: '', theme: '', style: 'dinner', guests: 4 }; }
        touch(w); el.querySelector('#dayrows').innerHTML = dayRows(); bindDayRows();
        if (d.mode === 'event') eventSheet(w, di, () => { el.querySelector('#dayrows').innerHTML = dayRows(); bindDayRows(); });
      };
      el.querySelector(`[name=time-${di}]`).onchange = e => { d.time = +e.target.value; touch(w); };
      el.querySelector(`[name=effort-${di}]`).onchange = e => { d.effort = e.target.value; touch(w); };
      el.querySelector(`[name=cuisine-${di}]`).onchange = e => { d.cuisine = e.target.value; touch(w); };
      const ev = el.querySelector(`[data-event="${di}"]`);
      if (ev) ev.onclick = () => eventSheet(w, di, () => { el.querySelector('#dayrows').innerHTML = dayRows(); bindDayRows(); });
    });
  };
  bindAll();
  s.el.querySelector('[data-plan]').onclick = () => { s.close(); planWeek(w); };
}

// ---------- one day ----------
function daySheet(w, di) {
  const d = w.days[di];
  const date = parseIso(d.date);
  const body = () => `
    <div class="field-label">This day</div>
    <div class="chips" data-mode>${Object.entries(MODES).map(([k, [i, l]]) => `<button class="chip ${d.mode === k ? 'on' : ''}" data-val="${k}">${i} ${l}</button>`).join('')}</div>
    ${d.mode === 'cook' ? `
      <div class="field-label" style="margin-top:16px">Time available to cook</div>
      <div class="chips" data-time>${TIMES.map(([v, l]) => `<button class="chip ${d.time === v ? 'on' : ''}" data-val="${v}">${l}</button>`).join('')}</div>
      <div class="field-label" style="margin-top:16px">Effort</div>
      <div class="seg" data-effort>${EFFORTS.map(([v, l]) => `<button class="${d.effort === v ? 'on' : ''}" data-val="${v}">${l}</button>`).join('')}</div>
      <label class="field" style="margin-top:16px"><span>Cuisine</span><select name="cuisine"><option value="">Any</option>${CUISINES.filter(c => c !== 'Other').map(c => `<option ${d.cuisine === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>` : ''}
    ${d.mode === 'event' ? `<div class="notice" style="margin-top:14px">🎉 <div><b>${esc(d.event && d.event.name || 'Special occasion')}</b><br><span class="small">${d.event ? `${EVENT_STYLES[d.event.style].label} · ${d.event.guests} guests${d.event.theme ? ' · ' + (EVENT_THEMES.find(t => t.key === d.event.theme) || {}).label : ''}` : ''}</span></div></div><button class="btn soft" style="margin-top:10px" data-ev>Edit event details</button>` : ''}
    <label class="field" style="margin-top:16px"><span>Note</span><input type="text" name="note" value="${esc(d.note)}" placeholder="e.g. soccer training, Nan visiting"></label>`;
  const s = openSheet({ title: `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`, body: body(), foot: '<button class="btn" data-close>Done</button><button class="btn primary" data-replan>✨ Re-plan this day</button>', onClose: () => renderApp() });
  const bindIt = () => {
    const el = s.el;
    el.querySelectorAll('[data-mode] .chip').forEach(c => c.onclick = () => {
      d.mode = c.dataset.val;
      if (d.mode === 'event') { d.event = d.event || { name: '', theme: '', style: 'dinner', guests: 4 }; }
      touch(w); s.setBody(body()); bindIt();
      if (d.mode === 'event') eventSheet(w, di, () => { s.setBody(body()); bindIt(); });
    });
    el.querySelectorAll('[data-time] .chip').forEach(c => c.onclick = () => { d.time = +c.dataset.val; touch(w); s.setBody(body()); bindIt(); });
    el.querySelectorAll('[data-effort] button').forEach(c => c.onclick = () => { d.effort = c.dataset.val; touch(w); s.setBody(body()); bindIt(); });
    const cu = el.querySelector('[name=cuisine]'); if (cu) cu.onchange = e => { d.cuisine = e.target.value; touch(w); };
    el.querySelector('[name=note]').onchange = e => { d.note = e.target.value; touch(w); };
    const ev = el.querySelector('[data-ev]'); if (ev) ev.onclick = () => eventSheet(w, di, () => { s.setBody(body()); bindIt(); });
  };
  bindIt();
  s.el.querySelector('[data-replan]').onclick = () => { replanDay(w, di); touch(w); s.close(); toast('Day re-planned'); };
}

function eventSheet(w, di, after) {
  const d = w.days[di];
  const ev = d.event = d.event || { name: '', theme: '', style: 'dinner', guests: 4 };
  const body = `
    <label class="field"><span>What's the occasion?</span><input type="text" name="name" value="${esc(ev.name)}" placeholder="e.g. Mia's 7th birthday, Mexican night with the Smiths"></label>
    <div class="field-label">Theme</div>
    <div class="chips" data-theme>${[{ key: '', label: 'No theme', emoji: '🍽️' }, ...EVENT_THEMES].map(t => `<button class="chip ${ev.theme === t.key ? 'on' : ''}" data-val="${t.key}">${t.emoji} ${t.label}</button>`).join('')}</div>
    <p class="small muted" style="margin-top:6px">Or just describe it in the name, e.g. “Hawaiian luau” or “pirate party”, and we'll match recipes to it.</p>
    <div class="field-label" style="margin-top:14px">Style</div>
    <div class="seg" data-style>${Object.entries(EVENT_STYLES).map(([k, v]) => `<button class="${ev.style === k ? 'on' : ''}" data-val="${k}">${v.label}</button>`).join('')}</div>
    <div class="row" style="justify-content:space-between;margin-top:16px"><b>Guests (on top of your household)</b>${stepperHtml('guests', ev.guests, 0, 60, 1, 'Guests')}</div>
    <p class="small muted">Recipes are scaled for ${householdServings().toFixed(0)} + guests. The menu is planned when you tap “Plan this event”.</p>`;
  const s = openSheet({ title: 'Special occasion', body, foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>🎉 Plan this event</button>' });
  const el = s.el;
  el.querySelector('[name=name]').oninput = e => { ev.name = e.target.value; };
  el.querySelectorAll('[data-theme] .chip').forEach(c => c.onclick = () => { ev.theme = c.dataset.val; el.querySelectorAll('[data-theme] .chip').forEach(x => x.classList.toggle('on', x === c)); });
  el.querySelectorAll('[data-style] button').forEach(c => c.onclick = () => { ev.style = c.dataset.val; el.querySelectorAll('[data-style] button').forEach(x => x.classList.toggle('on', x === c)); });
  bindSteppers(el, (n, v) => { ev.guests = v; });
  el.querySelector('[data-save]').onclick = () => {
    d.mode = 'event';
    for (const k of Object.keys(d.meals)) if (!d.meals[k].locked) delete d.meals[k];
    replanDay(w, di); touch(w); s.close(); after && after(); renderApp();
    toast('Event menu planned 🎉');
  };
}

// ---------- swap ----------
export function swapSheet(w, di, slot) {
  const d = w.days[di];
  const cur = d.meals[slot];
  const curR = cur && getRecipe(cur.recipeId);
  const alts = alternatives(w, di, slot, 10);
  const row = (x, i, src = 'alt') => `<div class="alt">
      <a class="thumb" href="#/recipe/${encodeURIComponent(x.r.id)}?week=${w.key}&di=${di}&slot=${slot}&preview=1" aria-label="Preview ${esc(x.r.name)}">${recipeArt(x.r, 64)}</a>
      <div style="min-width:0"><a class="alt-name" href="#/recipe/${encodeURIComponent(x.r.id)}?week=${w.key}&di=${di}&slot=${slot}&preview=1"><b>${esc(x.r.name)}</b></a>
        <div class="small muted">${esc(x.r.cuisine)} · ⏱ ${totalTime(x.r)} min${x.cps != null ? ` · ${money(x.cps)}/serve` : ''}</div>
        <div class="pills" style="margin-top:4px">${(x.reasons || []).slice(0, 3).map(t => `<span class="pill accent">${esc(t)}</span>`).join('')}</div></div>
      <button class="btn small primary" data-pick="${src}|${i}">Choose</button>
    </div>`;
  const body = `
    ${curR ? `<p class="small muted">Instead of <b>${esc(curR.name)}</b>${curR && costPerServe(curR) != null ? ` (${money(costPerServe(curR))}/serve)` : ''}:</p>` : ''}
    <div id="alts">${alts.map((x, i) => row(x, i)).join('') || '<p class="muted">No other recipes fit this day. Try changing the day’s time or cuisine.</p>'}</div>
    <h3 style="margin-top:18px">Find something else</h3>
    <input type="search" name="q" placeholder="Search your cookbook${state.setup.online ? ' or online' : ''}…" aria-label="Search recipes">
    <div id="results"></div>
    ${state.setup.online ? `<button class="btn soft" style="margin-top:12px" data-online>🌐 Show online ideas${d.cuisine ? ` for ${esc(d.cuisine)}` : ''}</button><div id="online"></div>` : ''}`;
  const s = openSheet({ title: `${SLOT_LABEL[slot.replace(/\d$/, '')]} on ${dayLabel(d)}`, body, wide: true });
  let found = [], online = [];
  const choose = (x) => {
    if (x.r.source === 'online' && !getRecipe(x.r.id)) rememberTransient(x.r);
    if (x.r.source === 'online' && !state.savedOnline.some(r => r.id === x.r.id)) { state.savedOnline.push({ ...x.r, updated: Date.now() }); }
    swapMeal(w, di, slot, x.r.id, { reasons: x.reasons ? x.reasons.slice(0, 2) : [], reuseFrom: x.reuseFrom });
    touch(w); s.close(); renderApp(); toast(`Swapped to ${x.r.name}`);
  };
  const bindPicks = () => s.el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
    const [src, i] = b.dataset.pick.split('|');
    choose((src === 'alt' ? alts : src === 'found' ? found : online)[+i]);
  });
  bindPicks();
  const q = s.el.querySelector('[name=q]');
  let timer;
  q.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const term = q.value.trim().toLowerCase();
      const out = s.el.querySelector('#results');
      if (term.length < 2) { out.innerHTML = ''; return; }
      found = allRecipes().filter(r => (r.name + ' ' + r.cuisine + ' ' + (r.tags || []).join(' ')).toLowerCase().includes(term)).slice(0, 12)
        .map(r => ({ r, cps: costPerServe(r), reasons: suits(r).ok ? [] : ['⚠️ ' + suits(r).why] }));
      out.innerHTML = found.map((x, i) => row(x, i, 'found')).join('') || '<p class="small muted">Nothing in your cookbook matches.</p>';
      if (state.setup.online && term.length >= 3) {
        try {
          const res = await searchOnline(term);
          online = res.slice(0, 8).map(r => ({ r, cps: costPerServe(r), reasons: ['Online idea', ...(suits(r, state.setup, { ignoreEquipment: true }).ok ? [] : ['⚠️ ' + suits(r, state.setup, { ignoreEquipment: true }).why])] }));
          res.forEach(rememberTransient);
          s.el.querySelector('#online').innerHTML = online.length ? '<h4 style="margin-top:12px">Online</h4>' + online.map((x, i) => row(x, i, 'online')).join('') : '';
        } catch (e) { /* offline */ }
      }
      bindPicks();
    }, 300);
  };
  const ob = s.el.querySelector('[data-online]');
  if (ob) ob.onclick = async () => {
    ob.disabled = true; ob.textContent = 'Loading…';
    try {
      const cuisine = d.cuisine || (w.prefs.cuisines[0]) || (state.setup.likedCuisines[0]) || ['Italian', 'Mexican', 'Indian', 'Thai', 'British'][Math.floor(Math.random() * 5)];
      const res = d.mode === 'event' && d.event && d.event.name ? await searchOnline(d.event.name.split(' ')[0]).then(r => r.length ? r : byArea(cuisine)) : await byArea(cuisine, 6);
      res.forEach(rememberTransient);
      online = res.filter(r => suits(r, state.setup, { ignoreEquipment: true }).ok).map(r => ({ r, cps: costPerServe(r), reasons: ['Online idea', r.cuisine] }));
      s.el.querySelector('#online').innerHTML = online.map((x, i) => row(x, i, 'online')).join('') || '<p class="small muted">No online ideas found.</p>';
      bindPicks();
      ob.remove();
    } catch (e) { ob.disabled = false; ob.textContent = '🌐 Online ideas unavailable – try again'; }
  };
}

// ---------- budget ----------
function budgetSheet(w) {
  const b = budgetFor(w);
  const list = buildList(w);
  const stores = state.setup.stores.map(st => ({ st, total: buildList(w, { store: st }).total }));
  const cheapest = stores.slice().sort((a, b) => a.total - b.total)[0];
  const left = b.total - b.extras - list.total;
  const line = (l, v, cls = '') => `<tr><td>${l}</td><td class="${cls}">${v}</td></tr>`;
  const body = `
    <table class="nutri">
      ${line('Weekly food budget', money(b.total))}
      ${line('Alcohol & drinks', '− ' + money(b.ex.drinks))}
      ${line(`Takeaway (${b.ex.takeawayCount} night${b.ex.takeawayCount === 1 ? '' : 's'})`, '− ' + money(b.ex.takeaway))}
      ${line(`Dining out (${b.ex.diningCount} night${b.ex.diningCount === 1 ? '' : 's'})`, '− ' + money(b.ex.dining))}
      ${line('Other food spending', '− ' + money(b.ex.other))}
      ${line('<b>Left for groceries</b>', `<b>${money(b.groceries)}</b>`)}
      ${line('Shopping list estimate', money(list.total))}
      ${line('<b>Left over</b>', `<b>${money(left)}</b>`, left < 0 ? 'exp-past' : '')}
    </table>
    <p class="small muted" style="margin-top:10px">The shopping estimate counts whole packs at ${esc(state.setup.primaryStore)} prices, less what's already in your pantry.</p>
    ${stores.length > 1 ? `<h3 style="margin-top:16px">By shop</h3><table class="nutri">${stores.map(x => line(x.st[0].toUpperCase() + x.st.slice(1) + (x === cheapest ? ' <span class="pill good">cheapest</span>' : ''), money(x.total))).join('')}</table>` : ''}
    ${left < 0 ? `<div class="notice bad" style="margin-top:14px">💡 <div>You're ${money(-left)} over. You could swap in cheaper meals, turn a takeaway night into a cook night, or lower the drinks allowance.</div></div>` : ''}`;
  const s = openSheet({ title: 'Budget this week', body, foot: `<a class="btn" href="#/budget">Change budget</a>${left < 0 ? '<button class="btn primary" data-fit>💰 Swap in cheaper meals</button>' : '<button class="btn primary" data-close>Done</button>'}` });
  const fit = s.el.querySelector('[data-fit]');
  if (fit) fit.onclick = () => {
    const r = fitToBudget(w); touch(w); s.close(); renderApp();
    toast(r.after < r.before ? `Saved ${money(r.before - r.after)} on the shopping` : 'No cheaper swaps found – try changing locked meals or extras');
  };
}
