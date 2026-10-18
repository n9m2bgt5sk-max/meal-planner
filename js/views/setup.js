// First-time setup wizard, and the same sections reused on the Settings page.
import { state, save, householdServings } from '../store.js';
import { ALLERGENS, STORES, stateFromPostcode } from '../data/ingredients.js';
import { CUISINES, EQUIPMENT } from '../recipes-core.js';
import { APP_THEMES } from '../themes.js';
import { esc, switchHtml, stepperHtml, bindSteppers, toast } from '../ui.js';
import { render as renderApp, applyLook, go } from '../app.js';
import { refreshWeather, deviceLocation } from '../weather.js';

const EQUIP_LABEL = { stovetop: '🔥 Stovetop', oven: '♨️ Oven', grill: '🥓 Grill', bbq: '🍖 BBQ', 'slow-cooker': '🍲 Slow cooker', 'pressure-cooker': '⏲️ Pressure cooker', 'air-fryer': '🌀 Air fryer', microwave: '📡 Microwave', blender: '🥤 Blender', 'food-processor': '🔪 Food processor', 'stand-mixer': '🎂 Stand mixer', wok: '🥘 Wok' };
const ALLERGEN_LABEL = { gluten: 'Gluten', dairy: 'Dairy', egg: 'Egg', nuts: 'Tree nuts', peanut: 'Peanut', soy: 'Soy', sesame: 'Sesame', fish: 'Fish', shellfish: 'Shellfish' };

