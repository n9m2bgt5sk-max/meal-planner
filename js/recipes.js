// The cookbook: bundled recipes + the user's own + saved online recipes, with prices applied.
import { ING, STORES, STATE_FACTOR, stateFromPostcode } from './data/ingredients.js';
import { state } from './store.js';
import { recipeCost, recipeNutrition, recipeFlags, recipeNeeds } from './recipes-core.js';
import classics from './data/recipes/classics.js';
import asian from './data/recipes/asian.js';
import world from './data/recipes/world.js';
import everyday from './data/recipes/everyday.js';

export const BUNDLED = [...classics, ...asian, ...world, ...everyday].map(r => ({ ...r, source: 'cookbook' }));

let cache = null, cacheKey = '';
export function allRecipes() {
  const key = state.customRecipes.length + ':' + state.savedOnline.length + ':' + (state.customRecipes.map(r => r.updated || 0).join(','));
  if (cache && key === cacheKey) return cache;
  cache = [...BUNDLED, ...state.customRecipes.map(r => ({ ...r, source: 'mine' })), ...state.savedOnline.map(r => ({ ...r, source: 'online' }))];
  cacheKey = key;
  return cache;
}

const transient = new Map(); // online recipes viewed but not saved
export function rememberTransient(r) { transient.set(r.id, r); }
export function getRecipe(id) {
  return allRecipes().find(r => r.id === id) || transient.get(id) || (state.onlinePool.items || []).find(r => r.id === id) || null;
}

// ---------- prices ----------
export function regionFactor() {
  const st = state.setup.state || stateFromPostcode(state.setup.postcode);
  return STATE_FACTOR[st] || 1;
}

// Price of an ingredient pack at a store: the user's own captured price wins, else the typical price adjusted.
export function priceInfo(ingId, store = state.setup.primaryStore) {
  const ing = ING[ingId];
  if (!ing) return null;
  const mine = state.prices[ingId] && state.prices[ingId][store];
  if (mine && mine.packPrice > 0 && mine.packSize > 0) return { ...mine, custom: true };
  const f = (STORES[store] ? STORES[store].factor : 1) * regionFactor();
  return { packSize: ing.packSize, packPrice: Math.round(ing.packPrice * f * 100) / 100, custom: false };
}
export function priceOfFor(store) { return id => priceInfo(id, store); }

export function costPerServe(recipe, store) {
  if (recipe._noCost) return null;
  return recipeCost(recipe, recipe.serves, priceOfFor(store || state.setup.primaryStore)) / recipe.serves;
}

const nutCache = new Map();
export function nutritionPerServe(recipe) {
  const k = recipe.id + (recipe.updated || '');
  if (!nutCache.has(k)) nutCache.set(k, recipeNutrition(recipe));
  return nutCache.get(k);
}
const flagCache = new Map();
// Words that flag allergens or meat in free-text ingredient lines (online recipes and your own).
const TEXT_FLAGS = [
  [/\b(flour|bread|pasta|spaghetti|noodle|breadcrumb|wheat|couscous|pastry|tortilla|soy sauce|barley|beer)/, 'gluten'],
  [/\b(milk|cheese|butter|cream|yoghurt|yogurt|parmesan|ghee|mozzarella|cheddar)/, 'dairy'],
  [/\begg/, 'egg'],
  [/\b(almond|cashew|walnut|pecan|hazelnut|pistachio|pine nut|macadamia)/, 'nuts'],
  [/\bpeanut/, 'peanut'],
  [/\b(soy|tofu|edamame|miso)/, 'soy'],
  [/\b(sesame|tahini)/, 'sesame'],
  [/\b(fish|salmon|tuna|anchov|cod|haddock|sardine|mackerel|trout)/, 'fish'],
  [/\b(prawn|shrimp|crab|lobster|mussel|clam|oyster|scallop|squid|calamari)/, 'shellfish'],
];
const MEAT_RE = /\b(chicken|beef|pork|lamb|bacon|ham|sausage|mince|steak|turkey|duck|veal|chorizo|salami|prosciutto|pancetta|goat|venison|gelatin)/;
export function flags(recipe) {
  const k = recipe.id + (recipe.updated || '');
  if (!flagCache.has(k)) {
    const f = recipeFlags(recipe);
    for (const l of recipe.ingredients) {
      const t = (l.text || (l.original ? l.prep : '') || '').toLowerCase();
      if (!t) continue;
      for (const [re, a] of TEXT_FLAGS) if (re.test(t) && !f.allergens.includes(a)) f.allergens.push(a);
      if (MEAT_RE.test(t)) { f.vegetarian = false; f.vegan = false; f.pescatarian = false; }
      if (/\b(fish|salmon|tuna|prawn|shrimp|anchov)/.test(t)) { f.vegetarian = false; f.vegan = false; }
      if (f.allergens.includes('dairy') || f.allergens.includes('egg') || /honey/.test(t)) f.vegan = false;
    }
    flagCache.set(k, f);
  }
  return flagCache.get(k);
}
export { recipeNeeds, recipeCost };

