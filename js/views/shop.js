// Shopping list (send to Reminders, Word, text) and the price book (edit or scan prices from a photo).
import { state, save, weekKeyFor, today, addDays, iso, uid, parseIso, MONTHS } from '../store.js';
import { ING, INGREDIENTS, AISLES, STORES } from '../data/ingredients.js';
import { priceInfo } from '../recipes.js';
import { buildList, itemQtyText, listAsLines, listAsText, markShoppingDone, storeTotals } from '../shopping.js';
import { makeDocx } from '../docx.js';
import { readPhoto, parsePrices } from '../ocr.js';
import { formatBase, money } from '../units.js';
import { esc, tickHtml, openSheet, toast, shareText, shareFile, copyText, pickFile, stepperHtml, bindSteppers, confirmSheet } from '../ui.js';
import { render as renderApp, go } from '../app.js';
import { ensureWeek } from './plan.js';

let weekOffset = (today() - parseIso(weekKeyFor(today()))) / 86400000 >= 6 ? 1 : 0;
let hideTicked = false;
let priceStore = null;
let priceQ = '';

function week() { return ensureWeek(weekKeyFor(addDays(today(), weekOffset * 7))); }
function storeName(s) { return STORES[s] ? STORES[s].name : s; }

export function render(route) {
  if (route.name === 'prices') return renderPrices();
  const w = week();
  const list = buildList(w);
  const totals = storeTotals(w);
  const cheapest = totals.slice().sort((a, b) => a.total - b.total)[0];
  const mine = totals.find(t => t.store === list.store);
  const live = list.items.filter(i => !i.inPantry && !i.removed);
  const ticked = live.filter(i => i.checked).length;
  let aisle = null;
  const rows = list.items.filter(i => !i.inPantry).map(it => {
    if (hideTicked && it.checked) return '';
    let head = '';
    if (it.aisle !== aisle) { aisle = it.aisle; head = `<div class="aisle">${esc(aisle)}</div>`; }
    return head + `<div class="item ${it.checked ? 'checked' : ''} ${it.removed ? 'removed' : ''}">
      ${tickHtml(`data-tick="${esc(it.key)}"`, it.checked, `Got ${it.name}`)}
      <div class="grow"><div class="nm">${esc(it.name)}${it.removed ? ' <span class="pill">removed</span>' : ''}</div>
        <div class="sub">${esc(itemQtyText(it))}${it.usedBy ? ` · ${esc(it.usedBy.filter(Boolean).slice(0, 2).join(', '))}${it.usedBy.length > 2 ? '…' : ''}` : ''}</div></div>
      <span class="price">${it.cost ? money(it.cost) : ''}</span>
      <button class="icon-btn" data-edit="${esc(it.key)}" aria-label="Edit ${esc(it.name)}">✎</button>
    </div>`;
  }).join('');
  const pantryRows = list.items.filter(i => i.inPantry).map(it => `<div class="item"><span aria-hidden="true">🥫</span><div class="grow"><div class="nm">${esc(it.name)}</div><div class="sub">${esc(itemQtyText(it))}</div></div></div>`).join('');
  return `
  <div class="topbar"><h1>Shopping</h1>
    <div class="seg"><button class="on">List</button><button data-goprices>Prices</button></div></div>
  <div class="row" style="margin-bottom:12px">
    <div class="seg" data-wk>${[[0, 'This week'], [1, 'Next week']].map(([o, l]) => `<button class="${weekOffset === o ? 'on' : ''}" data-val="${o}">${l}</button>`).join('')}</div>
    <label class="check small"><input type="checkbox" name="hide" ${hideTicked ? 'checked' : ''}> Hide ticked</label>
  </div>
  <div class="card" style="margin-bottom:14px">
    <div class="row" style="justify-content:space-between">
      <div><div class="muted small">Estimated at</div><select name="store" aria-label="Shop" style="width:auto;min-width:150px">${state.setup.stores.map(s => `<option value="${s}" ${s === list.store ? 'selected' : ''}>${storeName(s)}</option>`).join('')}</select></div>
      <div class="right"><div style="font-family:Fraunces,serif;font-size:2rem;font-weight:700">${money(list.total)}</div><div class="small muted">${live.length} items · ${ticked} ticked</div></div>
    </div>
    ${cheapest && mine && cheapest.store !== mine.store && mine.total - cheapest.total > 1 ? `<div class="notice good" style="margin-top:10px">💡 About ${money(mine.total - cheapest.total)} cheaper at ${esc(cheapest.name)}.</div>` : ''}
    <div class="row" style="margin-top:14px">
      <button class="btn primary" data-reminders>📲 Send to Reminders</button>
      <button class="btn" data-word>📄 Word doc</button>
      <button class="btn" data-copy>📋 Copy</button>
      <button class="btn" data-txt>📝 Text file</button>
    </div>
    <div class="row" style="margin-top:10px">
      <button class="btn soft" data-additem>＋ Add an item</button>
      <button class="btn soft" data-done>${list.state.done ? '✓ Shopping done' : '🧺 Done shopping'}</button>
      <a class="btn ghost small" href="#/help?topic=reminders">How Reminders works</a>
    </div>
  </div>
  ${live.length || list.state.extras.length ? `<div class="list">${rows}</div>` : `<div class="card empty"><div class="big">🛒</div><p>Nothing to buy yet. Plan the week first and the list appears here.</p><a class="btn primary" href="#/plan">Go to the plan</a></div>`}
  ${pantryRows ? `<div class="section-title"><h3>Already in your pantry</h3></div><div class="list">${pantryRows}</div>` : ''}
  ${list.staples.length ? `<div class="section-title"><h3>Check you have</h3><span class="small muted">staples & spices</span></div><div class="card flat"><div class="pills">${list.staples.map(s => `<span class="pill">${esc(s.name)}</span>`).join('')}</div></div>` : ''}`;
}

