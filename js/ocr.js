// Read prices from a photo of a shelf label or receipt, on the device (tesseract.js, bundled for offline use).
import { INGREDIENTS } from './data/ingredients.js';

let workerPromise = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the photo reader'));
    document.head.appendChild(s);
  });
}

export async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const base = new URL('vendor/tesseract/', document.baseURI).href;
      await loadScript(base + 'tesseract.min.js');
      return window.Tesseract.createWorker('eng', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base + 'core',
        langPath: base + 'lang',
        gzip: true,
        workerBlobURL: false,
        logger: m => onProgress && onProgress(m),
      });
    })();
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

// Shrink big camera photos and boost contrast, which helps the reader a lot.
export async function prepareImage(file) {
  const bmp = await createImageBitmap(file);
  const max = 2000;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = Math.max(0, Math.min(255, (y - 128) * 1.5 + 128));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export async function readPhoto(file, onProgress) {
  const worker = await getWorker(onProgress);
  const canvas = await prepareImage(file);
  const { data } = await worker.recognize(canvas);
  return data.text || '';
}

// ---------- understanding the text ----------
const STOP = new Set(['the', 'and', 'with', 'pack', 'pk', 'each', 'ea', 'per', 'coles', 'woolworths', 'woolies', 'aldi', 'iga', 'brand', 'value', 'select', 'macro', 'essentials', 'homebrand', 'farmers', 'market', 'fresh', 'australian', 'aus', 'free', 'range', 'special', 'save', 'was', 'now', 'price', 'unit', 'only', 'dollars']);
// Common receipt abbreviations.
const ABBREV = { chkn: 'chicken', chick: 'chicken', brst: 'breast', fil: 'fillet', fllt: 'fillet', mnce: 'mince', bf: 'beef', pk: 'pack', tom: 'tomatoes', toms: 'tomatoes', pot: 'potatoes', spag: 'spaghetti', ched: 'cheese', mozz: 'mozzarella', parm: 'parmesan', yog: 'yoghurt', yogh: 'yoghurt', veg: 'vegetables', mlk: 'milk', btr: 'butter', crm: 'cream', bnls: 'boneless', shldr: 'shoulder', saus: 'sausages', bread: 'bread', w: 'with' };

function tokens(s) {
  return s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).map(w => ABBREV[w] || w).filter(w => w.length > 1 && !STOP.has(w));
}

const INDEX = INGREDIENTS.map(ing => ({ ing, names: [ing.name, ...ing.aka].map(n => tokens(n)) }));

export function matchIngredient(text) {
  const t = tokens(text);
  if (!t.length) return null;
  let best = null;
  for (const { ing, names } of INDEX) {
    for (const n of names) {
      if (!n.length) continue;
      let hit = 0;
      for (const w of n) if (t.some(x => x === w || (w.length > 3 && (x.startsWith(w.slice(0, 4)) || w.startsWith(x)) && x.length > 2))) hit++;
      const score = hit / n.length + (hit === n.length ? 0.5 : 0) + hit * 0.1;
      if (hit && (!best || score > best.score)) best = { ing, score };
    }
  }
  return best && best.score >= 0.7 ? best.ing : null;
}

const SIZE_RE = /(\d+(?:[.,]\d+)?)\s?(kg|g|gm|ml|l|lt|litre|liter|pk|pack|x)\b/i;
export function parseSize(text) {
  const m = text.match(SIZE_RE);
  if (!m) return null;
  let n = parseFloat(m[1].replace(',', '.'));
  const u = m[2].toLowerCase();
  if (u === 'kg') return { size: n * 1000, unit: 'g' };
  if (u === 'g' || u === 'gm') return { size: n, unit: 'g' };
  if (u === 'ml') return { size: n, unit: 'ml' };
  if (u === 'l' || u === 'lt' || u === 'litre' || u === 'liter') return { size: n * 1000, unit: 'ml' };
  return { size: n, unit: 'each' };
}

// Prices like $4.50, 4.50, 4,50, "$4 50" (shelf labels print cents small).
const PRICE_RE = /\$?\s?(\d{1,3})(?:[.,](\d{2})|\s(\d{2})\b)/g;
const UNIT_PRICE_RE = /\$?\s?(\d{1,3}[.,]\d{2})\s*(?:per|\/)\s*(\d*)\s*(kg|g|100g|ml|100ml|l|litre|each|ea)\b/i;

function pricesIn(line) {
  const out = [];
  PRICE_RE.lastIndex = 0;
  let m;
  while ((m = PRICE_RE.exec(line))) {
    const v = parseFloat(m[1] + '.' + (m[2] || m[3]));
    if (v > 0 && v < 500) out.push({ v, idx: m.index, raw: m[0] });
  }
  return out;
}

// Turn OCR text into suggested price entries: [{ text, ing, packSize, packUnit, price }]
export function parsePrices(text) {
  const lines = text.split(/\n+/).map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 1);
  const rows = [];
  let pendingName = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/total|subtotal|gst|eftpos|change|cash|balance|visa|mastercard|savings|rounding|points|flybuys|rewards/i.test(line)) { pendingName = ''; continue; }
    const unitM = line.match(UNIT_PRICE_RE);
    const lineNoUnit = unitM ? line.replace(unitM[0], ' ') : line;
    const prices = pricesIn(lineNoUnit);
    const words = lineNoUnit.replace(PRICE_RE, ' ').replace(/[^A-Za-z0-9.\s]/g, ' ').trim();
    const hasWords = tokens(words).length > 0;
    if (!prices.length) {
      if (hasWords) pendingName = (pendingName ? pendingName + ' ' : '') + words;
      continue;
    }
    // Receipt line "BEEF MINCE 500G 8.00", or a shelf label where the name was on earlier lines.
    const name = hasWords ? words : pendingName;
    pendingName = '';
    if (!name) continue;
    const price = prices[prices.length - 1].v;
    const size = parseSize(name) || parseSize(line);
    const ing = matchIngredient(name);
    const row = { text: name.slice(0, 60), ing: ing ? ing.id : '', price, packSize: null, packUnit: null };
    if (size) { row.packSize = size.size; row.packUnit = size.unit; }
    else if (ing) { row.packSize = ing.packSize; row.packUnit = ing.packUnit; }
    // A per-kg price on the label (e.g. loose produce or deli) when there's no pack size.
    if (unitM && !size) {
      const up = parseFloat(unitM[1].replace(',', '.'));
      const u = unitM[3].toLowerCase();
      if (u === 'kg' && ing && ing.packUnit === 'g') { row.packSize = 1000; row.packUnit = 'g'; row.price = up; row.note = 'per kg'; }
    }
    if (ing && row.packUnit && row.packUnit !== ing.packUnit) {
      // Convert between g and ml roughly; keep 'each' as entered.
      if ((row.packUnit === 'g' && ing.packUnit === 'ml') || (row.packUnit === 'ml' && ing.packUnit === 'g')) row.packUnit = ing.packUnit;
      else if (ing.packUnit === 'each' && row.packUnit !== 'each') { row.packSize = ing.packSize; row.packUnit = 'each'; }
      else if (ing.packUnit !== 'each' && row.packUnit === 'each') { row.packSize = ing.each ? ing.each * row.packSize : ing.packSize; row.packUnit = ing.packUnit; }
    }
    rows.push(row);
  }
  return rows;
}
