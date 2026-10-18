// Weekly planner: scores every recipe for every meal slot and builds the week.
import { ING } from './data/ingredients.js';
import { state, parseIso, today, seasonFor, householdServings, hasYoungKids, iso } from './store.js';
import { allRecipes, getRecipe, suits, costPerServe, activeTime, totalTime, flags } from './recipes.js';
import { buildList, pantryTotals } from './shopping.js';
import { themeMatch, EVENT_STYLES } from './themes.js';

export const SLOTS = ['breakfast', 'lunch', 'dinner'];
export const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', main: 'Main', side: 'Side', dessert: 'Dessert', nibbles: 'Nibbles', brunch: 'Brunch dish' };

// ---------- budget ----------
export function extrasFor(week) {
  const b = state.budget.extras;
  const takeaway = week.days.filter(d => d.mode === 'takeaway').length;
  const dining = week.days.filter(d => d.mode === 'dining').length;
  return {
    drinks: Number(b.drinks) || 0,
    takeaway: takeaway * (Number(b.takeawayEach) || 0), takeawayCount: takeaway,
    dining: dining * (Number(b.diningEach) || 0), diningCount: dining,
    other: Number(b.other) || 0,
  };
}
export function budgetFor(week) {
  const total = week.budgetOverride != null ? Number(week.budgetOverride) : Number(state.budget.weekly) || 0;
  const ex = extrasFor(week);
  const extras = ex.drinks + ex.takeaway + ex.dining + ex.other;
  return { total, extras, ex, groceries: Math.max(0, total - extras) };
}

// ---------- context ----------
function weatherFor(date) {
  const w = (state.weather.days || []).find(d => d.date === date);
  return w || null;
}
export function dayClimate(date) {
  const w = weatherFor(date);
  if (w) {
    if (w.tmax >= 28) return { kind: 'hot', w };
    if (w.tmax <= 16) return { kind: 'cold', w };
    return { kind: 'mild', w };
  }
  const s = seasonFor(parseIso(date));
  return { kind: s === 'summer' ? 'warm' : s === 'winter' ? 'cool' : 'mild', w: null, season: s };
}

function buildContext(week) {
  const pantry = pantryTotals();
  const soon = {};
  const t = today();
  for (const p of state.pantry) {
    if (!p.ingId || !p.expiry) continue;
    const days = (parseIso(p.expiry) - t) / 86400000;
    if (days <= 4) soon[p.ingId] = true;
  }
  const lastCooked = {};
  for (const h of state.history) {
    const d = (t - parseIso(h.date)) / 86400000;
    if (d >= 0 && (lastCooked[h.recipeId] == null || d < lastCooked[h.recipeId])) lastCooked[h.recipeId] = d;
  }
  const cuisineRatings = {};
  for (const [id, rt] of Object.entries(state.ratings)) {
    const r = getRecipe(id);
    if (!r || !rt.stars) continue;
    (cuisineRatings[r.cuisine] = cuisineRatings[r.cuisine] || []).push(rt.stars);
  }
  const b = budgetFor(week);
  const plannedServes = week.days.reduce((s, d) => s + (d.mode === 'cook' ? householdServings() : 0), 0) || 1;
  return {
    setup: state.setup, week, pantry, soon, lastCooked, cuisineRatings,
    serves: householdServings(),
    youngKids: hasYoungKids(),
    hasKids: (state.setup.children || []).length > 0,
    targetPerServe: b.groceries / Math.max(1, plannedServes) * 0.85, // leave room for breakfasts, lunches and staples
    budget: b,
    recipes: allRecipes().concat(week.prefs.online ? (state.onlinePool.items || []) : []),
  };
}

function mainProtein(r) {
  for (const l of r.ingredients) {
    const ing = ING[l.id];
    if (!ing) continue;
    for (const f of ['beef', 'pork', 'lamb', 'poultry', 'fish', 'shellfish']) if (ing.flags.includes(f)) return f;
  }
  return 'veg';
}

const MEAL_FOR_SLOT = { breakfast: ['breakfast'], lunch: ['lunch'], dinner: ['dinner'], main: ['dinner'], side: ['side'], dessert: ['dessert'], nibbles: ['snack', 'side'], brunch: ['breakfast', 'lunch'] };

