// Automatic sync between devices through the household's own free Firebase project.
// Each household shares one Firestore document, named by a long random code that only its devices know.
import { state, save, onChange } from './store.js';
import { merge } from './sync.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const LOCAL_KEY = 'mealplanner.sync';  // kept out of the synced data: it's this device's connection
const DEVICE_ONLY_SETUP = ['theme', 'textSize'];

let conn = null;        // { push(payload), close() }
let status = { state: 'off', message: 'Not set up', last: 0 };
let statusListeners = [];
let pushTimer = null, applyingRemote = false, lastPushed = '', lastSetupHash = '';

export function syncConfig() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch (e) { return null; }
}
function setConfig(c) { if (c) localStorage.setItem(LOCAL_KEY, JSON.stringify(c)); else localStorage.removeItem(LOCAL_KEY); }
export function syncStatus() { return status; }
export function onStatus(fn) { statusListeners.push(fn); }
function setStatus(s, message) { status = { ...status, state: s, message, last: s === 'ok' ? Date.now() : status.last }; statusListeners.forEach(f => f(status)); }

// Accepts the "firebaseConfig = { ... }" snippet copied from the Firebase console.
export function parseFirebaseConfig(text) {
  const get = k => { const m = String(text).match(new RegExp(k + '\\s*["\']?\\s*:\\s*["\']([^"\']+)["\']')); return m ? m[1] : ''; };
  const c = { apiKey: get('apiKey'), authDomain: get('authDomain'), projectId: get('projectId'), appId: get('appId') };
  if (!c.apiKey || !c.projectId || !c.appId) return null;
  if (!c.authDomain) c.authDomain = c.projectId + '.firebaseapp.com';
  return c;
}

export function newHouseholdCode() {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}

export function joinLink() {
  const c = syncConfig();
  if (!c) return '';
  const payload = btoa(JSON.stringify({ f: c.firebase, h: c.household }));
  return `${location.origin}${location.pathname}#/join?c=${encodeURIComponent(payload)}`;
}
export function decodeJoin(code) {
  try { const d = JSON.parse(atob(decodeURIComponent(code))); if (d.f && d.h) return { firebase: d.f, household: d.h }; } catch (e) {}
  return null;
}

// What gets shared: everything except this device's id and connection.
function payloadOf() {
  const { deviceId, ...rest } = state;
  return rest;
}
function comparable(p) { const { updatedAt, ...rest } = p; return JSON.stringify(rest); }

function setupHash() { const s = { ...state.setup }; DEVICE_ONLY_SETUP.forEach(k => delete s[k]); return JSON.stringify([s, state.budget]); }

function applyRemote(remote) {
  if (!remote) return false;
  const before = comparable(payloadOf());
  applyingRemote = true;
  try {
    // Household setup and budget: whichever device changed them last wins.
    if ((remote.setupAt || 0) > (state.setupAt || 0) && remote.setup) {
      const keep = {}; DEVICE_ONLY_SETUP.forEach(k => { keep[k] = state.setup[k]; });
      state.setup = { ...state.setup, ...remote.setup, ...keep };
      if (remote.budget) state.budget = remote.budget;
      state.setupAt = remote.setupAt;
      lastSetupHash = setupHash();
    }
    merge(remote);
  } finally { applyingRemote = false; }
  return comparable(payloadOf()) !== before;
}

async function firebaseAdapter(cfg, onRemote) {
  const [{ initializeApp, getApps, deleteApp }, { getAuth, signInAnonymously }, fs] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js'),
  ]);
  for (const a of getApps()) await deleteApp(a);
  const app = initializeApp(cfg.firebase);
  await signInAnonymously(getAuth(app));
  const db = fs.getFirestore(app);
  const ref = fs.doc(db, 'households', cfg.household);
  const first = await fs.getDoc(ref);
  const unsub = fs.onSnapshot(ref, snap => {
    if (snap.metadata.hasPendingWrites || !snap.exists()) return;
    const d = snap.data();
    if (d.by === state.deviceId) return;
    onRemote(JSON.parse(d.data));
  }, err => setStatus('error', friendlyError(err)));
  return {
    initial: first.exists() ? JSON.parse(first.data().data) : null,
    push: async payload => fs.setDoc(ref, { data: JSON.stringify(payload), updatedAt: Date.now(), by: state.deviceId }),
    close: async () => { unsub(); await deleteApp(app); },
  };
}

function friendlyError(e) {
  const m = String(e && (e.code || e.message) || e);
  if (/permission/i.test(m)) return 'Firebase refused access. Check the security rules and that Anonymous sign-in is turned on.';
  if (/admin-restricted|operation-not-allowed/i.test(m)) return 'Turn on Anonymous sign-in in Firebase (Authentication › Sign-in method).';
  if (/api-key|invalid/i.test(m)) return 'The Firebase settings look wrong. Copy them again from the Firebase console.';
  if (/network|offline|unavailable|failed to fetch/i.test(m)) return 'Offline – changes will sync when you’re back online.';
  return 'Sync problem: ' + m;
}

function schedulePush(delay = 1500) {
  if (!conn || applyingRemote) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, delay);
}
export async function pushNow() {
  if (!conn) return;
  const h = setupHash();
  if (h !== lastSetupHash) { state.setupAt = Date.now(); lastSetupHash = h; }
  const p = payloadOf();
  const cmp = comparable(p);
  if (cmp === lastPushed) return;
  const size = cmp.length;
  if (size > 900000) { setStatus('error', 'Your data is too big to sync. Clear old history in Settings.'); return; }
  try { setStatus('syncing', 'Syncing…'); await conn.push(p); lastPushed = cmp; setStatus('ok', 'Up to date'); }
  catch (e) { setStatus('error', friendlyError(e)); }
}

// Connect using the saved config. Returns true when connected.
export async function connect(cfg = syncConfig()) {
  if (!cfg) { setStatus('off', 'Not set up'); return false; }
  await disconnect(false);
  setStatus('syncing', 'Connecting…');
  try {
    const adapter = window.__mockCloud ? window.__mockCloud : firebaseAdapter;
    const c = await adapter(cfg, remote => {
      const changed = applyRemote(remote);
      lastPushed = comparable(remote);
      if (changed) { save(); window.dispatchEvent(new CustomEvent('mp-remote-change')); schedulePush(); }
      setStatus('ok', 'Up to date');
    });
    conn = c;
    setConfig(cfg);
    lastSetupHash = setupHash();
    if (c.initial) {
      // A device that is joining takes the household's setup as it is.
      if (!state.setup.done) { state.setupAt = 0; }
      applyRemote(c.initial);
      if (c.initial.setup && c.initial.setup.done) state.setup.done = true;
      save(); window.dispatchEvent(new CustomEvent('mp-remote-change'));
    }
    if (!state.setupAt) state.setupAt = Date.now();
    await pushNow();
    setStatus('ok', 'Up to date');
    return true;
  } catch (e) {
    conn = null;
    setStatus('error', friendlyError(e));
    return false;
  }
}

export async function disconnect(forget = true) {
  if (conn) { try { await conn.close(); } catch (e) {} }
  conn = null;
  if (forget) { setConfig(null); setStatus('off', 'Not set up'); }
}

export function startSync() {
  onChange(() => schedulePush());
  window.addEventListener('online', () => { if (syncConfig() && !conn) connect(); else schedulePush(0); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pushNow(); });
  if (syncConfig()) connect();
}
