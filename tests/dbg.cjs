const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  p.on('pageerror', e => console.log('pageerror: ' + e.message));
  await p.route(/open-meteo|themealdb|gstatic/, r => r.abort());
  await p.addInitScript(() => { window.__noSW = true; });
  await p.goto('http://localhost:8765/');
  await p.evaluate(() => { const s = window.mp.state; s.setup.done = true; s.setup.children=[{age:6}]; s.setup.allergies=['peanut']; s.setup.postcode='3000'; s.setup.meals.lunch=true; localStorage.setItem('mealplanner.v1', JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(500);
  const out = await p.evaluate(async () => {
    const P = await import('/js/planner.js'); const S = await import('/js/shopping.js'); const st = await import('/js/store.js'); const R = await import('/js/recipes.js');
    const w = st.getWeek('2026-10-19');
    const res = [];
    for (let i = 0; i < 3; i++) {
      P.generateWeek(w);
      const b = P.budgetFor(w);
      res.push({ groceries: b.groceries, total: S.buildList(w).total.toFixed(2), meals: w.days.map(d => Object.entries(d.meals).map(([s, m]) => s[0] + ':' + m.recipeId + '/' + m.kind + (m.extraServings ? '+' + m.extraServings : '') + ' $' + (R.costPerServe(R.getRecipe(m.recipeId))||0).toFixed(2)).join(' ')) });
    }
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
