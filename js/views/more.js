// More: budget, history & calendar, settings, sync with your partner, backup, and help.
import { state, save, iso, today, parseIso, addDays, DAY_SHORT, MONTHS, weekKeyFor, defaultState, replaceState } from '../store.js';
import { getRecipe, recipeArt, allRecipes, costPerServe } from '../recipes.js';
import { budgetFor } from '../planner.js';
import { buildList } from '../shopping.js';
import { exportBlob, exportName, readFile, merge, restore } from '../sync.js';
import { syncConfig, syncStatus, onStatus, connect, disconnect, parseFirebaseConfig, newHouseholdCode, joinLink, decodeJoin, pushNow } from '../cloud.js';
import qrcode from '../../vendor/qrcode/qrcode.mjs';
import { money } from '../units.js';
import { esc, openSheet, toast, shareFile, shareText, copyText, pickFile, confirmSheet } from '../ui.js';
import { render as renderApp, go, applyLook } from '../app.js';
import { SECTIONS, resetWizard } from './setup.js';

let calMonth = null;

export function render(route) {
  switch (route.name) {
    case 'budget': return renderBudget();
    case 'history': return renderHistory();
    case 'settings': return renderSettings();
    case 'backup': return renderBackup();
    case 'sync': return renderSync();
    case 'join': return renderJoin(route);
    case 'help': return renderHelp(route);
    default: return renderMenu();
  }
}
export function bind(root, route) {
  switch (route.name) {
    case 'budget': return bindSections(root, ['budget']);
    case 'history': return bindHistory(root);
    case 'settings': return bindSettings(root);
    case 'backup': return bindBackup(root);
    case 'sync': return bindSync(root);
    case 'join': return bindJoin(root, route);
    case 'help': return bindHelp(root, route);
    default: return;
  }
}

function back(href = '#/more', label = 'More') { return `<a class="btn ghost" href="${href}">‹ ${label}</a>`; }