export function totalTime(r) { return (r.prep || 0) + (r.cook || 0); }
export function activeTime(r) { return (r.prep || 0) + Math.max(0, (r.cook || 0) - (r.handsOff || 0)); }

// Does a recipe suit the household's hard rules (allergies, diet, avoid list, equipment)?
export function suits(recipe, setup = state.setup, opts = {}) {
  const f = flags(recipe);
  for (const a of setup.allergies) if (f.allergens.includes(a)) return { ok: false, why: `contains ${a}` };
  if (setup.diet === 'vegetarian' && !f.vegetarian) return { ok: false, why: 'not vegetarian' };
  if (setup.diet === 'vegan' && !f.vegan) return { ok: false, why: 'not vegan' };
  if (setup.diet === 'pescatarian' && !f.pescatarian) return { ok: false, why: 'contains meat' };
  for (const word of setup.avoid) {
    const w = word.toLowerCase().trim();
    if (!w) continue;
    const hit = recipe.ingredients.some(l => {
      if (l.optional) return false;
      if (l.id === w) return true;
      const ing = ING[l.id];
      const names = ing ? [ing.name, ...ing.aka, ing.id] : [l.text || ''];
      return names.some(n => n.toLowerCase().includes(w));
    });
    if (hit) return { ok: false, why: `has ${word}` };
  }
  if (!opts.ignoreEquipment) {
    const missing = (recipe.equipment || []).filter(e => !setup.equipment.includes(e));
    if (missing.length) return { ok: false, why: `needs ${missing.join(', ')}` };
  }
  if ((setup.dislikedCuisines || []).includes(recipe.cuisine) && !opts.ignoreCuisine) return { ok: false, why: `${recipe.cuisine} is on your skip list` };
  return { ok: true };
}

// ---------- pictures ----------
const CUISINE_COLOURS = {
  Italian: ['#e8553d', '#f7d9c4'], Australian: ['#d98b2b', '#f6e3c3'], British: ['#7d6b5d', '#ece2d6'], French: ['#5b6fb5', '#e3e7f6'],
  Greek: ['#2f7fc1', '#dceefb'], 'Middle Eastern': ['#c9772e', '#f7e4cf'], Moroccan: ['#c4552f', '#f6dccd'], Indian: ['#e09a1c', '#fbecc8'],
  Chinese: ['#c8372d', '#f9d8d2'], Thai: ['#3f9b5b', '#d9f0df'], Japanese: ['#d24b5a', '#f9dfe3'], Korean: ['#b5463b', '#f5dcd7'],
  Vietnamese: ['#4f9a6a', '#dcefe2'], Malaysian: ['#c9862e', '#f7e6cc'], Mexican: ['#e0642b', '#fde1cf'], American: ['#c7423a', '#f8dcd8'],
  Mediterranean: ['#3e8aa8', '#d9edf3'], Spanish: ['#d2482c', '#f9dacf'], Other: ['#8a7b6a', '#efe8df'],
};
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

export function recipeArt(recipe, size = 160) {
  if (recipe.photo) {
    return `<img class="art-photo" src="${recipe.photo}" alt="" loading="lazy" referrerpolicy="no-referrer" width="${size}" height="${size}">`;
  }
  const [rim, fill] = CUISINE_COLOURS[recipe.cuisine] || CUISINE_COLOURS.Other;
  const pics = (recipe.picture && recipe.picture.length ? recipe.picture : ['🍽️']).slice(0, 3);
  const h = hash(recipe.id);
  const rot = (h % 30) - 15;
  const small = pics.slice(1).map((p, i) => {
    const ang = ((h >> (i * 3)) % 360) * Math.PI / 180;
    const x = 80 + Math.cos(ang + i * 2.2) * 46, y = 80 + Math.sin(ang + i * 2.2) * 46;
    return `<text x="${x.toFixed(0)}" y="${y.toFixed(0)}" font-size="30" text-anchor="middle" dominant-baseline="central">${p}</text>`;
  }).join('');
  return `<svg class="art" viewBox="0 0 160 160" width="${size}" height="${size}" role="img" aria-label="${escapeAttr(recipe.name)}">
    <circle cx="80" cy="80" r="78" fill="${fill}"/>
    <circle cx="80" cy="80" r="66" fill="#fffdf8" stroke="${rim}" stroke-width="5"/>
    <circle cx="80" cy="80" r="54" fill="none" stroke="${rim}" stroke-opacity=".25" stroke-width="2" stroke-dasharray="3 5"/>
    <g transform="rotate(${rot} 80 80)"><text x="80" y="84" font-size="64" text-anchor="middle" dominant-baseline="central">${pics[0]}</text></g>
    ${small}
  </svg>`;
}
export function escapeAttr(s) { return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
