// Ingredient database: typical Australian supermarket prices (Coles shelf price, AUD, late 2026 estimate),
// pack sizes and approximate nutrition per 100 g (or 100 ml).
// Row: [id, name, aisle, packSize, packUnit, packPrice, [kcal, protein, carbs, fat, fibre, sodiumMg], flags, shelfDays, extra]
// packUnit: 'g' | 'ml' | 'each'.  extra: { each: grams per piece, eachName, plural, density (g per ml), aka: [search words] }
// flags: allergens (gluten dairy egg nuts peanut soy sesame fish shellfish), animal (beef pork lamb poultry fish shellfish),
//        staple (assumed in cupboard), spice, frozen, honey, alcohol

const ROWS = [
  // ---------- Meat & Seafood ----------
  ['beef-mince', 'Beef mince', 'Meat & Seafood', 500, 'g', 8.0, [254, 17, 0, 20, 0, 66], 'beef', 3, { aka: ['mince', 'ground beef', 'minced beef'] }],
  ['lean-beef-mince', 'Lean beef mince', 'Meat & Seafood', 500, 'g', 10.0, [180, 21, 0, 10, 0, 70], 'beef', 3, { aka: ['lean mince', 'premium mince', '5 star mince'] }],
  ['beef-chuck', 'Beef chuck steak', 'Meat & Seafood', 1000, 'g', 19.0, [190, 20, 0, 12, 0, 60], 'beef', 3, { aka: ['chuck', 'gravy beef', 'stewing beef', 'casserole beef', 'beef shin'] }],
  ['beef-rump', 'Beef rump steak', 'Meat & Seafood', 500, 'g', 14.0, [160, 22, 0, 8, 0, 55], 'beef', 3, { aka: ['rump', 'steak', 'sirloin', 'porterhouse', 'scotch fillet'] }],
  ['beef-strips', 'Beef stir-fry strips', 'Meat & Seafood', 500, 'g', 12.0, [150, 22, 0, 7, 0, 60], 'beef', 3, { aka: ['stir fry beef', 'beef strips'] }],
  ['pork-mince', 'Pork mince', 'Meat & Seafood', 500, 'g', 7.5, [230, 18, 0, 17, 0, 60], 'pork', 3, { aka: ['ground pork'] }],
  ['pork-shoulder', 'Pork shoulder', 'Meat & Seafood', 1500, 'g', 18.0, [230, 17, 0, 18, 0, 70], 'pork', 3, { aka: ['pork scotch', 'pork neck', 'pork butt'] }],
  ['pork-chops', 'Pork loin chops', 'Meat & Seafood', 500, 'g', 9.0, [200, 22, 0, 12, 0, 60], 'pork', 3, { aka: ['pork chop', 'pork cutlet', 'pork steak', 'pork fillet'] }],
  ['bacon', 'Bacon (middle rashers)', 'Meat & Seafood', 250, 'g', 5.5, [270, 16, 1, 22, 0, 1200], 'pork', 10, { each: 35, eachName: 'rasher', aka: ['rashers', 'speck', 'pancetta'] }],
  ['ham', 'Leg ham (sliced)', 'Meat & Seafood', 200, 'g', 5.0, [110, 18, 2, 3, 0, 1100], 'pork', 7, { aka: ['ham off the bone', 'shaved ham'] }],
  ['chorizo', 'Chorizo', 'Meat & Seafood', 250, 'g', 6.5, [455, 24, 2, 38, 0, 1250], 'pork', 21, { each: 125, eachName: 'sausage', aka: ['salami'] }],
  ['sausages', 'Beef sausages', 'Meat & Seafood', 600, 'g', 7.0, [250, 14, 6, 19, 1, 700], 'beef gluten', 3, { each: 75, eachName: 'sausage', aka: ['snags', 'bbq sausages', 'thin sausages'] }],
  ['chicken-breast', 'Chicken breast fillets', 'Meat & Seafood', 500, 'g', 7.5, [110, 23, 0, 2, 0, 60], 'poultry', 3, { aka: ['chicken breast', 'chicken fillet'] }],
  ['chicken-thigh', 'Chicken thigh fillets', 'Meat & Seafood', 500, 'g', 8.5, [170, 19, 0, 10, 0, 85], 'poultry', 3, { aka: ['chicken thighs', 'thigh fillets', 'chicken'] }],
  ['chicken-drumsticks', 'Chicken drumsticks', 'Meat & Seafood', 1000, 'g', 7.0, [180, 18, 0, 11, 0, 90], 'poultry', 3, { aka: ['drumsticks', 'chicken legs', 'chicken wings', 'wings'] }],
  ['whole-chicken', 'Whole chicken', 'Meat & Seafood', 1600, 'g', 12.0, [135, 13, 0, 9, 0, 50], 'poultry', 3, { each: 1600, eachName: 'chicken', aka: ['whole bird', 'roasting chicken'] }],
  ['chicken-mince', 'Chicken mince', 'Meat & Seafood', 500, 'g', 8.0, [150, 20, 0, 8, 0, 70], 'poultry', 2, { aka: ['ground chicken', 'turkey mince'] }],
  ['lamb-mince', 'Lamb mince', 'Meat & Seafood', 500, 'g', 10.0, [280, 17, 0, 23, 0, 70], 'lamb', 3, { aka: ['ground lamb'] }],
  ['lamb-leg', 'Lamb leg (bone in)', 'Meat & Seafood', 1800, 'g', 30.0, [150, 19, 0, 8, 0, 45], 'lamb', 4, { aka: ['leg of lamb', 'lamb roast', 'lamb shoulder'] }],
  ['lamb-chops', 'Lamb loin chops', 'Meat & Seafood', 500, 'g', 15.0, [280, 17, 0, 23, 0, 70], 'lamb', 3, { aka: ['lamb cutlets', 'lamb chops', 'lamb'] }],
  ['salmon', 'Salmon fillets (skin on)', 'Meat & Seafood', 240, 'g', 10.0, [208, 20, 0, 13, 0, 60], 'fish', 2, { each: 120, eachName: 'fillet', aka: ['salmon fillet', 'atlantic salmon', 'tasmanian salmon'] }],
  ['white-fish', 'White fish fillets (barramundi or basa)', 'Meat & Seafood', 400, 'g', 10.0, [100, 20, 0, 2, 0, 70], 'fish', 2, { each: 130, eachName: 'fillet', aka: ['barramundi', 'basa', 'flathead', 'snapper', 'cod', 'hake', 'fish fillets', 'white fish'] }],
  ['prawns', 'Raw prawns (peeled)', 'Meat & Seafood', 500, 'g', 16.0, [100, 21, 0, 1, 0, 300], 'shellfish', 2, { aka: ['shrimp', 'king prawns', 'tiger prawns'] }],
  ['roast-chook', 'BBQ roast chicken (ready cooked)', 'Deli', 900, 'g', 13.0, [215, 25, 0, 13, 0, 450], 'poultry', 3, { each: 900, eachName: 'chicken', aka: ['bbq chicken', 'rotisserie chicken', 'cooked chicken'] }],

  // ---------- Dairy & Eggs ----------
  ['eggs', 'Free-range eggs (12 pack)', 'Dairy & Eggs', 12, 'each', 7.0, [143, 13, 1, 10, 0, 140], 'egg', 28, { each: 55, eachName: 'egg', aka: ['egg', 'free range eggs', 'cage free eggs'] }],
  ['milk', 'Full cream milk', 'Dairy & Eggs', 2000, 'ml', 3.3, [64, 3.4, 4.8, 3.5, 0, 44], 'dairy', 10, { aka: ['milk', 'lite milk', 'skim milk'] }],
  ['butter', 'Butter', 'Dairy & Eggs', 250, 'g', 5.5, [740, 1, 0, 81, 0, 600], 'dairy', 60, { aka: ['salted butter', 'unsalted butter'] }],
  ['cheddar', 'Tasty cheese (grated)', 'Dairy & Eggs', 500, 'g', 9.0, [400, 25, 1, 33, 0, 620], 'dairy', 28, { aka: ['cheese', 'tasty cheese', 'cheddar cheese', 'grated cheese', 'shredded cheese'] }],
  ['mozzarella', 'Mozzarella (grated)', 'Dairy & Eggs', 500, 'g', 8.5, [300, 22, 2, 22, 0, 600], 'dairy', 28, { aka: ['pizza cheese', 'bocconcini'] }],
  ['parmesan', 'Parmesan', 'Dairy & Eggs', 250, 'g', 7.5, [420, 36, 0, 29, 0, 1500], 'dairy', 60, { aka: ['parmigiano', 'grana padano', 'pecorino'] }],
  ['feta', 'Feta', 'Dairy & Eggs', 200, 'g', 4.5, [264, 14, 4, 21, 0, 1100], 'dairy', 21, { aka: ['danish feta', 'goats cheese'] }],
  ['halloumi', 'Halloumi', 'Dairy & Eggs', 180, 'g', 6.5, [320, 22, 2, 25, 0, 2000], 'dairy', 30, { aka: [] }],
  ['cream', 'Thickened cream', 'Dairy & Eggs', 300, 'ml', 3.5, [340, 2, 3, 35, 0, 30], 'dairy', 14, { aka: ['cream', 'pure cream', 'double cream', 'heavy cream'] }],
  ['sour-cream', 'Sour cream', 'Dairy & Eggs', 300, 'ml', 3.2, [200, 3, 4, 20, 0, 50], 'dairy', 14, { density: 1, aka: [] }],
  ['greek-yoghurt', 'Greek yoghurt (natural)', 'Dairy & Eggs', 1000, 'g', 6.5, [100, 9, 4, 5, 0, 40], 'dairy', 14, { aka: ['yoghurt', 'yogurt', 'natural yoghurt'] }],
  ['cream-cheese', 'Cream cheese', 'Dairy & Eggs', 250, 'g', 4.5, [340, 6, 4, 34, 0, 300], 'dairy', 21, { aka: ['philadelphia', 'ricotta', 'mascarpone'] }],

  // ---------- Bakery ----------
  ['bread', 'Wholemeal sandwich loaf', 'Bakery', 700, 'g', 3.8, [240, 10, 41, 3, 6, 450], 'gluten', 6, { each: 40, eachName: 'slice', aka: ['bread', 'white bread', 'toast', 'sandwich bread', 'sourdough'] }],
  ['wraps', 'Wraps / tortillas (8 pack)', 'Bakery', 8, 'each', 4.5, [300, 8, 50, 7, 3, 600], 'gluten', 14, { each: 50, eachName: 'wrap', aka: ['tortillas', 'flour tortillas', 'wraps', 'mountain bread'] }],
  ['burger-buns', 'Burger buns (6 pack)', 'Bakery', 6, 'each', 4.0, [270, 9, 48, 5, 2, 450], 'gluten', 5, { each: 70, eachName: 'bun', aka: ['buns', 'brioche buns', 'hot dog rolls'] }],
  ['bread-rolls', 'Crusty bread rolls (6 pack)', 'Bakery', 6, 'each', 4.0, [260, 9, 50, 2, 3, 500], 'gluten', 3, { each: 70, eachName: 'roll', aka: ['rolls', 'baguette', 'french stick', 'ciabatta'] }],
  ['naan', 'Naan / flatbread (4 pack)', 'Bakery', 4, 'each', 4.5, [290, 9, 50, 6, 2, 500], 'gluten dairy', 7, { each: 80, eachName: 'flatbread', aka: ['naan bread', 'pita', 'pita bread', 'flatbread', 'lebanese bread', 'roti'] }],
  ['english-muffins', 'English muffins (6 pack)', 'Bakery', 6, 'each', 3.5, [230, 8, 45, 2, 2, 400], 'gluten', 7, { each: 65, eachName: 'muffin', aka: ['crumpets', 'bagels'] }],
  ['pizza-bases', 'Pizza bases (2 pack)', 'Bakery', 2, 'each', 4.5, [270, 8, 50, 4, 2, 500], 'gluten', 14, { each: 220, eachName: 'base', aka: ['pizza base'] }],

  // ---------- Fruit & Veg ----------
  ['onion', 'Brown onions', 'Fruit & Veg', 1000, 'g', 3.0, [40, 1.1, 9, 0.1, 1.7, 4], '', 30, { each: 150, eachName: 'onion', aka: ['onion', 'brown onion', 'white onion', 'yellow onion', 'shallot', 'shallots'] }],
  ['red-onion', 'Red onions', 'Fruit & Veg', 1000, 'g', 4.5, [40, 1.1, 9, 0.1, 1.7, 4], '', 30, { each: 150, eachName: 'red onion', aka: ['red onion', 'spanish onion', 'purple onion'] }],
  ['garlic', 'Garlic', 'Fruit & Veg', 150, 'g', 3.0, [149, 6.4, 33, 0.5, 2.1, 17], '', 30, { each: 5, eachName: 'clove', aka: ['garlic clove', 'garlic cloves'] }],
  ['ginger', 'Fresh ginger', 'Fruit & Veg', 100, 'g', 1.8, [80, 1.8, 18, 0.8, 2, 13], '', 21, { aka: ['ginger root'] }],
  ['potato', 'Potatoes (washed)', 'Fruit & Veg', 2000, 'g', 5.0, [77, 2, 17, 0.1, 2.2, 6], '', 21, { each: 200, eachName: 'potato', plural: 'potatoes', aka: ['potatoes', 'baby potatoes', 'chat potatoes', 'washed potatoes', 'sebago', 'red potatoes'] }],
  ['sweet-potato', 'Sweet potato', 'Fruit & Veg', 1000, 'g', 4.5, [86, 1.6, 20, 0.1, 3, 55], '', 21, { each: 400, eachName: 'sweet potato', plural: 'sweet potatoes', aka: ['kumara', 'gold sweet potato'] }],
  ['carrot', 'Carrots', 'Fruit & Veg', 1000, 'g', 2.5, [41, 0.9, 10, 0.2, 2.8, 69], '', 21, { each: 120, eachName: 'carrot', aka: ['carrots'] }],
  ['celery', 'Celery', 'Fruit & Veg', 800, 'g', 3.5, [16, 0.7, 3, 0.2, 1.6, 80], '', 14, { each: 50, eachName: 'stick', aka: ['celery sticks', 'celery stalk'] }],
  ['broccoli', 'Broccoli', 'Fruit & Veg', 350, 'g', 2.5, [34, 2.8, 7, 0.4, 2.6, 33], '', 7, { each: 350, eachName: 'head', aka: ['broccolini', 'brocolli'] }],
  ['cauliflower', 'Cauliflower', 'Fruit & Veg', 1000, 'g', 4.5, [25, 1.9, 5, 0.3, 2, 30], '', 7, { each: 1000, eachName: 'cauliflower', aka: ['cauli'] }],
  ['zucchini', 'Zucchini', 'Fruit & Veg', 500, 'g', 3.0, [17, 1.2, 3, 0.3, 1, 8], '', 7, { each: 200, eachName: 'zucchini', plural: 'zucchini', aka: ['courgette'] }],
  ['capsicum', 'Red capsicum', 'Fruit & Veg', 200, 'g', 1.6, [31, 1, 6, 0.3, 2.1, 4], '', 10, { each: 200, eachName: 'capsicum', aka: ['capsicums', 'bell pepper', 'red pepper', 'green capsicum', 'yellow capsicum'] }],
  ['tomato', 'Tomatoes', 'Fruit & Veg', 1000, 'g', 6.0, [18, 0.9, 3.9, 0.2, 1.2, 5], '', 7, { each: 120, eachName: 'tomato', plural: 'tomatoes', aka: ['tomatoes', 'truss tomatoes', 'roma tomatoes', 'gourmet tomatoes'] }],
  ['cherry-tomatoes', 'Cherry tomatoes', 'Fruit & Veg', 250, 'g', 3.5, [18, 0.9, 3.9, 0.2, 1.2, 5], '', 7, { aka: ['grape tomatoes', 'qukes'] }],
  ['cucumber', 'Lebanese cucumbers', 'Fruit & Veg', 300, 'g', 2.0, [15, 0.7, 3.6, 0.1, 0.5, 2], '', 7, { each: 150, eachName: 'cucumber', aka: ['cucumber', 'continental cucumber'] }],
  ['lettuce', 'Cos lettuce', 'Fruit & Veg', 400, 'g', 3.0, [17, 1.2, 3.3, 0.3, 2.1, 8], '', 7, { each: 400, eachName: 'lettuce', aka: ['iceberg lettuce', 'iceberg', 'cos', 'romaine'] }],
  ['baby-spinach', 'Baby spinach', 'Fruit & Veg', 120, 'g', 3.0, [23, 2.9, 3.6, 0.4, 2.2, 79], '', 5, { aka: ['spinach', 'english spinach', 'silverbeet', 'kale'] }],
  ['salad-mix', 'Mixed salad leaves', 'Fruit & Veg', 200, 'g', 4.0, [17, 1.5, 3, 0.2, 1.8, 20], '', 5, { aka: ['salad leaves', 'rocket', 'mesclun', 'baby leaves', 'arugula'] }],
  ['cabbage', 'Cabbage (half)', 'Fruit & Veg', 1000, 'g', 3.5, [25, 1.3, 6, 0.1, 2.5, 18], '', 14, { aka: ['red cabbage', 'savoy cabbage', 'wombok', 'chinese cabbage', 'coleslaw mix'] }],
  ['mushrooms', 'Cup mushrooms', 'Fruit & Veg', 250, 'g', 4.0, [22, 3.1, 3.3, 0.3, 1, 5], '', 5, { aka: ['button mushrooms', 'mushroom', 'swiss brown mushrooms', 'field mushrooms'] }],
  ['green-beans', 'Green beans', 'Fruit & Veg', 300, 'g', 3.0, [31, 1.8, 7, 0.1, 2.7, 6], '', 5, { aka: ['beans', 'snow peas', 'sugar snap peas'] }],
  ['corn-cob', 'Sweet corn cobs', 'Fruit & Veg', 250, 'g', 1.0, [86, 3.3, 19, 1.4, 2, 15], '', 5, { each: 250, eachName: 'cob', aka: ['corn', 'sweetcorn', 'corn on the cob'] }],
  ['avocado', 'Avocados', 'Fruit & Veg', 170, 'g', 2.0, [160, 2, 9, 15, 7, 7], '', 5, { each: 170, eachName: 'avocado', aka: ['avo', 'hass avocado'] }],
  ['lemon', 'Lemons', 'Fruit & Veg', 120, 'g', 1.0, [29, 1.1, 9, 0.3, 2.8, 2], '', 21, { each: 120, eachName: 'lemon', aka: ['lemon juice'] }],
  ['lime', 'Limes', 'Fruit & Veg', 70, 'g', 0.9, [30, 0.7, 11, 0.2, 2.8, 2], '', 21, { each: 70, eachName: 'lime', aka: ['lime juice'] }],
  ['banana', 'Bananas', 'Fruit & Veg', 1000, 'g', 3.9, [89, 1.1, 23, 0.3, 2.6, 1], '', 6, { each: 120, eachName: 'banana', aka: ['bananas'] }],
  ['apple', 'Apples', 'Fruit & Veg', 1000, 'g', 5.0, [52, 0.3, 14, 0.2, 2.4, 1], '', 28, { each: 150, eachName: 'apple', aka: ['apples', 'pink lady', 'granny smith', 'pear', 'pears'] }],
  ['spring-onion', 'Spring onions', 'Fruit & Veg', 120, 'g', 2.5, [32, 1.8, 7, 0.2, 2.6, 16], '', 7, { each: 15, eachName: 'spring onion', aka: ['shallots (green)', 'scallions', 'green onions', 'chives'] }],
  ['coriander', 'Fresh coriander', 'Fruit & Veg', 50, 'g', 3.0, [23, 2.1, 3.7, 0.5, 2.8, 46], '', 5, { aka: ['cilantro', 'coriander leaves'] }],
  ['parsley', 'Fresh parsley', 'Fruit & Veg', 50, 'g', 3.0, [36, 3, 6, 0.8, 3.3, 56], '', 7, { aka: ['flat leaf parsley', 'italian parsley', 'curly parsley', 'dill'] }],
  ['basil', 'Fresh basil', 'Fruit & Veg', 30, 'g', 3.5, [23, 3.2, 2.7, 0.6, 1.6, 4], '', 5, { aka: ['thai basil'] }],
  ['mint', 'Fresh mint', 'Fruit & Veg', 30, 'g', 3.0, [70, 3.8, 15, 0.9, 8, 31], '', 5, { aka: ['mint leaves'] }],
  ['pumpkin', 'Butternut pumpkin', 'Fruit & Veg', 1000, 'g', 3.5, [45, 1, 12, 0.1, 2, 4], '', 21, { aka: ['butternut', 'butternut squash', 'jap pumpkin', 'kent pumpkin', 'squash'] }],
  ['eggplant', 'Eggplant', 'Fruit & Veg', 350, 'g', 3.0, [25, 1, 6, 0.2, 3, 2], '', 7, { each: 350, eachName: 'eggplant', aka: ['aubergine'] }],
  ['asian-greens', 'Bok choy / Asian greens', 'Fruit & Veg', 300, 'g', 3.0, [13, 1.5, 2.2, 0.2, 1, 65], '', 4, { aka: ['bok choy', 'pak choy', 'choy sum', 'gai lan', 'bok choi'] }],
  ['chilli', 'Fresh red chilli', 'Fruit & Veg', 50, 'g', 2.0, [40, 1.9, 9, 0.4, 1.5, 9], '', 10, { each: 10, eachName: 'chilli', plural: 'chillies', aka: ['chili', 'red chilli', 'jalapeno', 'birdseye chilli'] }],
  ['bean-sprouts', 'Bean sprouts', 'Fruit & Veg', 250, 'g', 2.5, [30, 3, 6, 0.2, 1.8, 6], '', 3, { aka: ['sprouts'] }],
  ['berries', 'Frozen mixed berries', 'Frozen', 500, 'g', 6.5, [50, 1, 11, 0.3, 4, 1], 'frozen', 180, { aka: ['blueberries', 'strawberries', 'raspberries', 'berries'] }],

  // ---------- Pantry: pasta, rice, grains ----------
  ['spaghetti', 'Spaghetti', 'Pantry', 500, 'g', 1.8, [355, 12, 72, 1.5, 3, 5], 'gluten', 365, { aka: ['linguine', 'fettuccine', 'pasta', 'tagliatelle', 'angel hair'] }],
  ['short-pasta', 'Penne / short pasta', 'Pantry', 500, 'g', 1.8, [355, 12, 72, 1.5, 3, 5], 'gluten', 365, { aka: ['penne', 'fusilli', 'rigatoni', 'macaroni', 'spirals', 'shells', 'orzo', 'risoni'] }],
  ['lasagne-sheets', 'Lasagne sheets', 'Pantry', 250, 'g', 2.5, [355, 12, 72, 1.5, 3, 5], 'gluten egg', 365, { aka: ['lasagna sheets', 'lasagne'] }],
  ['gnocchi', 'Potato gnocchi', 'Pantry', 500, 'g', 3.5, [150, 3.5, 32, 0.5, 2, 400], 'gluten', 90, { aka: [] }],
  ['egg-noodles', 'Egg noodles', 'Pantry', 440, 'g', 3.0, [360, 13, 70, 3, 3, 20], 'gluten egg', 365, { aka: ['hokkien noodles', 'ramen noodles', 'udon', 'noodles', 'chow mein noodles'] }],
  ['rice-noodles', 'Rice noodles', 'Pantry', 375, 'g', 2.8, [360, 6, 80, 1, 1, 20], '', 365, { aka: ['vermicelli', 'rice stick noodles', 'pad thai noodles'] }],
  ['rice', 'Long grain white rice', 'Pantry', 1000, 'g', 3.0, [360, 7, 79, 0.5, 1, 5], '', 365, { aka: ['white rice', 'jasmine rice', 'rice', 'long grain rice', 'brown rice'] }],
  ['basmati-rice', 'Basmati rice', 'Pantry', 1000, 'g', 4.0, [355, 8, 78, 0.6, 1.3, 5], '', 365, { aka: ['basmati'] }],
  ['arborio', 'Arborio rice', 'Pantry', 500, 'g', 3.5, [350, 7, 79, 0.6, 1, 5], '', 365, { aka: ['risotto rice', 'paella rice', 'sushi rice'] }],
  ['couscous', 'Couscous', 'Pantry', 500, 'g', 2.8, [376, 13, 77, 0.6, 5, 10], 'gluten', 365, { aka: ['bulgur', 'pearl couscous'] }],
  ['quinoa', 'Quinoa', 'Pantry', 400, 'g', 5.0, [368, 14, 64, 6, 7, 5], '', 365, { aka: [] }],
  ['oats', 'Rolled oats', 'Pantry', 750, 'g', 2.5, [380, 12, 60, 8, 10, 5], 'gluten', 365, { aka: ['porridge oats', 'quick oats', 'oats'] }],
  ['plain-flour', 'Plain flour', 'Pantry', 1000, 'g', 1.8, [364, 10, 76, 1, 2.7, 2], 'gluten staple', 365, { aka: ['flour', 'all purpose flour', 'self raising flour', 'self-raising flour', 'cornflour'] }],
  ['sugar', 'White sugar', 'Pantry', 1000, 'g', 1.8, [400, 0, 100, 0, 0, 0], 'staple', 730, { aka: ['caster sugar', 'icing sugar', 'raw sugar'] }],
  ['brown-sugar', 'Brown sugar', 'Pantry', 500, 'g', 2.0, [380, 0, 98, 0, 0, 30], '', 730, { aka: ['dark brown sugar', 'palm sugar'] }],
  ['honey', 'Honey', 'Pantry', 500, 'g', 6.5, [304, 0.3, 82, 0, 0, 4], 'honey', 730, { density: 1.4, aka: [] }],
  ['maple-syrup', 'Maple syrup', 'Pantry', 250, 'ml', 7.0, [260, 0, 67, 0, 0, 12], '', 365, { density: 1.3, aka: ['golden syrup', 'pancake syrup'] }],
  ['breadcrumbs', 'Panko breadcrumbs', 'Pantry', 200, 'g', 3.0, [395, 13, 72, 5, 4, 600], 'gluten', 180, { aka: ['panko', 'dried breadcrumbs', 'bread crumbs'] }],
  ['taco-shells', 'Taco shells (12 pack)', 'Pantry', 12, 'each', 3.5, [480, 6, 60, 24, 6, 400], '', 180, { each: 11, eachName: 'taco shell', aka: ['tacos', 'hard taco shells'] }],
  ['corn-chips', 'Corn chips', 'Pantry', 230, 'g', 3.5, [500, 7, 60, 25, 5, 400], '', 120, { aka: ['tortilla chips', 'nachos chips', 'doritos'] }],
  ['puff-pastry', 'Puff pastry sheets (frozen)', 'Frozen', 6, 'each', 4.5, [390, 6, 35, 25, 1, 300], 'gluten frozen', 180, { each: 170, eachName: 'sheet', aka: ['shortcrust pastry', 'pastry'] }],

  // ---------- Pantry: cans & jars ----------
  ['diced-tomatoes', 'Diced tomatoes (can)', 'Pantry', 400, 'g', 1.1, [20, 1, 3.5, 0.2, 1, 150], '', 730, { each: 400, eachName: 'can', aka: ['tinned tomatoes', 'crushed tomatoes', 'chopped tomatoes', 'canned tomatoes'] }],
  ['passata', 'Tomato passata', 'Pantry', 700, 'ml', 2.2, [30, 1.3, 5, 0.2, 1, 200], '', 365, { aka: ['tomato puree', 'pasta sauce', 'tomato sugo', 'napoletana sauce'] }],
  ['tomato-paste', 'Tomato paste', 'Pantry', 140, 'g', 1.0, [82, 4.3, 18, 0.5, 4, 60], '', 365, { aka: ['tomato concentrate'] }],
  ['coconut-milk', 'Coconut milk (can)', 'Pantry', 400, 'ml', 1.6, [200, 2, 3, 20, 0, 15], '', 730, { each: 400, eachName: 'can', aka: ['coconut cream', 'light coconut milk'] }],
  ['chickpeas', 'Chickpeas (can)', 'Pantry', 400, 'g', 1.1, [120, 7, 15, 3, 5, 250], '', 730, { each: 400, eachName: 'can', aka: ['garbanzo beans'] }],
  ['kidney-beans', 'Red kidney beans (can)', 'Pantry', 400, 'g', 1.1, [100, 7, 14, 0.5, 6, 250], '', 730, { each: 400, eachName: 'can', aka: ['kidney beans', 'four bean mix', 'cannellini beans', 'butter beans', 'white beans'] }],
  ['black-beans', 'Black beans (can)', 'Pantry', 400, 'g', 1.6, [110, 7, 16, 0.5, 7, 250], '', 730, { each: 400, eachName: 'can', aka: ['refried beans'] }],
  ['red-lentils', 'Red lentils (dried)', 'Pantry', 500, 'g', 3.0, [340, 24, 50, 1.5, 11, 5], '', 365, { aka: ['lentils', 'split peas'] }],
  ['brown-lentils', 'Brown lentils (can)', 'Pantry', 400, 'g', 1.2, [90, 7, 12, 0.5, 4, 250], '', 730, { each: 400, eachName: 'can', aka: ['canned lentils', 'green lentils', 'puy lentils'] }],
  ['baked-beans', 'Baked beans (can)', 'Pantry', 420, 'g', 1.3, [80, 4.5, 12, 0.4, 4, 380], '', 730, { each: 420, eachName: 'can', aka: [] }],
  ['corn-kernels', 'Corn kernels (can)', 'Pantry', 420, 'g', 1.6, [80, 2.5, 16, 1, 2, 200], '', 730, { each: 420, eachName: 'can', aka: ['creamed corn', 'canned corn'] }],
  ['tuna', 'Tuna in springwater (large can)', 'Pantry', 425, 'g', 6.0, [120, 25, 0, 2, 0, 350], 'fish', 730, { aka: ['canned tuna', 'tinned tuna', 'canned salmon', 'tinned salmon'] }],
  ['chicken-stock', 'Chicken stock', 'Pantry', 1000, 'ml', 2.5, [5, 0.5, 0.5, 0.2, 0, 350], '', 365, { aka: ['stock', 'chicken broth', 'stock cubes'] }],
  ['beef-stock', 'Beef stock', 'Pantry', 1000, 'ml', 2.5, [5, 0.5, 0.5, 0.2, 0, 350], '', 365, { aka: ['beef broth'] }],
  ['veg-stock', 'Vegetable stock', 'Pantry', 1000, 'ml', 2.5, [5, 0.2, 1, 0.1, 0, 350], '', 365, { aka: ['vegetable stock', 'vegetable broth'] }],
  ['olives', 'Kalamata olives', 'Pantry', 300, 'g', 3.5, [230, 1.6, 6, 22, 3, 1500], '', 180, { aka: ['black olives', 'green olives'] }],
  ['pesto', 'Basil pesto', 'Pantry', 190, 'g', 4.0, [450, 5, 5, 45, 2, 900], 'dairy nuts', 30, { aka: ['pesto sauce'] }],
  ['salsa', 'Tomato salsa (jar)', 'Pantry', 300, 'g', 3.5, [35, 1.5, 7, 0.2, 1.5, 500], '', 30, { aka: ['chunky salsa'] }],
  ['peanut-butter', 'Peanut butter', 'Pantry', 375, 'g', 4.0, [600, 25, 15, 50, 7, 400], 'peanut', 180, { aka: [] }],
  ['tofu', 'Firm tofu', 'Dairy & Eggs', 300, 'g', 3.5, [145, 15, 3, 8, 2, 10], 'soy', 14, { aka: ['tofu', 'silken tofu'] }],
  ['cashews', 'Roasted cashews', 'Pantry', 250, 'g', 6.0, [580, 18, 30, 46, 3, 300], 'nuts', 180, { aka: ['nuts', 'almonds', 'peanuts', 'walnuts', 'pine nuts', 'pecans'] }],
  ['sesame-seeds', 'Sesame seeds', 'Pantry', 100, 'g', 2.5, [570, 18, 23, 50, 12, 11], 'sesame', 365, { aka: [] }],
  ['dark-chocolate', 'Dark cooking chocolate', 'Pantry', 180, 'g', 4.5, [520, 6, 55, 31, 7, 20], 'dairy', 365, { aka: ['chocolate', 'choc chips', 'chocolate chips', 'milk chocolate'] }],
  ['cocoa', 'Cocoa powder', 'Pantry', 200, 'g', 5.0, [230, 20, 58, 14, 33, 20], '', 365, { aka: ['cacao'] }],
  ['vanilla', 'Vanilla essence', 'Pantry', 50, 'ml', 3.0, [288, 0, 13, 0, 0, 9], 'staple', 730, { aka: ['vanilla extract', 'vanilla bean paste'] }],
  ['baking-powder', 'Baking powder', 'Pantry', 125, 'g', 2.0, [53, 0, 28, 0, 0, 10000], 'staple', 365, { aka: ['bicarb soda', 'baking soda'] }],

  // ---------- Sauces, oils & condiments ----------
  ['olive-oil', 'Olive oil', 'Sauces & Oils', 750, 'ml', 13.0, [884, 0, 0, 100, 0, 0], 'staple', 365, { density: 0.92, aka: ['extra virgin olive oil', 'evoo', 'oil'] }],
  ['vegetable-oil', 'Vegetable / canola oil', 'Sauces & Oils', 1000, 'ml', 5.0, [884, 0, 0, 100, 0, 0], 'staple', 365, { density: 0.92, aka: ['canola oil', 'sunflower oil', 'cooking oil', 'peanut oil', 'rice bran oil'] }],
  ['soy-sauce', 'Soy sauce', 'Sauces & Oils', 250, 'ml', 3.0, [60, 8, 5, 0, 0, 5500], 'soy gluten', 730, { aka: ['tamari', 'kecap manis', 'light soy', 'dark soy'] }],
  ['oyster-sauce', 'Oyster sauce', 'Sauces & Oils', 255, 'ml', 3.5, [100, 2, 22, 0, 0, 3500], 'shellfish', 365, { aka: ['hoisin sauce', 'hoisin'] }],
  ['fish-sauce', 'Fish sauce', 'Sauces & Oils', 200, 'ml', 3.0, [35, 5, 4, 0, 0, 7800], 'fish', 730, { aka: [] }],
  ['sweet-chilli', 'Sweet chilli sauce', 'Sauces & Oils', 300, 'ml', 3.0, [200, 0.5, 50, 0.5, 1, 1000], '', 365, { density: 1.2, aka: ['sriracha', 'chilli sauce', 'hot sauce'] }],
  ['tomato-sauce', 'Tomato sauce (ketchup)', 'Sauces & Oils', 500, 'ml', 3.0, [100, 1.2, 24, 0.1, 0.5, 900], '', 365, { density: 1.15, aka: ['ketchup'] }],
  ['bbq-sauce', 'BBQ sauce', 'Sauces & Oils', 500, 'ml', 3.5, [170, 1, 40, 0.5, 1, 1000], '', 365, { density: 1.2, aka: ['barbecue sauce', 'worcestershire sauce', 'worcestershire'] }],
  ['mayonnaise', 'Mayonnaise', 'Sauces & Oils', 440, 'g', 4.5, [680, 1, 2, 75, 0, 600], 'egg', 90, { aka: ['mayo', 'aioli', 'kewpie'] }],
  ['dijon', 'Dijon mustard', 'Sauces & Oils', 200, 'g', 3.5, [150, 7, 6, 10, 4, 1600], '', 365, { aka: ['mustard', 'wholegrain mustard', 'american mustard', 'yellow mustard'] }],
  ['sesame-oil', 'Sesame oil', 'Sauces & Oils', 150, 'ml', 4.0, [884, 0, 0, 100, 0, 0], 'sesame', 365, { density: 0.92, aka: ['toasted sesame oil'] }],
  ['thai-curry-paste', 'Thai red curry paste', 'Sauces & Oils', 200, 'g', 4.0, [130, 2, 12, 8, 3, 3000], 'shellfish', 90, { aka: ['red curry paste', 'green curry paste', 'massaman paste', 'massaman curry paste', 'yellow curry paste'] }],
  ['indian-curry-paste', 'Indian curry paste (tikka / butter chicken)', 'Sauces & Oils', 280, 'g', 4.5, [200, 3, 10, 16, 3, 2000], '', 90, { aka: ['tikka masala paste', 'korma paste', 'butter chicken paste', 'rogan josh paste', 'curry paste', 'tandoori paste'] }],
  ['balsamic', 'Balsamic vinegar', 'Sauces & Oils', 250, 'ml', 3.5, [88, 0.5, 17, 0, 0, 23], '', 730, { aka: ['vinegar', 'red wine vinegar', 'white wine vinegar', 'apple cider vinegar', 'rice vinegar', 'malt vinegar'] }],
  ['sweet-soy', 'Hoisin / teriyaki sauce', 'Sauces & Oils', 250, 'ml', 3.5, [220, 2, 45, 3, 1, 2500], 'soy gluten', 365, { density: 1.2, aka: ['teriyaki sauce', 'teriyaki marinade', 'plum sauce'] }],

  // ---------- Herbs & spices (assumed in the cupboard if "I keep basic spices" is on) ----------
  ['salt', 'Salt', 'Herbs & Spices', 750, 'g', 1.2, [0, 0, 0, 0, 0, 38758], 'staple', 3650, { aka: ['sea salt', 'salt flakes', 'table salt'] }],
  ['pepper', 'Black pepper', 'Herbs & Spices', 50, 'g', 3.5, [251, 10, 64, 3, 25, 20], 'staple spice', 730, { density: 0.5, aka: ['ground pepper', 'cracked pepper', 'pepper'] }],
  ['paprika', 'Smoked paprika', 'Herbs & Spices', 40, 'g', 3.0, [282, 14, 54, 13, 35, 68], 'spice', 730, { density: 0.5, aka: ['paprika', 'sweet paprika', 'cayenne pepper'] }],
  ['cumin', 'Ground cumin', 'Herbs & Spices', 35, 'g', 3.0, [375, 18, 44, 22, 11, 168], 'spice', 730, { density: 0.5, aka: ['cumin seeds'] }],
  ['ground-coriander', 'Ground coriander', 'Herbs & Spices', 30, 'g', 3.0, [298, 12, 55, 18, 42, 35], 'spice', 730, { density: 0.5, aka: ['coriander seeds'] }],
  ['chilli-flakes', 'Chilli flakes', 'Herbs & Spices', 30, 'g', 3.0, [318, 12, 57, 17, 27, 30], 'spice', 730, { density: 0.5, aka: ['chilli powder', 'dried chilli', 'red pepper flakes'] }],
  ['cinnamon', 'Ground cinnamon', 'Herbs & Spices', 30, 'g', 3.0, [247, 4, 81, 1.2, 53, 10], 'spice', 730, { density: 0.5, aka: ['cinnamon stick', 'nutmeg', 'mixed spice', 'allspice', 'ground ginger', 'cloves'] }],
  ['dried-herbs', 'Dried mixed Italian herbs', 'Herbs & Spices', 15, 'g', 3.0, [270, 9, 64, 4, 37, 20], 'spice', 730, { density: 0.3, aka: ['oregano', 'dried oregano', 'thyme', 'dried thyme', 'rosemary', 'dried rosemary', 'bay leaves', 'bay leaf', 'italian herbs', 'mixed herbs', 'sage'] }],
  ['curry-powder', 'Curry powder', 'Herbs & Spices', 40, 'g', 3.0, [325, 14, 58, 14, 53, 52], 'spice', 730, { density: 0.5, aka: [] }],
  ['garam-masala', 'Garam masala', 'Herbs & Spices', 35, 'g', 3.0, [380, 15, 50, 15, 30, 50], 'spice', 730, { density: 0.5, aka: ['tandoori spice'] }],
  ['turmeric', 'Ground turmeric', 'Herbs & Spices', 35, 'g', 3.0, [312, 10, 67, 3, 23, 27], 'spice', 730, { density: 0.5, aka: [] }],
  ['five-spice', 'Chinese five spice', 'Herbs & Spices', 30, 'g', 3.0, [347, 10, 70, 9, 30, 30], 'spice', 730, { density: 0.5, aka: ['star anise', 'sichuan pepper'] }],
  ['taco-seasoning', 'Taco seasoning', 'Herbs & Spices', 30, 'g', 1.2, [300, 7, 50, 6, 10, 6000], '', 365, { density: 0.5, aka: ['taco mix', 'fajita seasoning', 'burrito seasoning', 'mexican seasoning'] }],
  ['rosemary', 'Fresh rosemary / thyme', 'Fruit & Veg', 20, 'g', 3.0, [131, 3.3, 21, 6, 14, 26], '', 10, { aka: ['fresh rosemary', 'fresh thyme', 'thyme sprigs', 'rosemary sprigs', 'sage leaves'] }],

  // ---------- Frozen ----------
  ['frozen-peas', 'Frozen peas', 'Frozen', 1000, 'g', 3.0, [80, 5, 10, 0.4, 5, 5], 'frozen', 365, { aka: ['peas', 'baby peas', 'edamame'] }],
  ['frozen-veg', 'Frozen mixed vegetables', 'Frozen', 1000, 'g', 3.0, [60, 3, 9, 0.5, 4, 30], 'frozen', 365, { aka: ['mixed vegetables', 'stir fry vegetables', 'frozen vegetables', 'mixed veg'] }],
  ['frozen-chips', 'Frozen oven chips', 'Frozen', 1000, 'g', 4.0, [150, 2.5, 24, 5, 2.5, 200], 'frozen', 365, { aka: ['chips', 'fries', 'wedges', 'potato gems', 'hash browns'] }],
  ['ice-cream', 'Vanilla ice cream', 'Frozen', 2000, 'ml', 6.0, [200, 3.5, 24, 10, 0, 80], 'dairy frozen', 365, { density: 0.55, aka: ['icecream', 'gelato'] }],
];

