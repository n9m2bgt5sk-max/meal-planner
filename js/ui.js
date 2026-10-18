// Small UI helpers: escaping, sheets (dialogs), toasts, sharing and downloads.
export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let sheetStack = [];
export function openSheet({ title, body, foot = '', wide = false, onClose, id = '' }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${id ? `id="${id}"` : ''}>
    <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body">${body}</div>
    ${foot ? `<div class="sheet-foot">${foot}</div>` : ''}
  </div>`;
  const close = () => {
    wrap.remove();
    sheetStack = sheetStack.filter(s => s !== api);
    document.body.style.overflow = sheetStack.length ? 'hidden' : '';
    onClose && onClose();
  };
  wrap.addEventListener('click', e => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
  });
  document.body.appendChild(wrap);
  document.body.style.overflow = 'hidden';
  const api = { el: wrap.querySelector('.sheet'), close, setBody(html) { wrap.querySelector('.sheet-body').innerHTML = html; }, setFoot(html) {
    let f = wrap.querySelector('.sheet-foot');
    if (!f) { f = document.createElement('div'); f.className = 'sheet-foot'; wrap.querySelector('.sheet').appendChild(f); }
    f.innerHTML = html;
  } };
  sheetStack.push(api);
  setTimeout(() => { const f = wrap.querySelector('.sheet-body input, .sheet-body select'); if (f && !('ontouchstart' in window)) f.focus({ preventScroll: true }); }, 50);
  return api;
}
export function closeAllSheets() { [...sheetStack].forEach(s => s.close()); }
export function topSheet() { return sheetStack[sheetStack.length - 1]; }

let toastTimer;
export function toast(msg, action) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { action.run(); t.remove(); };
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), action ? 6000 : 3000);
}

export function confirmSheet(title, message, okLabel = 'OK', danger = false) {
  return new Promise(res => {
    let answered = false;
    const s = openSheet({
      title, body: `<p>${esc(message)}</p>`,
      foot: `<button class="btn" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button>`,
      onClose: () => { if (!answered) res(false); },
    });
    s.el.querySelector('[data-ok]').onclick = () => { answered = true; s.close(); res(true); };
  });
}

// Share text via the iOS share sheet (Reminders shortcut, Messages, Notes...). Falls back to copying.
export async function shareText(text, title) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  await copyText(text);
  return 'copied';
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (err) {}
    ta.remove();
    return true;
  }
}

// Share a file (Word doc, backup) to Files/Word/AirDrop; falls back to a download.
export async function shareFile(blob, name, title) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

export function pickFile(accept, capture) {
  return new Promise(res => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    if (capture) input.setAttribute('capture', capture);
    input.style.position = 'fixed'; input.style.left = '-1000px';
    input.onchange = () => { res(input.files && input.files[0]); input.remove(); };
    document.body.appendChild(input);
    input.click();
  });
}

// A checkbox inside a 44px tap target.
export function tickHtml(attrs, checked, label) {
  return `<label class="tick"><input type="checkbox" ${attrs} ${checked ? 'checked' : ''} aria-label="${esc(label)}"></label>`;
}
export function switchHtml(name, checked, label, sub = '') {
  return `<label class="switch"><span><b>${esc(label)}</b>${sub ? `<br><span class="small muted">${esc(sub)}</span>` : ''}</span><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span class="track"></span></label>`;
}
export function stepperHtml(name, value, min = 0, max = 99, step = 1, label = '') {
  return `<span class="stepper" data-stepper="${name}" data-min="${min}" data-max="${max}" data-step="${step}" role="group" aria-label="${esc(label || name)}">
    <button type="button" data-dec aria-label="Less">−</button><span class="val" data-val>${value}</span><button type="button" data-inc aria-label="More">+</button></span>`;
}
// Wire up steppers inside a root; onChange(name, value)
export function bindSteppers(root, onChange) {
  root.querySelectorAll('[data-stepper]').forEach(st => {
    const name = st.dataset.stepper, min = +st.dataset.min, max = +st.dataset.max, step = +st.dataset.step;
    const val = st.querySelector('[data-val]');
    const set = v => { v = Math.max(min, Math.min(max, Math.round(v * 100) / 100)); val.textContent = v; onChange(name, v, st); };
    st.querySelector('[data-dec]').onclick = () => set(parseFloat(val.textContent) - step);
    st.querySelector('[data-inc]').onclick = () => set(parseFloat(val.textContent) + step);
  });
}
