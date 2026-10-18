# Meal Planner

A warm, simple weekly meal planner for iPad and iPhone. It runs in Safari, installs to the home screen, and works offline. Your data stays on your device, with optional automatic sync between devices through your own free Firebase project.

## What it does

- Plans the week for your household (adults and children by age), with a servings slider on every recipe.
- Suggests batch cooks and "cook once, eat twice" leftovers (for example bolognese one night, jacket potatoes the next).
- Lets you swap any meal, lock favourites, and set each day's time, effort and cuisine.
- Plans special occasions and themed nights (birthdays, BBQs, Christmas, taco night and more).
- Fits meals to a weekly budget, including drinks, takeaway, dining out and extras.
- Prices by postcode for Coles, Woolworths, Aldi and IGA, and lets you update prices by hand or from a photo of a shelf label or receipt (read on the device).
- Builds a shopping list by aisle that skips what's in your pantry, fridge and freezer, and sends it to Reminders or a Word document.
- Uses the local weather forecast and the season.
- Has 106 bundled recipes with method, nutrition and cookbook-style pages, plus online recipe search (TheMealDB).
- Keeps a history and calendar, and learns from your star ratings.
- Respects allergies, diets, kitchen equipment and children's tastes.
- Metric by default, with an imperial switch. Six themes and adjustable text size.

## Running it

There is no build step. Serve the folder with any static server:

```
python3 -m http.server 8765
```

Then open http://localhost:8765. For hosting, GitHub Pages works as is (the `.nojekyll` file is included).

After changing any file, regenerate the service worker so installed copies update:

```
node tools/build.mjs
```

## Tests

```
npm install            # Playwright only
node tests/validate-recipes.mjs
node tests/e2e.cjs     # functional run plus layout sweep over iPad and iPhone sizes
```

`ONLY_FUNCTIONAL=1` skips the layout sweep. Screenshots go to `OUT` (default `tests/out`).

## Files

- `index.html`, `css/app.css`, `js/app.js`: the shell, themes and routing.
- `js/planner.js`: scoring and week generation. `js/shopping.js`: lists. `js/ocr.js`: photo prices.
- `js/data/`: ingredients with prices and nutrition, and the recipe collections (see `docs/RECIPE_SCHEMA.md`).
- `js/cloud.js`, `js/sync.js`: Firebase sync, backup and merge.
- `vendor/`: fonts, the offline photo reader (tesseract.js) and the QR code generator.
