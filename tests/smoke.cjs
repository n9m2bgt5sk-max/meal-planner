const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1024, height: 768 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.route(/open-meteo|themealdb|gstatic/, r => r.abort());
  await p.addInitScript(() => { window.__noSW = true; });
  await p.goto('http://localhost:8765/');
  await p.waitForTimeout(1500);
  console.log('hash', await p.evaluate(() => location.hash));
  console.log((await p.textContent('body')).slice(0, 300));
  console.log(errs.join('\n'));
  await b.close();
})();
