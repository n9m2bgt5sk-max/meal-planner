// Special-occasion themes and visual app themes.
export const EVENT_THEMES = [
  { key: 'italian-night', label: 'Italian night', emoji: '🇮🇹', cuisines: ['Italian'], words: ['pasta', 'pizza', 'italian', 'risotto', 'lasagne'] },
  { key: 'mexican-fiesta', label: 'Mexican fiesta', emoji: '🌮', cuisines: ['Mexican'], words: ['taco', 'nacho', 'burrito', 'fajita', 'mexican', 'salsa'] },
  { key: 'asian-feast', label: 'Asian feast', emoji: '🥢', cuisines: ['Chinese', 'Thai', 'Japanese', 'Korean', 'Vietnamese', 'Malaysian'], words: ['stir', 'noodle', 'dumpling', 'satay', 'curry'] },
  { key: 'indian-banquet', label: 'Indian banquet', emoji: '🍛', cuisines: ['Indian'], words: ['curry', 'dahl', 'tikka', 'masala', 'naan'] },
  { key: 'aussie-bbq', label: 'Aussie BBQ', emoji: '🔥', cuisines: ['Australian'], words: ['bbq', 'barbecue', 'sausage', 'burger', 'grill', 'skewer'] },
  { key: 'greek-feast', label: 'Greek feast', emoji: '🫒', cuisines: ['Greek', 'Mediterranean'], words: ['greek', 'souvlaki', 'tzatziki', 'feta', 'lamb'] },
  { key: 'american-diner', label: 'American diner', emoji: '🍔', cuisines: ['American'], words: ['burger', 'mac', 'pulled', 'wings', 'hot dog', 'pancake'] },
  { key: 'christmas', label: 'Christmas', emoji: '🎄', cuisines: ['Australian', 'British'], words: ['roast', 'ham', 'prawn', 'pavlova', 'glazed', 'turkey'] },
  { key: 'easter', label: 'Easter', emoji: '🐣', cuisines: [], words: ['lamb', 'roast', 'fish', 'hot cross', 'chocolate'] },
  { key: 'halloween', label: 'Halloween', emoji: '🎃', cuisines: [], words: ['pumpkin', 'spooky', 'chocolate', 'chilli'] },
  { key: 'birthday', label: 'Birthday', emoji: '🎂', cuisines: [], words: ['cake', 'cupcake', 'party', 'pizza'] },
  { key: 'kids-party', label: "Kids' party", emoji: '🎈', cuisines: [], words: ['fairy', 'sausage roll', 'pizza', 'nugget', 'cupcake', 'party'] },
  { key: 'movie-night', label: 'Movie night', emoji: '🍿', cuisines: ['American', 'Mexican'], words: ['pizza', 'nacho', 'burger', 'popcorn', 'wings'] },
  { key: 'game-day', label: 'Game day / footy', emoji: '🏉', cuisines: ['American', 'Australian'], words: ['pie', 'sausage roll', 'wings', 'nacho', 'burger', 'pizza'] },
  { key: 'high-tea', label: 'High tea', emoji: '🫖', cuisines: ['British'], words: ['scone', 'sandwich', 'cake', 'tart', 'cupcake'] },
  { key: 'brunch-party', label: 'Brunch party', emoji: '🥞', cuisines: [], words: ['pancake', 'egg', 'avocado', 'bacon', 'frittata', 'muffin'] },
  { key: 'australia-day', label: 'Australia Day', emoji: '🇦🇺', cuisines: ['Australian'], words: ['lamb', 'bbq', 'pavlova', 'lamington', 'prawn', 'sausage'] },
  { key: 'melbourne-cup', label: 'Melbourne Cup', emoji: '🏇', cuisines: [], words: ['sandwich', 'salad', 'tart', 'prawn', 'scone', 'finger'] },
  { key: 'valentines', label: "Valentine's / date night", emoji: '❤️', cuisines: ['French', 'Italian'], words: ['steak', 'salmon', 'risotto', 'chocolate', 'carbonara'] },
  { key: 'mothers-day', label: "Mother's Day", emoji: '💐', cuisines: [], words: ['brunch', 'pancake', 'salmon', 'cake'] },
  { key: 'fathers-day', label: "Father's Day", emoji: '👔', cuisines: [], words: ['steak', 'bbq', 'roast', 'burger'] },
];

export const EVENT_STYLES = {
  dinner: { label: 'Sit-down dinner', courses: ['main', 'side', 'dessert'] },
  party: { label: 'Party / finger food', courses: ['nibbles', 'nibbles', 'main', 'dessert'] },
  bbq: { label: 'BBQ', courses: ['main', 'side', 'side', 'dessert'] },
  brunch: { label: 'Brunch', courses: ['brunch', 'brunch', 'side'] },
};

export const APP_THEMES = [
  { key: 'farmhouse', label: 'Farmhouse', swatch: ['#c8553d', '#fbf4e8'] },
  { key: 'garden', label: 'Herb garden', swatch: ['#4f7d4a', '#f3f6ec'] },
  { key: 'seaside', label: 'Seaside', swatch: ['#2f6f97', '#eef5f8'] },
  { key: 'sunshine', label: 'Sunshine', swatch: ['#d98b00', '#fff8e1'] },
  { key: 'berry', label: 'Berry', swatch: ['#a23b6b', '#fbf0f4'] },
  { key: 'night', label: 'Night kitchen', swatch: ['#f0a35e', '#1f1a17'] },
];

export function themeMatch(recipe, themeKey, freeText) {
  const t = EVENT_THEMES.find(x => x.key === themeKey);
  let score = 0;
  const name = (recipe.name + ' ' + (recipe.description || '')).toLowerCase();
  if (t) {
    if ((recipe.tags || []).includes(t.key)) score += 4;
    if (t.cuisines.includes(recipe.cuisine)) score += 2;
    if (t.words.some(w => name.includes(w))) score += 1.5;
  }
  if (freeText) {
    const words = freeText.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3);
    for (const w of words) {
      if (name.includes(w) || (recipe.tags || []).some(tag => tag.includes(w)) || recipe.cuisine.toLowerCase().includes(w)) score += 2;
    }
  }
  return score;
}