function renderMenu() {
  const st = syncStatus();
  const item = (href, ico, title, sub) => `<a class="card" href="${href}" style="display:flex;gap:14px;align-items:center;text-decoration:none;color:var(--ink)"><span style="font-size:2rem">${ico}</span><span class="grow"><b>${title}</b><br><span class="small muted">${sub}</span></span><span class="muted" aria-hidden="true">›</span></a>`;
  return `<div class="topbar"><h1>More</h1></div>
    <div class="grid two">
      ${item('#/budget', '💰', 'Budget', `Weekly ${money(state.budget.weekly)} · drinks, takeaway & dining out`)}
      ${item('#/history', '📅', 'History & calendar', `${state.history.filter(h => h.recipeId).length} meals so far · how often you've had each`)}
      ${item('#/sync', '🔄', 'Sync with your partner', syncConfig() ? `${st.message}` : 'Share one plan across phones and iPads')}
      ${item('#/settings', '⚙️', 'Settings', 'Household, allergies, kitchen, shops, theme')}
      ${item('#/prices', '🏷️', 'Prices', 'Update prices or scan a label or receipt')}
      ${item('#/backup', '💾', 'Backup & restore', 'Save a copy of everything to Files or iCloud')}
      ${item('#/help', '❓', 'Help', 'Reminders, installing on your home screen, tips')}
    </div>`;
}

// ---------- budget ----------
function renderBudget() {
  const w = state.weeks[weekKeyFor(today())];
  const b = w ? budgetFor(w) : null;
  const spend = w ? buildList(w).total : 0;
  const weeks = Object.values(state.weeks).sort((a, b) => b.key.localeCompare(a.key)).slice(0, 6);
  return `<div class="topbar">${back()}<h1>Budget</h1></div>
    ${b ? `<div class="card" style="margin-bottom:14px"><h3>This week</h3><p>Budget ${money(b.total)} · extras ${money(b.extras)} · groceries ${money(spend)} · <b>${money(b.total - b.extras - spend)} left</b></p></div>` : ''}
    <div class="card"><h2>${SECTIONS.budget.title}</h2><div id="sec-budget">${SECTIONS.budget.render()}</div></div>
    ${weeks.length ? `<div class="section-title"><h3>Recent weeks</h3></div><div class="list">${weeks.map(wk => { const bb = budgetFor(wk); const t = buildList(wk).total; return `<div class="item"><div class="grow"><div class="nm">Week of ${parseIso(wk.key).getDate()} ${MONTHS[parseIso(wk.key).getMonth()].slice(0, 3)}</div><div class="sub">Groceries ${money(t)} + extras ${money(bb.extras)}</div></div><span class="price ${t + bb.extras > bb.total ? 'exp-past' : ''}">${money(t + bb.extras)} / ${money(bb.total)}</span></div>`; }).join('')}</div>` : ''}`;
}
function bindSections(root, keys) {
  for (const k of keys) {
    const el = root.querySelector('#sec-' + k);
    const rerender = () => { el.innerHTML = SECTIONS[k].render(); SECTIONS[k].bind(el, rerender); };
    SECTIONS[k].bind(el, rerender);
  }
}

// ---------- history ----------
function renderHistory() {
  const t = today();
  if (!calMonth) calMonth = new Date(t.getFullYear(), t.getMonth(), 1);
  const first = new Date(calMonth);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const byDate = {};
  for (const h of state.history) (byDate[h.date] = byDate[h.date] || []).push(h);
  // Planned meals from today on, so the calendar shows what's coming too.
  for (const w of Object.values(state.weeks)) for (const d of w.days) {
    if (d.date < iso(t)) continue;
    const m = d.meals && d.meals.dinner;
    if (m && d.mode === 'cook') { const r = getRecipe(m.recipeId); if (r) (byDate[d.date] = byDate[d.date] || []).push({ name: r.name, recipeId: r.id, slot: 'dinner', planned: true }); }
    else if (d.mode === 'takeaway' || d.mode === 'dining') (byDate[d.date] = byDate[d.date] || []).push({ name: d.mode === 'takeaway' ? 'Takeaway' : 'Dining out', planned: true });
  }
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const k = iso(d);
    const ms = (byDate[k] || []).filter(h => h.slot === 'dinner' || !h.slot || h.slot === 'main');
    cells.push(`<button class="cell ${d.getMonth() !== calMonth.getMonth() ? 'other' : ''} ${k === iso(t) ? 'today' : ''}" data-date="${k}" aria-label="${d.getDate()} ${MONTHS[d.getMonth()]}"><span class="n">${d.getDate()}</span>${ms.slice(0, 2).map(h => `<span class="m" ${h.planned ? 'style="opacity:.7"' : ''}>${esc(h.name)}</span>`).join('')}</button>`);
    if (i >= 34 && d.getMonth() !== calMonth.getMonth() && addDays(d, 1).getDay() === 1) break;
  }
  const counts = {};
  for (const h of state.history) if (h.recipeId) counts[h.recipeId] = (counts[h.recipeId] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const cooked = state.history.filter(h => h.recipeId).length;
  const takeaway = state.history.filter(h => h.mode === 'takeaway').length;
  return `<div class="topbar">${back()}<h1>History</h1></div>
    <div class="card" style="margin-bottom:14px">
      <div class="row" style="justify-content:space-between"><button class="icon-btn" data-month="-1" aria-label="Previous month">‹</button><h3 style="margin:0">${MONTHS[calMonth.getMonth()]} ${calMonth.getFullYear()}</h3><button class="icon-btn" data-month="1" aria-label="Next month">›</button></div>
      <div class="cal" style="margin-top:10px">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="dow">${d}</div>`).join('')}${cells.join('')}</div>
      <p class="tiny muted" style="margin:8px 0 0">Faded = planned, not happened yet. Tap a day for details.</p>
    </div>
    <div class="grid two">
      <div class="card"><h3>Most made</h3>${top.length ? `<div class="list" style="box-shadow:none">${top.map(([id, n]) => { const r = getRecipe(id); const rt = state.ratings[id]; return r ? `<a class="item" href="#/recipe/${encodeURIComponent(id)}" style="text-decoration:none;color:var(--ink)"><div class="grow"><div class="nm">${esc(r.name)}</div><div class="sub">${rt && rt.stars ? '★'.repeat(rt.stars) + ' · ' : ''}${esc(r.cuisine)}</div></div><span class="pill accent">×${n}</span></a>` : ''; }).join('')}</div>` : '<p class="muted">Meals appear here once their day has passed.</p>'}</div>
      <div class="card"><h3>At a glance</h3><table class="nutri"><tr><td>Meals on past plans</td><td>${cooked}</td></tr><tr><td>Takeaway nights</td><td>${takeaway}</td></tr><tr><td>Different recipes</td><td>${Object.keys(counts).length}</td></tr><tr><td>Recipes you've rated</td><td>${Object.values(state.ratings).filter(r => r.stars).length}</td></tr></table></div>
    </div>`;
}
function bindHistory(root) {
  root.querySelectorAll('[data-month]').forEach(b => b.onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + +b.dataset.month, 1); renderApp(); });
  root.querySelectorAll('[data-date]').forEach(b => b.onclick = () => {
    const k = b.dataset.date;
    const items = state.history.filter(h => h.date === k);
    const wk = state.weeks[weekKeyFor(parseIso(k))];
    const day = wk && wk.days.find(d => d.date === k);
    const planned = day && k >= iso(today()) ? Object.entries(day.meals || {}).map(([slot, m]) => ({ slot, name: (getRecipe(m.recipeId) || {}).name, recipeId: m.recipeId })) : [];
    const all = [...items, ...planned];
    const d = parseIso(k);
    openSheet({ title: `${d.getDate()} ${MONTHS[d.getMonth()]}`, body: all.length ? all.map(h => h.recipeId ? `<a class="alt" style="text-decoration:none;color:var(--ink)" href="#/recipe/${encodeURIComponent(h.recipeId)}"><span class="thumb">${getRecipe(h.recipeId) ? recipeArt(getRecipe(h.recipeId), 64) : ''}</span><span><b>${esc(h.name)}</b><br><span class="small muted">${esc(h.slot || '')}${h.cooked ? ' · cooked ✓' : ''}</span></span><span></span></a>` : `<p>${esc(h.name)}</p>`).join('') : '<p class="muted">Nothing recorded for this day.</p>' });
  });
}

