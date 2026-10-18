// Validates recipe files: node tests/validate-recipes.mjs [file ...]
import { readdirSync } from 'fs';
import { resolve } from 'path';
import { ING } from '../js/data/ingredients.js';
import { LEFTOVER_KEYS, CUISINES, EQUIPMENT, MEALS, UNITS, TAGS, recipeCost, recipeNutrition, recipeFlags } from '../js/recipes-core.js';

const dir = resolve('js/data/recipes');
const files = process.argv.slice(2).length ? process.argv.slice(2).map(f => resolve(f)) : readdirSync(dir).filter(f => f.endsWith('.js')).map(f => resolve(dir, f));
let errors = 0, count = 0;
const ids = new Set();
const makes = new Set(), uses = new Set();
const err = (r, m) => { errors++; console.log(`  ✗ ${r}: ${m}`); };
for (const file of files) {
  const mod = await import('file://' + file);
  const list = mod.default;
  console.log(`${file.split('/').pop()}: ${list.length} recipes`);
  for (const r of list) {
    count++;
    const id = r.id || '(no id)';
    if (!/^[a-z0-9-]+$/.test(r.id || '')) err(id, 'bad id');
    if (ids.has(r.id)) err(id, 'duplicate id'); ids.add(r.id);
    for (const k of ['name', 'description', 'cuisine', 'meal', 'serves', 'prep', 'cook', 'effort', 'spice', 'equipment', 'tags', 'weather', 'ingredients', 'steps', 'picture']) if (r[k] === undefined) err(id, `missing ${k}`);
    if (!CUISINES.includes(r.cuisine)) err(id, `cuisine ${r.cuisine}`);
    for (const m of r.meal || []) if (!MEALS.includes(m)) err(id, `meal ${m}`);
    for (const e of r.equipment || []) if (!EQUIPMENT.includes(e)) err(id, `equipment ${e}`);
    for (const t of r.tags || []) if (!TAGS.includes(t)) err(id, `tag ${t}`);
    if (!['hot', 'cold', 'any'].includes(r.weather)) err(id, `weather ${r.weather}`);
    if (![1, 2, 3].includes(r.effort)) err(id, 'effort');
    if (![0, 1, 2, 3].includes(r.spice)) err(id, 'spice');
    if (!Array.isArray(r.steps) || r.steps.length < 2) err(id, 'steps');
    for (const l of r.ingredients || []) {
      if (!ING[l.id]) err(id, `unknown ingredient ${l.id}`);
      if (!UNITS.includes(l.unit)) err(id, `unit ${l.unit} (${l.id})`);
      if (!(l.qty > 0)) err(id, `qty ${l.qty} (${l.id})`);
    }
    for (const mk of r.makes || []) {
      if (!LEFTOVER_KEYS.includes(mk.key)) err(id, `makes key ${mk.key}`);
      makes.add(mk.key);
      for (const s of mk.scale || []) if (!r.ingredients.some(l => l.id === s)) err(id, `makes.scale ${s} not in ingredients`);
    }
    if (r.uses) {
      if (!LEFTOVER_KEYS.includes(r.uses.key)) err(id, `uses key ${r.uses.key}`);
      uses.add(r.uses.key);
      for (const s of r.uses.replaces || []) if (!r.ingredients.some(l => l.id === s)) err(id, `uses.replaces ${s} not in ingredients`);
    }
    if (r.ingredients) {
      const n = recipeNutrition(r), c = recipeCost(r, r.serves) / r.serves, f = recipeFlags(r);
      const main = (r.meal || []).includes('dinner');
      if (main && (n.kcal < 250 || n.kcal > 1200)) err(id, `kcal/serve looks off: ${n.kcal.toFixed(0)}`);
      if (process.env.VERBOSE) console.log(`    ${r.id}: ${n.kcal.toFixed(0)} kcal, P${n.protein.toFixed(0)} $${c.toFixed(2)}/serve ${f.vegetarian ? 'veg' : ''} [${f.allergens}]`);
    }
  }
}
console.log(`\n${count} recipes, ${errors} problems. Leftovers made: ${[...makes]} | used: ${[...uses]}`);
process.exit(errors ? 1 : 0);