export function bind(root, route) {
  if (route.name === 'prices') return bindPrices(root);
  const w = week();
  const sl = () => buildList(w).state;
  root.querySelector('[data-goprices]').onclick = () => go('#/prices');
  root.querySelectorAll('[data-wk] button').forEach(b => b.onclick = () => { weekOffset = +b.dataset.val; renderApp(); });
  root.querySelector('[name=hide]').onchange = e => { hideTicked = e.target.checked; renderApp(); };
  root.querySelector('[name=store]').onchange = e => { state.setup.primaryStore = e.target.value; save(); renderApp(); };
  root.querySelectorAll('[data-tick]').forEach(c => c.onchange = () => { const s = sl(); s.checked[c.dataset.tick] = c.checked; w.updatedAt = Date.now(); save(); renderApp(); });
  root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editItemSheet(w, b.dataset.edit));
  const title = `Shopping list – week of ${parseIso(w.key).getDate()} ${MONTHS[parseIso(w.key).getMonth()].slice(0, 3)}`;
  root.querySelector('[data-reminders]').onclick = async () => {
    const lines = listAsLines(buildList(w), { uncheckedOnly: true });
    if (!lines.length) return toast('Nothing left to buy');
    const res = await shareText(lines.join('\n'), 'Shopping');
    if (res === 'copied') toast('Copied – open Reminders and paste into your Shopping list');
  };
  root.querySelector('[data-copy]').onclick = async () => { await copyText(listAsLines(buildList(w), { uncheckedOnly: true }).join('\n')); toast('List copied – paste into Reminders, Notes or a message'); };
  root.querySelector('[data-txt]').onclick = async () => { const blob = new Blob([listAsText(buildList(w), title)], { type: 'text/plain' }); await shareFile(blob, `shopping-${w.key}.txt`, title); };
  root.querySelector('[data-word]').onclick = async () => {
    const list = buildList(w);
    const blocks = [{ type: 'title', text: title }, { type: 'text', text: `Estimated ${money(list.total)} at ${storeName(list.store)}` }];
    let aisle = null;
    for (const it of list.items) {
      if (it.removed || it.inPantry) continue;
      if (it.aisle !== aisle) { aisle = it.aisle; blocks.push({ type: 'heading', text: aisle }); }
      blocks.push({ type: 'item', text: it.name, note: [itemQtyText(it), it.cost ? money(it.cost) : ''].filter(Boolean).join('  ·  ') });
    }
    if (list.staples.length) { blocks.push({ type: 'heading', text: 'Check you have' }); list.staples.forEach(s => blocks.push({ type: 'item', text: s.name })); }
    const res = await shareFile(makeDocx(blocks), `shopping-${w.key}.docx`, title);
    if (res === 'downloaded') toast('Word document saved');
  };
  root.querySelector('[data-additem]').onclick = () => addItemSheet(w);
  root.querySelector('[data-done]').onclick = async () => {
    const s = sl();
    if (s.done) { toast('Already marked as done'); return; }
    if (!(await confirmSheet('Finished shopping?', 'Everything on the list goes into your pantry, so it isn’t bought twice. Cooked meals use it up.', 'Yes, put it away'))) return;
    markShoppingDone(w); w.updatedAt = Date.now(); save(); renderApp(); toast('Pantry updated 🥫');
  };
}

