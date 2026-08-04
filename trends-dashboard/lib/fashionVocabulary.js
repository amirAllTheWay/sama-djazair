// Terms that mark a search as being about what someone wears rather than who
// they are. Kept in both French and English: hl=fr shapes Google's interface
// language, not what people type, and fashion vocabulary travels untranslated
// ("outfit", "streetwear", "look" are used as-is in French searches).
const FASHION_TERMS = [
  // vêtements
  'outfit',
  'tenue',
  'look',
  'style',
  'mode',
  'fashion',
  'porte',
  'wearing',
  'wear',
  'dressed',
  'habill',
  'vetement',
  'vêtement',
  'clothes',
  'clothing',
  'garde-robe',
  'wardrobe',
  'streetwear',
  'street style',
  // pièces
  'costume',
  'suit',
  'smoking',
  'tuxedo',
  'veste',
  'jacket',
  'blazer',
  'manteau',
  'coat',
  'chemise',
  'shirt',
  'tshirt',
  't-shirt',
  'pull',
  'sweater',
  'jean',
  'jeans',
  'pantalon',
  'trousers',
  'pants',
  'short',
  'chaussure',
  'shoes',
  'sneaker',
  'basket',
  'boots',
  'bottes',
  'mocassin',
  'loafer',
  'cravate',
  'tie',
  'lunettes',
  'sunglasses',
  'glasses',
  'sac',
  'bag',
  'handbag',
  'montre',
  'watch',
  'bijou',
  'jewelry',
  'jewellery',
  'bague',
  'ring',
  'collier',
  'necklace',
  'boucle',
  'earring',
  'ceinture',
  'belt',
  'casquette',
  'cap',
  'hat',
  'chapeau',
  'echarpe',
  'écharpe',
  'scarf',
];

// Canonical label first, then the spellings that appear in copy. Used both to
// mark a search as fashion-related and to answer "which house was it" for an
// article, so the display name is kept apart from the match strings.
const BRANDS = [
  { label: 'Bottega Veneta', match: ['bottega veneta', 'bottega'] },
  { label: 'Chanel', match: ['chanel'] },
  { label: 'Valentino', match: ['valentino'] },
  { label: 'Burberry', match: ['burberry'] },
  { label: 'Cartier', match: ['cartier'] },
  { label: 'Prada', match: ['prada'] },
  { label: 'Miu Miu', match: ['miu miu'] },
  { label: 'Gucci', match: ['gucci'] },
  { label: 'Dior', match: ['dior'] },
  { label: 'Saint Laurent', match: ['saint laurent', 'ysl'] },
  { label: 'Versace', match: ['versace'] },
  { label: 'Balenciaga', match: ['balenciaga'] },
  { label: 'Fendi', match: ['fendi'] },
  { label: 'Hermès', match: ['hermes', 'hermès'] },
  { label: 'Louis Vuitton', match: ['louis vuitton'] },
  { label: 'Celine', match: ['celine', 'céline'] },
  { label: 'Zegna', match: ['zegna'] },
  { label: 'Armani', match: ['armani', 'giorgio armani'] },
  { label: 'Loewe', match: ['loewe'] },
  { label: 'Jacquemus', match: ['jacquemus'] },
  { label: 'Ralph Lauren', match: ['ralph lauren'] },
  { label: 'Tom Ford', match: ['tom ford'] },
  { label: 'Omega', match: ['omega'] },
  { label: 'Rolex', match: ['rolex'] },
  { label: 'Nike', match: ['nike'] },
  { label: 'Adidas', match: ['adidas'] },
  { label: 'New Balance', match: ['new balance'] },
];

