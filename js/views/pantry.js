// Pantry, fridge and freezer: what you have, what's expiring, and recipes that use it up.
import { state, save, iso, today, parseIso, addDays, uid } from '../store.js';
import { ING, INGREDIENTS } from '../data/ingredients.js';
import { allRecipes, recipeArt, suits, totalTime } from '../recipes.js';
import { matchIngredient, readPhoto, parsePrices } from '../ocr.js';
import { formatBase } from '../units.js';
import { esc, openSheet, toast, pickFile } from '../ui.js';
import { render as renderApp } from '../app.js';

const LOCS = { pantry: ['🥫', 'Pantry'], fridge: ['🧊', 'Fridge'], freezer: ['❄️', 'Freezer'] };
let show = 'all';

function daysLeft(p) { return p.expiry ? Math.round((parseIso(p.expiry) - today()) / 86400000) : null; }
function defaultLoc(ing) {
  if (!ing) return 'pantry';
  if (ing.flags.includes('frozen')) return 'freezer';
  if (['Meat & Seafood', 'Dairy & Eggs', 'Deli'].includes(ing.aisle) || (ing.aisle === 'Fruit & Veg' && ing.shelfDays < 10)) return 'fridge';
  return 'pantry';
}
function qtyText(p) {
  if (p.ingId && ING[p.ingId]) return formatBase(p.ingId, p.qty, state.setup.units);
  return p.qtyText || '';
}

export function render() {
  const items = state.pantry.slice().sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'));
  const soon = items.filter(p => { const d = daysLeft(p); return d != null && d <= 3; });
  const sections = Object.entries(LOCS).filter(([k]) => show === 'all' || show === k).map(([k, [ico, label]]) => {
    const list = items.filter(p => p.location === k);
    return `<div class="section-title"><h3>${ico} ${label}</h3><span class="small muted">${list.length}</span></div>
      <div class="list">${list.map(p => {
        const d = daysLeft(p);
        const exp = d == null ? '' : d < 0 ? `<span class="exp-past">expired ${-d}d ago</span>` : d <= 3 ? `<span class="exp-soon">${d === 0 ? 'use today' : `use within ${d}d`}</span>` : `<span class="muted">${parseIso(p.expiry).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>`;
        return `<div class="item"><div class="grow"><div class="nm">${esc(p.name)}</div><div class="sub">${esc(qtyText(p))}${exp ? ' · ' : ''}${exp}</div></div>
          <button class="icon-btn" data-edit="${p.id}" aria-label="Edit ${esc(p.name)}">✎</button>
          <button class="icon-btn" data-del="${p.id}" aria-label="Remove ${esc(p.name)}">✕</button></div>`;
      }).join('') || '<div class="item"><span class="muted small">Nothing here yet</span></div>'}</div>`;
  }).join('');
  return `
  <div class="topbar"><h1>Pantry</h1><div class="actions"><button class="btn primary" data-add>＋ Add item</button><button class="btn" data-receipt>📷 From a receipt</button></div></div>
  <p class="muted">What's in your cupboard, fridge and freezer. The planner uses these first, and the shopping list skips them.</p>
  ${soon.length ? `<div class="notice" style="margin-bottom:12px">⏰ <div class="grow"><b>Use these up soon:</b> ${soon.map(p => esc(p.name)).join(', ')}<br><button class="btn small soft" style="margin-top:8px" data-useup>Recipes that use them</button></div></div>` : ''}
  <div class="seg" data-show>${[['all', 'Everything'], ...Object.entries(LOCS).map(([k, v]) => [k, v[1]])].map(([k, l]) => `<button class="${show === k ? 'on' : ''}" data-val="${k}">${l}</button>`).join('')}</div>
  ${state.pantry.length ? sections : `<div class="card empty" style="margin-top:14px"><div class="big">🥫</div><p>Add what you've already got and we'll plan meals around it. When you tick “Done shopping”, everything you bought lands here too.</p></div>`}`;
}

export function bind(root) {
  root.querySelector('[data-add]').onclick = () => itemSheet(null);
  root.querySelector('[data-receipt]').onclick = async () => { const f = await pickFile('image/*'); if (f) receiptSheet(f); };
  root.querySelectorAll('[data-show] button').forEach(b => b.onclick = () => { show = b.dataset.val; renderApp(); });
  root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => itemSheet(state.pantry.find(p => p.id === b.dataset.edit)));
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const p = state.pantry.find(x => x.id === b.dataset.del);
    state.pantry = state.pantry.filter(x => x.id !== p.id); state.deleted.push(p.id); save(); renderApp();
    toast(`${p.name} removed`, { label: 'Undo', run: () => { state.pantry.push(p); state.deleted = state.deleted.filter(x => x !== p.id); save(); renderApp(); } });
  });
  const uu = root.querySelector('[data-useup]');
  if (uu) uu.onclick = useUpSheet;
}

