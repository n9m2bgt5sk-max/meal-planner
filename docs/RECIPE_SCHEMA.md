# Recipe file format

Each file `js/data/recipes/<group>.js` is an ES module:

```js
export default [
  {
    id: 'spaghetti-bolognese',            // unique kebab-case
    name: 'Spaghetti Bolognese',
    description: 'One or two warm sentences, like a cookbook intro.',
    cuisine: 'Italian',                   // see CUISINES below
    meal: ['dinner'],                     // any of: breakfast lunch dinner side dessert snack
    serves: 4,                            // ALWAYS write recipes for 4 (party foods may use 8-12)
    prep: 15, cook: 40,                   // minutes; cook includes simmering/oven time
    handsOff: 30,                         // optional: minutes of cook time needing no attention (slow cooker, oven roasting)
    effort: 1,                            // 1 easy weeknight, 2 some work, 3 weekend project
    spice: 0,                             // 0 none, 1 mild, 2 medium, 3 hot
    kidFriendly: true,
    equipment: ['stovetop'],              // see EQUIPMENT; list everything actually needed
    tags: ['comfort', 'budget', 'crowd-pleaser', 'italian-night'],   // see TAGS
    weather: 'any',                       // 'hot' (best on hot days), 'cold' (best on cold days), 'any'
    batch: true,                          // good to cook a double batch and freeze/keep
    freezes: true,
    fridgeDays: 3,
    makes: [ { key: 'bolognese-sauce', label: 'extra bolognese sauce', portions: 4,
               scale: ['beef-mince', 'diced-tomatoes', 'onion', 'carrot', 'garlic', 'tomato-paste'] } ],  // optional
    uses: { key: 'bolognese-sauce', portions: 4, replaces: ['beef-mince', 'diced-tomatoes'] },               // optional
    ingredients: [
      { id: 'beef-mince', qty: 500, unit: 'g' },
      { id: 'onion', qty: 1, unit: 'each', prep: 'finely diced' },
      { id: 'olive-oil', qty: 1, unit: 'tbsp' },
      { id: 'parmesan', qty: 30, unit: 'g', prep: 'grated, to serve', optional: true },
    ],
    steps: [
      'Heat the oil in a large saucepan over medium heat. Add the onion, carrot and garlic and cook for 5 minutes until soft.',
      '...'
    ],
    tips: 'Optional one-line tip, swap or make-ahead note.',
    picture: ['🍝', '🍅', '🧀'],          // 1-3 food emoji used for the illustration (first = hero)
  },
];
```

Rules
- `id` in ingredients must exist in `js/data/ingredients.js` (use the closest match; e.g. any steak -> `beef-rump`, any fresh herb not listed -> `parsley`, any dried herb -> `dried-herbs`).
- Units: `g`, `ml`, `each`, `tsp`, `tbsp` (Australian 20 ml), `cup` (250 ml), `pinch`. Use `each` for countable things (onions, eggs, garlic cloves, cans, wraps, rashers, fillets) - the ingredient's eachName is what one "each" is.
- Quantities are for `serves` people. Realistic Australian home-cooking amounts.
- Steps: 4-9 clear steps, oven temps as `180°C` (state fan-forced where relevant), times as `20 minutes`. Mention resting/serving.
- `makes`: a recipe that naturally produces planned leftovers for a reuse recipe. `scale` = ingredient ids that are increased to make the extra portions.
- `uses`: a reuse recipe. It must still list all its ingredients so it works without leftovers; `replaces` = ingredient ids not needed when the leftover is available.
- Leftover keys (use only these): bolognese-sauce, roast-chicken, cooked-rice, pulled-pork, chilli-con-carne, roast-lamb, roast-veg, beef-ragu, curry-sauce, mashed-potato, cooked-pasta

CUISINES: Italian, Australian, British, French, Greek, Spanish, Middle Eastern, Moroccan, Indian, Chinese, Thai, Japanese, Korean, Vietnamese, Malaysian, Mexican, American, Mediterranean, Other

EQUIPMENT: stovetop, oven, grill, bbq, slow-cooker, pressure-cooker, air-fryer, microwave, blender, food-processor, stand-mixer, wok

TAGS (use any that apply):
general: comfort, light, fresh, healthy, high-protein, budget, quick, one-pot, tray-bake, crowd-pleaser, make-ahead, lunchbox, finger-food, brunch, picnic, date-night, salad, soup, pasta, rice, noodles, roast, bbq, curry, stir-fry, baked
seasonal: summer, winter, spring, autumn
themes (for special occasions): italian-night, mexican-fiesta, asian-feast, indian-banquet, aussie-bbq, greek-feast, american-diner, christmas, easter, halloween, birthday, kids-party, movie-night, game-day, high-tea, brunch-party, australia-day, melbourne-cup, mothers-day, fathers-day, valentines