// The garments themselves, labelled in French for display. Ordered most
// specific first so "leather tie" is reported rather than plain "cravate".
const GARMENTS = [
  { label: 'Cravate en cuir', match: ['leather tie'], absorbs: ['Cravate'] },
  { label: 'Cravate', match: ['necktie', 'cravate'] },
  { label: 'Costume rayé', match: ['pinstripe suit', 'pinstripe'], absorbs: ['Costume'] },
  {
    label: 'Costume 3 pièces',
    match: ['three-piece suit', 'three piece suit'],
    absorbs: ['Costume'],
  },
  { label: 'Smoking', match: ['tuxedo', 'tux ', 'smoking'], absorbs: ['Costume'] },
  { label: 'Costume', match: ['suit', 'costume', 'tailoring'] },
  { label: 'Veste croisée', match: ['double-breasted', 'double breasted'] },
  { label: 'Blazer', match: ['blazer'] },
  { label: 'Manteau', match: ['overcoat', 'trench', 'coat', 'manteau'] },
  { label: 'Cuir', match: ['leather jacket', 'leather coat'] },
  { label: 'Maille', match: ['knitwear', 'sweater', 'cardigan', 'jumper', 'maille'] },
  { label: 'Chemise', match: ['shirt', 'poplin', 'chemise'] },
  { label: 'T-shirt', match: ['t-shirt', 'tshirt', 'tee '] },
  { label: 'Jean', match: ['jeans', 'denim'] },
  { label: 'Pantalon', match: ['trousers', 'pantalon', 'slacks'] },
  { label: 'Short', match: ['shorts'] },
  { label: 'Mocassins', match: ['loafers', 'mocassins'] },
  { label: 'Sneakers', match: ['sneakers', 'trainers', 'baskets'] },
  { label: 'Bottes', match: ['boots', 'bottes'] },
  { label: 'Sandales', match: ['sandals', 'flip-flops'] },
  { label: 'Lunettes de soleil', match: ['sunglasses', 'shades', 'lunettes de soleil'] },
  { label: 'Sac', match: ['handbag', 'tote', 'crossbody', 'shoulder bag', 'purse', 'sac'] },
  { label: 'Montre', match: ['watch', 'montre'] },
  { label: 'Bijoux', match: ['jewellery', 'jewelry', 'earrings', 'necklace', 'bijoux'] },
  { label: 'Casquette', match: ['cap', 'beanie', 'casquette', 'bonnet'] },
  { label: 'Écharpe', match: ['scarf', 'écharpe', 'echarpe'] },
];

// Where a look was worn — the other half of what makes an outfit story usable.
const OCCASIONS = [
  { label: 'Oscars', match: ['oscars', 'academy awards'] },
  { label: 'Golden Globes', match: ['golden globes'] },
  { label: 'SAG Awards', match: ['sag awards', 'sag actor', 'screen actors guild'] },
  { label: 'BAFTA', match: ['bafta'] },
  { label: 'Met Gala', match: ['met gala'] },
  { label: 'Cannes', match: ['cannes'] },
  { label: 'Venise', match: ['venice film festival', 'mostra'] },
  { label: 'Fashion Week', match: ['fashion week'] },
  { label: 'Défilé', match: ['runway', 'front row', 'défilé', 'defile'] },
  { label: 'Première', match: ['premiere', 'première', 'red carpet', 'tapis rouge'] },
  { label: 'Photocall', match: ['photocall', 'photo call'] },
  { label: 'Campagne', match: ['campaign', 'campagne', 'ambassador', 'ambassadeur'] },
  { label: 'Aéroport', match: ['airport', 'aéroport', 'aeroport'] },
  { label: 'Street style', match: ['street style', 'streetwear', 'out and about', 'spotted'] },
];

for (const { match } of [...BRANDS, ...OCCASIONS, ...GARMENTS]) FASHION_TERMS.push(...match);

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const NORMALIZED_TERMS = FASHION_TERMS.map(normalize);

function isFashionQuery(query) {
  const haystack = normalize(query);
  return NORMALIZED_TERMS.some((term) => haystack.includes(term));
}

function matchLabels(text, dictionary) {
  const haystack = normalize(text);
  const hits = dictionary.filter(({ match }) =>
    match.some((term) => haystack.includes(normalize(term)))
  );

  // "Pinstripe suit" matches both the specific entry and the generic one;
  // listing "Costume rayé, Costume" reads as two garments rather than one.
  const absorbed = new Set(hits.flatMap((entry) => entry.absorbs || []));
  return hits.map(({ label }) => label).filter((label) => !absorbed.has(label));
}

const detectBrands = (text) => matchLabels(text, BRANDS);
const detectOccasions = (text) => matchLabels(text, OCCASIONS);
const detectGarments = (text) => matchLabels(text, GARMENTS);

module.exports = {
  isFashionQuery,
  detectBrands,
  detectOccasions,
  detectGarments,
  FASHION_TERMS,
  BRANDS,
  OCCASIONS,
  GARMENTS,
};
