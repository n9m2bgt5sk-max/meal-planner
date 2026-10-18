// Online recipes from TheMealDB (free, no account), converted into cookbook recipes with estimated costs.
import { matchIngredient } from './ocr.js';
import { ING } from './data/ingredients.js';

const API = 'https://www.themealdb.com/api/json/v1/1/';

const AREA_TO_CUISINE = {
  American: 'American', British: 'British', Canadian: 'American', Chinese: 'Chinese', Croatian: 'Other', Dutch: 'Other', Egyptian: 'Middle Eastern',
  Filipino: 'Other', French: 'French', Greek: 'Greek', Indian: 'Indian', Irish: 'British', Italian: 'Italian', Jamaican: 'Other', Japanese: 'Japanese',
  Kenyan: 'Other', Malaysian: 'Malaysian', Mexican: 'Mexican', Moroccan: 'Moroccan', Polish: 'Other', Portuguese: 'Spanish', Russian: 'Other',
  Spanish: 'Spanish', Thai: 'Thai', Tunisian: 'Moroccan', Turkish: 'Middle Eastern', Ukrainian: 'Other', Vietnamese: 'Vietnamese', Australian: 'Australian',
  Norwegian: 'Other', Saudi: 'Middle Eastern', Syrian: 'Middle Eastern', Venezulan: 'Other', Argentinian: 'Other', Uruguayan: 'Other',
};
export const CUISINE_TO_AREA = { American: 'American', British: 'British', Chinese: 'Chinese', French: 'French', Greek: 'Greek', Indian: 'Indian', Italian: 'Italian', Japanese: 'Japanese', Malaysian: 'Malaysian', Mexican: 'Mexican', Moroccan: 'Moroccan', Spanish: 'Spanish', Thai: 'Thai', Vietnamese: 'Vietnamese', 'Middle Eastern': 'Turkish', Australian: 'Australian' };

