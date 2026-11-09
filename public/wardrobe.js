const all = ['spring', 'summer', 'fall', 'winter'];
const cool = ['spring', 'fall', 'winter'];
const warm = ['spring', 'summer', 'fall'];

export const samples = [
  ['Ecru tee', 'top', '#e8dcc3', 'cream', 'casual', warm],
  ['Rust knit', 'top', '#af5030', 'rust', 'casual', cool],
  ['Sage oxford', 'top', '#778b64', 'sage', 'smart', all],
  ['Ivory blouse', 'top', '#f3e8d5', 'ivory', 'formal', all],
  ['Indigo jeans', 'bottom', '#354b71', 'navy', 'casual', all],
  ['Olive chinos', 'bottom', '#717652', 'olive', 'smart', all],
  ['Charcoal trousers', 'bottom', '#454548', 'charcoal', 'formal', all],
  ['White sneakers', 'shoes', '#eeeae1', 'white', 'casual', all],
  ['Tan loafers', 'shoes', '#a8815b', 'tan', 'smart', all],
  ['Black dress shoes', 'shoes', '#242426', 'black', 'formal', all],
  ['Denim jacket', 'outerwear', '#536a8a', 'blue', 'casual', cool],
  ['Espresso coat', 'outerwear', '#494039', 'brown', 'formal', cool],
  ['Sand jacket', 'outerwear', '#bda480', 'beige', 'smart', cool]
].map(([subtype, type, hex, primary_color, formality, season], index) => ({
  id: 'sample-' + index,
  tags: { subtype, type, primary_color, formality, season, secondary_color: '', pattern: 'solid' },
  hex
}));

function hue(hex) {
  const [r, g, b] = hex.match(/[a-f0-9]{2}/gi).map(pair => parseInt(pair, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < .12 || max < .16 || min > .83) return null;
  const angle = max === r ? (g - b) / delta : max === g ? 2 + (b - r) / delta : 4 + (r - g) / delta;
  return (angle * 60 + 360) % 360;
}

function palette(items) {
  const neutrals = /^(black|white|off[ -]white|gray|grey|charcoal|beige|cream|ivory|ecru|tan|brown|taupe|sand|espresso|navy)$/i;
  const hues = items.filter(item => !neutrals.test(item.tags.primary_color.trim()))
    .map(item => hue(item.hex)).filter(value => value !== null);
  if (!hues.length) return { name: 'Tonal Neutrals', score: 86 };
  if (hues.length === 1) return { name: 'Neutral + Pop', score: 94 };
  const distances = hues.flatMap((first, index) => hues.slice(index + 1).map(second => {
    const distance = Math.abs(first - second);
    return Math.min(distance, 360 - distance);
  }));
  if (distances.every(distance => distance <= 18)) return { name: 'Monochrome', score: 96 };
  if (distances.every(distance => distance <= 45)) return { name: 'Analogous', score: 91 };
  if (distances.some(distance => distance >= 145)
      && distances.every(distance => distance <= 25 || distance >= 145)) return { name: 'Complementary', score: 92 };
  return { name: 'Mixed Palette', score: 45 };
}

function suitableFor(closet, occasion, weather) {
  const season = { warm: ['summer'], mild: ['spring', 'fall'], cold: ['winter'] }[weather];
  return closet.filter(({ tags }) => (!occasion || tags.formality === occasion)
    && (!season || season.some(value => tags.season.includes(value))));
}

// How many color-matched outfits these filters allow. Stops counting at cap.
export function countMatches(closet, occasion, weather, cap = 99) {
  const suitable = suitableFor(closet, occasion, weather);
  const of = type => suitable.filter(item => item.tags.type === type);
  const coats = weather === 'warm' ? [] : of('outerwear');
  const outerwear = weather === 'cold' ? coats : [null, ...coats];
  let count = 0;
  for (const top of of('top')) {
    for (const bottom of of('bottom')) {
      for (const shoes of of('shoes')) {
        for (const coat of outerwear) {
          const items = coat ? [top, bottom, shoes, coat] : [top, bottom, shoes];
          if (palette(items).score >= 80 && ++count > cap) return count;
        }
      }
    }
  }
  return count;
}

export function rollOutfit(closet, occasion, weather, lastKey) {
  const suitable = suitableFor(closet, occasion, weather);
  const pieces = type => suitable.filter(item => item.tags.type === type)
    .map(item => ({ item, order: Math.random() })).sort((a, b) => a.order - b.order)
    .slice(0, 12).map(({ item }) => item);
  const coats = weather === 'warm' ? [] : pieces('outerwear');
  const outerwear = weather === 'cold' ? coats : [null, ...coats];
  const tops = pieces('top');
  const bottoms = pieces('bottom');
  const footwear = pieces('shoes');
  let choice;
  let repeat;
  let best = Infinity;
  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const shoes of footwear) {
        for (const coat of outerwear) {
          const items = coat ? [top, bottom, shoes, coat] : [top, bottom, shoes];
          const rule = palette(items);
          if (rule.score < 80) continue;
          const key = items.map(item => item.id).join('|');
          if (key === lastKey) {
            repeat = { items, rule, key };
            continue;
          }
          const weight = (rule.score - 70) * (coat && weather !== 'cold' ? .5 : 1);
          const rank = -Math.log(1 - Math.random()) / weight;
          if (rank >= best) continue;
          best = rank;
          choice = { items, rule, key };
        }
      }
    }
  }
  return choice || repeat;
}
