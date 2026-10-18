// A recipe as a cookbook page: servings slider, units, ingredients, method, nutrition, rating, cook mode.
import { state, save, householdServings, getWeek, weekKeyFor, today, addDays, parseIso, DAY_NAMES, MONTHS, iso } from '../store.js';
import { ING } from '../data/ingredients.js';
import { getRecipe, recipeArt, costPerServe, nutritionPerServe, flags, totalTime, rememberTransient, suits } from '../recipes.js';
import { formatQty, convertText, money, toBase } from '../units.js';
import { relink, SLOT_LABEL, dayLabel } from '../planner.js';
import { pantryTotals } from '../shopping.js';
import { lookup } from '../online.js';
import { esc, openSheet, toast, confirmSheet } from '../ui.js';
import { render as renderApp, go } from '../app.js';
import { ensureWeek } from './plan.js';
import { editRecipeSheet } from './cookbook.js';

const ALLERGEN_LABEL = { gluten: 'Gluten', dairy: 'Dairy', egg: 'Egg', nuts: 'Tree nuts', peanut: 'Peanut', soy: 'Soy', sesame: 'Sesame', fish: 'Fish', shellfish: 'Shellfish' };
let viewServings = {};

function ctxMeal(route) {
  const { week, di, slot } = route.params;
  if (!week || di == null || !slot) return null;
  const w = state.weeks[week];
  if (!w) return null;
  return { w, di: +di, slot, meal: w.days[+di].meals[slot] };
}