// ---------- settings ----------
const SETTINGS_ORDER = ['household', 'diet', 'location', 'kitchen', 'tastes'];
function renderSettings() {
  return `<div class="topbar">${back()}<h1>Settings</h1></div>
    <div class="stack">${SETTINGS_ORDER.map(k => `<div class="card"><h2>${SECTIONS[k].title}</h2><div id="sec-${k}">${SECTIONS[k].render()}</div></div>`).join('')}
    <div class="card"><h2>Your data</h2>
      <div class="row"><a class="btn" href="#/backup">💾 Backup & restore</a><button class="btn" data-wizard>Run setup again</button><button class="btn" data-clearhist>Clear history older than a year</button><button class="btn danger" data-reset>Start over</button></div>
      <p class="small muted" style="margin-top:10px">Everything is stored on this device${syncConfig() ? ' and synced with your household' : ''}.</p></div>
    <p class="tiny muted center">Meal Planner 1.0 · Recipes, prices and nutrition are estimates; check labels for allergens.</p></div>`;
}
function bindSettings(root) {
  bindSections(root, SETTINGS_ORDER);
  root.querySelector('[data-wizard]').onclick = () => { resetWizard(1); go('#/setup'); };
  root.querySelector('[data-clearhist]').onclick = () => { const cut = iso(addDays(today(), -365)); const n = state.history.length; state.history = state.history.filter(h => h.date >= cut); save(); toast(`${n - state.history.length} old entries cleared`); };
  root.querySelector('[data-reset]').onclick = async () => {
    if (!(await confirmSheet('Start over?', 'This deletes every plan, rating, price and pantry item on this device. Export a backup first if you might want them.', 'Delete everything', true))) return;
    await disconnect(true);
    replaceState(defaultState()); applyLook(); resetWizard(0); go('#/setup');
  };
}

