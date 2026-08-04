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

for (const { match } of [...BRANDS, ...OCCASIONS]) FASHION_TERMS.push(...match);

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
  return dictionary
    .filter(({ match }) => match.some((term) => haystack.includes(normalize(term))))
    .map(({ label }) => label);
}

const detectBrands = (text) => matchLabels(text, BRANDS);
const detectOccasions = (text) => matchLabels(text, OCCASIONS);

module.exports = { isFashionQuery, detectBrands, detectOccasions, FASHION_TERMS, BRANDS, OCCASIONS };