export function render(route) {
  const id = route.args[0];
  const r = getRecipe(id);
  if (!r) {
    if (id && id.startsWith('mdb-')) {
      lookup(id).then(x => { if (x) { rememberTransient(x); renderApp(); } }).catch(() => {});
      return `<div class="empty"><div class="big">⏳</div><p>Loading recipe…</p></div>`;
    }
    return `<div class="empty"><div class="big">🤷</div><p>Recipe not found.</p><a class="btn" href="#/cookbook">Back to the cookbook</a></div>`;
  }
  const c = ctxMeal(route);
  const inPlan = c && c.meal && c.meal.recipeId === r.id && !route.params.preview;
  const servings = inPlan ? c.meal.servings : (viewServings[r.id] || Math.round(householdServings()));
  const extra = inPlan ? (c.meal.extraServings || 0) : 0;
  const makes = inPlan ? (c.meal.makes || []) : [];
  const covered = inPlan && c.meal.kind === 'reuse' && r.uses ? new Set(r.uses.replaces) : new Set();
  const units = state.setup.units;
  const factor = (servings + extra) / r.serves;
  const pantry = pantryTotals();
  const n = nutritionPerServe(r);
  const f = flags(r);
  const cps = costPerServe(r);
  const rating = state.ratings[r.id] || {};
  const hist = state.history.filter(h => h.recipeId === r.id);
  const last = hist.length ? hist[hist.length - 1].date : null;
  const s = suits(r);
  const ingLines = r.ingredients.map(l => {
    if (!l.id) return `<li><span class="q"></span><span>${esc(l.text)} <span class="tiny muted">(not priced)</span></span></li>`;
    const ing = ING[l.id];
    let mult = factor;
    for (const mk of makes) if (mk.scale.includes(l.id)) mult += mk.portions / r.serves;
    const qty = formatQty(l.id, l.qty * mult, l.unit, units);
    const have = pantry[l.id] && pantry[l.id] >= toBase(l.id, l.qty * mult, l.unit) * 0.9;
    const isCovered = covered.has(l.id);
    const name = ing ? ing.name.replace(/ \(.*\)$/, '') : l.id;
    return `<li class="${isCovered ? 'covered' : ''}"><span class="q">${esc(qty)}</span><span>${esc(name.toLowerCase())}${l.prep && !l.original ? `, <span class="muted">${esc(l.prep)}</span>` : ''}${l.original ? ` <span class="tiny muted">(${esc(l.prep)})</span>` : ''}${l.optional ? ' <span class="opt">optional</span>' : ''}${have ? ' <span class="pill good" style="font-size:.7rem">in pantry</span>' : ''}${isCovered ? ' <span class="tiny">– use leftovers</span>' : ''}</span></li>`;
  }).join('');
  const notes = [];
  if (inPlan && c.meal.kind === 'reuse' && c.meal.from) notes.push(`♻️ Uses leftover ${esc((r.uses && r.uses.key || '').replace(/-/g, ' '))} from ${dayLabel(c.w.days[c.meal.from.di])}. Crossed-out items are covered.`);
  if (inPlan && (c.meal.kind === 'reheat' || c.meal.kind === 'leftover') && c.meal.from) notes.push(`🍱 Cooked on ${dayLabel(c.w.days[c.meal.from.di])} – just reheat ${c.meal.servings} serves.`);
  if (extra) notes.push(`🍲 Cooking ${servings + extra} serves: ${servings} for tonight and ${extra} to keep for later. Quantities below include the extra.`);
  for (const mk of makes) notes.push(`♻️ Make extra ${esc(mk.label)} for ${dayLabel(c.w.days[mk.forDay])} – those quantities are already increased below.`);
  if (!s.ok) notes.push(`⚠️ Heads up: ${esc(s.why)}.`);
  if (r.source === 'online' && r.estimated) notes.push(`🌐 Online recipe: cost and nutrition are estimates from ${r.estimated.matched} of ${r.estimated.total} ingredients. Times are approximate.`);
  const spice = ['None', 'Mild', 'Medium', 'Hot'][r.spice || 0];
  const backHref = c ? `#/plan?week=${c.w.key}` : '#/cookbook';
  const saved = r.source !== 'online' || state.savedOnline.some(x => x.id === r.id);

  return `
  <div class="topbar no-print">
    <a class="btn ghost" href="${backHref}">‹ Back</a>
    <div class="grow"></div>
    <div class="actions">
      <button class="btn" data-cook>👩‍🍳 Cook mode</button>
      <button class="btn" data-print aria-label="Print recipe">🖨️</button>
      ${route.params.preview && c ? `<button class="btn primary" data-use>Use for ${esc(dayLabel(c.w.days[c.di]))} ${SLOT_LABEL[c.slot.replace(/\d$/, '')].toLowerCase()}</button>` : `<button class="btn primary" data-add>＋ Add to plan</button>`}
    </div>
  </div>
  <article class="cookbook">
    <div class="head">
      <div>
        <div class="hand" style="font-size:1.5rem">${esc(r.cuisine)} · ${(r.meal || []).map(m => SLOT_LABEL[m] || m).join(', ')}</div>
        <h1>${esc(r.name)}</h1>
        <p class="intro">${esc(r.description || '')}</p>
        <div class="facts">
          <div><b>Prep</b>${r.prep} min</div><div><b>Cook</b>${r.cook} min${r.handsOff ? ` <span class="tiny muted">(${r.handsOff} hands-off)</span>` : ''}</div>
          <div><b>Effort</b>${['', 'Easy', 'Medium', 'Project'][r.effort || 1]}</div><div><b>Spice</b>${spice}</div>
          ${cps != null ? `<div><b>Cost</b>${money(cps)} / serve</div>` : ''}
          ${r.kidFriendly ? '<div><b>Kids</b>👧 Friendly</div>' : ''}
        </div>
        <div class="pills">${f.vegetarian ? '<span class="pill good">Vegetarian</span>' : ''}${f.vegan ? '<span class="pill good">Vegan</span>' : ''}${r.batch ? '<span class="pill accent">Batch cook</span>' : ''}${r.freezes ? '<span class="pill accent">Freezes well</span>' : ''}${(r.equipment || []).map(e => `<span class="pill">${esc(e.replace('-', ' '))}</span>`).join('')}</div>
      </div>
      <div class="hero">${recipeArt(r, 280)}</div>
    </div>
    ${notes.map(x => `<div class="notice" style="margin-top:12px">${x}</div>`).join('')}
    <div class="serve-ctl no-print">
      <div class="row" style="justify-content:space-between"><b>Serves <span data-sv>${servings}</span>${extra ? ` <span class="small muted">+ ${extra} extra</span>` : ''}</b>
        <div class="seg" data-units><button class="${units === 'metric' ? 'on' : ''}" data-val="metric">Metric</button><button class="${units === 'imperial' ? 'on' : ''}" data-val="imperial">Imperial</button></div></div>
      <input type="range" min="1" max="24" step="1" value="${servings}" name="servings" aria-label="Number of serves">
      <div class="small muted">${inPlan ? `Changes ${esc(dayLabel(c.w.days[c.di]))}'s ${SLOT_LABEL[c.slot.replace(/\d$/, '')].toLowerCase()} and your shopping list.` : `Your household is about ${householdServings().toFixed(1)} serves.`}${cps != null ? ` This batch costs about <b>${money(cps * (servings + extra))}</b>.` : ''}</div>
    </div>
    <div class="cols">
      <section>
        <h2>You'll need</h2>
        <ul class="ing-list">${ingLines}</ul>
        <h2 style="margin-top:20px">Per serve</h2>
        <table class="nutri">
          <tr><td>Energy</td><td>${Math.round(n.kcal)} kcal / ${Math.round(n.kcal * 4.184)} kJ</td></tr>
          <tr><td>Protein</td><td>${n.protein.toFixed(0)} g</td></tr><tr><td>Carbohydrate</td><td>${n.carbs.toFixed(0)} g</td></tr>
          <tr><td>Fat</td><td>${n.fat.toFixed(0)} g</td></tr><tr><td>Fibre</td><td>${n.fibre.toFixed(0)} g</td></tr><tr><td>Sodium</td><td>${Math.round(n.sodium)} mg</td></tr>
        </table>
        <p class="tiny muted">Estimated from the ingredients (seasoning to taste not included).${f.allergens.length ? ` Contains: ${f.allergens.map(a => ALLERGEN_LABEL[a]).join(', ')}.` : ' No common allergens listed.'}</p>
      </section>
      <section>
        <h2>Method</h2>
        <ol class="steps">${r.steps.map(st => `<li>${esc(convertText(st, units))}</li>`).join('')}</ol>
        ${r.tips ? `<div class="tip">✎ ${esc(convertText(r.tips, units))}</div>` : ''}
        ${r.sourceUrl ? `<p class="small" style="margin-top:12px">Source: <a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">${esc(r.sourceUrl.replace(/^https?:\/\//, '').split('/')[0])}</a></p>` : ''}
        <div class="card flat no-print" style="margin-top:20px">
          <div class="row" style="justify-content:space-between"><b>Your rating</b>
            <span class="stars" role="group" aria-label="Rate this recipe">${[1, 2, 3, 4, 5].map(k => `<button class="${rating.stars >= k ? 'on' : ''}" data-star="${k}" aria-label="${k} star${k > 1 ? 's' : ''}">★</button>`).join('')}</span></div>
          <label class="switch"><span>Suggest this again</span><input type="checkbox" name="again" ${rating.again !== false ? 'checked' : ''}><span class="track"></span></label>
          <label class="field" style="margin:4px 0 0"><span>Notes</span><textarea name="note" placeholder="e.g. kids loved it, use less chilli">${esc(rating.note || '')}</textarea></label>
          <p class="small muted" style="margin:6px 0 0">${hist.length ? `On your plan ${hist.length} time${hist.length > 1 ? 's' : ''}, last on ${parseIso(last).getDate()} ${MONTHS[parseIso(last).getMonth()]}.` : 'Not on a past plan yet.'}</p>
        </div>
        <div class="row no-print" style="margin-top:14px">
          ${!saved ? '<button class="btn soft" data-save-online>⭐ Save to my cookbook</button>' : ''}
          ${r.source === 'mine' ? '<button class="btn" data-edit>✏️ Edit</button><button class="btn danger" data-delete>Delete</button>' : ''}
          ${r.source === 'cookbook' ? '<button class="btn" data-copy>✏️ Make my own version</button>' : ''}
          ${r.source === 'online' && saved ? '<button class="btn danger" data-unsave>Remove from my cookbook</button>' : ''}
        </div>
      </section>
    </div>
  </article>`;
}

export function bind(root, route) {
  const r = getRecipe(route.args[0]);
  if (!r) return;
  const c = ctxMeal(route);
  const inPlan = c && c.meal && c.meal.recipeId === r.id && !route.params.preview;
  const range = root.querySelector('[name=servings]');
  range.oninput = () => { root.querySelector('[data-sv]').textContent = range.value; };
  range.onchange = () => {
    const v = +range.value;
    if (inPlan) { c.meal.servings = v; relink(c.w); c.w.updatedAt = Date.now(); save(); }
    else viewServings[r.id] = v;
    renderApp();
  };
  root.querySelectorAll('[data-units] button').forEach(b => b.onclick = () => { state.setup.units = b.dataset.val; save(); renderApp(); });
  root.querySelector('[data-print]').onclick = () => window.print();
  root.querySelector('[data-cook]').onclick = () => cookMode(r);
  root.querySelectorAll('[data-star]').forEach(b => b.onclick = () => {
    state.ratings[r.id] = { ...(state.ratings[r.id] || {}), stars: +b.dataset.star, updated: Date.now() };
    if (+b.dataset.star === 1) state.ratings[r.id].again = false;
    save(); renderApp();
  });
  root.querySelector('[name=again]').onchange = e => { state.ratings[r.id] = { ...(state.ratings[r.id] || {}), again: e.target.checked, updated: Date.now() }; save(); };
  root.querySelector('[name=note]').onchange = e => { state.ratings[r.id] = { ...(state.ratings[r.id] || {}), note: e.target.value, updated: Date.now() }; save(); toast('Note saved'); };
  const use = root.querySelector('[data-use]');
  if (use) use.onclick = async () => {
    const { swapMeal } = await import('../planner.js');
    if (r.source === 'online' && !state.savedOnline.some(x => x.id === r.id)) state.savedOnline.push({ ...r, updated: Date.now() });
    swapMeal(c.w, c.di, c.slot, r.id); save();
    toast(`${r.name} added`); go(`#/plan?week=${c.w.key}`);
  };
  const add = root.querySelector('[data-add]');
  if (add) add.onclick = () => addToPlanSheet(r);
  const so = root.querySelector('[data-save-online]');
  if (so) so.onclick = () => { state.savedOnline.push({ ...r, updated: Date.now() }); save(); toast('Saved to your cookbook'); renderApp(); };
  const us = root.querySelector('[data-unsave]');
  if (us) us.onclick = () => { state.savedOnline = state.savedOnline.filter(x => x.id !== r.id); state.deleted.push(r.id); rememberTransient(r); save(); renderApp(); };
  const ed = root.querySelector('[data-edit]');
  if (ed) ed.onclick = () => editRecipeSheet(r);
  const cp = root.querySelector('[data-copy]');
  if (cp) cp.onclick = () => editRecipeSheet({ ...JSON.parse(JSON.stringify(r)), id: null, name: r.name + ' (my version)', source: 'mine' });
  const del = root.querySelector('[data-delete]');
  if (del) del.onclick = async () => {
    if (!(await confirmSheet('Delete recipe?', `Remove “${r.name}” from your cookbook?`, 'Delete', true))) return;
    state.customRecipes = state.customRecipes.filter(x => x.id !== r.id); state.deleted.push(r.id); save(); go('#/cookbook');
  };
}

