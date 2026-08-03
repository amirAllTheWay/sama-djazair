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
  // marques régulièrement associées aux célébrités mode
  'bottega',
  'chanel',
  'valentino',
  'burberry',
  'cartier',
  'prada',
  'gucci',
  'dior',
  'saint laurent',
  'versace',
  'balenciaga',
  'fendi',
  'hermes',
  'hermès',
  'louis vuitton',
  'celine',
  'céline',
  'zegna',
  'armani',
  // contextes mode
  'red carpet',
  'tapis rouge',
  'met gala',
  'fashion week',
  'defile',
  'défilé',
  'runway',
  'campagne',
  'campaign',
  'ambassadeur',
  'ambassador',
  'egerie',
  'égérie',
];

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

module.exports = { isFashionQuery, FASHION_TERMS };
