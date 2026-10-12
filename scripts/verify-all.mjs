const base = 'http://localhost:3001/api/v1';

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function get(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function patch(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function run() {
  const suffix = Math.random().toString(36).substring(2, 10);
  console.log(`\n=== 1. Registering test users (${suffix}) ===`);
  const buyer = await post('/auth/register', {
    email: `buyer-${suffix}@example.test`,
    password: 'LocalTestPass2026!',
    displayName: 'ТОО Заказчик Тест',
    role: 'customer',
    organizationName: `Заказчик ${suffix}`,
  });
  const supplier = await post('/auth/register', {
    email: `supplier-${suffix}@example.test`,
    password: 'LocalTestPass2026!',
    displayName: 'ТОО Поставщик Тест',
    role: 'supplier',
    organizationName: `Поставщик ${suffix}`,
  });
  const admin = await post('/auth/login', {
    login: 'admin@tendermarket.test',
    password: 'LocalTestPass2026!',
  });

  console.log('✓ Users authenticated.');

  await post('/supplier/profile', {
    publicName: `ТОО Поставщик ${suffix}`,
    about: 'Надежный поставщик услуг и товаров',
    regions: ['Алматы', 'Өскемен'],
    categoryIds: [],
  }, supplier.accessToken);
  console.log('✓ Supplier profile configured.');

  console.log('\n=== 2. Creating SERVICE Request ===');
  const cats = await get('/categories');
  const catId = cats[0].id;
  const req = await post('/requests', {
    title: `Монтаж и пусконаладка сети ${suffix}`,
    type: 'SERVICE',
    region: 'Алматы',
    deliveryAddress: 'пр. Достык 45',
    budget: 300000,
    items: [
      { name: 'Монтажные работы', type: 'SERVICE', quantity: 20, unit: 'час', categoryId: catId },
    ],
  }, buyer.accessToken);
  console.log(`✓ Request created: ID = ${req.id}, Type = ${req.type}, Items = ${req.items.length}`);

  console.log('\n=== 3. Submitting and Accepting Offer ===');
  const reqItemId = req.items[0].id;
  const offer = await post(`/requests/${req.id}/offers`, {
    deliveryPrice: 0,
    paymentTerms: 'Безналичный расчет, постоплата 100%',
    note: 'Специалисты сертифицированы',
    items: [
      { requestItemId: reqItemId, unitPrice: 12000, available: true, quantity: 20 },
    ],
  }, supplier.accessToken);
  console.log(`✓ Offer created: ID = ${offer.id}, Total = ${offer.totalPrice}`);

  const deal = await post(`/offers/${offer.id}/accept`, {}, buyer.accessToken);
  console.log(`✓ Deal created: ID = ${deal.id}, Number = TM-${deal.number}`);

  console.log('\n=== 4. Fetching Kazakhstan Official Documents ===');
  const docs = await get(`/deals/${deal.id}/documents`, buyer.accessToken);
  console.log(`✓ Generated documents count: ${docs.length}`);
  for (const d of docs) {
    console.log(`   - [${d.type}] ${d.title} | Status: ${d.status}`);
  }

  console.log('\n=== 5. Supplier E-Signing Contract ===');
  const signedSupplier = await post(`/deals/${deal.id}/documents/CONTRACT/sign`, {}, supplier.accessToken);
  console.log(`✓ Supplier signed: Status = ${signedSupplier.status}, Code = ${signedSupplier.verificationCode}, Supplier = ${signedSupplier.supplierSignerName}`);

  console.log('\n=== 6. Buyer E-Signing Contract ===');
  const signedBoth = await post(`/deals/${deal.id}/documents/CONTRACT/sign`, {}, buyer.accessToken);
  console.log(`✓ Buyer signed: Status = ${signedBoth.status}, Code = ${signedBoth.verificationCode}, Buyer = ${signedBoth.buyerSignerName}`);

  console.log('\n=== 7. Creating Subcontract (Өскемен локальный субподряд) ===');
  const sub = await post(`/deals/${deal.id}/subcontracts`, {
    title: 'Локальный электромонтаж Өскемен',
    targetRegion: 'Өскемен',
    agreedAmount: 80000,
    description: 'Требуется бригада в г. Өскемен для прокладки лотков',
  }, supplier.accessToken);
  console.log(`✓ Subcontract created: ID = ${sub.id}, Number = SP-${sub.number}, Status = ${sub.status}`);

  console.log('\n=== 8. Admin Oversight & Moderation ===');
  const adminOverview = await get('/admin/overview', admin.accessToken);
  console.log(`✓ Admin Overview activeSubcontracts: ${adminOverview.activeSubcontracts}`);

  const adminSubs = await get('/admin/subcontracts', admin.accessToken);
  console.log(`✓ Admin Subcontracts total count: ${adminSubs.length}`);
  const found = adminSubs.find(s => s.id === sub.id);
  console.log(`✓ Found subcontract in Admin list: ${found?.title} | Region: ${found?.targetRegion}`);

  const mod = await patch(`/admin/subcontracts/${sub.id}`, { action: 'complete' }, admin.accessToken);
  console.log(`✓ Admin completed subcontract: Status = ${mod.status}`);

  console.log('\n=== 9. Catalog Filter (Goods vs Services) ===');
  const serviceCatalog = await get('/products?type=SERVICE');
  console.log(`✓ Service catalog items: ${serviceCatalog.length}`);

  const productCatalog = await get('/products?type=PRODUCT');
  console.log(`✓ Product catalog items: ${productCatalog.length}`);

  console.log('\n🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉\n');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