export function timeFits(r, minutes) {
  if (!minutes) return true;
  return totalTime(r) <= minutes || (r.handsOff && activeTime(r) <= minutes);
}

// Score a recipe for a slot. Returns null if it can't be used at all.
export function scoreRecipe(r, slot, di, ctx, planned = [], opts = {}) {
  const day = ctx.week.days[di];
  const reasons = [];
  if (!(r.meal || []).some(m => MEAL_FOR_SLOT[slot].includes(m))) return null;
  const s = suits(r, ctx.setup);
  if (!s.ok) return null;
  const rating = state.ratings[r.id];
  if (rating && (rating.again === false || rating.stars === 1) && !opts.allowDisliked) return null;
  let score = 5;
  const isMain = slot === 'dinner' || slot === 'main';

  // Time and effort for the day.
  if (isMain && !opts.ignoreTime) {
    if (!timeFits(r, day.time)) {
      if (!opts.relaxTime) return null;
      score -= 4;
    } else if (day.time <= 30) { reasons.push(r.handsOff && totalTime(r) > day.time ? 'Start it in the morning' : `Ready in ${totalTime(r)} min`); }
    if (day.effort === 'easy') { if (r.effort === 3) score -= 5; else if (r.effort === 2) score -= 1.5; else score += 1; }
    if (day.effort === 'project') { if (r.effort === 3) { score += 2.5; reasons.push('A cooking project'); } else if (r.effort === 1) score -= 1; }
  }

  // Cuisine preferences: day first, then the week, then the household's favourites.
  if (day.cuisine && r.cuisine === day.cuisine) { score += 4; reasons.push(`${r.cuisine} night`); }
  else if (day.cuisine && isMain) score -= 1.5;
  if (ctx.week.prefs.cuisines.length) {
    if (ctx.week.prefs.cuisines.includes(r.cuisine)) { score += 1.5; if (!day.cuisine) reasons.push(`${r.cuisine} this week`); }
    else score -= 0.5;
  }
  if ((ctx.setup.likedCuisines || []).includes(r.cuisine)) score += 1;

  // Children and spice.
  const maxSpice = ctx.youngKids ? Math.min(1, ctx.setup.spiceTolerance) : ctx.setup.spiceTolerance;
  if (r.spice > maxSpice) score -= 2 * (r.spice - maxSpice);
  if (ctx.hasKids) { if (r.kidFriendly) { score += 1.5; reasons.push('Kid friendly'); } else score -= 1; }

  // Weather and season.
  const cl = dayClimate(day.date);
  if (cl.kind === 'hot') { if (r.weather === 'hot') { score += 2.5; reasons.push(`Cool meal for a ${Math.round(cl.w.tmax)}° day`); } if (r.weather === 'cold') score -= 3; if ((r.equipment || []).includes('oven') && r.cook > 45) score -= 1; }
  if (cl.kind === 'cold') { if (r.weather === 'cold') { score += 2.5; reasons.push(`Warming for a ${Math.round(cl.w.tmax)}° day`); } if (r.weather === 'hot') score -= 2; }
  if (cl.kind === 'warm') { if (r.weather === 'hot') score += 1.2; if (r.weather === 'cold') score -= 1.2; }
  if (cl.kind === 'cool') { if (r.weather === 'cold') score += 1.2; if (r.weather === 'hot') score -= 1.2; }
  if (cl.w && cl.w.rain >= 70 && (r.equipment || []).includes('bbq') && !(r.equipment || []).includes('grill')) score -= 2;
  const season = seasonFor(parseIso(day.date));
  if ((r.tags || []).includes(season)) score += 0.8;

  // Pantry, fridge and freezer.
  let pantryHits = [], soonHits = [];
  for (const l of r.ingredients) {
    const ing = ING[l.id];
    if (!ing || ing.staple || ing.spice) continue;
    if (ctx.pantry[l.id]) pantryHits.push(ing.name);
    if (ctx.soon[l.id]) soonHits.push(ing.name);
  }
  score += Math.min(3, pantryHits.length * 0.7) + soonHits.length * 2;
  if (soonHits.length) reasons.push(`Uses up your ${soonHits[0].toLowerCase()}`);
  else if (pantryHits.length) reasons.push(`Uses your ${pantryHits[0].toLowerCase()}`);

  // Ratings (and ratings of similar dishes).
  if (rating && rating.stars) {
    score += (rating.stars - 3) * 1.2;
    if (rating.stars >= 4) reasons.push(`Rated ${'★'.repeat(rating.stars)}`);
  } else {
    const cr = ctx.cuisineRatings[r.cuisine];
    if (cr && cr.length) score += ((cr.reduce((a, b) => a + b, 0) / cr.length) - 3) * 0.4;
  }

  // History: repeats are fine but variety is nice.
  const last = ctx.lastCooked[r.id];
  if (last != null) { if (last < 7) score -= 2; else if (last < 14) score -= 0.8; }
  else if (r.source === 'cookbook' && Object.keys(ctx.lastCooked).length > 10) { score += 0.3; }
  const inPlan = planned.filter(p => p.recipeId === r.id).length;
  if (inPlan) score -= isMain ? 5 * inPlan : slot === 'breakfast' ? 1 * inPlan : 2.5 * inPlan;
  if (isMain) {
    const prev = planned.find(p => p.di === di - 1 && (p.slot === 'dinner' || p.slot === 'main'));
    if (prev) {
      const pr = getRecipe(prev.recipeId);
      if (pr && pr.cuisine === r.cuisine) score -= 0.8;
      if (pr && mainProtein(pr) === mainProtein(r)) score -= 0.8;
    }
  }

  // Budget.
  const cps = costPerServe(r);
  if (cps != null && isMain && ctx.targetPerServe > 0) {
    const ratio = cps / ctx.targetPerServe;
    if (ratio > 1) score -= Math.min(5, (ratio - 1) * 3);
    else if (ratio < 0.7) { score += 0.8; reasons.push('Budget friendly'); }
  }
  if (r.uses && !opts.reuse) score -= 2.5;
  if (isMain && r.makes && r.makes.length && di < 5) { score += 1.2; reasons.push('Cook once, eat twice'); }
  if (r.source === 'online') { score -= 0.5; reasons.push('Online idea'); }
  if (opts.theme) {
    const tm = themeMatch(r, opts.theme, opts.themeText);
    score += tm * 1.5;
    if (tm >= 3) reasons.unshift('Fits the theme');
  }
  return { r, score, reasons: [...new Set(reasons)].slice(0, 3), cps };
}

