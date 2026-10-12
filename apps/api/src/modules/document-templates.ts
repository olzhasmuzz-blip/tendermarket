export function numberToWordsKzt(amount: number): string {
  const intPart = Math.floor(Math.abs(amount));
  const tiyn = Math.round((Math.abs(amount) - intPart) * 100);

  const units = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const unitsFem = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const teens = [
    "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать",
    "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать",
  ];
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

  function getGroup(val: number, isFem = false): string {
    const h = Math.floor(val / 100);
    const d = Math.floor((val % 100) / 10);
    const u = val % 10;
    const parts: string[] = [];

    if (h) parts.push(hundreds[h]);
    if (d === 1) {
      parts.push(teens[u]);
    } else {
      if (d) parts.push(tens[d]);
      if (u) parts.push(isFem ? unitsFem[u] : units[u]);
    }
    return parts.filter(Boolean).join(" ");
  }

  function decline(val: number, one: string, two: string, five: string): string {
    const n = Math.abs(val) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return five;
    if (n1 > 1 && n1 < 5) return two;
    if (n1 === 1) return one;
    return five;
  }

  if (intPart === 0) {
    return `Ноль тенге ${String(tiyn).padStart(2, "0")} тиын`;
  }

  const billions = Math.floor(intPart / 1_000_000_000);
  const millions = Math.floor((intPart % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((intPart % 1_000_000) / 1_000);
  const ones = intPart % 1_000;

  const res: string[] = [];
  if (billions) {
    res.push(getGroup(billions), decline(billions, "миллиард", "миллиарда", "миллиардов"));
  }
  if (millions) {
    res.push(getGroup(millions), decline(millions, "миллион", "миллиона", "миллионов"));
  }
  if (thousands) {
    res.push(getGroup(thousands, true), decline(thousands, "тысяча", "тысячи", "тысяч"));
  }
  if (ones) {
    res.push(getGroup(ones));
  }

  const tengeWord = decline(intPart, "тенге", "тенге", "тенге");
  const words = res.filter(Boolean).join(" ");
  const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
  return `${capitalized} ${tengeWord} ${String(tiyn).padStart(2, "0")} тиын`;
}

export function generateContractContent(deal: any) {
  const isService =
    deal.offer?.request?.type === "SERVICE" ||
    deal.offer?.items?.some((i: any) =>
      ["усл.", "час", "проект", "смена", "месяц"].includes(i.requestItem?.unit)
    );

  const total = Number(deal.agreedTotal);
  const totalInWords = numberToWordsKzt(total);
  const dateFormatted = new Date(deal.createdAt).toLocaleDateString("ru-KZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const city = deal.offer?.request?.region || "г. Астана";
  const supplierName = deal.supplier?.name || "Поставщик";
  const buyerName = deal.buyer?.name || "Заказчик";
  const contractNumber = `TM-Д-${deal.number}`;

  const items = (deal.offer?.items || []).map((item: any, idx: number) => ({
    index: idx + 1,
    name: item.requestItem?.name || `Позиция ${idx + 1}`,
    quantity: Number(item.quantity || 1),
    unit: item.requestItem?.unit || "шт.",
    unitPrice: Number(item.unitPrice || 0),
    totalPrice: Number(item.quantity || 1) * Number(item.unitPrice || 0),
  }));

  const deliveryPrice = Number(deal.offer?.deliveryPrice || 0);

  return {
    contractType: isService ? "SERVICE" : "DELIVERY",
    title: isService
      ? `ДОГОВОР ВОЗМЕЗДНОГО ОКАЗАНИЯ УСЛУГ (ПОДРЯДА) № ${contractNumber}`
      : `ДОГОВОР КУПЛИ-ПРОДАЖИ (ПОСТАВКИ ТОВАРОВ) № ${contractNumber}`,
    contractNumber,
    date: dateFormatted,
    city,
    legalBasis:
      "Составлен в электронной форме в соответствии со статьями 152, 386, 393-397 Гражданского кодекса Республики Казахстан и Законом Республики Казахстан «Об электронном документе и электронной цифровой подписи».",
    parties: {
      seller: {
        roleTitle: isService ? "Исполнитель" : "Поставщик",
        name: supplierName,
        region: deal.supplier?.region || city,
        bin: "БИН " + (deal.supplier?.id ? deal.supplier.id.slice(0, 12).replace(/\D/g, "7").padEnd(12, "0") : "980440001234"),
        iban: "KZ" + (deal.supplier?.id ? deal.supplier.id.slice(0, 18).replace(/\D/g, "4").padEnd(18, "0") : "459260000000001234"),
        bank: "АО «Kaspi Bank» / АО «Народный Банк Казахстана (Halyk)»",
        bik: "CASPKZKA",
      },
      buyer: {
        roleTitle: "Заказчик",
        name: buyerName,
        region: deal.offer?.request?.region || city,
        bin: "БИН/ИИН " + (deal.buyer?.id ? deal.buyer.id.slice(0, 12).replace(/\D/g, "8").padEnd(12, "0") : "010340005678"),
        iban: "KZ" + (deal.buyer?.id ? deal.buyer.id.slice(0, 18).replace(/\D/g, "5").padEnd(18, "0") : "789260000000005678"),
        bank: "АО «ForteBank» / АО «Банк ЦентрКредит»",
        bik: "FORTKZKA",
      },
    },
    sections: [
      {
        title: "1. ПРЕДМЕТ ДОГОВОРА",
        body: isService
          ? `1.1. Исполнитель обязуется по заданию Заказчика оказать услуги (выполнить работы), указанные в Спецификации настоящего Договора, а Заказчик обязуется принять результат оказанных услуг (выполненных работ) и оплатить их в порядке и на условиях, предусмотренных настоящим Договором.\n1.2. Место оказания услуг: ${city}.`
          : `1.1. Поставщик обязуется передать в собственность Заказчика товары в количестве, ассортименте и по ценам согласно Спецификации настоящего Договора, а Заказчик обязуется принять указанные товары и оплатить их.\n1.2. Место поставки товаров: ${city}.`,
      },
      {
        title: "2. СТОИМОСТЬ И ПОРЯДОК РАСЧЕТОВ",
        body: `2.1. Общая сумма настоящего Договора составляет ${new Intl.NumberFormat("ru-KZ").format(total)} ₸ (${totalInWords}). НДС: согласно налоговому законодательству РК.\n2.2. Оплата производится безналичным расчетом путем перечисления денежных средств на банковские реквизиты либо через безопасный платежный шлюз электронной площадки TenderMarket.\n2.3. В сумму договора включены все налоги, сборы, транспортные расходы${deliveryPrice ? ` (включая доставку: ${new Intl.NumberFormat("ru-KZ").format(deliveryPrice)} ₸)` : ""} и сопутствующие затраты.`,
      },
      {
        title: "3. ПОРЯДОК ПРИЕМКИ И ДОКУМЕНТООБОРОТ",
        body: isService
          ? "3.1. Сдача-приемка оказанных услуг (выполненных работ) оформляется Актом выполненных работ (оказанных услуг) по форме Р-1, утвержденной Приказом Министра финансов РК № 562.\n3.2. Заказчик обязан в течение 3 (трех) рабочих дней с момента предоставления Акта подписать его электронной подписью либо направить мотивированный отказ."
          : "3.1. Приемка товаров по количеству и качеству производится в момент передачи с оформлением Накладной на отпуск запасов на сторону (форма З-2, Приказ МФ РК № 562).\n3.2. Право собственности и риски случайной гибели переходят к Заказчику с момента подписания электронной накладной.",
      },
      {
        title: "4. ОТВЕТСТВЕННОСТЬ СТОРОН И РАЗРЕШЕНИЕ СПОРОВ",
        body: "4.1. Стороны несут ответственность за неисполнение или ненадлежащее исполнение обязательств в соответствии с нормами действующего законодательства Республики Казахстан.\n4.2. Все споры и разногласия подлежат обязательному досудебному урегулированию через сервис Арбитража TenderMarket в соответствии с Регламентом разрешения споров платформы.",
      },
      {
        title: "5. ЭЛЕКТРОННОЕ ПОДПИСАНИЕ И ЮРИДИЧЕСКАЯ СИЛА",
        body: "5.1. Настоящий договор составлен в электронном виде и подписывается Сторонами с использованием аналога собственноручной подписи (простой электронной подписи / ПЭП) в информационной системе TenderMarket.\n5.2. Стороны признают юридическую силу электронного документа, факт подписания подтверждается уникальным криптографическим хэшем, IP-адресом и системным штампом времени акцепта.",
      },
    ],
    items,
    deliveryPrice,
    total,
    totalInWords,
  };
}

export function generateInvoiceContent(deal: any) {
  const total = Number(deal.agreedTotal);
  const totalInWords = numberToWordsKzt(total);
  const dateFormatted = new Date().toLocaleDateString("ru-KZ");
  const invoiceNumber = `TM-СЧ-${deal.number}`;

  const supplierName = deal.supplier?.name || "Поставщик";
  const buyerName = deal.buyer?.name || "Заказчик";

  const items = (deal.offer?.items || []).map((item: any, idx: number) => ({
    index: idx + 1,
    name: item.requestItem?.name || `Товар/Услуга ${idx + 1}`,
    quantity: Number(item.quantity || 1),
    unit: item.requestItem?.unit || "шт.",
    unitPrice: Number(item.unitPrice || 0),
    totalPrice: Number(item.quantity || 1) * Number(item.unitPrice || 0),
  }));

  if (Number(deal.offer?.deliveryPrice) > 0) {
    items.push({
      index: items.length + 1,
      name: "Доставка и экспедирование груза",
      quantity: 1,
      unit: "усл.",
      unitPrice: Number(deal.offer.deliveryPrice),
      totalPrice: Number(deal.offer.deliveryPrice),
    });
  }

  return {
    invoiceNumber,
    date: dateFormatted,
    supplier: {
      name: supplierName,
      bin: "980440001234",
      iban: "KZ459260000000001234",
      bank: "АО «Kaspi Bank»",
      bik: "CASPKZKA",
      kbe: "17",
      address: deal.supplier?.region || "Республика Казахстан",
    },
    buyer: {
      name: buyerName,
      bin: "010340005678",
      address: deal.offer?.request?.region || "Республика Казахстан",
    },
    paymentPurpose: `Оплата по сделке № TM-${deal.number} согласно договору № TM-Д-${deal.number}. Без НДС.`,
    items,
    total,
    totalInWords,
  };
}

export function generateWaybillContent(deal: any) {
  const total = Number(deal.agreedTotal);
  const dateFormatted = new Date().toLocaleDateString("ru-KZ");
  const waybillNumber = `TM-НАК-${deal.number}`;

  const supplierName = deal.supplier?.name || "Поставщик";
  const buyerName = deal.buyer?.name || "Заказчик";

  const items = (deal.offer?.items || []).map((item: any, idx: number) => ({
    index: idx + 1,
    name: item.requestItem?.name || `Товар ${idx + 1}`,
    sku: `SKU-${1000 + idx}`,
    unit: item.requestItem?.unit || "шт.",
    quantityReleased: Number(item.quantity || 1),
    quantityReceived: Number(item.quantity || 1),
    unitPrice: Number(item.unitPrice || 0),
    totalPrice: Number(item.quantity || 1) * Number(item.unitPrice || 0),
  }));

  return {
    standardForm: "Форма З-2 (Приложение 26 к приказу Министра финансов РК от 20.12.2012 № 562)",
    waybillNumber,
    date: dateFormatted,
    consignor: {
      name: supplierName,
      bin: "980440001234",
    },
    consignee: {
      name: buyerName,
      bin: "010340005678",
    },
    basisDocument: `Договор № TM-Д-${deal.number}`,
    items,
    total,
    totalInWords: numberToWordsKzt(total),
    releaserTitle: "Отпуск груза разрешил: Руководитель / Менеджер склада",
    receiverTitle: "Груз принял в полной сохранности: Уполномоченный представитель",
  };
}

export function generateActOfCompletionContent(deal: any) {
  const total = Number(deal.agreedTotal);
  const dateFormatted = new Date().toLocaleDateString("ru-KZ");
  const actNumber = `TM-АВР-${deal.number}`;

  const supplierName = deal.supplier?.name || "Исполнитель";
  const buyerName = deal.buyer?.name || "Заказчик";

  const items = (deal.offer?.items || []).map((item: any, idx: number) => ({
    index: idx + 1,
    name: item.requestItem?.name || `Услуга / работа ${idx + 1}`,
    completionDate: dateFormatted,
    unit: item.requestItem?.unit || "усл.",
    quantity: Number(item.quantity || 1),
    unitPrice: Number(item.unitPrice || 0),
    totalPrice: Number(item.quantity || 1) * Number(item.unitPrice || 0),
  }));

  return {
    standardForm: "Форма Р-1 (Приложение 50 к приказу Министра финансов РК от 20.12.2012 № 562)",
    actNumber,
    date: dateFormatted,
    executor: {
      name: supplierName,
      bin: "980440001234",
    },
    customer: {
      name: buyerName,
      bin: "010340005678",
    },
    basisDocument: `Договор № TM-Д-${deal.number}`,
    items,
    total,
    totalInWords: numberToWordsKzt(total),
    acceptanceNote:
      "Вышеперечисленные работы (услуги) выполнены полностью и в срок. Заказчик претензий по объему, качеству и срокам оказания услуг не имеет.",
  };
}

export function generateReceiptContent(deal: any) {
  const total = Number(deal.agreedTotal);
  const now = new Date();
  const dateFormatted = now.toLocaleString("ru-KZ");
  const receiptNumber = `TM-ЧЕК-${deal.number}`;

  return {
    title: "ФИСКАЛЬНЫЙ ЧЕК / КВИТАНЦИЯ ОБ ОПЛАТЕ",
    receiptNumber,
    dateTime: dateFormatted,
    terminalId: "TM-POS-KZ-01",
    rnm: "990100481234",
    znm: "FST0098231",
    fpd: "482109418291",
    operator: "ТОО «TenderMarket Operations»",
    bin: "230940019284",
    paymentType: "БЕЗНАЛИЧНЫЙ РАСЧЕТ (Электронный платеж TenderMarket)",
    dealNumber: `Сделка № TM-${deal.number}`,
    total,
    qrVerificationUrl: `https://tendermarket.kz/receipt/${deal.id}`,
    fiscalStatus: "ЧЕК ЗАРЕГИСТРИРОВАН В ОФД КАЗАХСТАНА",
  };
}
