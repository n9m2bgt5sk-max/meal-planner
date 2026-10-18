// End-to-end test: every screen and dialog, on iPad and iPhone sizes, plus the main functions.
// Run: python3 -m http.server 8765 (in the app folder), then node tests/e2e.cjs
// Network calls (weather, online recipes, Firebase) are answered by fixtures so the test runs offline.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = process.env.BASE || 'http://localhost:8765/';
const OUT = process.env.OUT || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'iPad-landscape', width: 1180, height: 820 },
  { name: 'iPad-portrait', width: 820, height: 1180 },
  { name: 'iPad-mini-portrait', width: 744, height: 1133 },
  { name: 'iPad-Pro-landscape', width: 1366, height: 1024 },
  { name: 'iPhone-15', width: 393, height: 852 },
  { name: 'iPhone-SE', width: 375, height: 667 },
  { name: 'iPhone-Pro-Max', width: 430, height: 932 },
  { name: 'iPhone-landscape', width: 852, height: 393 },
];

const results = { checks: [], layout: [], errors: [] };
function check(name, ok, detail = '') {
  results.checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' – ' + detail : ''}`);
}

// ---------- fixtures ----------
function isoDay(offset) { const d = new Date(); d.setDate(d.getDate() + offset); const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); }
const forecast = { daily: { time: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [], weather_code: [] } };
for (let i = -1; i < 14; i++) { forecast.daily.time.push(isoDay(i)); forecast.daily.temperature_2m_max.push([31, 33, 18, 14, 22, 25, 29][(i + 7) % 7]); forecast.daily.temperature_2m_min.push(12); forecast.daily.precipitation_probability_max.push(i % 3 ? 10 : 80); forecast.daily.weather_code.push([0, 1, 3, 61, 2, 80, 0][(i + 7) % 7]); }
const geocode = { results: [{ name: 'Melbourne', latitude: -37.81, longitude: 144.96, admin1: 'Victoria', postcodes: ['3000'] }] };
const meal = (id, name, area, cat) => ({ idMeal: String(id), strMeal: name, strArea: area, strCategory: cat, strTags: 'Pasta,Baking', strInstructions: 'Preheat the oven to 180°C.\r\nBrown the beef mince with the onion.\r\nLayer with lasagne sheets and bake for 40 minutes.', strMealThumb: 'https://www.themealdb.com/images/media/meals/test.jpg', strSource: 'https://example.com/lasagne', strYoutube: '', strIngredient1: 'Minced Beef', strMeasure1: '500g', strIngredient2: 'Onion', strMeasure2: '1 chopped', strIngredient3: 'Lasagne Sheets', strMeasure3: '250g', strIngredient4: 'Passata', strMeasure4: '500ml', strIngredient5: 'Mozzarella', strMeasure5: '200g', strIngredient6: 'Nutmeg', strMeasure6: '1 pinch', strIngredient7: 'Peanuts', strMeasure7: '' });
const MEALS = [meal(52844, 'Lasagne', 'Italian', 'Pasta'), meal(52845, 'Beef Lasagne Roll', 'Italian', 'Beef'), meal(52846, 'Spicy Arrabiata Penne', 'Italian', 'Vegetarian')];
MEALS[2].strIngredient1 = 'penne rigate'; MEALS[2].strMeasure1 = '1 pound'; MEALS[2].strIngredient7 = ''; MEALS[0].strIngredient7 = '';

async function mockNetwork(ctx) {
  await ctx.route(/geocoding-api\.open-meteo\.com/, r => r.fulfill({ json: geocode }));
  await ctx.route(/api\.open-meteo\.com/, r => r.fulfill({ json: forecast }));
  await ctx.route(/themealdb\.com\/api/, r => {
    const u = r.request().url();
    if (/search\.php/.test(u)) return r.fulfill({ json: { meals: MEALS.slice(0, 2) } });
    if (/filter\.php/.test(u)) return r.fulfill({ json: { meals: MEALS.map(m => ({ idMeal: m.idMeal, strMeal: m.strMeal })) } });
    if (/lookup\.php/.test(u)) { const id = u.match(/i=(\d+)/)[1]; return r.fulfill({ json: { meals: [MEALS.find(m => m.idMeal === id) || MEALS[0]] } }); }
    if (/random\.php/.test(u)) return r.fulfill({ json: { meals: [MEALS[Math.floor(Math.random() * 3)]] } });
    return r.fulfill({ json: { meals: null } });
  });
  await ctx.route(/themealdb\.com\/images/, r => r.fulfill({ path: path.join(__dirname, '../icons/icon-192.png'), contentType: 'image/png' }));
  await ctx.route(/gstatic\.com/, r => r.abort());
}

// In-memory stand-in for Firebase, shared by every page in the test.
const cloud = { doc: null, pages: new Set() };
async function mockCloud(ctx) {
  await ctx.exposeBinding('__cloudGetNode', () => cloud.doc);
  await ctx.exposeBinding('__cloudPushNode', async (src, doc) => {
    cloud.doc = doc;
    for (const p of cloud.pages) if (p !== src.page && !p.isClosed()) p.evaluate(d => window.__cloudOnRemote && window.__cloudOnRemote(d), doc).catch(() => {});
  });
  await ctx.addInitScript(() => {
    window.__noSW = true;
    window.__mockCloud = async (cfg, onRemote) => {
      window.__cloudOnRemote = d => { if (d.by !== window.mp.state.deviceId) onRemote(JSON.parse(d.data)); };
      const initial = await window.__cloudGetNode();
      return {
        initial: initial ? JSON.parse(initial.data) : null,
        push: async p => window.__cloudPushNode({ data: JSON.stringify(p), by: window.mp.state.deviceId, updatedAt: Date.now() }),
        close: async () => {},
      };
    };
  });
}

async function newPage(browser, vp, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, hasTouch: true, isMobile: vp.width < 1000 || opts.mobile, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await mockNetwork(ctx);
  await mockCloud(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => results.errors.push(`[${vp.name}] ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) results.errors.push(`[${vp.name}] console: ${m.text()}`); });
  cloud.pages.add(page);
  return { ctx, page };
}