function pickWeighted(list) {
  if (!list.length) return null;
  const top = list.slice(0, 4);
  const weights = [0.5, 0.25, 0.15, 0.1].slice(0, top.length);
  let x = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < top.length; i++) { x -= weights[i]; if (x <= 0) return top[i]; }
  return top[0];
}

function ranked(ctx, slot, di, planned, opts = {}) {
  const out = [];
  for (const r of ctx.recipes) {
    const s = scoreRecipe(r, slot, di, ctx, planned, opts);
    if (s) { s.score += Math.random() * (opts.noJitter ? 0 : 1.2); out.push(s); }
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

function plannedList(week) {
  const out = [];
  week.days.forEach((d, di) => { for (const [slot, m] of Object.entries(d.meals || {})) if (m && m.recipeId) out.push({ di, slot, recipeId: m.recipeId }); });
  return out;
}

function slotsForDay(day) {
  const m = state.setup.meals;
  const s = [];
  if (m.breakfast) s.push('breakfast');
  if (m.lunch) s.push('lunch');
  if (day.mode === 'cook') s.push('dinner');
  return s;
}

function newMeal(r, servings, extra = {}) {
  return { recipeId: r.id, servings: Math.max(1, Math.round(servings * 2) / 2), locked: false, kind: 'cook', makes: [], extraServings: 0, ...extra };
}

// ---------- build the whole week ----------
export function generateWeek(week, opts = {}) {
  const ctx = buildContext(week);
  const serves = ctx.serves;
  const tdy = iso(today());

  // Keep locked meals, and meals on days already past.
  week.days.forEach(day => {
    const keep = {};
    for (const [slot, m] of Object.entries(day.meals || {})) {
      if (m && (m.locked || (day.date < tdy && !opts.includePast))) keep[slot] = m;
    }
    day.meals = keep;
    if (day.mode !== 'event') for (const k of Object.keys(day.meals)) if (EVENT_COURSE(k)) delete day.meals[k];
  });
  const isOpen = (day, slot) => !day.meals[slot] && !(day.date < tdy && !opts.includePast);

  // 1. Special occasions.
  week.days.forEach((day, di) => { if (day.mode === 'event' && day.event) planEvent(week, di, ctx); });

  // 2. Batch cooking: cook big on roomy days, reheat on the busiest days.
  const sessions = { individual: 0, mix: 1, bulk: 2 }[week.prefs.style] ?? 1;
  const perSession = week.prefs.style === 'bulk' ? 2 : 1;
  if (sessions > 0) {
    const cookDays = week.days.map((d, di) => ({ d, di })).filter(x => x.d.mode === 'cook' && isOpen(x.d, 'dinner'));
    const busy = cookDays.filter(x => x.d.time <= 45).sort((a, b) => a.d.time - b.d.time || a.di - b.di);
    const busyAfter = x => busy.filter(y => y.di > x.di).length;
    // The roomiest day that still has busy nights after it. Failing that, any roomy day with a cook night after it,
    // so a big Saturday cook can still cover Sunday.
    const later = x => cookDays.filter(y => y.di > x.di).sort((a, b) => a.d.time - b.d.time || a.di - b.di);
    const roomy = cookDays.filter(x => x.d.time >= 60 || (x.d.time >= 45 && x.d.effort !== 'easy'))
      .filter(x => later(x).length > 0)
      .sort((a, b) => (busyAfter(b) > 0) - (busyAfter(a) > 0) || b.d.time - a.d.time || a.di - b.di);
    const used = new Set();
    for (let s = 0; s < sessions && roomy.length; s++) {
      const src = roomy.shift();
      if (used.has(src.di)) continue;
      let targets = busy.filter(x => x.di > src.di && !used.has(x.di)).slice(0, perSession);
      if (!targets.length) targets = later(src).filter(x => !used.has(x.di)).slice(0, 1);
      if (!targets.length) continue;
      const list = onCuisine(ranked(ctx, 'dinner', src.di, plannedList(week)).filter(x => x.r.batch && (x.r.freezes || (x.r.fridgeDays || 0) >= 3)), src.d);
      const pick = pickWeighted(list);
      if (!pick) continue;
      const m = newMeal(pick.r, serves, { reasons: ['Batch cook', ...pick.reasons].slice(0, 3) });
      src.d.meals.dinner = m;
      used.add(src.di);
      for (const t of targets) {
        t.d.meals.dinner = { recipeId: pick.r.id, servings: serves, kind: 'reheat', from: { di: src.di, slot: 'dinner' }, locked: false, makes: [], extraServings: 0, reasons: [`Cooked ${dayLabel(src.d)}, just reheat`] };
        used.add(t.di);
      }
    }
  }

  // 3. Every other dinner, busiest days first so they get the quick recipes.
  const order = week.days.map((d, di) => ({ d, di })).filter(x => slotsForDay(x.d).includes('dinner') && isOpen(x.d, 'dinner')).sort((a, b) => a.d.time - b.d.time);
  for (const { d, di } of order) {
    let list = ranked(ctx, 'dinner', di, plannedList(week));
    if (!list.length) list = ranked(ctx, 'dinner', di, plannedList(week), { relaxTime: true });
    const themed = onCuisine(list, d);
    const pick = pickWeighted(themed.length ? themed : list);
    if (pick) d.meals.dinner = newMeal(pick.r, serves, { reasons: pick.reasons });
  }

  // 4. Cook once, use twice: link meals that make leftovers to recipes that use them.
  linkReuse(week, ctx);

  // 5. Lunches and breakfasts.
  week.days.forEach((d, di) => {
    for (const slot of ['lunch', 'breakfast']) {
      if (!slotsForDay(d).includes(slot) || !isOpen(d, slot)) continue;
      if (slot === 'lunch' && week.prefs.leftoverLunches && di > 0) {
        const prev = week.days[di - 1].meals.dinner;
        const pr = prev && getRecipe(prev.recipeId);
        if (prev && pr && (prev.kind === 'cook' || prev.kind === 'reuse') && (pr.fridgeDays || 2) >= 1 && !(pr.meal || []).includes('dessert')) {
          d.meals.lunch = { recipeId: pr.id, servings: state.setup.adults, kind: 'leftover', from: { di: di - 1, slot: 'dinner' }, locked: false, makes: [], extraServings: 0, reasons: ['Leftovers from last night'] };
          continue;
        }
      }
      const list = ranked(ctx, slot, di, plannedList(week));
      const pick = pickWeighted(list);
      if (pick) d.meals[slot] = newMeal(pick.r, serves, { reasons: pick.reasons });
    }
  });

  relink(week);
  // 6. Bring the shopping total within the grocery budget by swapping the priciest meals.
  fitBudget(week, ctx);
  relink(week);
  week.generated = true;
  week.updatedAt = Date.now();
  return week;
}

// Only the recipes that match a day's chosen cuisine, when it has one.
function onCuisine(list, day) { return day.cuisine ? list.filter(x => x.r.cuisine === day.cuisine) : list; }

function EVENT_COURSE(k) { return /^(main|side|dessert|nibbles|brunch)\d*$/.test(k); }

export function dayLabel(day) {
  const d = parseIso(day.date);
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
}

function planEvent(week, di, ctx) {
  const day = week.days[di];
  const ev = day.event;
  const style = EVENT_STYLES[ev.style] || EVENT_STYLES.dinner;
  const guests = Number(ev.guests) || 0;
  const servings = ctx.serves + guests;
  const counts = {};
  for (const course of style.courses) {
    counts[course] = (counts[course] || 0) + 1;
    const slot = counts[course] > 1 ? course + counts[course] : course;
    if (day.meals[slot]) continue;
    const list = ranked(ctx, course, di, plannedList(week), { theme: ev.theme, themeText: ev.name, ignoreTime: true });
    const pick = pickWeighted(list);
    if (pick) day.meals[slot] = newMeal(pick.r, servings, { reasons: pick.reasons, course });
  }
}

function linkReuse(week, ctx) {
  let links = 0;
  week.days.forEach((d, di) => {
    const m = d.meals.dinner;
    if (!m || m.kind !== 'cook' || links >= 3) return;
    const r = getRecipe(m.recipeId);
    if (!r || !r.makes || !r.makes.length) return;
    // A batch cook that's already being reheated later is enough of that dish for one week.
    if (week.days.some(x => Object.values(x.meals || {}).some(o => o && o.from && o.from.di === di))) return;
    for (const mk of r.makes) {
      const maxDay = Math.min(week.days.length - 1, di + Math.max(1, Math.min(3, r.fridgeDays || 3)));
      let best = null;
      for (let j = di + 1; j <= maxDay; j++) {
        for (const slot of ['dinner', 'lunch']) {
          const dj = week.days[j];
          const cur = dj.meals[slot];
          if (!slotsForDay(dj).includes(slot) || (cur && (cur.locked || cur.kind !== 'cook'))) continue;
          for (const cand of ctx.recipes.filter(x => x.uses && x.uses.key === mk.key)) {
            const s = scoreRecipe(cand, slot === 'dinner' ? 'dinner' : 'lunch', j, ctx, plannedList(week).filter(p => !(p.di === j && p.slot === slot)), { relaxTime: true, reuse: true });
            if (!s) continue;
            const curR = cur && getRecipe(cur.recipeId);
            const curS = curR ? scoreRecipe(curR, slot, j, ctx, [], { relaxTime: true }) : null;
            const gain = s.score + 3 - (curS ? curS.score : 0);
            if (!best || gain > best.gain) best = { j, slot, s, gain };
          }
        }
      }
      if (best && best.gain > 0) {
        week.days[best.j].meals[best.slot] = newMeal(best.s.r, ctx.serves, { kind: 'reuse', from: { di, slot: 'dinner', key: mk.key }, reasons: [`Uses ${mk.label} from ${dayLabel(d)}`, ...best.s.reasons].slice(0, 3) });
        links++;
      }
    }
  });
}

// Recompute what each cooked meal has to make extra of, from the meals that depend on it.
export function relink(week) {
  week.days.forEach(d => Object.values(d.meals || {}).forEach(m => { if (m) { m.makes = []; m.extraServings = 0; } }));
  week.days.forEach((d, di) => {
    for (const [slot, m] of Object.entries(d.meals || {})) {
      if (!m || !m.from) continue;
      const srcDay = week.days[m.from.di];
      const src = srcDay && srcDay.meals[m.from.slot];
      const srcR = src && getRecipe(src.recipeId);
      const valid = src && srcR && (srcDay.mode === 'cook' || srcDay.mode === 'event');
      if (m.kind === 'reuse') {
        const mk = valid && (srcR.makes || []).find(x => x.key === m.from.key);
        if (!mk) { m.kind = 'cook'; delete m.from; m.reasons = (m.reasons || []).filter(x => !x.startsWith('Uses ')); continue; }
        const r = getRecipe(m.recipeId);
        const portions = (r && r.uses ? r.uses.portions : mk.portions) * (m.servings / (r ? r.serves : 4));
        src.makes.push({ key: mk.key, label: mk.label, scale: mk.scale, portions: portions * (srcR.serves / mk.portions) * (mk.portions / srcR.serves), forDay: di, forSlot: slot });
      } else if (m.kind === 'reheat' || m.kind === 'leftover') {
        if (!valid || src.recipeId !== m.recipeId) { m.kind = 'cook'; delete m.from; m.reasons = []; m.orphan = true; continue; }
        src.extraServings += m.servings;
      }
    }
  });
}

function fitBudget(week, ctx) {
  const limit = ctx.budget.groceries;
  if (!limit) return;
  for (let i = 0; i < 14; i++) {
    const total = buildList(week, { fromToday: true }).total;
    if (total <= limit) return;
    // The most expensive unlocked dinner that nothing depends on.
    let worst = null;
    const slotsToTry = i < 10 ? ['dinner'] : ['dinner', 'lunch', 'breakfast'];
    week.days.forEach((d, di) => {
      for (const slot of slotsToTry) {
        const m = d.meals[slot];
        if (!m || m.locked || m.kind !== 'cook' || (m.makes && m.makes.length) || m.extraServings) continue;
        if (d.date < iso(today())) continue;
        const r = getRecipe(m.recipeId);
        const c = costPerServe(r) || 0;
        if (!worst || c > worst.c) worst = { d, di, slot, c, r };
      }
    });
    if (!worst) { if (i < 10) { i = 9; continue; } return; }
    const others = plannedList(week).filter(p => !(p.di === worst.di && p.slot === worst.slot));
    let list = ranked(ctx, worst.slot, worst.di, others, { noJitter: true }).filter(x => x.cps != null && x.cps < worst.c * 0.8);
    // Keep a themed night (e.g. Indian night) on theme when saving money.
    if (worst.slot === 'dinner' && worst.d.cuisine && worst.r && worst.r.cuisine === worst.d.cuisine) list = onCuisine(list, worst.d);
    const fresh = list.filter(x => !others.some(p => p.recipeId === x.r.id));
    if (fresh.length) list = fresh;
    else list = list.filter(x => others.filter(p => p.recipeId === x.r.id).length < 2);
    if (!list.length) { worst.d.meals[worst.slot].budgetChecked = true; if (worst.slot === 'dinner' && i < 10) { i = 9; continue; } return; }
    const pick = list[0];
    worst.d.meals[worst.slot] = newMeal(pick.r, worst.d.meals[worst.slot].servings, { reasons: ['Cheaper choice for your budget', ...pick.reasons].slice(0, 3) });
    relink(week);
  }
}

// ---------- swaps ----------
export function alternatives(week, di, slot, limit = 8) {
  const ctx = buildContext(week);
  const day = week.days[di];
  const cur = day.meals[slot];
  const course = cur && cur.course ? cur.course : slot.replace(/\d+$/, '');
  const ev = day.mode === 'event' && day.event ? { theme: day.event.theme, themeText: day.event.name, ignoreTime: true } : {};
  const planned = plannedList(week).filter(p => !(p.di === di && p.slot === slot));
  let list = ranked(ctx, course, di, planned, { noJitter: true, ...ev });
  if (list.length < limit) {
    const relaxed = ranked(ctx, course, di, planned, { noJitter: true, relaxTime: true, ...ev }).filter(x => !list.some(y => y.r.id === x.r.id));
    relaxed.forEach(x => x.reasons.unshift('Takes longer than planned'));
    list = list.concat(relaxed);
  }
  list = list.filter(x => !cur || x.r.id !== cur.recipeId);
  // Reuse options: leftovers from an earlier day this week.
  const reuse = [];
  for (let j = Math.max(0, di - 3); j < di; j++) {
    const src = week.days[j].meals.dinner;
    const sr = src && getRecipe(src.recipeId);
    if (!sr || !sr.makes) continue;
    for (const mk of sr.makes) {
      for (const cand of ctx.recipes.filter(x => x.uses && x.uses.key === mk.key)) {
        if (!suits(cand).ok || (cur && cand.id === cur.recipeId)) continue;
        reuse.push({ r: cand, score: 99, reasons: [`Uses ${mk.label} from ${dayLabel(week.days[j])}`], cps: costPerServe(cand), reuseFrom: { di: j, slot: 'dinner', key: mk.key } });
      }
    }
  }
  return [...reuse, ...list].slice(0, limit);
}

export function swapMeal(week, di, slot, recipeId, opts = {}) {
  const day = week.days[di];
  const cur = day.meals[slot];
  const r = getRecipe(recipeId);
  const servings = cur ? cur.servings : householdServings();
  day.meals[slot] = newMeal(r, servings, { course: cur && cur.course, reasons: opts.reasons || [], ...(opts.reuseFrom ? { kind: 'reuse', from: opts.reuseFrom } : {}) });
  relink(week);
  week.updatedAt = Date.now();
}

// Re-plan just one slot (used after changing a single day's settings).
export function replanDay(week, di) {
  const ctx = buildContext(week);
  const day = week.days[di];
  for (const k of Object.keys(day.meals)) if (!day.meals[k].locked) delete day.meals[k];
  if (day.mode === 'event' && day.event) planEvent(week, di, ctx);
  for (const slot of slotsForDay(day)) {
    if (day.meals[slot]) continue;
    let list = ranked(ctx, slot, di, plannedList(week));
    if (!list.length) list = ranked(ctx, slot, di, plannedList(week), { relaxTime: true });
    const pick = pickWeighted(list);
    if (pick) day.meals[slot] = newMeal(pick.r, ctx.serves, { reasons: pick.reasons });
  }
  relink(week);
  week.updatedAt = Date.now();
}

export function weekCost(week) {
  let meals = 0;
  for (const d of week.days) for (const m of Object.values(d.meals || {})) {
    if (!m || m.kind === 'reheat' || m.kind === 'leftover') continue;
    const r = getRecipe(m.recipeId);
    const c = r ? costPerServe(r) : 0;
    meals += (c || 0) * ((m.servings || 0) + (m.extraServings || 0));
  }
  return meals;
}

export function weekNutrition(week, nutritionPerServe) {
  const tot = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, sodium: 0 };
  let n = 0;
  for (const d of week.days) for (const m of Object.values(d.meals || {})) {
    if (!m) continue;
    const r = getRecipe(m.recipeId);
    if (!r) continue;
    const per = nutritionPerServe(r);
    for (const k of Object.keys(tot)) tot[k] += per[k];
    n++;
  }
  return { tot, n };
}

export { flags };

export function fitToBudget(week) {
  const ctx = buildContext(week);
  const before = buildList(week, { fromToday: true }).total;
  fitBudget(week, ctx);
  relink(week);
  week.updatedAt = Date.now();
  return { before, after: buildList(week, { fromToday: true }).total };
}