function toIngredient(r) {
  const [id, name, aisle, packSize, packUnit, packPrice, n, flags, shelfDays, extra = {}] = r;
  const f = flags ? flags.split(' ') : [];
  return {
    id, name, aisle, packSize, packUnit, packPrice,
    nutrition: { kcal: n[0], protein: n[1], carbs: n[2], fat: n[3], fibre: n[4], sodium: n[5] },
    flags: f,
    staple: f.includes('staple'),
    spice: f.includes('spice'),
    shelfDays,
    each: extra.each || (packUnit === 'each' ? 100 : null),
    eachName: extra.eachName || null,
    plural: extra.plural || null,
    density: extra.density || 1,
    aka: extra.aka || [],
  };
}

export const INGREDIENTS = ROWS.map(toIngredient);
export const ING = Object.fromEntries(INGREDIENTS.map(i => [i.id, i]));

export const ALLERGENS = ['gluten', 'dairy', 'egg', 'nuts', 'peanut', 'soy', 'sesame', 'fish', 'shellfish'];
export const ANIMAL = ['beef', 'pork', 'lamb', 'poultry', 'fish', 'shellfish'];
export const AISLES = ['Fruit & Veg', 'Meat & Seafood', 'Deli', 'Dairy & Eggs', 'Bakery', 'Pantry', 'Sauces & Oils', 'Herbs & Spices', 'Frozen', 'Other'];