// ---------- backup ----------
function renderBackup() {
  return `<div class="topbar">${back()}<h1>Backup & restore</h1></div>
    <div class="grid two">
      <div class="card"><h3>💾 Save a backup</h3><p class="muted">One file with your plans, history, ratings, pantry, prices and recipes. Save it to Files or iCloud Drive.</p><button class="btn primary" data-export>Save backup file</button></div>
      <div class="card"><h3>📂 Restore</h3><p class="muted">Open a backup file. You can replace everything on this device, or merge it with what's here.</p><button class="btn" data-import>Choose a backup file</button></div>
    </div>`;
}
function bindBackup(root) {
  root.querySelector('[data-export]').onclick = async () => { const r = await shareFile(exportBlob(), exportName('backup'), 'Meal Planner backup'); if (r !== 'cancelled') toast('Backup ready'); };
  root.querySelector('[data-import]').onclick = async () => {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    let incoming;
    try { incoming = await readFile(f); } catch (e) { toast(e.message || 'Could not read that file'); return; }
    const s = openSheet({ title: 'Restore backup', body: '<p>How would you like to use this file?</p><p class="small muted"><b>Merge</b> keeps what’s on this device and adds anything newer from the file. <b>Replace</b> makes this device an exact copy of the backup.</p>', foot: '<button class="btn" data-close>Cancel</button><button class="btn" data-replace>Replace everything</button><button class="btn primary" data-merge>Merge</button>' });
    s.el.querySelector('[data-merge]').onclick = () => { const sum = merge(incoming); if (!state.setup.done && incoming.setup) { state.setup = { ...incoming.setup }; state.budget = incoming.budget; } s.close(); applyLook(); toast(`Merged: ${sum.weeks} weeks, ${sum.history} history, ${sum.ratings} ratings`); go('#/plan'); };
    s.el.querySelector('[data-replace]').onclick = () => { restore(incoming); s.close(); applyLook(); toast('Backup restored'); go('#/plan'); };
  };
}