// ---------- sections ----------
export const SECTIONS = {
  household: {
    title: 'Who are you feeding?',
    render() {
      const s = state.setup;
      return `<p class="muted">Recipes are scaled to your household. Children get smaller portions by age.</p>
        <div class="row" style="justify-content:space-between"><b>Adults (and teens 14+)</b>${stepperHtml('adults', s.adults, 1, 12, 1, 'Adults')}</div>
        <div class="divider"></div>
        <div class="row" style="justify-content:space-between"><b>Children</b><button class="btn soft small" data-add-kid>＋ Add a child</button></div>
        <div id="kids">${s.children.map((c, i) => `<div class="kid-row"><span class="grow">Child ${i + 1}${c.name ? ` – ${esc(c.name)}` : ''}</span><span class="small muted">Age</span>${stepperHtml('kid-' + i, c.age, 0, 17, 1, `Child ${i + 1} age`)}<button class="icon-btn" data-del-kid="${i}" aria-label="Remove child ${i + 1}">🗑️</button></div>`).join('') || '<p class="small muted" style="margin-top:8px">No children added.</p>'}</div>
        <p class="small muted" style="margin-top:12px">That's about <b>${householdServings().toFixed(1)}</b> adult-sized serves per meal.</p>`;
    },
    bind(root, rerender) {
      bindSteppers(root, (name, v) => {
        if (name === 'adults') state.setup.adults = v;
        else if (name.startsWith('kid-')) state.setup.children[+name.slice(4)].age = v;
        save(); rerender();
      });
      root.querySelector('[data-add-kid]').onclick = () => { state.setup.children.push({ age: 6 }); save(); rerender(); };
      root.querySelectorAll('[data-del-kid]').forEach(b => b.onclick = () => { state.setup.children.splice(+b.dataset.delKid, 1); save(); rerender(); });
    },
  },
  diet: {
    title: 'Allergies & diet',
    render() {
      const s = state.setup;
      return `<div class="field-label">Allergies or intolerances (never suggested)</div>
        <div class="chips" data-group="allergies">${ALLERGENS.map(a => `<button class="chip no ${s.allergies.includes(a) ? 'on' : ''}" data-val="${a}" aria-pressed="${s.allergies.includes(a)}">${ALLERGEN_LABEL[a]}</button>`).join('')}</div>
        <div class="field-label" style="margin-top:16px">Diet</div>
        <div class="seg" data-seg="diet">${[['none', 'Everything'], ['pescatarian', 'Pescatarian'], ['vegetarian', 'Vegetarian'], ['vegan', 'Vegan']].map(([k, l]) => `<button class="${s.diet === k ? 'on' : ''}" data-val="${k}">${l}</button>`).join('')}</div>
        <label class="field" style="margin-top:16px"><span>Foods to avoid (comma separated)</span><input type="text" name="avoid" value="${esc(s.avoid.join(', '))}" placeholder="e.g. mushrooms, coriander, olives"></label>
        <div class="field-label">Spice level the adults enjoy</div>
        <div class="seg" data-seg="spiceTolerance">${[[0, 'No chilli'], [1, 'Mild'], [2, 'Medium'], [3, 'Hot']].map(([k, l]) => `<button class="${s.spiceTolerance === k ? 'on' : ''}" data-val="${k}">${l}</button>`).join('')}</div>
        <p class="small muted" style="margin-top:8px">With children under 12 the planner leans to mild dishes and suggests how to tone down spicy ones.</p>`;
    },
    bind(root, rerender) {
      root.querySelectorAll('[data-group=allergies] .chip').forEach(c => c.onclick = () => {
        const a = c.dataset.val, list = state.setup.allergies;
        state.setup.allergies = list.includes(a) ? list.filter(x => x !== a) : [...list, a];
        save(); rerender();
      });
      bindSegs(root, rerender);
      root.querySelector('[name=avoid]').onchange = e => { state.setup.avoid = e.target.value.split(',').map(s => s.trim()).filter(Boolean); save(); };
    },
  },
  location: {
    title: 'Where do you shop?',
    render() {
      const s = state.setup;
      return `<label class="field"><span>Postcode</span><input type="text" inputmode="numeric" maxlength="4" name="postcode" value="${esc(s.postcode)}" placeholder="e.g. 3000"></label>
        <p class="small muted" style="margin-top:-6px">${s.postcode ? `${esc(stateFromPostcode(s.postcode) || 'Unknown state')} prices and local weather.` : 'Used for regional prices and your local weather forecast.'} ${s.location ? `Weather for <b>${esc(s.location.name)}</b>.` : ''}</p>
        <button class="btn small soft" data-locate>📍 Use my location for weather</button>
        <div class="field-label" style="margin-top:16px">Shops you use</div>
        <div class="chips" data-group="stores">${Object.entries(STORES).map(([k, v]) => `<button class="chip ${s.stores.includes(k) ? 'on' : ''}" data-val="${k}" aria-pressed="${s.stores.includes(k)}">${v.name}</button>`).join('')}</div>
        <label class="field" style="margin-top:14px"><span>Main shop (used for prices)</span><select name="primaryStore">${s.stores.map(k => `<option value="${k}" ${s.primaryStore === k ? 'selected' : ''}>${STORES[k].name}</option>`).join('')}</select></label>
        <div class="field-label">Measurements</div>
        <div class="seg" data-seg="units"><button class="${s.units === 'metric' ? 'on' : ''}" data-val="metric">Metric (g, ml, °C)</button><button class="${s.units === 'imperial' ? 'on' : ''}" data-val="imperial">Imperial (oz, cups, °F)</button></div>
        ${switchHtml('weather', s.weather, 'Use the weather forecast', 'Salads on hot days, soups when it’s cold. Needs internet.')}`;
    },
    bind(root, rerender) {
      const pc = root.querySelector('[name=postcode]');
      pc.onchange = () => { state.setup.postcode = pc.value.trim(); state.setup.state = stateFromPostcode(pc.value.trim()) || ''; state.setup.location = null; state.weather = { fetched: 0, days: [], place: '' }; save(); rerender(); refreshWeather(true).then(() => rerender()); };
      root.querySelector('[data-locate]').onclick = async () => {
        try { state.setup.location = await deviceLocation(); state.weather.fetched = 0; save(); await refreshWeather(true); toast('Weather location set'); rerender(); }
        catch (e) { toast('Location not available – your postcode will be used'); }
      };
      root.querySelectorAll('[data-group=stores] .chip').forEach(c => c.onclick = () => {
        const k = c.dataset.val, list = state.setup.stores;
        if (list.includes(k) && list.length === 1) return toast('Keep at least one shop');
        state.setup.stores = list.includes(k) ? list.filter(x => x !== k) : [...list, k];
        if (!state.setup.stores.includes(state.setup.primaryStore)) state.setup.primaryStore = state.setup.stores[0];
        save(); rerender();
      });
      root.querySelector('[name=primaryStore]').onchange = e => { state.setup.primaryStore = e.target.value; save(); };
      root.querySelector('[name=weather]').onchange = e => { state.setup.weather = e.target.checked; save(); if (e.target.checked) refreshWeather(true); };
      bindSegs(root, rerender);
    },
  },
  kitchen: {
    title: 'Your kitchen',
    render() {
      const s = state.setup;
      return `<div class="field-label">Equipment you have</div>
        <div class="chips" data-group="equipment">${EQUIPMENT.map(e => `<button class="chip ${s.equipment.includes(e) ? 'on' : ''}" data-val="${e}" aria-pressed="${s.equipment.includes(e)}">${EQUIP_LABEL[e]}</button>`).join('')}</div>
        <div class="field-label" style="margin-top:16px">Meals to plan</div>
        ${switchHtml('meal-breakfast', s.meals.breakfast, 'Breakfasts')}
        ${switchHtml('meal-lunch', s.meals.lunch, 'Lunches')}
        ${switchHtml('meal-dinner', s.meals.dinner, 'Dinners')}
        <div class="field-label" style="margin-top:12px">Usual time to cook on a weeknight</div>
        <div class="seg" data-seg="defaultTime">${[[20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '1 hour'], [90, '1½ hours+']].map(([k, l]) => `<button class="${s.defaultTime === k ? 'on' : ''}" data-val="${k}">${l}</button>`).join('')}</div>
        <div class="field-label" style="margin-top:16px">Week starts on</div>
        <div class="seg" data-seg="weekStart">${[[1, 'Monday'], [6, 'Saturday'], [0, 'Sunday']].map(([k, l]) => `<button class="${s.weekStart === k ? 'on' : ''}" data-val="${k}">${l}</button>`).join('')}</div>
        ${switchHtml('assumeStaples', s.assumeStaples, 'I keep basic staples', 'Salt, pepper, oil, flour, sugar and dried spices go on a “check you have” list instead of the shopping list.')}`;
    },
    bind(root, rerender) {
      root.querySelectorAll('[data-group=equipment] .chip').forEach(c => c.onclick = () => {
        const k = c.dataset.val, list = state.setup.equipment;
        state.setup.equipment = list.includes(k) ? list.filter(x => x !== k) : [...list, k];
        save(); rerender();
      });
      for (const m of ['breakfast', 'lunch', 'dinner']) root.querySelector(`[name=meal-${m}]`).onchange = e => { state.setup.meals[m] = e.target.checked; save(); };
      root.querySelector('[name=assumeStaples]').onchange = e => { state.setup.assumeStaples = e.target.checked; save(); };
      bindSegs(root, rerender);
    },
  },
  budget: {
    title: 'Weekly food budget',
    render() {
      const b = state.budget, e = b.extras;
      const num = (name, val, label, prefix = '$') => `<label class="field"><span>${label}</span><div class="row nowrap"><b>${prefix}</b><input type="number" inputmode="decimal" min="0" step="1" name="${name}" value="${esc(val)}"></div></label>`;
      return `<p class="muted">Your whole food budget for a week. Drinks, takeaway and dining out come off first, and the meal plan fits the rest.</p>
        ${num('weekly', b.weekly, 'Total weekly food budget')}
        <div class="grid two">
          ${num('drinks', e.drinks, 'Alcohol & drinks each week')}
          ${num('other', e.other, 'Other food spending (coffees, snacks)')}
          ${num('takeawayEach', e.takeawayEach, 'Typical takeaway night costs')}
          <label class="field"><span>Takeaway nights in a usual week</span>${stepperHtml('takeawayCount', e.takeawayCount, 0, 7, 1, 'Takeaway nights')}</label>
          ${num('diningEach', e.diningEach, 'Typical dining-out night costs')}
          <label class="field"><span>Dining-out nights in a usual week</span>${stepperHtml('diningCount', e.diningCount, 0, 7, 1, 'Dining out nights')}</label>
        </div>
        <p class="small muted">Takeaway and dining-out nights are added to each new week (you can move or change them on the plan).</p>`;
    },
    bind(root, rerender) {
      root.querySelectorAll('input[type=number]').forEach(i => i.onchange = () => {
        const v = Math.max(0, parseFloat(i.value) || 0);
        if (i.name === 'weekly') state.budget.weekly = v; else state.budget.extras[i.name] = v;
        save();
      });
      bindSteppers(root, (name, v) => { state.budget.extras[name] = v; save(); });
    },
  },
  tastes: {
    title: 'Tastes & look',
    render() {
      const s = state.setup;
      return `<div class="field-label">Cuisines you love (suggested more often)</div>
        <div class="chips" data-group="likedCuisines">${CUISINES.filter(c => c !== 'Other').map(c => `<button class="chip ${s.likedCuisines.includes(c) ? 'on' : ''}" data-val="${c}" aria-pressed="${s.likedCuisines.includes(c)}">${c}</button>`).join('')}</div>
        <div class="field-label" style="margin-top:16px">Cuisines to skip</div>
        <div class="chips" data-group="dislikedCuisines">${CUISINES.filter(c => c !== 'Other').map(c => `<button class="chip no ${s.dislikedCuisines.includes(c) ? 'on' : ''}" data-val="${c}" aria-pressed="${s.dislikedCuisines.includes(c)}">${c}</button>`).join('')}</div>
        <div class="field-label" style="margin-top:16px">Theme</div>
        <div class="chips" data-group="theme">${APP_THEMES.map(t => `<button class="chip ${s.theme === t.key ? 'on' : ''}" data-val="${t.key}"><span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:linear-gradient(135deg,${t.swatch[0]} 50%,${t.swatch[1]} 50%);border:1px solid rgba(0,0,0,.15)"></span>${t.label}</button>`).join('')}</div>
        <div class="field-label" style="margin-top:16px">Text size</div>
        <div class="seg" data-seg="textSize"><button class="${s.textSize !== 'large' ? 'on' : ''}" data-val="normal">Normal</button><button class="${s.textSize === 'large' ? 'on' : ''}" data-val="large">Large</button></div>
        ${switchHtml('online', s.online, 'Online recipe ideas', 'Search and suggest recipes from a free online recipe library when connected.')}`;
    },
    bind(root, rerender) {
      for (const g of ['likedCuisines', 'dislikedCuisines']) root.querySelectorAll(`[data-group=${g}] .chip`).forEach(c => c.onclick = () => {
        const k = c.dataset.val, list = state.setup[g];
        state.setup[g] = list.includes(k) ? list.filter(x => x !== k) : [...list, k];
        const other = g === 'likedCuisines' ? 'dislikedCuisines' : 'likedCuisines';
        state.setup[other] = state.setup[other].filter(x => !state.setup[g].includes(x));
        save(); rerender();
      });
      root.querySelectorAll('[data-group=theme] .chip').forEach(c => c.onclick = () => { state.setup.theme = c.dataset.val; save(); applyLook(); rerender(); });
      root.querySelector('[name=online]').onchange = e => { state.setup.online = e.target.checked; save(); };
      bindSegs(root, () => { applyLook(); rerender(); });
    },
  },
};

function bindSegs(root, rerender) {
  root.querySelectorAll('[data-seg]').forEach(seg => seg.querySelectorAll('button').forEach(b => b.onclick = () => {
    const key = seg.dataset.seg;
    const raw = b.dataset.val;
    state.setup[key] = /^\d+$/.test(raw) ? Number(raw) : raw;
    save(); rerender();
  }));
}

// ---------- wizard ----------
const STEPS = ['welcome', 'household', 'diet', 'location', 'kitchen', 'budget', 'tastes'];
let step = 0;

export function render() {
  const key = STEPS[step];
  const pct = Math.round((step / (STEPS.length - 1)) * 100);
  let body;
  if (key === 'welcome') {
    body = `<div class="card center" style="padding:30px 20px">
      <div class="hello">🍲🥕🧺</div>
      <h1 style="margin-top:14px">Welcome to your <span class="hand" style="font-size:1.25em">Meal Planner</span></h1>
      <p class="muted" style="max-width:520px;margin:10px auto 20px">A few quick questions about your household, kitchen and budget, then we'll plan a week of meals, a shopping list and a cookbook to match. Everything stays on this device.</p>
      <button class="btn primary big" data-next>Let's get started</button>
      <p class="small muted" style="margin-top:16px">Have a backup or a file from your partner? <a href="#/backup" data-restore>Restore it instead</a>.</p>
    </div>`;
  } else {
    const sec = SECTIONS[key];
    body = `<div class="card"><h2>${sec.title}</h2><div id="sec">${sec.render()}</div></div>
      <div class="row" style="justify-content:space-between;margin-top:16px">
        <button class="btn" data-back>‹ Back</button>
        <button class="btn primary" data-next>${step === STEPS.length - 1 ? 'Plan my first week 🎉' : 'Next ›'}</button>
      </div>`;
  }
  return `<div class="wizard">
    ${state.setup.done ? '<div class="row" style="justify-content:flex-end"><a class="btn ghost small" href="#/more">Close setup</a></div>' : ''}
    <div class="progress" aria-hidden="true"><div style="width:${pct}%"></div></div>
    ${body}
  </div>`;
}

export function bind(root) {
  const key = STEPS[step];
  const rerender = () => {
    const sec = root.querySelector('#sec');
    if (!sec) return;
    sec.innerHTML = SECTIONS[key].render();
    SECTIONS[key].bind(sec, rerender);
  };
  if (SECTIONS[key]) SECTIONS[key].bind(root.querySelector('#sec'), rerender);
  const next = root.querySelector('[data-next]');
  next.onclick = () => {
    if (step < STEPS.length - 1) { step++; render_(); return; }
    state.setup.done = true; step = 0; save(true);
    refreshWeather(true);
    go('#/plan?fresh=1');
  };
  const back = root.querySelector('[data-back]');
  if (back) back.onclick = () => { step = Math.max(0, step - 1); render_(); };
  const restore = root.querySelector('[data-restore]');
  if (restore) restore.onclick = e => { e.preventDefault(); state.setup.done = true; save(true); go('#/backup'); };
}
function render_() { renderApp(false); window.scrollTo(0, 0); }
export function resetWizard(toStep = 0) { step = toStep; }