async function get(path) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(API + path, { signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
function parseNumber(s) {
  s = s.trim();
  for (const [k, v] of Object.entries(FRACTIONS)) if (s.includes(k)) return (parseFloat(s.replace(k, '')) || 0) + v;
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (mixed) return +mixed[1] + mixed[2] / mixed[3];
  const frac = s.match(/^(\d+)\/(\d+)/);
  if (frac) return frac[1] / frac[2];
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// "500g", "2 tbs", "1 cup", "3", "1/2 tsp", "1kg", "400ml" -> { qty, unit }
export function parseMeasure(m) {
  const s = (m || '').toLowerCase().trim();
  if (!s) return null;
  const n = parseNumber(s);
  if (n == null) return null;
  const rest = s.replace(/^[\d\s./½¼¾⅓⅔⅛]+/, '').trim();
  if (/^kg/.test(rest)) return { qty: n * 1000, unit: 'g' };
  if (/^(g|gr|gram)/.test(rest)) return { qty: n, unit: 'g' };
  if (/^(lb|pound)/.test(rest)) return { qty: n * 454, unit: 'g' };
  if (/^oz/.test(rest)) return { qty: n * 28, unit: 'g' };
  if (/^(ml|millil)/.test(rest)) return { qty: n, unit: 'ml' };
  if (/^(l\b|litre|liter)/.test(rest)) return { qty: n * 1000, unit: 'ml' };
  if (/^(tbs|tbsp|tablespoon)/.test(rest)) return { qty: n * 0.75, unit: 'tbsp' }; // US 15 ml -> AU 20 ml tbsp
  if (/^(tsp|teaspoon)/.test(rest)) return { qty: n, unit: 'tsp' };
  if (/^cup/.test(rest)) return { qty: n, unit: 'cup' };
  if (/^(pinch|dash)/.test(rest)) return { qty: n, unit: 'pinch' };
  if (/^(clove)/.test(rest)) return { qty: n, unit: 'each' };
  if (!rest || /^(large|medium|small|whole|piece|pieces|can|tin|x)/.test(rest)) return { qty: n, unit: 'each' };
  return { qty: n, unit: 'each' };
}

export function convertMeal(m) {
  const ingredients = [];
  let matched = 0, total = 0;
  for (let i = 1; i <= 20; i++) {
    const name = (m['strIngredient' + i] || '').trim();
    const measure = (m['strMeasure' + i] || '').trim();
    if (!name) continue;
    total++;
    const ing = matchIngredient(name);
    const q = parseMeasure(measure);
    if (ing && q) {
      // A countable amount of something we buy by weight: use the ingredient's typical piece size.
      let { qty, unit } = q;
      if (unit === 'each' && ing.packUnit !== 'each' && !ing.each) { qty = qty * 100; unit = ing.packUnit === 'ml' ? 'ml' : 'g'; }
      ingredients.push({ id: ing.id, qty, unit, prep: `${measure} ${name}`.trim(), original: true });
      matched++;
    } else {
      ingredients.push({ text: `${measure} ${name}`.trim() });
    }
  }
  const steps = (m.strInstructions || '').split(/\r?\n+/).map(s => s.replace(/^(step\s*\d+[:.)]?|\d+[.)])\s*/i, '').trim()).filter(s => s.length > 3);
  const cat = (m.strCategory || '').toLowerCase();
  const meal = cat === 'breakfast' ? ['breakfast'] : cat === 'dessert' ? ['dessert'] : cat === 'side' || cat === 'starter' ? ['side'] : ['dinner'];
  const tags = (m.strTags || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  return {
    id: 'mdb-' + m.idMeal,
    name: m.strMeal,
    description: `${m.strArea || ''} ${m.strCategory || ''} recipe from TheMealDB.`.trim(),
    cuisine: AREA_TO_CUISINE[m.strArea] || 'Other',
    meal, serves: 4, prep: 20, cook: 40, effort: 2, spice: 0, kidFriendly: false,
    equipment: ['stovetop'], tags: tags.filter(t => /^[a-z-]+$/.test(t)), weather: 'any',
    ingredients, steps: steps.length ? steps : [m.strInstructions || ''],
    photo: m.strMealThumb ? m.strMealThumb + '/medium' : null,
    picture: ['🍽️'],
    sourceUrl: m.strSource || '',
    video: m.strYoutube || '',
    source: 'online',
    estimated: { matched, total },
    approxTime: true,
  };
}

export async function searchOnline(q) {
  const data = await get('search.php?s=' + encodeURIComponent(q));
  return (data.meals || []).map(convertMeal);
}
export async function lookup(id) {
  const data = await get('lookup.php?i=' + encodeURIComponent(String(id).replace('mdb-', '')));
  return data.meals && data.meals[0] ? convertMeal(data.meals[0]) : null;
}
export async function byArea(cuisine, max = 6) {
  const area = CUISINE_TO_AREA[cuisine];
  if (!area) return [];
  const data = await get('filter.php?a=' + encodeURIComponent(area));
  const list = (data.meals || []).sort(() => Math.random() - 0.5).slice(0, max);
  const full = await Promise.all(list.map(x => lookup(x.idMeal).catch(() => null)));
  return full.filter(Boolean);
}
export async function randomMeals(n = 4) {
  const out = await Promise.all(Array.from({ length: n }, () => get('random.php').then(d => d.meals && convertMeal(d.meals[0])).catch(() => null)));
  return out.filter(Boolean);
}

// A fresh pool of online ideas for planning, leaning to the cuisines the household likes.
export async function refreshPool(cuisines) {
  const want = cuisines.length ? cuisines : ['Italian', 'Mexican', 'Indian', 'Thai', 'British', 'American'];
  const pick = want.filter(c => CUISINE_TO_AREA[c]).sort(() => Math.random() - 0.5).slice(0, 3);
  const lists = await Promise.all(pick.map(c => byArea(c, 5).catch(() => [])));
  const items = lists.flat().filter(r => r.meal.includes('dinner') && r.estimated.matched >= Math.max(2, r.estimated.total * 0.5));
  return items;
}

export function hasIngredient(id) { return !!ING[id]; }
