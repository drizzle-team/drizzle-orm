// prettier-ignore
export const customerIds = [
  'LAZYK', 'FOLIG', 'QUEDE', 'MORGK', 'SAVEA', 'AROUT',
  'VICTE', 'ISLAT', 'EASTC', 'BOLID', 'SIMOB', 'LEHMS',
  'LETSS', 'FRANS', 'FAMIA', 'LACOR', 'GROSR', 'MEREP',
  'BERGS', 'RICAR', 'CENTC', 'FISSA', 'WANDK', 'BLONP',
  'OCEAN', 'PERIC', 'MAISD', 'LAMAI', 'LINOD', 'BOTTM',
  'NORTS', 'QUEEN', 'LILAS', 'SPLIR', 'WILMK', 'HILAA',
  'LONEP', 'TRAIH', 'SANTG', 'FRANK', 'TRADH', 'WARTH',
  'REGGC', 'RICSU', 'THECR', 'VAFFE', 'ANATR', 'BSBEV',
  'TORTU', 'WOLZA', 'WHITC', 'SUPRD', 'TOMSP', 'HANAR',
  'DRACD', 'RANCH', 'SEVES', 'GODOS', 'CHOPS', 'BONAP',
  'KOENE', 'COMMI', 'CACTU', 'GREAL', 'ALFKI', 'BLAUS',
  'OTTIK', 'WELLI', 'ERNSH', 'OLDWO', 'FRANR', 'PRINI',
  'VINET', 'MAGAA', 'GOURL', 'LAUGB', 'PARIS', 'GALED',
  'DUMON', 'HUNGC', 'QUICK', 'SPECD', 'HUNGO', 'RATTC',
  'PICCO', 'FURIB', 'THEBI', 'ROMEY', 'CONSH', 'FOLKO',
  'ANTON'
]

// prettier-ignore
export const customerSearches = [
  "ve", "ey", "or", "bb", "te",
  "ab", "ca", "ki", "ap", "be",
  "ct", "hi", "er", "pr", "pi",
  "en", "au", "ra", "ti", "ke",
  "ou", "ur", "me", "ea", "op",
  "at", "ne", "na", "os", "ri",
  "on", "ha", "il", "to", "as",
  "io", "di", "zy", "az", "la",
  "ko", "st", "gh", "ug", "ac",
  "cc", "ch", "hu", "re", "an",
];

// prettier-ignore
export const productSearches = [
  "ha", "ey", "or", "po", "te",
  "ab", "er", "ke", "ap", "be",
  "en", "au", "ra", "ti", "su",
  "sa", "hi", "nu", "ge", "pi",
  "ou", "ur", "me", "ea", "tu",
  "at", "ne", "na", "os", "ri",
  "on", "ka", "il", "to", "as",
  "io", "di", "za", "fa", "la",
  "ko", "st", "gh", "ug", "ac",
  "cc", "ch", "pa", "re", "an",
];

const employeeIdStart = 1;
const employeeIdEnd = 10;
export const employeeIds = Array.from({ length: employeeIdEnd - employeeIdStart }, (_, i) => i + employeeIdStart);

const supplierIdStart = 1;
const supplierIdEnd = 30;
export const supplierIds = Array.from({ length: supplierIdEnd - supplierIdStart }, (_, i) => i + supplierIdStart);

const productIdStart = 1;
const productIdEnd = 78;
export const productIds = Array.from({ length:  productIdEnd - productIdStart  }, (_, i) => i + productIdEnd);

const getRandomOrderIds = () => {
  const firstId = 10248;
  const lastId = 27065;
  const orderIds = new Set<number>();
  while (orderIds.size <= 100) orderIds.add(Math.round(firstId + Math.random() * (lastId - firstId)));
  return Array.from(orderIds);
};

export const orderIds = getRandomOrderIds();
