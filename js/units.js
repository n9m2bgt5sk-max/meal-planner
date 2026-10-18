// Quantity conversion and formatting (metric / imperial).
import { ING } from './data/ingredients.js';

// Australian measures: tablespoon is 20 ml.
export const VOLUME_ML = { tsp: 5, tbsp: 20, cup: 250, ml: 1, l: 1000 };
export const MASS_G = { g: 1, kg: 1000, pinch: 0.5 };

// Convert a recipe quantity into the ingredient's pack unit (g, ml or each).
export function toBase(ingId, qty, unit) {
  const ing = ING[ingId];
  if (!ing) return 0;
  const target = ing.packUnit;
  let grams = null, ml = null, each = null;
  if (unit in MASS_G) grams = qty * MASS_G[unit];
  else if (unit in VOLUME_ML) ml = qty * VOLUME_ML[unit];
  else if (unit === 'each') each = qty;
  if (target === 'g') {
    if (grams != null) return grams;
    if (ml != null) return ml * ing.density;
    return each * (ing.each || 100);
  }
  if (target === 'ml') {
    if (ml != null) return ml;
    if (grams != null) return grams / ing.density;
    return each * (ing.each || 100);
  }
  // target 'each'
  if (each != null) return each;
  const g = grams != null ? grams : ml * ing.density;
  return g / (ing.each || 100);
}

// Grams of an ingredient for a quantity in its pack unit (used for nutrition).
export function baseToGrams(ingId, baseQty) {
  const ing = ING[ingId];
  if (!ing) return 0;
  if (ing.packUnit === 'g') return baseQty;
  if (ing.packUnit === 'ml') return baseQty * ing.density;
  return baseQty * (ing.each || 100);
}

function trimNum(n, dp = 1) {
  if (n >= 100) return String(Math.round(n));
  const f = Math.pow(10, dp);
  return String(Math.round(n * f) / f);
}

// Nice fractions for spoons, cups and pieces.
export function niceFraction(n) {
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  const opts = [[0, ''], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']];
  let best = opts[0], bd = 9;
  for (const o of opts) { const d = Math.abs(frac - o[0]); if (d < bd) { bd = d; best = o; } }
  let w = whole + (best[0] === 1 ? 1 : 0);
  if (w === 0 && best[1] === '') return n > 0 ? (n < 0.2 ? '⅛' : '¼') : '0';
  return (w ? String(w) : '') + best[1];
}

function roundMetric(v, unit) {
  if (unit === 'g' || unit === 'ml') {
    if (v >= 1000) return { v: trimNum(v / 1000, 2), u: unit === 'g' ? 'kg' : 'L' };
    if (v >= 100) return { v: String(Math.round(v / 5) * 5), u: unit };
    if (v >= 10) return { v: String(Math.round(v)), u: unit };
    return { v: trimNum(v, 1), u: unit };
  }
  return { v: trimNum(v), u: unit };
}

function pluralName(ing, n) {
  const one = ing.eachName || ing.name.toLowerCase();
  if (n <= 1 + 1e-9) return one;
  if (ing.plural) return ing.plural;
  if (/(ch|sh|s|x)$/.test(one)) return one + 'es';
  if (/[^aeiou]y$/.test(one)) return one.slice(0, -1) + 'ies';
  return one + 's';
}

// Format a recipe line quantity. system: 'metric' | 'imperial'
export function formatQty(ingId, qty, unit, system = 'metric') {
  const ing = ING[ingId];
  if (!ing || !qty) return '';
  if (unit === 'pinch') return qty <= 1 ? 'a pinch of' : `${niceFraction(qty)} pinches of`;
  if (unit === 'each') {
    return `${niceFraction(qty)} ${pluralName(ing, qty)}`;
  }
  if (unit === 'tsp' || unit === 'tbsp' || unit === 'cup') {
    if (system === 'imperial' && unit === 'tbsp') {
      // An Australian tbsp is 4 tsp; US cooks know tablespoons as 15 ml, so show tsp-accurate amounts.
      const tsp = qty * 4;
      if (tsp >= 3) return `${niceFraction(tsp / 3)} US tbsp`;
      return `${niceFraction(tsp)} tsp`;
    }
    const label = unit === 'cup' ? (qty > 1 ? 'cups' : 'cup') : unit;
    return `${niceFraction(qty)} ${label}`;
  }
  if (system === 'imperial') {
    if (unit === 'g' || unit === 'kg') {
      const g = qty * (unit === 'kg' ? 1000 : 1);
      const oz = g / 28.3495;
      if (oz >= 16) return `${trimNum(oz / 16, 2)} lb`;
      return `${oz < 1 ? trimNum(oz, 2) : trimNum(oz, 1)} oz`;
    }
    if (unit === 'ml' || unit === 'l') {
      const ml = qty * (unit === 'l' ? 1000 : 1);
      if (ml >= 120) return `${niceFraction(ml / 236.6)} US cups`;
      return `${trimNum(ml / 29.57, 1)} fl oz`;
    }
  }
  const r = roundMetric(qty, unit === 'kg' ? 'g' : unit === 'l' ? 'ml' : unit);
  return `${r.v} ${r.u}`;
}

// Format an amount already in pack units (for shopping lists and pantry).
export function formatBase(ingId, base, system = 'metric') {
  const ing = ING[ingId];
  if (!ing) return String(base);
  if (ing.packUnit === 'each') return `${niceFraction(base)} ${pluralName(ing, base)}`;
  if (ing.eachName && ing.each && base >= ing.each * 0.75 && ing.aisle === 'Fruit & Veg') {
    const n = base / ing.each;
    return `${niceFraction(Math.max(n, 0.25))} ${pluralName(ing, n)}`;
  }
  return formatQty(ingId, base, ing.packUnit, system);
}

// Convert temperatures written in recipe steps ("180°C") to Fahrenheit when imperial.
export function convertText(text, system) {
  if (system !== 'imperial') return text;
  return text
    .replace(/(\d{2,3})\s?°C(?:\s?\((?:fan[- ]forced|fan)\))?/gi, (m, c) => {
      const f = Math.round((c * 9) / 5 + 32);
      return `${Math.round(f / 25) * 25}°F` + (/fan/i.test(m) ? ' (fan)' : '');
    })
    .replace(/(\d+(?:\.\d+)?)\s?cm\b/g, (m, cm) => `${trimNum(cm / 2.54, 1)} in`)
    .replace(/(\d+(?:\.\d+)?)\s?kg\b/g, (m, kg) => `${trimNum(kg * 2.2046, 1)} lb`)
    .replace(/(\d+(?:\.\d+)?)\s?g\b/g, (m, g) => `${trimNum(g / 28.35, 1)} oz`)
    .replace(/(\d+(?:\.\d+)?)\s?ml\b/g, (m, ml) => `${trimNum(ml / 29.57, 1)} fl oz`);
}

export function money(n) {
  if (n == null || isNaN(n)) return '–';
  return '$' + n.toFixed(2);
}