// Store price multipliers relative to the Coles shelf price, and regional adjustments by state (from postcode).
export const STORES = {
  coles: { name: 'Coles', factor: 1.0 },
  woolworths: { name: 'Woolworths', factor: 1.0 },
  aldi: { name: 'Aldi', factor: 0.86 },
  iga: { name: 'IGA', factor: 1.1 },
};
export function stateFromPostcode(pc) {
  const p = parseInt(pc, 10);
  if (!p) return null;
  if ((p >= 200 && p <= 299) || (p >= 2600 && p <= 2618) || (p >= 2900 && p <= 2920)) return 'ACT';
  if (p >= 800 && p <= 999) return 'NT';
  if (p >= 1000 && p <= 2999) return 'NSW';
  if (p >= 3000 && p <= 3999) return 'VIC';
  if (p >= 4000 && p <= 4999) return 'QLD';
  if (p >= 5000 && p <= 5999) return 'SA';
  if (p >= 6000 && p <= 6999) return 'WA';
  if (p >= 7000 && p <= 7999) return 'TAS';
  return null;
}
export const STATE_FACTOR = { NSW: 1.0, ACT: 1.0, VIC: 0.99, QLD: 1.0, SA: 1.0, WA: 1.03, TAS: 1.04, NT: 1.08 };
// Rough capital city coordinates, used for weather when a postcode can't be located more precisely.
export const STATE_COORDS = {
  NSW: [-33.87, 151.21, 'Sydney'], ACT: [-35.28, 149.13, 'Canberra'], VIC: [-37.81, 144.96, 'Melbourne'],
  QLD: [-27.47, 153.03, 'Brisbane'], SA: [-34.93, 138.6, 'Adelaide'], WA: [-31.95, 115.86, 'Perth'],
  TAS: [-42.88, 147.33, 'Hobart'], NT: [-12.46, 130.84, 'Darwin'],
};