// ---------- sync ----------
const RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /households/{household} {
      allow read, write: if request.auth != null && household.size() >= 20;
    }
  }
}`;

function renderSync() {
  const cfg = syncConfig();
  const st = syncStatus();
  if (cfg) {
    const link = joinLink();
    let qr = '';
    try { const q = qrcode(0, 'L'); q.addData(link); q.make(); qr = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) {}
    return `<div class="topbar">${back()}<h1>Sync</h1></div>
      <div class="card" style="margin-bottom:14px"><div class="row"><span style="font-size:2rem">${st.state === 'ok' ? '✅' : st.state === 'error' ? '⚠️' : '🔄'}</span><div class="grow"><b>${esc(st.message)}</b><div class="small muted">Plans, shopping ticks, pantry, prices, ratings and history sync automatically between your devices.</div></div><button class="btn" data-now>Sync now</button></div></div>
      <div class="grid two">
        <div class="card"><h3>Add your partner or another device</h3><p class="muted">On the other phone or iPad, scan this code with the Camera app, or send them the link. It opens the app already connected to your household.</p>
          <div style="max-width:220px;margin:0 auto;background:#fff;padding:8px;border-radius:12px">${qr}</div>
          <div class="row" style="margin-top:12px"><button class="btn primary" data-sharelink>📤 Send the link</button><button class="btn" data-copylink>📋 Copy</button></div>
          <p class="tiny muted" style="margin-top:10px">Anyone with this link can see and change your meal plan, so only share it with your household.</p></div>
        <div class="card"><h3>Stop syncing</h3><p class="muted">This device keeps its data but stops sharing. Your partner's devices keep working.</p><button class="btn danger" data-stop>Stop syncing on this device</button></div>
      </div>`;
  }
  return `<div class="topbar">${back()}<h1>Sync with your partner</h1></div>
    <div class="card" style="margin-bottom:14px"><p>Sync shares one meal plan, shopping list, pantry and history across everyone's phones and iPads. It uses your own free Google Firebase project, so your data stays in an account you control.</p>
      <p class="muted">Setting it up takes about 15 minutes, once. <a href="#/help?topic=sync">Step-by-step instructions</a> · Already set up on another device? Open the link or QR code from that device instead.</p></div>
    <div class="card"><h3>Connect this device</h3>
      <label class="field"><span>Paste your Firebase settings (the “firebaseConfig” block)</span><textarea name="cfg" rows="7" placeholder="const firebaseConfig = {&#10;  apiKey: &quot;…&quot;,&#10;  authDomain: &quot;…&quot;,&#10;  projectId: &quot;…&quot;,&#10;  …&#10;};"></textarea></label>
      <button class="btn primary" data-connect>Connect and create our household</button>
      <p class="small muted" data-msg style="margin-top:10px">${st.state === 'error' ? esc(st.message) : ''}</p>
      <details style="margin-top:8px"><summary class="small">Firestore security rules to paste in Firebase</summary><pre class="small" style="white-space:pre-wrap;background:var(--bg2);padding:10px;border-radius:10px">${esc(RULES)}</pre><button class="btn small" data-copyrules>📋 Copy rules</button></details>
    </div>`;
}
function bindSync(root) {
  const stop = root.querySelector('[data-stop]');
  if (!bindSync.listening) { bindSync.listening = true; onStatus(() => { if (location.hash.startsWith('#/sync') && !document.querySelector('.sheet-wrap')) renderApp(); }); }
  if (stop) {
    root.querySelector('[data-now]').onclick = async () => { await pushNow(); toast(syncStatus().message); renderApp(); };
    root.querySelector('[data-sharelink]').onclick = () => shareText(joinLink(), 'Join our meal plan');
    root.querySelector('[data-copylink]').onclick = async () => { await copyText(joinLink()); toast('Link copied'); };
    stop.onclick = async () => { if (await confirmSheet('Stop syncing?', 'This device will stop sharing changes.', 'Stop syncing', true)) { await disconnect(true); renderApp(); } };
    return;
  }
  root.querySelector('[data-copyrules]').onclick = async () => { await copyText(RULES); toast('Rules copied'); };
  root.querySelector('[data-connect]').onclick = async () => {
    const fb = parseFirebaseConfig(root.querySelector('[name=cfg]').value);
    const msg = root.querySelector('[data-msg]');
    if (!fb) { msg.textContent = 'That doesn’t look like the Firebase settings. Copy the whole firebaseConfig block, including apiKey, projectId and appId.'; return; }
    msg.textContent = 'Connecting…';
    const ok = await connect({ firebase: fb, household: newHouseholdCode() });
    if (ok) { toast('Sync is on 🎉'); renderApp(); } else msg.textContent = syncStatus().message;
  };
}

function renderJoin(route) {
  const cfg = decodeJoin(route.params.c || '');
  if (!cfg) return `<div class="empty"><div class="big">🔗</div><p>That join link isn't complete. Ask for it to be sent again.</p><a class="btn" href="#/plan">Open the app</a></div>`;
  return `<div class="wizard"><div class="card center" style="padding:28px 20px"><div class="hello">🏡🔄</div><h1 style="margin-top:12px">Join your household's meal plan</h1>
    <p class="muted">This device will share plans, shopping lists, pantry, prices and history with your household.${state.setup.done ? ' What’s already on this device is merged in.' : ''}</p>
    <button class="btn primary big" data-join>Join</button> <a class="btn ghost" href="#/plan">Not now</a><p class="small muted" data-msg style="margin-top:12px"></p></div></div>`;
}
function bindJoin(root, route) {
  const cfg = decodeJoin(route.params.c || '');
  const b = root.querySelector('[data-join]');
  if (!b) return;
  b.onclick = async () => {
    b.disabled = true;
    const msg = root.querySelector('[data-msg]');
    msg.textContent = 'Connecting…';
    const ok = await connect(cfg);
    if (ok) { applyLook(); toast('You’re in! 🎉'); go(state.setup.done ? '#/plan' : '#/setup'); }
    else { msg.textContent = syncStatus().message; b.disabled = false; }
  };
}