export function addToPlanSheet(r) {
  const weeks = [0, 1].map(o => ensureWeek(weekKeyFor(addDays(today(), o * 7))));
  const t = iso(today());
  const slots = (r.meal || []).includes('breakfast') ? 'breakfast' : (r.meal || []).includes('lunch') && !(r.meal || []).includes('dinner') ? 'lunch' : 'dinner';
  const body = `<div class="field-label">Which meal?</div>
    <div class="seg" data-slot>${['breakfast', 'lunch', 'dinner'].map(s => `<button class="${s === slots ? 'on' : ''}" data-val="${s}">${SLOT_LABEL[s]}</button>`).join('')}</div>
    ${weeks.map((w, wi) => `<h3 style="margin-top:16px">${wi === 0 ? 'This week' : 'Next week'}</h3><div class="chips">${w.days.map((d, di) => {
      const date = parseIso(d.date);
      return d.date < t ? '' : `<button class="chip" data-day="${wi}|${di}">${DAY_NAMES[date.getDay()].slice(0, 3)} ${date.getDate()}</button>`;
    }).join('')}</div>`).join('')}
    <p class="small muted" style="margin-top:12px">It'll be locked 🔒 so re-planning keeps it.</p>`;
  const s = openSheet({ title: `Add ${r.name}`, body });
  let slot = slots;
  s.el.querySelectorAll('[data-slot] button').forEach(b => b.onclick = () => { slot = b.dataset.val; s.el.querySelectorAll('[data-slot] button').forEach(x => x.classList.toggle('on', x === b)); });
  s.el.querySelectorAll('[data-day]').forEach(b => b.onclick = () => {
    const [wi, di] = b.dataset.day.split('|').map(Number);
    const w = weeks[wi];
    const d = w.days[di];
    if (slot === 'dinner' && d.mode !== 'cook' && d.mode !== 'event') d.mode = 'cook';
    if (r.source === 'online' && !state.savedOnline.some(x => x.id === r.id)) state.savedOnline.push({ ...r, updated: Date.now() });
    d.meals[slot] = { recipeId: r.id, servings: Math.round(householdServings() * 2) / 2, locked: true, kind: 'cook', makes: [], extraServings: 0, reasons: ['Your pick'] };
    relink(w); w.updatedAt = Date.now(); save(); s.close();
    toast(`Added to ${DAY_NAMES[parseIso(d.date).getDay()]}`, { label: 'View', run: () => go(`#/plan?week=${w.key}`) });
  });
}