// ---------- layout audit ----------
async function audit(page, label) {
  await page.waitForTimeout(250);
  const problems = await page.evaluate(async label => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const out = [];
    const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    if (sw > vw + 1) out.push(`page scrolls sideways (${sw}px wide in a ${vw}px screen)`);
    const top = document.querySelector('.cookmode') || [...document.querySelectorAll('.sheet-wrap')].pop() || document;
    const sel = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, label.switch, label.tick, [role=button]';
    const els = [...top.querySelectorAll(sel)].filter(el => {
      if (el.tagName === 'INPUT' && (el.closest('.switch') || el.closest('.tick') || el.type === 'hidden')) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (el.closest('.hidden') || el.closest('details:not([open])') && el.tagName !== 'SUMMARY') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const name = el => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.placeholder || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40);
    for (const el of els) {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const r = el.getBoundingClientRect();
      const n = name(el);
      if (r.left < -1 || r.right > vw + 1) { out.push(`"${n}" is off the side of the screen (${Math.round(r.left)} to ${Math.round(r.right)} of ${vw})`); continue; }
      if (r.top < -1 || (r.bottom > vh + 1 && r.height < vh)) { out.push(`"${n}" can't be scrolled into view (top ${Math.round(r.top)}, bottom ${Math.round(r.bottom)} of ${vh})`); continue; }
      const pts = [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5]].map(([fx, fy]) => [r.left + r.width * fx, Math.min(vh - 1, Math.max(0, r.top + r.height * fy))]);
      const hits = pts.map(([x, y]) => document.elementFromPoint(x, y));
      const ok = hits.some(h => h && (h === el || el.contains(h) || (el.tagName === 'INPUT' && h.tagName === 'LABEL' && h.contains(el))));
      if (!ok) { const h = hits[0]; out.push(`"${n}" is covered by ${h ? (h.className && h.className.baseVal === undefined ? h.tagName.toLowerCase() + '.' + String(h.className).split(' ')[0] : h.tagName.toLowerCase()) : 'nothing'}`); continue; }
      const inline = el.tagName === 'A' && el.closest('p, li, .small, .tiny') && !el.classList.contains('btn');
      const minSide = Math.min(r.width, r.height);
      if (!inline && el.tagName !== 'SUMMARY' && minSide < 30) out.push(`"${n}" is small to tap (${Math.round(r.width)}×${Math.round(r.height)})`);
    }
    window.scrollTo(0, 0);
    return out.map(p => `${label}: ${p}`);
  }, label);
  for (const p of problems) { results.layout.push(p); console.log('  ⚠ ' + p); }
  return problems;
}

async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false }).catch(() => {}); }
async function closeTopSheet(page) {
  const btn = page.locator('.sheet-wrap').last().locator('.sheet-head [data-close]');
  if (await btn.count()) await btn.click();
  await page.waitForTimeout(150);
}
async function closeAllSheets(page) { for (let i = 0; i < 4 && await page.locator('.sheet-wrap').count(); i++) await closeTopSheet(page); }
async function go(page, hash) { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(300); }
const state = page => page.evaluate(() => JSON.parse(JSON.stringify(window.mp.state)));
const mod = (page, m, fn, arg) => page.evaluate(async ([m, fn, arg]) => { const x = await import(m); return (new Function('x', 'arg', 'return (' + fn + ')(x, arg)'))(x, arg); }, [m, fn.toString(), arg]);