function itemSheet(p) {
  const isNew = !p;
  p = p ? { ...p } : { id: 'p' + uid(), ingId: '', name: '', qty: 0, location: 'pantry', expiry: '', added: iso(today()) };
  const ing = p.ingId && ING[p.ingId];
  const unit = ing ? (ing.packUnit === 'each' ? (ing.eachName || 'item') + 's' : ing.packUnit) : '';
  const body = `
    <datalist id="pantry-names">${INGREDIENTS.map(i => `<option value="${esc(i.name)}">`).join('')}</datalist>
    <label class="field"><span>Item</span><input type="text" list="pantry-names" name="name" value="${esc(p.name)}" placeholder="e.g. Beef mince, rice, frozen peas"></label>
    <div class="grid two">
      <label class="field"><span>Amount <span data-u>${unit ? `(${unit})` : ''}</span></span><input type="number" inputmode="decimal" name="qty" value="${p.ingId ? Math.round(p.qty * 10) / 10 : ''}" placeholder="${ing ? ing.packSize : ''}"></label>
      <label class="field"><span>Use by</span><input type="date" name="expiry" value="${esc(p.expiry || '')}"></label>
    </div>
    <div class="field-label">Where</div>
    <div class="seg" data-loc>${Object.entries(LOCS).map(([k, [i, l]]) => `<button class="${p.location === k ? 'on' : ''}" data-val="${k}">${i} ${l}</button>`).join('')}</div>
    <p class="small muted" style="margin-top:10px">Pick from the suggestions so the planner can match it to recipes. Amounts are in grams, millilitres or pieces.</p>`;
  const s = openSheet({ title: isNew ? 'Add to pantry' : 'Edit item', body, foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>' });
  const el = s.el;
  const nameIn = el.querySelector('[name=name]');
  nameIn.onchange = () => {
    const m = INGREDIENTS.find(i => i.name.toLowerCase() === nameIn.value.trim().toLowerCase()) || matchIngredient(nameIn.value);
    if (m) {
      el.querySelector('[data-u]').textContent = `(${m.packUnit === 'each' ? (m.eachName || 'item') + 's' : m.packUnit})`;
      const q = el.querySelector('[name=qty]'); if (!q.value) q.value = m.packSize;
      const e = el.querySelector('[name=expiry]'); if (!e.value) e.value = iso(addDays(today(), m.shelfDays));
      p.location = defaultLoc(m);
      el.querySelectorAll('[data-loc] button').forEach(b => b.classList.toggle('on', b.dataset.val === p.location));
    }
  };
  el.querySelectorAll('[data-loc] button').forEach(b => b.onclick = () => { p.location = b.dataset.val; el.querySelectorAll('[data-loc] button').forEach(x => x.classList.toggle('on', x === b)); });
  el.querySelector('[data-save]').onclick = () => {
    const name = nameIn.value.trim();
    if (!name) return toast('Type what the item is');
    const m = INGREDIENTS.find(i => i.name.toLowerCase() === name.toLowerCase()) || matchIngredient(name);
    const qv = parseFloat(el.querySelector('[name=qty]').value);
    p.name = name; p.ingId = m ? m.id : null;
    p.qty = m ? (qv > 0 ? qv : m.packSize) : 1;
    p.qtyText = m ? '' : (qv > 0 ? String(qv) : '');
    p.expiry = el.querySelector('[name=expiry]').value || null;
    p.updated = Date.now();
    state.pantry = state.pantry.filter(x => x.id !== p.id);
    state.pantry.push(p);
    save(); s.close(); renderApp(); toast(isNew ? `${name} added` : 'Saved');
  };
}

async function receiptSheet(file) {
  const s = openSheet({ title: 'Reading your receipt', body: '<div class="center" style="padding:20px"><div style="font-size:3rem">🧾</div><p data-msg>Reading…</p></div>' });
  try {
    const text = await readPhoto(file, m => { const el = s.el.querySelector('[data-msg]'); if (el && m.status === 'recognizing text') el.textContent = `Reading… ${Math.round(m.progress * 100)}%`; });
    const rows = parsePrices(text).filter(r => r.ing);
    if (!rows.length) { s.setBody('<p>We couldn\'t match anything on that receipt. Try a flatter, well-lit photo, or add items by hand.</p>'); return; }
    s.setBody(`<p class="small muted">Untick anything you don't want added.</p>${rows.map((r, i) => `<label class="check"><input type="checkbox" name="r-${i}" checked><span><b>${esc(ING[r.ing].name)}</b> <span class="small muted">${esc(formatBase(r.ing, r.packSize || ING[r.ing].packSize))} · read “${esc(r.text)}”</span></span></label>`).join('')}
      <label class="check"><input type="checkbox" name="prices" checked><span>Also save these as my prices</span></label>`);
    s.setFoot('<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Add to pantry</button>');
    s.el.querySelector('[data-save]').onclick = () => {
      const savePrices = s.el.querySelector('[name=prices]').checked;
      let n = 0;
      rows.forEach((r, i) => {
        if (!s.el.querySelector(`[name=r-${i}]`).checked) return;
        const ing = ING[r.ing];
        const qty = r.packSize || ing.packSize;
        state.pantry.push({ id: 'p' + uid(), ingId: ing.id, name: ing.name, qty, location: defaultLoc(ing), expiry: iso(addDays(today(), ing.shelfDays)), added: iso(today()), updated: Date.now() });
        if (savePrices && r.price) { state.prices[ing.id] = state.prices[ing.id] || {}; state.prices[ing.id][state.setup.primaryStore] = { packSize: qty, packPrice: r.price, date: iso(today()), source: 'photo' }; }
        n++;
      });
      save(); s.close(); renderApp(); toast(`${n} item${n === 1 ? '' : 's'} added`);
    };
  } catch (e) { s.setBody(`<p>The photo reader couldn't start: ${esc(e.message || e)}</p>`); }
}

function useUpSheet() {
  const soonIds = new Set(state.pantry.filter(p => p.ingId && daysLeft(p) != null && daysLeft(p) <= 3).map(p => p.ingId));
  const list = allRecipes().filter(r => suits(r).ok).map(r => ({ r, n: r.ingredients.filter(l => soonIds.has(l.id)).length })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 12);
  openSheet({ title: 'Use it up', body: list.map(x => `<a class="alt" href="#/recipe/${encodeURIComponent(x.r.id)}" style="text-decoration:none;color:var(--ink)"><span class="thumb">${recipeArt(x.r, 64)}</span><span><b>${esc(x.r.name)}</b><br><span class="small muted">Uses ${x.n} expiring item${x.n > 1 ? 's' : ''} · ${totalTime(x.r)} min</span></span><span></span></a>`).join('') || '<p class="muted">No recipes use those items. Try the cookbook search.</p>' });
}