// ---------- cook mode ----------
let wakeLock = null;
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach(t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.3, ctx.currentTime + t); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.25); });
  } catch (e) {}
  if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
}

export function cookMode(r) {
  const units = state.setup.units;
  let i = 0;
  const timers = [];
  const el = document.createElement('div');
  el.className = 'cookmode';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Cook mode');
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  try { navigator.wakeLock && navigator.wakeLock.request('screen').then(l => { wakeLock = l; }).catch(() => {}); } catch (e) {}
  const findTimes = text => {
    const out = [];
    const re = /(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s*(minutes|minute|mins|min|hours|hour|hrs|hr)\b/gi;
    let m;
    while ((m = re.exec(text))) { const n = +(m[2] || m[1]); out.push(/h/i.test(m[3]) ? n * 60 : n); }
    return [...new Set(out)].slice(0, 2);
  };
  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const draw = () => {
    const text = convertText(r.steps[i], units);
    el.innerHTML = `
      <div class="row" style="justify-content:space-between"><span class="stepnum">Step ${i + 1} of ${r.steps.length}</span><button class="btn" data-x>✕ Close</button></div>
      <div class="hand" style="font-size:1.3rem;margin-top:-6px">${esc(r.name)}</div>
      <div class="steptext">${esc(text)}</div>
      <div class="row" style="margin-bottom:10px">${findTimes(text).map(m => `<button class="btn soft" data-timer="${m}">⏲️ ${m} min timer</button>`).join('')}
        ${timers.map((t, k) => `<span class="timer" aria-live="polite">${esc(t.label)} ${t.left > 0 ? fmt(t.left) : 'Done! 🔔'}<button class="icon-btn" data-stop="${k}" aria-label="Stop timer">✕</button></span>`).join('')}</div>
      <div class="row nowrap">
        <button class="btn big grow" data-prev ${i === 0 ? 'disabled' : ''}>‹ Back</button>
        ${i < r.steps.length - 1 ? '<button class="btn primary big grow" data-next>Next ›</button>' : '<button class="btn primary big grow" data-x>Finished 🎉</button>'}
      </div>`;
    el.querySelectorAll('[data-x]').forEach(b => b.onclick = close);
    const p = el.querySelector('[data-prev]'); if (p) p.onclick = () => { i--; draw(); };
    const n = el.querySelector('[data-next]'); if (n) n.onclick = () => { i++; draw(); };
    el.querySelectorAll('[data-timer]').forEach(b => b.onclick = () => { timers.push({ label: `Step ${i + 1}`, left: +b.dataset.timer * 60 }); draw(); });
    el.querySelectorAll('[data-stop]').forEach(b => b.onclick = () => { timers.splice(+b.dataset.stop, 1); draw(); });
  };
  const tick = setInterval(() => {
    let changed = false;
    for (const t of timers) if (t.left > 0) { t.left--; changed = true; if (t.left === 0) beep(); }
    if (changed) el.querySelectorAll('.timer').forEach((span, k) => { const t = timers[k]; if (t) span.firstChild.textContent = `${t.label} ${t.left > 0 ? fmt(t.left) : 'Done! 🔔'}`; });
  }, 1000);
  function close() {
    clearInterval(tick); el.remove(); document.body.style.overflow = '';
    try { wakeLock && wakeLock.release(); } catch (e) {}
  }
  draw();
}