// ---------- functional run (iPad landscape) ----------
async function functional(browser) {
  const vp = VIEWPORTS[0];
  const { ctx, page } = await newPage(browser, vp);
  await page.goto(BASE);
  await page.waitForTimeout(600);
  check('First open goes to the setup wizard', (await page.evaluate(() => location.hash)) === '#/setup');
  await audit(page, `${vp.name} setup welcome`);
  await page.click('[data-next]');
  // Household: 2 adults, children aged 6 and 3.
  await page.click('[data-add-kid]'); await page.click('[data-add-kid]');
  await page.locator('[data-stepper="kid-1"] [data-dec]').click(); await page.locator('[data-stepper="kid-1"] [data-dec]').click(); await page.locator('[data-stepper="kid-1"] [data-dec]').click();
  await audit(page, `${vp.name} setup household`);
  let s = await state(page);
  check('Household: 2 adults, kids aged 6 and 3', s.setup.adults === 2 && s.setup.children.length === 2 && s.setup.children[1].age === 3, JSON.stringify(s.setup.children));
  await page.click('[data-next]');
  await page.click('[data-group=allergies] [data-val=peanut]');
  await page.fill('[name=avoid]', 'olives, mushrooms'); await page.locator('[name=avoid]').dispatchEvent('change');
  await audit(page, `${vp.name} setup diet`);
  await page.click('[data-next]');
  await page.fill('[name=postcode]', '3000'); await page.locator('[name=postcode]').dispatchEvent('change');
  await page.waitForTimeout(400);
  await audit(page, `${vp.name} setup location`);
  await page.click('[data-next]');
  await page.click('[data-group=equipment] [data-val=air-fryer]');
  await page.locator('label.switch:has([name=meal-lunch])').click();
  await audit(page, `${vp.name} setup kitchen`);
  await page.click('[data-next]');
  await page.fill('[name=weekly]', '320'); await page.locator('[name=weekly]').dispatchEvent('change');
  await audit(page, `${vp.name} setup budget`);
  await page.click('[data-next]');
  await page.click('[data-group=likedCuisines] [data-val=Italian]');
  await page.click('[data-group=likedCuisines] [data-val=Mexican]');
  await audit(page, `${vp.name} setup tastes`);
  await page.click('[data-next]');
  await page.waitForTimeout(800);
  s = await state(page);
  check('Setup saved (peanut allergy, postcode, budget, lunches, air fryer)', s.setup.done && s.setup.allergies.includes('peanut') && s.setup.postcode === '3000' && s.budget.weekly === 320 && s.setup.meals.lunch && s.setup.equipment.includes('air-fryer'));
  check('Postcode found the state (VIC) and weather loaded', s.setup.state === 'VIC' && s.weather.days.length > 7, `${s.weather.place}, ${s.weather.days.length} days`);
  check('Week set-up opens automatically after setup', await page.locator('.sheet-wrap').count() === 1);
  await audit(page, `${vp.name} week setup`);
  await shot(page, 'week-setup');

  // Week setup: Monday quick & easy, Wednesday takeaway, Thursday event, Saturday cooking project.
  const days = await page.evaluate(() => { const k = Object.keys(window.mp.state.weeks).sort().pop(); return window.mp.state.weeks[k].days.map(d => d.date); });
  await page.click('[data-group=wc] [data-val=Italian]');
  await page.click('[data-style] [data-val=mix]');
  await page.selectOption('[name=time-0]', '20');
  await page.selectOption('[name=effort-0]', 'easy');
  await page.selectOption('[name=mode-2]', 'takeaway');
  await page.selectOption('[name=mode-3]', 'event');
  await page.waitForTimeout(300);
  check('Choosing "Special occasion" opens the event details', await page.locator('.sheet-wrap').count() === 2);
  await page.fill('.sheet-wrap >> nth=1 >> [name=name]', 'Taco night with the Smiths');
  await page.click('.sheet-wrap >> nth=1 >> [data-theme] [data-val=mexican-fiesta]');
  await page.click('.sheet-wrap >> nth=1 >> [data-style] [data-val=party]');
  for (let i = 0; i < 2; i++) await page.click('.sheet-wrap >> nth=1 >> [data-stepper=guests] [data-inc]');
  await audit(page, `${vp.name} event sheet`);
  await shot(page, 'event');
  await page.click('.sheet-wrap >> nth=1 >> [data-save]');
  await page.waitForTimeout(300);
  await page.selectOption('[name=time-5]', '120');
  await page.selectOption('[name=effort-5]', 'project');
  await page.selectOption('[name=cuisine-1]', 'Indian');
  await page.click('[data-plan]');
  await page.waitForTimeout(2500);
  await shot(page, 'plan');
  s = await state(page);
  const wk = s.weeks[Object.keys(s.weeks).sort().pop()];
  const today = isoDay(0);
  const getR = id => mod(page, '/js/recipes.js', (x, id) => { const r = x.getRecipe(id); return r && { name: r.name, time: x.totalTime(r), active: x.activeTime(r), cuisine: r.cuisine, flags: x.flags(r), tags: r.tags, meal: r.meal, effort: r.effort }; }, id);
  const future = wk.days.filter(d => d.date >= today);
  let allDinners = true, peanutFree = true;
  for (const d of future) {
    if (d.mode === 'cook' && !d.meals.dinner) allDinners = false;
    for (const m of Object.values(d.meals)) { const r = await getR(m.recipeId); if (r.flags.allergens.includes('peanut')) peanutFree = false; }
  }
  check('Every cook night from today has a dinner', allDinners);
  check('No meal contains peanut (allergy respected)', peanutFree);
  if (wk.days[0].date >= today) {
    const r = await getR(wk.days[0].meals.dinner.recipeId);
    check('Monday (20 min, easy) gets a quick easy dinner or a reheat', wk.days[0].meals.dinner.kind === 'reheat' || (r.time <= 20 || r.active <= 20) && r.effort <= 2, `${r.name} ${r.time} min`);
  }
  check('Wednesday takeaway has no dinner to cook', !wk.days[2].meals.dinner);
  const ev = wk.days[3];
  const evMeals = await Promise.all(Object.values(ev.meals).filter(m => m.course).map(m => getR(m.recipeId)));
  check('Thursday event has a themed party menu (nibbles, main, dessert)', ev.mode === 'event' && evMeals.length >= 3 && Object.keys(ev.meals).some(k => k.startsWith('nibbles')), evMeals.map(r => r.name).join(', '));
  check('Event menu scaled for guests', Object.values(ev.meals).filter(m => m.course).every(m => m.servings >= 5), Object.values(ev.meals).map(m => m.servings).join(','));
  check('Event menu leans to the Mexican theme', evMeals.filter(r => r.cuisine === 'Mexican' || (r.tags || []).includes('mexican-fiesta')).length >= 1);
  const tueDinner = wk.days[1].meals.dinner && await getR(wk.days[1].meals.dinner.recipeId);
  check('Tuesday (Indian night) gets an Indian dinner or a planned reheat/reuse', !tueDinner || tueDinner.cuisine === 'Indian' || wk.days[1].meals.dinner.kind !== 'cook', tueDinner && tueDinner.name);
  const kinds = wk.days.flatMap(d => Object.values(d.meals).map(m => m.kind));
  check('Plan uses batch cooking or leftovers (cook once, eat twice)', kinds.some(k => k === 'reheat' || k === 'reuse' || k === 'leftover'), kinds.join(','));
  check('Lunches planned too', future.filter(d => d.meals.lunch).length >= future.length - 1);
  check('Weather shown on day cards', await page.locator('.day .wx').count() >= 5);
  await audit(page, `${vp.name} plan`);

  // Swap.
  const di = wk.days.findIndex(d => d.date >= today && d.mode === 'cook' && d.meals.dinner && d.meals.dinner.kind === 'cook');
  const before = wk.days[di].meals.dinner.recipeId;
  await page.click(`[data-swap="${di}|dinner"]`);
  await page.waitForTimeout(300);
  check('Swap shows at least 5 alternatives with reasons', await page.locator('.sheet-wrap .alt').count() >= 5 && await page.locator('.sheet-wrap .alt .pill').count() > 0);
  await audit(page, `${vp.name} swap sheet`);
  await shot(page, 'swap');
  await page.fill('.sheet-wrap [name=q]', 'lasagne');
  await page.waitForTimeout(900);
  check('Swap search finds cookbook and online recipes', await page.locator('#results .alt').count() >= 1 && await page.locator('#online .alt').count() >= 1);
  await page.locator('.sheet-wrap [data-pick^="alt|"]').first().click();
  await page.waitForTimeout(300);
  s = await state(page);
  const after = s.weeks[wk.key].days[di].meals.dinner.recipeId;
  check('Choosing an alternative swaps the meal', after !== before, `${before} → ${after}`);

  // Lock + re-plan keeps the locked meal.
  await page.click(`[data-lock="${di}|dinner"]`);
  await page.click('[data-generate]');
  await page.waitForTimeout(300);
  await page.click('.sheet-wrap [data-ok]');
  await page.waitForTimeout(2500);
  s = await state(page);
  check('Locked meal survives a re-plan', s.weeks[wk.key].days[di].meals.dinner.recipeId === after && s.weeks[wk.key].days[di].meals.dinner.locked);

  // Day sheet + replan day.
  await page.click(`[data-day="${di}"]`);
  await audit(page, `${vp.name} day sheet`);
  await page.click('.sheet-wrap [data-time] [data-val="30"]');
  await page.click('.sheet-wrap [data-replan]');
  await page.waitForTimeout(400);
  s = await state(page);
  check('Day settings saved (30 min)', s.weeks[wk.key].days[di].time === 30);

  // Budget sheet.
  await page.click('[data-budget]');
  await audit(page, `${vp.name} budget sheet`);
  const budgetText = await page.textContent('.sheet-wrap');
  check('Budget shows takeaway taken off and what is left for groceries', /Takeaway \(\d nights?\)/.test(budgetText) && /Left for groceries/.test(budgetText));
  await closeAllSheets(page);

  // Recipe page from the plan: servings slider and units.
  const mealLink = page.locator(`.day >> nth=${di} >> a.title[href*="slot=dinner"]`).first();
  await mealLink.click();
  await page.waitForTimeout(400);
  check('Recipe page shows ingredients, method, nutrition', await page.locator('.ing-list li').count() > 2 && await page.locator('.steps li').count() >= 2 && /kcal/.test(await page.textContent('.nutri')));
  await audit(page, `${vp.name} recipe (cookbook page)`);
  await shot(page, 'recipe');
  const q1 = await page.locator('.ing-list .q').first().textContent();
  await page.locator('[name=servings]').fill('8');
  await page.locator('[name=servings]').dispatchEvent('change');
  await page.waitForTimeout(300);
  const q2 = await page.locator('.ing-list .q').first().textContent();
  s = await state(page);
  check('Servings slider rescales the recipe and updates the planned meal', q1 !== q2 && s.weeks[wk.key].days[di].meals.dinner.servings === 8, `${q1} → ${q2}`);
  await page.click('[data-units] [data-val=imperial]');
  await page.waitForTimeout(200);
  const imp = await page.textContent('.cookbook');
  check('Imperial switch shows oz/lb/cups/°F', /oz|lb|cup|°F|US tbsp/.test(imp));
  await page.click('[data-units] [data-val=metric]');
  await page.click('[data-star="5"]');
  s = await state(page);
  check('Rating a recipe is saved', s.ratings[after] && s.ratings[after].stars === 5);
  await page.click('[data-cook]');
  await page.waitForTimeout(200);
  await audit(page, `${vp.name} cook mode`);
  await shot(page, 'cookmode');
  const timerBtn = page.locator('.cookmode [data-timer]');
  if (await timerBtn.count()) { await timerBtn.first().click(); check('Cook mode timer starts', await page.locator('.cookmode .timer').count() === 1); }
  while (await page.locator('.cookmode [data-next]').count()) await page.click('.cookmode [data-next]');
  await page.click('.cookmode [data-x] >> nth=-1');
  check('Cook mode steps through to the end and closes', await page.locator('.cookmode').count() === 0);

  // Cookbook.
  await go(page, '#/cookbook');
  const allCount = await page.locator('.rcard').count();
  check('Cookbook lists recipes (allergy-safe filter on)', allCount > 60, `${allCount} recipes`);
  await audit(page, `${vp.name} cookbook`);
  await shot(page, 'cookbook');
  await page.click('[data-toggle=veg]');
  await page.waitForTimeout(200);
  const vegCount = await page.locator('.rcard').count();
  check('Vegetarian filter narrows the list', vegCount > 5 && vegCount < allCount, `${vegCount}`);
  await page.click('[data-toggle=veg]');
  await page.fill('[name=oq]', 'lasagne');
  await page.click('[data-osearch]');
  await page.waitForTimeout(800);
  check('Online search shows results', await page.locator('#online-results .rcard').count() >= 1);
  await audit(page, `${vp.name} cookbook online`);
  await page.locator('#online-results .rcard').first().click();
  await page.waitForTimeout(500);
  const onlineText = await page.textContent('.cookbook');
  check('Online recipe opens as a cookbook page with an estimate note', /Online recipe/.test(onlineText) && /Lasagne/.test(onlineText));
  await page.click('[data-save-online]');
  s = await state(page);
  check('Online recipe saved to my cookbook', s.savedOnline.some(r => r.id === 'mdb-52844'));
  await page.click('[data-add]');
  await audit(page, `${vp.name} add-to-plan sheet`);
  await closeAllSheets(page);

  // Own recipe.
  await go(page, '#/cookbook');
  await page.click('[data-new]');
  await audit(page, `${vp.name} new recipe sheet`);
  await page.fill('.sheet-wrap [name=name]', "Nan's chicken soup");
  await page.fill('.sheet-wrap [name=in-0]', 'Chicken thigh fillets');
  await page.fill('.sheet-wrap [name=iq-0]', '500');
  await page.selectOption('.sheet-wrap [name=iu-0]', 'g');
  await page.click('.sheet-wrap [data-addrow]');
  await page.fill('.sheet-wrap [name=in-1]', 'Carrots');
  await page.fill('.sheet-wrap [name=iq-1]', '2');
  await page.click('.sheet-wrap [data-addrow]');
  await page.fill('.sheet-wrap [name=in-2]', 'secret family spice');
  await page.fill('.sheet-wrap [name=steps]', 'Simmer everything for 40 minutes.\nServe hot.');
  await page.click('.sheet-wrap [data-save]');
  await page.waitForTimeout(400);
  s = await state(page);
  const mine = s.customRecipes[0];
  check('Own recipe saved with matched and free-text ingredients', mine && mine.ingredients.some(l => l.id === 'chicken-thigh') && mine.ingredients.some(l => l.text && /secret/.test(l.text)), mine && JSON.stringify(mine.ingredients));
  check('Own recipe page has a cost', /\$\d/.test(await page.textContent('.cookbook .facts')));

  // Shopping list.
  await go(page, '#/plan');
  await go(page, '#/shop');
  await page.waitForTimeout(300);
  const items = await page.locator('.list .item input[type=checkbox]').count();
  check('Shopping list built from the plan', items > 10, `${items} items`);
  await audit(page, `${vp.name} shopping list`);
  await shot(page, 'shopping');
  check('Staples shown separately as "check you have"', /Check you have/.test(await page.textContent('#main')));
  await page.locator('.list .item input[type=checkbox]').first().check();
  await page.waitForTimeout(200);
  check('Ticking an item marks it', await page.locator('.list .item.checked').count() === 1);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-word]')]);
  const docPath = path.join(OUT, 'shopping.docx');
  await dl.saveAs(docPath);
  let docOk = false;
  try { const xml = execSync(`unzip -p "${docPath}" word/document.xml`).toString(); docOk = /Shopping list/.test(xml) && /<w:t/.test(xml); } catch (e) {}
  check('Word document downloads and is a valid .docx', docOk);
  try { execSync(`python3 -c "import zipfile,sys; z=zipfile.ZipFile('${docPath}'); assert z.testzip() is None"`); check('Word document zip passes integrity check', true); } catch (e) { check('Word document zip passes integrity check', false); }
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('[data-txt]')]);
  const txt = fs.readFileSync(await dl2.path(), 'utf8');
  check('Text file export has aisles and a total', /Estimated total/.test(txt) && /☐/.test(txt));
  await page.click('[data-copy]');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('Copy for Reminders: one item per line, ticked items left out', clip.split('\n').length >= items - 3 && !/Fruit & Veg/.test(clip), `${clip.split('\n').length} lines`);
  await page.click('[data-reminders]');
  await page.waitForTimeout(200);
  check('Send to Reminders falls back to copy when no share sheet', /Copied|copied/.test(await page.textContent('.toast')));
  await page.locator('[data-edit]').first().click();
  await audit(page, `${vp.name} shopping item sheet`);
  await page.locator('.sheet-wrap [data-stepper=packs] [data-inc]').click();
  await closeAllSheets(page);
  await page.click('[data-additem]');
  await audit(page, `${vp.name} add item sheet`);
  await page.fill('.sheet-wrap [name=name]', 'Dishwashing liquid');
  await page.fill('.sheet-wrap [name=cost]', '4.5');
  await page.click('.sheet-wrap [data-save]');
  check('Extra item added to the list', /Dishwashing liquid/.test(await page.textContent('.list')));

  // Prices: manual edit and photo scan.
  await go(page, '#/prices');
  await audit(page, `${vp.name} prices`);
  await page.fill('[name=pq]', 'mince');
  await page.waitForTimeout(600);
  await page.click('[data-price=beef-mince]');
  await audit(page, `${vp.name} price sheet`);
  await page.fill('.sheet-wrap [name=price]', '12');
  await page.click('.sheet-wrap [data-save]');
  s = await state(page);
  check('Manual price saved for the main shop', s.prices['beef-mince'] && s.prices['beef-mince'].coles.packPrice === 12);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-pick]')]);
  await chooser.setFiles(path.join(__dirname, 'fixtures/receipt.png'));
  await page.waitForSelector('.sheet-wrap [data-save]', { timeout: 90000 }).catch(() => {});
  const rowsFound = await page.locator('.sheet-wrap [data-row]').count();
  check('Photo of a receipt is read on the device', rowsFound >= 3, `${rowsFound} lines found`);
  await audit(page, `${vp.name} scan review`);
  await shot(page, 'scan');
  if (rowsFound) {
    const matched = await page.$$eval('.sheet-wrap select[name^=ing-]', els => els.map(e => e.value));
    check('Receipt lines matched to ingredients (mince, chicken, milk, spaghetti)', ['beef-mince', 'chicken-breast', 'milk', 'spaghetti'].every(i => matched.includes(i)), matched.join(','));
    await page.click('.sheet-wrap [data-save]');
    s = await state(page);
    check('Scanned prices saved', s.prices.milk && s.prices.milk.coles && s.prices.milk.coles.packPrice === 3.3 && s.prices.milk.coles.source === 'photo', JSON.stringify(s.prices.milk));
  }
  const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-pick]')]);
  await chooser2.setFiles(path.join(__dirname, 'fixtures/shelf.png'));
  await page.waitForSelector('.sheet-wrap [data-save], .sheet-wrap .center p', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(500);
  const shelfSel = await page.$$eval('.sheet-wrap select[name^=ing-]', els => els.map(e => e.value));
  const shelfPrice = await page.$$eval('.sheet-wrap input[name^=price-]', els => els.map(e => e.value));
  check('Shelf label photo read (tasty cheese $9.00)', shelfSel.includes('cheddar') && shelfPrice.includes('9'), `${shelfSel} ${shelfPrice}`);
  await closeAllSheets(page);

  // Pantry.
  const totalBefore = await mod(page, '/js/shopping.js', (x) => { const st = window.mp.state; const k = Object.keys(st.weeks).sort().pop(); return x.buildList(st.weeks[k]).total; });
  await go(page, '#/pantry');
  await audit(page, `${vp.name} pantry (empty)`);
  await page.click('[data-add]');
  await audit(page, `${vp.name} pantry add sheet`);
  await page.fill('.sheet-wrap [name=name]', 'Baby spinach');
  await page.locator('.sheet-wrap [name=name]').dispatchEvent('change');
  await page.fill('.sheet-wrap [name=expiry]', isoDay(1));
  await page.click('.sheet-wrap [data-save]');
  await page.click('[data-add]');
  await page.fill('.sheet-wrap [name=name]', 'Rice');
  await page.locator('.sheet-wrap [name=name]').dispatchEvent('change');
  await page.fill('.sheet-wrap [name=qty]', '2000');
  await page.click('.sheet-wrap [data-save]');
  s = await state(page);
  check('Pantry items saved and matched', s.pantry.length === 2 && s.pantry.some(p => p.ingId === 'baby-spinach' && p.location === 'fridge') && s.pantry.some(p => p.ingId === 'rice'));
  check('Expiring item flagged to use up', await page.locator('[data-useup]').count() === 1);
  await audit(page, `${vp.name} pantry`);
  await page.click('[data-useup]');
  check('Use-it-up suggests recipes', await page.locator('.sheet-wrap .alt').count() >= 1);
  await closeAllSheets(page);
  const totalAfter = await mod(page, '/js/shopping.js', (x) => { const st = window.mp.state; const k = Object.keys(st.weeks).sort().pop(); return x.buildList(st.weeks[k]).total; });
  check('Pantry items come off the shopping list', totalAfter <= totalBefore, `${totalBefore.toFixed(2)} → ${totalAfter.toFixed(2)}`);
  const [rc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-receipt]')]);
  await rc.setFiles(path.join(__dirname, 'fixtures/receipt.png'));
  await page.waitForSelector('.sheet-wrap [data-save]', { timeout: 60000 }).catch(() => {});
  await audit(page, `${vp.name} pantry receipt sheet`);
  await page.click('.sheet-wrap [data-save]').catch(() => {});
  s = await state(page);
  check('Receipt adds items to the pantry', s.pantry.length >= 5, `${s.pantry.length} items`);

  // Done shopping → pantry.
  await go(page, '#/shop');
  await page.click('[data-done]');
  await page.click('.sheet-wrap [data-ok]');
  s = await state(page);
  check('Done shopping moves the purchases into the pantry', s.pantry.length > 15, `${s.pantry.length} items`);
  await go(page, '#/shop');
  const left = await mod(page, '/js/shopping.js', (x) => { const st = window.mp.state; const k = Object.keys(st.weeks).sort().pop(); return x.buildList(st.weeks[k]).items.filter(i => !i.inPantry && !i.extra && !i.removed).map(i => `${i.id} need ${Math.round(i.need)} have ${Math.round(i.have)} pack ${i.packSize}`); });
  check('After shopping, nothing left to buy for the plan', left.length === 0, left.join('; ') || '0 left');

  // Mark cooked (today's meal) and history.
  await go(page, '#/plan');
  const ck = page.locator('[data-cooked]');
  if (await ck.count()) {
    await ck.first().click();
    s = await state(page);
    check('Mark cooked works and offers rating', await page.locator('.meal [data-rate]').count() >= 5);
  }
  // Seed a past week to check history & calendar.
  await page.evaluate(async () => {
    const st = await import('/js/store.js');
    const key = st.weekKeyFor(st.addDays(st.today(), -14));
    const w = st.getWeek(key);
    w.days.forEach((d, i) => { d.meals.dinner = { recipeId: i % 2 ? 'spaghetti-bolognese' : 'butter-chicken', servings: 3, kind: 'cook', makes: [], extraServings: 0 }; });
    w.days[4].mode = 'takeaway';
    st.save(true);
  });
  await page.reload();
  await page.waitForTimeout(600);
  await go(page, '#/history');
  s = await state(page);
  check('Past plans recorded in history', s.history.filter(h => h.recipeId).length >= 6 && s.history.some(h => h.mode === 'takeaway'));
  check('History shows most-made counts', /×[34]/.test(await page.textContent('#main')));
  await page.click('[data-month="-1"]');
  await page.click('[data-month="1"]');
  await audit(page, `${vp.name} history`);
  await shot(page, 'history');
  const cell = page.locator(`[data-date="${isoDay(-14)}"]`);
  if (await cell.count()) { await cell.click(); await audit(page, `${vp.name} history day`); await closeAllSheets(page); }

  // Repeat-avoidance & rating effect: a recipe rated 1 star never comes back.
  await page.evaluate(() => { window.mp.state.ratings['spaghetti-bolognese'] = { stars: 1, again: false, updated: Date.now() }; });
  const banned = await mod(page, '/js/planner.js', (x) => { const st = window.mp.state; const k = Object.keys(st.weeks).sort().pop(); let hit = 0; for (let i = 0; i < 5; i++) { x.generateWeek(st.weeks[k]); for (const d of st.weeks[k].days) for (const m of Object.values(d.meals)) if (m.recipeId === 'spaghetti-bolognese') hit++; } return hit; });
  check('A recipe rated 1 star / "don\'t suggest" is never planned', banned === 0);

  // Budget: tight budget then "swap in cheaper".
  await page.evaluate(() => { window.mp.state.pantry = []; });
  await go(page, '#/budget');
  await audit(page, `${vp.name} budget page`);
  await page.fill('#sec-budget [name=weekly]', '150'); await page.locator('#sec-budget [name=weekly]').dispatchEvent('change');
  await page.fill('#sec-budget [name=drinks]', '40'); await page.locator('#sec-budget [name=drinks]').dispatchEvent('change');
  s = await state(page);
  check('Budget extras saved (alcohol & drinks)', s.budget.weekly === 150 && s.budget.extras.drinks === 40);
  await go(page, '#/plan');
  const overTxt = await page.textContent('[data-budget]');
  check('Plan budget card reflects the new budget', /Budget \$150/.test(overTxt), overTxt.replace(/\s+/g, ' ').slice(0, 90));
  if (/over/.test(overTxt)) {
    await page.click('[data-budget]');
    const fit = page.locator('.sheet-wrap [data-fit]');
    if (await fit.count()) { await fit.click(); await page.waitForTimeout(500); check('“Swap in cheaper meals” lowers the shopping cost', /Saved|No cheaper/.test(await page.textContent('.toast'))); }
  }

  // More pages.
  for (const [hash, label] of [['#/more', 'more'], ['#/settings', 'settings'], ['#/backup', 'backup'], ['#/sync', 'sync (off)'], ['#/help', 'help']]) {
    await go(page, hash);
    if (hash === '#/help') await page.$$eval('details', ds => ds.forEach(d => { d.open = true; }));
    await audit(page, `${vp.name} ${label}`);
  }
  // Theme and text size.
  await go(page, '#/settings');
  await page.click('[data-group=theme] [data-val=night]');
  check('Theme change applies', await page.evaluate(() => document.documentElement.dataset.theme) === 'night');
  await go(page, '#/plan'); await shot(page, 'plan-night');
  await go(page, '#/recipe/butter-chicken'); await shot(page, 'recipe-night');
  await go(page, '#/settings');
  await page.click('[data-group=theme] [data-val=garden]');
  await page.click('[data-seg=textSize] [data-val=large]');
  check('Large text applies', await page.evaluate(() => document.documentElement.dataset.text) === 'large');
  await page.click('[data-seg=textSize] [data-val=normal]');
  await page.click('[data-group=theme] [data-val=farmhouse]');

  // Backup and restore into a fresh device.
  await go(page, '#/backup');
  const [bk] = await Promise.all([page.waitForEvent('download'), page.click('[data-export]')]);
  const backupPath = path.join(OUT, 'backup.json');
  await bk.saveAs(backupPath);
  const b2 = await newPage(browser, VIEWPORTS[4]);
  await b2.page.goto(BASE + '#/backup');
  await b2.page.waitForTimeout(400);
  const [bc] = await Promise.all([b2.page.waitForEvent('filechooser'), b2.page.click('[data-import]')]);
  await bc.setFiles(backupPath);
  await b2.page.waitForTimeout(300);
  await audit(b2.page, 'iPhone restore sheet');
  await b2.page.click('.sheet-wrap [data-replace]');
  await b2.page.waitForTimeout(400);
  const s2 = await state(b2.page);
  check('Backup restores on another device (plans, ratings, prices, recipes)', s2.setup.done && Object.keys(s2.weeks).length >= 2 && s2.ratings['spaghetti-bolognese'] && s2.customRecipes.length === 1 && s2.prices.milk, JSON.stringify({ done: s2.setup.done, weeks: Object.keys(s2.weeks).length, ratings: Object.keys(s2.ratings), custom: s2.customRecipes.length, milk: !!s2.prices.milk }));
  await b2.ctx.close();

  // Sync between iPad and a partner's iPhone.
  await go(page, '#/sync');
  await page.fill('[name=cfg]', 'const firebaseConfig = {\n  apiKey: "AIzaSyTEST",\n  authDomain: "our-meals.firebaseapp.com",\n  projectId: "our-meals",\n  storageBucket: "our-meals.appspot.com",\n  appId: "1:123:web:abc"\n};');
  await page.click('[data-connect]');
  await page.waitForTimeout(800);
  check('Sync connects with pasted Firebase settings', /Up to date/.test(await page.textContent('#main')));
  await audit(page, `${vp.name} sync (on)`);
  await shot(page, 'sync');
  check('Household data uploaded to the cloud', !!cloud.doc && JSON.parse(cloud.doc.data).setup.postcode === '3000');
  const link = await page.evaluate(async () => (await import('/js/cloud.js')).joinLink());
  const partner = await newPage(browser, VIEWPORTS[5]);
  await partner.page.goto(link.replace(/^https?:\/\/[^/]+\//, BASE));
  await partner.page.waitForTimeout(500);
  await audit(partner.page, 'iPhone-SE join');
  await shot(partner.page, 'join');
  await partner.page.click('[data-join]');
  await partner.page.waitForTimeout(1000);
  let ps = await state(partner.page);
  check('Partner joins with the link and gets the household plan', ps.setup.done && ps.setup.postcode === '3000' && Object.keys(ps.weeks).length >= 2 && (await partner.page.evaluate(() => location.hash)).startsWith('#/plan'));
  // Partner ticks a shopping item; the iPad sees it.
  await go(partner.page, '#/shop');
  await partner.page.click('[data-additem]');
  await partner.page.fill('.sheet-wrap [name=name]', 'Birthday candles');
  await partner.page.click('.sheet-wrap [data-save]');
  await partner.page.waitForTimeout(2500);
  s = await state(page);
  check('Partner\'s change arrives on the iPad', JSON.stringify(s.shopping).includes('Birthday candles'));
  // iPad changes a rating; partner sees it.
  await page.evaluate(() => { window.mp.state.ratings['butter-chicken'] = { stars: 4, again: true, updated: Date.now() }; window.mp.render(); });
  await page.evaluate(async () => { const st = await import('/js/store.js'); st.save(); });
  await page.waitForTimeout(2500);
  ps = await state(partner.page);
  check('iPad change arrives on the partner\'s phone', ps.ratings['butter-chicken'] && ps.ratings['butter-chicken'].stars === 4);
  check('Theme stays per device when syncing', ps.setup.theme === 'farmhouse');
  await partner.ctx.close();

  await page.evaluate(async () => (await import('/js/cloud.js')).disconnect(true));
  const seed = await page.evaluate(() => localStorage.getItem('mealplanner.v1'));
  fs.writeFileSync(path.join(OUT, 'seed.json'), seed);
  await ctx.close();
  return seed;
}

// ---------- layout sweep on every size ----------
async function sweep(browser, vp, seed, opts = {}) {
  const { ctx, page } = await newPage(browser, vp);
  page.setDefaultTimeout(8000);
  // Seed the saved data before the app's own scripts run, so nothing it saves on start can overwrite it.
  await page.addInitScript(([seed, large]) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); const s = JSON.parse(seed); s.setup.textSize = large ? 'large' : 'normal'; localStorage.setItem('mealplanner.v1', JSON.stringify(s)); }, [seed, !!opts.large]);
  await page.goto(BASE + '#/plan');
  await page.waitForTimeout(800);
  const L = vp.name + (opts.large ? ' (large text)' : '');
  const steps = [
    ['plan', async () => {}],
    ['week setup', async () => { await page.click('[data-week-setup]'); }],
    ['day sheet', async () => { await closeAllSheets(page); await page.locator('[data-day]').first().click(); }],
    ['event sheet', async () => { await closeAllSheets(page); const ev = page.locator('[data-day]', { hasText: 'Taco' }); if (await ev.count()) { await ev.first().click(); await page.click('.sheet-wrap [data-ev]'); } }],
    ['swap sheet', async () => { await closeAllSheets(page); await page.locator('[data-swap]').first().click(); }],
    ['budget sheet', async () => { await closeAllSheets(page); await page.click('[data-budget]'); }],
    ['recipe', async () => { await closeAllSheets(page); await page.locator('.day a.title').first().click(); }],
    ['cook mode', async () => { await page.click('[data-cook]'); }],
    ['recipe (cookbook)', async () => { await page.click('.cookmode [data-x]'); await go(page, '#/recipe/spaghetti-bolognese'); }],
    ['add to plan sheet', async () => { await page.click('[data-add]'); }],
    ['cookbook', async () => { await closeAllSheets(page); await go(page, '#/cookbook'); }],
    ['new recipe sheet', async () => { await page.click('[data-new]'); }],
    ['shopping', async () => { await closeAllSheets(page); await go(page, '#/shop'); }],
    ['shopping item sheet', async () => { const e = page.locator('[data-edit]'); if (await e.count()) await e.first().click(); }],
    ['add item sheet', async () => { await closeAllSheets(page); await page.click('[data-additem]'); }],
    ['prices', async () => { await closeAllSheets(page); await go(page, '#/prices'); }],
    ['price sheet', async () => { await page.locator('[data-price]').first().click(); }],
    ['pantry', async () => { await closeAllSheets(page); await go(page, '#/pantry'); }],
    ['pantry add sheet', async () => { await page.click('[data-add]'); }],
    ['more', async () => { await closeAllSheets(page); await go(page, '#/more'); }],
    ['budget page', async () => { await go(page, '#/budget'); }],
    ['history', async () => { await go(page, '#/history'); }],
    ['history day', async () => { await page.locator('.cal .cell').nth(10).click(); }],
    ['settings', async () => { await closeAllSheets(page); await go(page, '#/settings'); }],
    ['backup', async () => { await go(page, '#/backup'); }],
    ['sync', async () => { await go(page, '#/sync'); }],
    ['help', async () => { await go(page, '#/help'); await page.$$eval('details', ds => ds.forEach(d => { d.open = true; })); }],
    ['join', async () => { await go(page, '#/join?c=' + encodeURIComponent(Buffer.from(JSON.stringify({ f: { apiKey: 'x', projectId: 'y', appId: 'z' }, h: 'abcdefghijklmnopqrstuv' })).toString('base64'))); }],
    ['setup step 1', async () => { await page.evaluate(async () => (await import('/js/views/setup.js')).resetWizard(1)); await go(page, '#/setup'); }],
  ];
  for (let i = 2; i <= 6; i++) steps.push([`setup step ${i}`, async () => { await page.click('[data-next]'); }]);
  for (const [name, fn] of steps) {
    try { await fn(); await page.waitForTimeout(200); await audit(page, `${L} ${name}`); }
    catch (e) { results.layout.push(`${L} ${name}: could not open (${e.message.split('\n')[0]})`); console.log(`  ⚠ ${L} ${name}: ${e.message.split('\n')[0]}`); }
    if (['plan', 'recipe', 'shopping', 'cookbook', 'swap sheet', 'week setup'].includes(name)) await shot(page, `${vp.name}${opts.large ? '-large' : ''}-${name.replace(/\s+/g, '-')}`);
  }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();
  let seed;
  try { if (!process.env.ONLY_SWEEP) seed = await functional(browser); }
  catch (e) { results.errors.push('functional run stopped: ' + e.stack); console.log(e); }
  if (!seed && fs.existsSync(path.join(OUT, 'seed.json'))) seed = fs.readFileSync(path.join(OUT, 'seed.json'), 'utf8');
  if (seed && !process.env.ONLY_FUNCTIONAL) {
    for (const vp of VIEWPORTS) { console.log(`\n== ${vp.name} ${vp.width}×${vp.height}`); await sweep(browser, vp, seed); }
    console.log('\n== iPhone-SE large text'); await sweep(browser, VIEWPORTS[5], seed, { large: true });
  }
  await browser.close();
  const failed = results.checks.filter(c => !c.ok);
  console.log(`\n${results.checks.length - failed.length}/${results.checks.length} checks passed, ${results.layout.length} layout problems, ${results.errors.length} script errors, ${Math.round((Date.now() - t0) / 1000)}s`);
  if (results.errors.length) console.log(results.errors.join('\n'));
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  process.exit(failed.length || results.layout.length || results.errors.length ? 1 : 0);
})();