function editItemSheet(w, key) {
  const list = buildList(w);
  const it = list.items.find(i => i.key === key);
  if (!it) return;
  const s0 = list.state;
  if (it.extra) {
    const ex = s0.extras.find(e => e.id === key);
    const s = openSheet({ title: it.name, body: `<label class="field"><span>Item</span><input type="text" name="name" value="${esc(ex.name)}"></label><label class="field"><span>Amount</span><input type="text" name="qty" value="${esc(ex.qty || '')}"></label><label class="field"><span>Estimated cost ($)</span><input type="number" inputmode="decimal" name="cost" value="${ex.cost || ''}"></label>`, foot: '<button class="btn danger" data-del>Remove</button><button class="btn primary" data-save>Save</button>' });
    s.el.querySelector('[data-save]').onclick = () => { ex.name = s.el.querySelector('[name=name]').value; ex.qty = s.el.querySelector('[name=qty]').value; ex.cost = +s.el.querySelector('[name=cost]').value || 0; w.updatedAt = Date.now(); save(); s.close(); renderApp(); };
    s.el.querySelector('[data-del]').onclick = () => { s0.extras = s0.extras.filter(e => e.id !== key); w.updatedAt = Date.now(); save(); s.close(); renderApp(); };
    return;
  }
  const p = priceInfo(it.id);
  const body = `<p class="muted">${esc(itemQtyText(it))}. Needed for ${esc(it.usedBy.filter(Boolean).join(', '))}.</p>
    <div class="row" style="justify-content:space-between"><b>Packs to buy</b>${stepperHtml('packs', it.packs, 0, 50, 1, 'Packs')}</div>
    <p class="small muted">Each pack: ${esc(formatBase(it.id, p.packSize, state.setup.units))} at ${money(p.packPrice)}${p.custom ? ' (your price)' : ' (typical price)'}.</p>
    <a class="btn soft small" href="#/prices?q=${encodeURIComponent(ING[it.id].name)}">Update the price</a>`;
  const s = openSheet({ title: it.name, body, foot: `${s0.packs[it.id] != null ? '<button class="btn" data-reset>Reset</button>' : ''}<button class="btn ${it.removed ? '' : 'danger'}" data-remove>${it.removed ? 'Put back on list' : 'Remove from list'}</button><button class="btn primary" data-close>Done</button>`, onClose: () => renderApp() });
  bindSteppers(s.el, (n, v) => { s0.packs[it.id] = v; w.updatedAt = Date.now(); save(); });
  s.el.querySelector('[data-remove]').onclick = () => { s0.removed[it.id] = !it.removed; w.updatedAt = Date.now(); save(); s.close(); };
  const rs = s.el.querySelector('[data-reset]'); if (rs) rs.onclick = () => { delete s0.packs[it.id]; w.updatedAt = Date.now(); save(); s.close(); };
}