// ---------- help ----------
const HELP = [
  ['start', '🌱 Getting started', `<ol><li>Open <b>Plan</b> and tap <b>Set up the week</b>: mark busy nights (less time), takeaway or dining-out nights, and any special occasions.</li><li>Tap <b>Plan my week</b>. Every meal can be <b>swapped</b> 🔄 for suggestions, or <b>kept</b> 🔒 when you re-plan.</li><li>Open <b>Shopping</b> for the list. Send it to Reminders or a Word document.</li><li>After shopping tap <b>Done shopping</b>: it all goes to the pantry. Tap <b>Mark cooked</b> on meals and rate them ★ so suggestions get better.</li></ol>`],
  ['install', '📱 Put it on your home screen', `<p>In Safari, open the app, tap the <b>Share</b> button (square with an arrow), then <b>Add to Home Screen</b>. It then opens full screen like a normal app and works without internet. Do this on each iPhone and iPad.</p>`],
  ['reminders', '✅ Shopping list into Reminders', `<p><b>Quickest:</b> tap <b>Copy</b> on the shopping list, open Reminders, open your Shopping list, tap <b>New Reminder</b> and paste. Each line becomes its own reminder.</p>
    <p><b>One tap, every week:</b> make a Shortcut once:</p><ol><li>Open the <b>Shortcuts</b> app and tap <b>+</b>.</li><li>Tap the shortcut's name at the top › <b>Details</b> › turn on <b>Show in Share Sheet</b>, and set it to receive <b>Text</b>.</li><li>Add the action <b>Split Text</b> (split by New Lines).</li><li>Add <b>Repeat with Each</b>, and inside it add <b>Add New Reminder</b> with the <i>Repeat Item</i>, and choose your <b>Shopping</b> list.</li><li>Name it <b>Add to Shopping</b>.</li></ol><p>Now tap <b>Send to Reminders</b> in the app and pick <b>Add to Shopping</b> from the share sheet.</p>
    <p><b>Share with your partner:</b> in Reminders, open the Shopping list › <b>⋯</b> › <b>Share List</b>, and invite them. Both phones see the same ticks.</p>`],
  ['prices', '🏷️ Prices & photo scanning', `<p>The app starts with typical prices for your state. To make the budget accurate, open <b>Shopping › Prices</b> and tap <b>Take a photo</b> of a shelf label or a receipt. The app reads it on the device, matches items, and shows them for a quick check before saving.</p><p>Tips: good light, hold the camera square-on, fill the frame with the label. Crumpled receipts may need a fix or two.</p>`],
  ['sync', '🔄 Setting up sync (once)', `<p>You'll create a free Google Firebase project. It's free for a household's use.</p><ol>
    <li>Go to <b>console.firebase.google.com</b> and sign in with a Google account (or create one).</li>
    <li>Tap <b>Create a project</b>, name it e.g. <i>our-meal-planner</i>. You can turn Google Analytics <b>off</b>. Tap <b>Create</b>.</li>
    <li>In the left menu open <b>Build › Authentication › Get started</b>. Under <b>Sign-in method</b> choose <b>Anonymous</b>, turn it <b>on</b> and <b>Save</b>.</li>
    <li>Open <b>Build › Firestore Database › Create database</b>. Pick the location <b>australia-southeast1 (Sydney)</b>, start in <b>production mode</b>.</li>
    <li>In Firestore open the <b>Rules</b> tab, replace everything with the rules shown on the Sync page (tap <i>Copy rules</i>), and tap <b>Publish</b>.</li>
    <li>Tap the ⚙️ next to <b>Project Overview</b> › <b>Project settings</b>. Under <b>Your apps</b> tap the <b>&lt;/&gt;</b> (Web) icon, name it, and tap <b>Register app</b>. Leave Firebase Hosting unticked.</li>
    <li>Copy the <b>firebaseConfig</b> block it shows (from <i>const firebaseConfig = {</i> to <i>};</i>).</li>
    <li>In the meal planner open <b>More › Sync</b>, paste it and tap <b>Connect</b>.</li>
    <li>Then use <b>Send the link</b> or the QR code to add your partner's phone, and your own iPhone.</li></ol>
    <p class="small muted">Your plan is stored in your Firebase project, under a long secret household code that only your devices have.</p>`],
  ['budget', '💰 How the budget works', `<p>Your weekly food budget pays for drinks, takeaway and dining out first (set the usual amounts under <b>More › Budget</b>, and mark takeaway or dining-out nights on the plan). The rest is your grocery budget. The planner picks meals so the shopping list fits it, and the budget card shows what's left. If it's over, tap the card for cheaper swaps.</p>`],
  ['offline', '📶 Offline & your data', `<p>Everything works offline except the weather, online recipes and sync. Your data lives on this device. Use <b>Backup & restore</b> now and then, especially before changing devices.</p>`],
];
function renderHelp(route) {
  const open = route.params.topic;
  return `<div class="topbar">${back()}<h1>Help</h1></div>
    <div class="stack">${HELP.map(([k, t, body]) => `<details class="card" ${open === k || (!open && k === 'start') ? 'open' : ''} id="help-${k}"><summary style="cursor:pointer;min-height:44px;display:flex;align-items:center"><h3 style="margin:0">${t}</h3></summary><div style="margin-top:10px">${body}</div></details>`).join('')}</div>`;
}
function bindHelp(root, route) {
  if (route.params.topic) { const el = root.querySelector('#help-' + route.params.topic); if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 50); }
}
