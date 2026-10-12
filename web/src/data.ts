export type Category = { id: string; name: string; description: string; image: string };
export type Product = { id: string; name: string; subtitle: string; price: number; category: string; image: string; supplier: string };

export const kazakhstanCities = [
  "Абай", "Акколь", "Аксай", "Аксу", "Актау", "Актобе", "Алатау", "Алга", "Алматы", "Алтай", "Арал", "Аркалык", "Арыс", "Астана", "Атбасар", "Атырау", "Аягоз", "Байконыр", "Балхаш", "Булаево", "Державинск", "Ерейментау", "Есик", "Есиль", "Жанаозен", "Жанатас", "Жаркент", "Жезказган", "Жем", "Жетысай", "Житикара", "Зайсан", "Казалинск", "Кандыагаш", "Караганда", "Каражал", "Каратау", "Каркаралинск", "Каскелен", "Кентау", "Кокшетау", "Конаев", "Костанай", "Косшы", "Кульсары", "Курчатов", "Кызылорда", "Ленгер", "Лисаковск", "Макинск", "Мамлютка", "Павлодар", "Петропавловск", "Приозёрск", "Риддер", "Рудный", "Сарань", "Сарканд", "Сарыагаш", "Сатпаев", "Семей", "Сергеевка", "Серебрянск", "Степногорск", "Степняк", "Тайынша", "Талгар", "Талдыкорган", "Тараз", "Текели", "Темир", "Темиртау", "Тобыл", "Туркестан", "Уральск", "Усть-Каменогорск", "Өскемен", "Ушарал", "Уштобе", "Форт-Шевченко", "Хромтау", "Шалкар", "Шар", "Шардара", "Шахтинск", "Шемонаиха", "Шу", "Шымкент", "Щучинск", "Экибастуз", "Эмба"
];

export const categories: Category[] = [
  { id: "electronics", name: "Электроника", description: "Техника и аксессуары", image: "/products/laptop.png" },
  { id: "office", name: "Офис и канцелярия", description: "Всё для работы", image: "/products/office-chair.png" },
  { id: "home", name: "Дом и интерьер", description: "Уютные пространства", image: "/products/sofa.png" },
  { id: "food", name: "Продукты", description: "Для дома и бизнеса", image: "/products/grocery-set.png" },
  { id: "beauty", name: "Красота и уход", description: "Забота каждый день", image: "/products/skincare.png" },
  { id: "apparel", name: "Одежда", description: "На каждый день", image: "/products/jacket.png" },
  { id: "sport", name: "Спорт и отдых", description: "Для активной жизни", image: "/products/sneakers.png" },
  { id: "equipment", name: "Техника и оборудование", description: "Для любых задач", image: "/products/drill.png" },
];

export const products: Product[] = [
  { id: "laptop", name: "Ноутбук 14″", subtitle: "i5, 16 ГБ, 512 ГБ SSD", price: 280000, category: "Электроника", image: "/products/laptop.png", supplier: "TechnoPlus" },
  { id: "chair", name: "Кресло офисное", subtitle: "Эргономичное, графит", price: 48000, category: "Офис", image: "/products/office-chair.png", supplier: "ОфисМаркет" },
  { id: "sofa", name: "Диван компактный", subtitle: "2 места, светло-серый", price: 185000, category: "Дом и интерьер", image: "/products/sofa.png", supplier: "Домовой" },
  { id: "groceries", name: "Набор продуктов", subtitle: "Свежий ассортимент", price: 8500, category: "Продукты", image: "/products/grocery-set.png", supplier: "ФудСнаб" },
  { id: "skincare", name: "Набор для ухода", subtitle: "4 средства, без отдушек", price: 12900, category: "Красота и уход", image: "/products/skincare.png", supplier: "БьютиМир" },
  { id: "jacket", name: "Куртка базовая", subtitle: "Размеры S–XL", price: 35000, category: "Одежда", image: "/products/jacket.png", supplier: "AlmaWear" },
  { id: "sneakers", name: "Кроссовки для бега", subtitle: "Лёгкие, унисекс", price: 32000, category: "Спорт и отдых", image: "/products/sneakers.png", supplier: "СпортЛидер" },
  { id: "drill", name: "Дрель аккумуляторная", subtitle: "18 В, комплект", price: 56500, category: "Техника и оборудование", image: "/products/drill.png", supplier: "ИнструментПро" },
];

export const suppliers = [
  { name: "TechnoPlus", category: "Электроника и техника", city: "Алматы", products: "320 товаров", mark: "T+", tone: "blue" },
  { name: "ОфисМаркет", category: "Канцелярия и мебель", city: "Астана", products: "1 240 товаров", mark: "ОМ", tone: "violet" },
  { name: "Домовой", category: "Товары для дома", city: "Шымкент", products: "860 товаров", mark: "Д", tone: "mint" },
  { name: "ФудСнаб", category: "Продукты питания", city: "Алматы", products: "610 товаров", mark: "Ф", tone: "orange" },
  { name: "БьютиМир", category: "Красота и уход", city: "Караганда", products: "420 товаров", mark: "БМ", tone: "pink" },
  { name: "СпортЛидер", category: "Спорт и отдых", city: "Астана", products: "530 товаров", mark: "СЛ", tone: "blue" },
];

export const quoteItems = [
  { id: "laptop", name: "Ноутбук 14″", detail: "i5, 16 ГБ, 512 ГБ", category: "Электроника", qty: 2, unit: "шт.", price: 280000, image: "/products/laptop.png" },
  { id: "chair", name: "Кресло офисное", detail: "Эргономичное", category: "Мебель", qty: 4, unit: "шт.", price: 48000, image: "/products/office-chair.png" },
  { id: "paper", name: "Бумага A4", detail: "500 листов", category: "Офис", qty: 10, unit: "упак.", price: 3200, image: "/products/grocery-set.png" },
  { id: "apples", name: "Яблоки сезонные", detail: "Свежие, 1 кг", category: "Продукты", qty: 20, unit: "кг", price: 1200, image: "/products/grocery-set.png" },
  { id: "jacket", name: "Куртка рабочая", detail: "Размеры M–XL", category: "Одежда", qty: 6, unit: "шт.", price: 12000, image: "/products/jacket.png" },
  { id: "skincare", name: "Средство для ухода", detail: "Набор из 4 шт.", category: "Красота и уход", qty: 5, unit: "набор", price: 7500, image: "/products/skincare.png" },
];
