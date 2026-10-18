// Recipe calculations shared by the app and the validator: cost, nutrition, allergens, diet.
import { ING, ANIMAL } from './data/ingredients.js';
import { toBase, baseToGrams } from './units.js';

export const LEFTOVER_KEYS = ['bolognese-sauce', 'roast-chicken', 'cooked-rice', 'pulled-pork', 'chilli-con-carne', 'roast-lamb', 'roast-veg', 'beef-ragu', 'curry-sauce', 'mashed-potato', 'cooked-pasta'];
export const CUISINES = ['Italian', 'Australian', 'British', 'French', 'Greek', 'Spanish', 'Middle Eastern', 'Moroccan', 'Indian', 'Chinese', 'Thai', 'Japanese', 'Korean', 'Vietnamese', 'Malaysian', 'Mexican', 'American', 'Mediterranean', 'Other'];
export const EQUIPMENT = ['stovetop', 'oven', 'grill', 'bbq', 'slow-cooker', 'pressure-cooker', 'air-fryer', 'microwave', 'blender', 'food-processor', 'stand-mixer', 'wok'];
export const MEALS = ['breakfast', 'lunch', 'dinner', 'side', 'dessert', 'snack'];
export const UNITS = ['g', 'ml', 'each', 'tsp', 'tbsp', 'cup', 'pinch'];
export const THEMES = ['italian-night', 'mexican-fiesta', 'asian-feast', 'indian-banquet', 'aussie-bbq', 'greek-feast', 'american-diner', 'christmas', 'easter', 'halloween', 'birthday', 'kids-party', 'movie-night', 'game-day', 'high-tea', 'brunch-party', 'australia-day', 'melbourne-cup', 'mothers-day', 'fathers-day', 'valentines'];
export const TAGS = ['comfort', 'light', 'fresh', 'healthy', 'high-protein', 'budget', 'quick', 'one-pot', 'tray-bake', 'crowd-pleaser', 'make-ahead', 'lunchbox', 'finger-food', 'brunch', 'picnic', 'date-night', 'salad', 'soup', 'pasta', 'rice', 'noodles', 'roast', 'bbq', 'curry', 'stir-fry', 'baked', 'summer', 'winter', 'spring', 'autumn', ...THEMES];

// Per-unit price of an ingredient in its pack unit, using a price lookup (custom prices override defaults).
export function unitPrice(ingId, priceOf) {
  const ing = ING[ingId];
  if (!ing) return 0;
  const p = priceOf ? priceOf(ingId) : { packSize: ing.packSize, packPrice: ing.packPrice };
  return p.packPrice / p.packSize;
}

// Base quantities (pack units) per ingredient for a recipe at a number of servings.
// opts.skip: Set of ingredient ids to leave out (covered by leftovers); opts.extra: [{scale, portions}] to add.
export function recipeNeeds(recipe, servings, opts = {}) {
  const factor = servings / recipe.serves;
  const out = {};
  for (const line of recipe.ingredients) {
    if (opts.skip && opts.skip.has(line.id)) continue;
    if (!ING[line.id]) continue;
    let f = factor;
    if (opts.extra) for (const ex of opts.extra) if (ex.scale.includes(line.id)) f += ex.portions / recipe.serves;
    out[line.id] = (out[line.id] || 0) + toBase(line.id, line.qty, line.unit) * f;
  }
  return out;
}

export function recipeCost(recipe, servings, priceOf, opts = {}) {
  const needs = recipeNeeds(recipe, servings, opts);
  let total = 0;
  for (const [id, q] of Object.entries(needs)) {
    const line = recipe.ingredients.find(l => l.id === id);
    if (line && line.optional && !opts.includeOptional) continue;
    total += q * unitPrice(id, priceOf);
  }
  return total;
}

export function recipeNutrition(recipe) {
  const n = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, sodium: 0 };
  for (const line of recipe.ingredients) {
    const ing = ING[line.id];
    if (!ing || line.optional) continue;
    if (ing.id === 'salt') continue; // seasoning "to taste" is excluded from sodium
    const g = baseToGrams(line.id, toBase(line.id, line.qty, line.unit));
    // Stock, frying oil and marinades are partly discarded; count them at a reduced rate.
    let useRate = 1;
    if (ing.id === 'vegetable-oil' && g > 60) useRate = 0.3;
    for (const k of Object.keys(n)) n[k] += (ing.nutrition[k] * g * useRate) / 100;
  }
  const per = {};
  for (const k of Object.keys(n)) per[k] = n[k] / recipe.serves;
  return per;
}

export function recipeFlags(recipe) {
  const allergens = new Set();
  const animals = new Set();
  let honey = false;
  for (const line of recipe.ingredients) {
    const ing = ING[line.id];
    if (!ing || line.optional) continue;
    for (const f of ing.flags) {
      if (ANIMAL.includes(f)) animals.add(f);
      if (['gluten', 'dairy', 'egg', 'nuts', 'peanut', 'soy', 'sesame', 'fish', 'shellfish'].includes(f)) allergens.add(f);
      if (f === 'honey') honey = true;
    }
  }
  const vegetarian = animals.size === 0;
  const pescatarian = [...animals].every(a => a === 'fish' || a === 'shellfish');
  const vegan = vegetarian && !allergens.has('dairy') && !allergens.has('egg') && !honey;
  return { allergens: [...allergens], animals: [...animals], vegetarian, vegan, pescatarian };
}