function addItemSheet(w) {
  const s = openSheet({ title: 'Add an item', body: `<label class="field"><span>Item</span><input type="text" name="name" placeholder="e.g. dishwashing liquid, coffee"></label><label class="field"><span>Amount (optional)</span><input type="text" name="qty" placeholder="e.g. 2 packs"></label><label class="field"><span>Estimated cost $ (optional)</span><input type="number" inputmode="decimal" name="cost"></label><label class="field"><span>Aisle</span><select name="aisle">${AISLES.map(a => `<option ${a === 'Other' ? 'selected' : ''}>${a}</option>`).join('')}</select></label>`, foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Add</button>' });
  s.el.querySelector('[data-save]').onclick = () => {
    const name = s.el.querySelector('[name=name]').value.trim();
    if (!name) return toast('Type an item name');
    buildList(w).state.extras.push({ id: 'x' + uid(), name, qty: s.el.querySelector('[name=qty]').value, cost: +s.el.querySelector('[name=cost]').value || 0, aisle: s.el.querySelector('[name=aisle]').value });
    w.updatedAt = Date.now(); save(); s.close(); renderApp();
  };
}

// ---------- prices ----------
function renderPrices() {
  const store = priceStore || state.setup.primaryStore;
  const q = priceQ.toLowerCase();
  let aisle = null;
  const rows = INGREDIENTS.slice().sort((a, b) => AISLES.indexOf(a.aisle) - AISLES.indexOf(b.aisle) || a.name.localeCompare(b.name))
    .filter(i => !q || (i.name + ' ' + i.aka.join(' ')).toLowerCase().includes(q))
    .map(i => {
      const p = priceInfo(i.id, store);
      const mine = state.prices[i.id] && state.prices[i.id][store];
      let head = '';
      if (i.aisle !== aisle) { aisle = i.aisle; head = `<div class="aisle">${esc(aisle)}</div>`; }
      return head + `<div class="item"><div class="grow"><div class="nm">${esc(i.name)}</div><div class="sub">${esc(formatBase(i.id, p.packSize, state.setup.units))} · ${mine ? `your price, ${esc(mine.source === 'photo' ? 'from a photo' : 'entered')} ${esc(mine.date || '')}` : 'typical price'}</div></div>
        <span class="price" style="${mine ? 'color:var(--good)' : ''}">${money(p.packPrice)}</span><button class="icon-btn" data-price="${i.id}" aria-label="Edit price of ${esc(i.name)}">✎</button></div>`;
    }).join('');
  const custom = Object.values(state.prices).filter(x => x[store]).length;
  return `
  <div class="topbar"><h1>Prices</h1><div class="seg"><button data-golist>List</button><button class="on">Prices</button></div></div>
  <div class="card" style="margin-bottom:14px">
    <p>Typical ${esc(state.setup.state || 'Australian')} prices are built in. Snap a shelf label or receipt to put in your real prices: the more you add, the more accurate your budget gets.</p>
    <div class="row">
      <button class="btn primary" data-scan>📷 Take a photo</button>
      <button class="btn" data-pick>🖼️ Choose a photo</button>
    </div>
    <div class="grid two" style="margin-top:14px">
      <label class="field" style="margin:0"><span>Prices for</span><select name="pstore">${state.setup.stores.map(s => `<option value="${s}" ${s === store ? 'selected' : ''}>${storeName(s)}</option>`).join('')}</select></label>
      <label class="field" style="margin:0"><span>Find</span><input type="search" name="pq" value="${esc(priceQ)}" placeholder="e.g. mince"></label>
    </div>
    <p class="small muted" style="margin:10px 0 0">${custom} of your own prices at ${esc(storeName(store))}.</p>
  </div>
  <div class="list">${rows || '<div class="item">No matches</div>'}</div>`;
}

function bindPrices(root) {
  const store = () => priceStore || state.setup.primaryStore;
  const hash = location.hash.split('?')[1];
  if (hash) { const p = new URLSearchParams(hash); if (p.get('q') && !priceQ) { priceQ = p.get('q'); history.replaceState(null, '', '#/prices'); renderApp(); return; } }
  root.querySelector('[data-golist]').onclick = () => go('#/shop');
  root.querySelector('[name=pstore]').onchange = e => { priceStore = e.target.value; renderApp(); };
  const pq = root.querySelector('[name=pq]');
  let t; pq.oninput = () => { clearTimeout(t); t = setTimeout(() => { priceQ = pq.value; renderApp(); const n = document.querySelector('[name=pq]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 350); };
  root.querySelectorAll('[data-price]').forEach(b => b.onclick = () => priceSheet(b.dataset.price, store()));
  root.querySelector('[data-scan]').onclick = async () => { const f = await pickFile('image/*', 'environment'); if (f) scanSheet(f, store()); };
  root.querySelector('[data-pick]').onclick = async () => { const f = await pickFile('image/*'); if (f) scanSheet(f, store()); };
}

function unitLabel(u) { return u === 'each' ? 'items' : u; }

function priceSheet(id, store) {
  const ing = ING[id];
  const p = priceInfo(id, store);
  const s = openSheet({ title: ing.name, body: `
    <p class="small muted">At ${esc(storeName(store))}. Typical price is about ${money(ing.packPrice)} for ${esc(formatBase(id, ing.packSize))}.</p>
    <div class="grid two">
      <label class="field"><span>Pack size (${unitLabel(ing.packUnit)})</span><input type="number" inputmode="decimal" name="size" value="${p.packSize}"></label>
      <label class="field"><span>Price ($)</span><input type="number" inputmode="decimal" step="0.01" name="price" value="${p.packPrice}"></label>
    </div>`, foot: `${p.custom ? '<button class="btn" data-reset>Use typical price</button>' : ''}<button class="btn primary" data-save>Save price</button>` });
  s.el.querySelector('[data-save]').onclick = () => {
    const size = +s.el.querySelector('[name=size]').value, price = +s.el.querySelector('[name=price]').value;
    if (!(size > 0 && price > 0)) return toast('Enter a pack size and price');
    state.prices[id] = state.prices[id] || {};
    state.prices[id][store] = { packSize: size, packPrice: price, date: iso(today()), source: 'manual' };
    save(); s.close(); renderApp(); toast('Price saved');
  };
  const r = s.el.querySelector('[data-reset]');
  if (r) r.onclick = () => { delete state.prices[id][store]; save(); s.close(); renderApp(); };
}

async function scanSheet(file, store) {
  const s = openSheet({ title: 'Reading your photo', body: `<div class="center" style="padding:20px"><div style="font-size:3rem">🔎</div><p data-msg>Getting the photo reader ready…</p><div class="budget-bar"><div class="groc" data-bar style="width:5%"></div></div><p class="small muted" style="margin-top:12px">This happens on your device. The first time can take a little longer.</p></div>` });
  const msg = s.el.querySelector('[data-msg]'), bar = s.el.querySelector('[data-bar]');
  let rows;
  try {
    const text = await readPhoto(file, m => {
      if (!msg.isConnected) return;
      if (m.status === 'recognizing text') { msg.textContent = 'Reading the prices…'; bar.style.width = Math.round(10 + m.progress * 90) + '%'; }
      else if (m.status) msg.textContent = m.status[0].toUpperCase() + m.status.slice(1) + '…';
    });
    rows = parsePrices(text);
    if (!rows.length) {
      s.setBody(`<div class="center"><div style="font-size:3rem">🤔</div><p>We couldn't find any prices in that photo.</p><p class="small muted">Try again closer to the label, with good light, holding the camera straight. You can also enter prices by tapping ✎ next to an item.</p>${text.trim() ? `<details><summary class="small">What we read</summary><pre class="small" style="white-space:pre-wrap">${esc(text)}</pre></details>` : ''}</div>`);
      return;
    }
  } catch (e) {
    s.setBody(`<p>Sorry, the photo reader couldn't start: ${esc(e.message || e)}.</p>`);
    return;
  }
  const opts = id => `<option value="">– Skip this –</option>` + INGREDIENTS.slice().sort((a, b) => a.name.localeCompare(b.name)).map(i => `<option value="${i.id}" ${i.id === id ? 'selected' : ''}>${esc(i.name)}</option>`).join('');
  s.el.querySelector('.sheet-head h2').textContent = 'Check the prices';
  s.setBody(`<p class="small muted">Here's what we found. Match each line to an ingredient, fix anything that's off, and save. Lines set to “Skip” are ignored.</p>
    ${rows.map((r, i) => `<div class="card flat" style="padding:12px;margin-bottom:10px" data-row="${i}">
      <div class="small"><b>Read:</b> ${esc(r.text)}${r.note ? ` <span class="pill">${esc(r.note)}</span>` : ''}</div>
      <label class="field" style="margin:8px 0"><span>Ingredient</span><select name="ing-${i}">${opts(r.ing)}</select></label>
      <div class="grid two">
        <label class="field" style="margin:0"><span>Pack size <span data-unit="${i}">${r.ing ? '(' + unitLabel(ING[r.ing].packUnit) + ')' : ''}</span></span><input type="number" inputmode="decimal" name="size-${i}" value="${r.packSize || ''}"></label>
        <label class="field" style="margin:0"><span>Price ($)</span><input type="number" inputmode="decimal" step="0.01" name="price-${i}" value="${r.price}"></label>
      </div></div>`).join('')}
    <label class="field"><span>Shop</span><select name="store">${state.setup.stores.map(x => `<option value="${x}" ${x === store ? 'selected' : ''}>${storeName(x)}</option>`).join('')}</select></label>`);
  s.setFoot('<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save prices</button>');
  rows.forEach((r, i) => {
    const sel = s.el.querySelector(`[name=ing-${i}]`);
    sel.onchange = () => {
      const ing = ING[sel.value];
      s.el.querySelector(`[data-unit="${i}"]`).textContent = ing ? `(${unitLabel(ing.packUnit)})` : '';
      const size = s.el.querySelector(`[name=size-${i}]`);
      if (ing && !size.value) size.value = ing.packSize;
    };
  });
  s.el.querySelector('[data-save]').onclick = () => {
    const st = s.el.querySelector('[name=store]').value;
    let n = 0;
    rows.forEach((r, i) => {
      const id = s.el.querySelector(`[name=ing-${i}]`).value;
      const size = +s.el.querySelector(`[name=size-${i}]`).value, price = +s.el.querySelector(`[name=price-${i}]`).value;
      if (!id || !(size > 0) || !(price > 0)) return;
      state.prices[id] = state.prices[id] || {};
      state.prices[id][st] = { packSize: size, packPrice: price, date: iso(today()), source: 'photo' };
      n++;
    });
    save(); s.close(); renderApp(); toast(n ? `${n} price${n > 1 ? 's' : ''} saved 🎉` : 'Nothing saved');
  };
}
