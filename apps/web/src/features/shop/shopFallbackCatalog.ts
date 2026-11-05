import type {
  CategoryAdminDto,
  CategoryDto,
  Page,
  ProductAdminDto,
  ProductAdminSummaryDto,
  ProductDetailDto,
  ProductSummaryDto,
  QuoteDto,
  QuoteLineDto,
  QuoteRequest,
  ShopConfigDto,
} from './shopTypes';
import type { ListProductsParams } from './shopApi';

export const FALLBACK_CATEGORIES: CategoryDto[] = [
  { id: 1, name: 'Whey', slug: 'whey' },
  { id: 2, name: 'Creatine', slug: 'creatine' },
  { id: 3, name: 'Trước tập', slug: 'pre-workout' },
  { id: 4, name: 'Điện giải', slug: 'dien-giai' },
  { id: 5, name: 'Vitamin & khoáng chất', slug: 'vitamin' },
  { id: 6, name: 'Thanh protein', slug: 'thanh-protein' },
];

export const FALLBACK_ADMIN_CATEGORIES: CategoryAdminDto[] = FALLBACK_CATEGORIES.map((c, idx) => ({
  ...c,
  sortOrder: idx + 1,
  active: true,
  productCount: 1,
}));

export const FALLBACK_SHOP_CONFIG: ShopConfigDto = {
  shippingFee: 30000,
  freeShippingThreshold: 500000,
  paymentWindowMinutes: 30,
  counterHoldHours: 48,
  pickupAddress: '120 Hai Bà Trưng, Phường Sài Gòn, TP. Hồ Chí Minh — quầy lễ tân',
};

const FALLBACK_DETAILS: ProductDetailDto[] = [
  {
    id: 1,
    slug: 'sol-whey-isolate',
    name: 'SÖL Whey Isolate 100%',
    brand: 'SÖL Nutrition',
    categoryName: 'Whey',
    categorySlug: 'whey',
    form: 'powder',
    goals: ['muscle_gain', 'recovery'],
    shortDescription: 'Đạm whey tách béo lọc lạnh, dễ tiêu hóa sau buổi tập nặng.',
    description:
      'Đạm whey isolate tinh khiết từ sữa bò ăn cỏ, hàm lượng lactose thấp, hỗ trợ bổ sung đạm nhanh sau buổi tập.',
    servingSize: '1 muỗng (33 g)',
    usageInstructions: 'Pha 1 muỗng với 250–300 ml nước lạnh hoặc sữa hạt, lắc đều 20 giây.',
    warnings: 'Chứa thành phần từ sữa. Bảo quản nơi khô thoáng, đậy kín nắp sau khi mở.',
    registrationNumber: null,
    images: [
      { id: 1, url: '/images/shop/whey-isolate.jpg', alt: 'SÖL Whey Isolate 100%' },
      { id: 2, url: '/images/shop/whey-scoop.jpg', alt: 'Muỗng bột SÖL Whey Isolate' },
    ],
    variants: [
      {
        id: 101,
        sku: 'SOL-WHEY-CHO-2LB',
        label: 'Vị Sô-cô-la · 908 g',
        price: 1090000,
        servingsPerContainer: 27,
        pricePerServing: 40370,
        stock: 25,
        available: true,
      },
      {
        id: 102,
        sku: 'SOL-WHEY-CHO-5LB',
        label: 'Vị Sô-cô-la · 2,27 kg',
        price: 2290000,
        servingsPerContainer: 68,
        pricePerServing: 33676,
        stock: 18,
        available: true,
      },
      {
        id: 103,
        sku: 'SOL-WHEY-VAN-5LB',
        label: 'Vị Vani tự nhiên · 2,27 kg',
        price: 2290000,
        servingsPerContainer: 68,
        pricePerServing: 33676,
        stock: 15,
        available: true,
      },
    ],
    nutrients: [
      { name: 'Năng lượng', amount: 130, unit: 'kcal', dailyValuePercent: null, subRow: false, highlight: false },
      { name: 'Đạm', amount: 25, unit: 'g', dailyValuePercent: 50, subRow: false, highlight: true },
      { name: 'BCAA tự nhiên', amount: 5.5, unit: 'g', dailyValuePercent: null, subRow: true, highlight: false },
      { name: 'Carbohydrate', amount: 2, unit: 'g', dailyValuePercent: 1, subRow: false, highlight: false },
      { name: 'Chất béo', amount: 1, unit: 'g', dailyValuePercent: 1, subRow: false, highlight: false },
      { name: 'Natri', amount: 90, unit: 'mg', dailyValuePercent: 4, subRow: false, highlight: false },
    ],
    related: [],
  },
  {
    id: 2,
    slug: 'sol-creatine-monohydrate',
    name: 'SÖL Creatine Monohydrate Micronized',
    brand: 'SÖL Nutrition',
    categoryName: 'Creatine',
    categorySlug: 'creatine',
    form: 'powder',
    goals: ['muscle_gain', 'energy'],
    shortDescription: 'Creatine monohydrate hạt siêu mịn không mùi vị, dễ pha cùng nước hoặc whey.',
    description: '100% Creatine Monohydrate độ mịn 200 mesh, không chất độn, không hương liệu nhân tạo.',
    servingSize: '1 muỗng (5 g)',
    usageInstructions: 'Dùng 1 muỗng (5 g) mỗi ngày cùng 250 ml nước lọc hoặc nước trái cây.',
    warnings: 'Uống đủ tối thiểu 2 lít nước mỗi ngày khi sử dụng sản phẩm.',
    registrationNumber: null,
    images: [{ id: 3, url: '/images/shop/creatine-monohydrate.jpg', alt: 'SÖL Creatine Monohydrate Micronized' }],
    variants: [
      {
        id: 201,
        sku: 'SOL-CRE-300G',
        label: 'Không vị · 300 g',
        price: 590000,
        servingsPerContainer: 60,
        pricePerServing: 9833,
        stock: 8,
        available: true,
      },
      {
        id: 202,
        sku: 'SOL-CRE-500G',
        label: 'Không vị · 500 g',
        price: 850000,
        servingsPerContainer: 100,
        pricePerServing: 8500,
        stock: 20,
        available: true,
      },
    ],
    nutrients: [
      { name: 'Creatine Monohydrate', amount: 5, unit: 'g', dailyValuePercent: null, subRow: false, highlight: true },
    ],
    related: [],
  },
  {
    id: 3,
    slug: 'sol-pre-workout-ignition',
    name: 'SÖL Pre-Workout Ignition',
    brand: 'SÖL Nutrition',
    categoryName: 'Trước tập',
    categorySlug: 'pre-workout',
    form: 'powder',
    goals: ['energy'],
    shortDescription: 'Công thức tỉnh táo trước buổi tập với L-Citrulline, Beta-Alanine và Caffeine tự nhiên.',
    description: 'Kết hợp axit amin và chiết xuất hạt cà phê xanh với liều lượng minh bạch trên từng thành phần.',
    servingSize: '1 muỗng (14 g)',
    usageInstructions: 'Pha 1 muỗng với 300 ml nước lạnh, dùng trước buổi tập 20–30 phút.',
    warnings: 'Mỗi khẩu phần chứa 175 mg caffeine. Không dùng trong vòng 5 giờ trước khi ngủ.',
    registrationNumber: null,
    images: [{ id: 4, url: '/images/shop/pre-workout.jpg', alt: 'SÖL Pre-Workout Ignition' }],
    variants: [
      {
        id: 301,
        sku: 'SOL-PRE-CIT-30',
        label: 'Vị Cam Yuzu · 420 g',
        price: 890000,
        servingsPerContainer: 30,
        pricePerServing: 29667,
        stock: 22,
        available: true,
      },
      {
        id: 302,
        sku: 'SOL-PRE-BER-30',
        label: 'Vị Dâu rừng · 420 g',
        price: 890000,
        servingsPerContainer: 30,
        pricePerServing: 29667,
        stock: 14,
        available: true,
      },
    ],
    nutrients: [
      { name: 'L-Citrulline', amount: 6, unit: 'g', dailyValuePercent: null, subRow: false, highlight: true },
      { name: 'Beta-Alanine', amount: 3.2, unit: 'g', dailyValuePercent: null, subRow: false, highlight: false },
      { name: 'Caffeine tự nhiên', amount: 175, unit: 'mg', dailyValuePercent: null, subRow: false, highlight: false },
      { name: 'L-Theanine', amount: 100, unit: 'mg', dailyValuePercent: null, subRow: false, highlight: false },
      { name: 'Vitamin B12', amount: 2.4, unit: 'mcg', dailyValuePercent: 100, subRow: false, highlight: false },
    ],
    related: [],
  },
  {
    id: 4,
    slug: 'sol-electrolyte-hydro-salts',
    name: 'SÖL Electrolyte Hydro Salts',
    brand: 'SÖL Nutrition',
    categoryName: 'Điện giải',
    categorySlug: 'dien-giai',
    form: 'powder',
    goals: ['recovery', 'energy'],
    shortDescription: 'Muối điện giải không đường bù khoáng nhanh cho các buổi HIIT, chạy bộ và đánh sân.',
    description: 'Tỷ lệ Natri – Kali – Magie cân đối, vị thanh nhẹ từ chanh muối tự nhiên, không phẩm màu.',
    servingSize: '1 gói (6 g)',
    usageInstructions: 'Hòa 1 gói vào bình 500–600 ml nước mát, uống từng ngụm trong và sau khi tập.',
    warnings: 'Bảo quản nơi khô mát, tránh ánh nắng trực tiếp.',
    registrationNumber: null,
    images: [{ id: 5, url: '/images/shop/electrolyte.jpg', alt: 'SÖL Electrolyte Hydro Salts' }],
    variants: [
      {
        id: 401,
        sku: 'SOL-HYD-LMN-30',
        label: 'Vị Chanh muối · Hộp 30 gói',
        price: 490000,
        servingsPerContainer: 30,
        pricePerServing: 16333,
        stock: 40,
        available: true,
      },
      {
        id: 402,
        sku: 'SOL-HYD-PCH-30',
        label: 'Vị Đào trắng · Hộp 30 gói',
        price: 490000,
        servingsPerContainer: 30,
        pricePerServing: 16333,
        stock: 28,
        available: true,
      },
    ],
    nutrients: [
      { name: 'Năng lượng', amount: 10, unit: 'kcal', dailyValuePercent: null, subRow: false, highlight: false },
      { name: 'Natri', amount: 500, unit: 'mg', dailyValuePercent: 22, subRow: false, highlight: true },
      { name: 'Kali', amount: 200, unit: 'mg', dailyValuePercent: 4, subRow: false, highlight: false },
      { name: 'Magie', amount: 60, unit: 'mg', dailyValuePercent: 14, subRow: false, highlight: false },
      { name: 'Vitamin C', amount: 90, unit: 'mg', dailyValuePercent: 100, subRow: false, highlight: false },
    ],
    related: [],
  },
  {
    id: 5,
    slug: 'sol-daily-omega-3-d3-k2',
    name: 'SÖL Daily Omega-3 & D3+K2',
    brand: 'SÖL Nutrition',
    categoryName: 'Vitamin & khoáng chất',
    categorySlug: 'vitamin',
    form: 'capsule',
    goals: ['wellness', 'recovery'],
    shortDescription: 'Viên nang dầu cá biển sâu chuẩn rTG kết hợp Vitamin D3 và K2 MK-7.',
    description: 'Chiết xuất từ cá cơm vùng biển lạnh được chưng cất phân tử, viên mềm không tanh.',
    servingSize: '2 viên nang mềm',
    usageInstructions: 'Uống 2 viên mỗi ngày ngay sau bữa ăn chính có chất béo.',
    warnings: 'Tham khảo ý kiến chuyên gia y tế nếu đang dùng thuốc chống đông máu.',
    registrationNumber: null,
    images: [{ id: 6, url: '/images/shop/omega-3.jpg', alt: 'SÖL Daily Omega-3 & D3+K2' }],
    variants: [
      {
        id: 501,
        sku: 'SOL-OMG-90',
        label: 'Lọ 90 viên (45 lần dùng)',
        price: 650000,
        servingsPerContainer: 45,
        pricePerServing: 14444,
        stock: 7,
        available: true,
      },
    ],
    nutrients: [
      { name: 'Dầu cá tinh khiết', amount: 2000, unit: 'mg', dailyValuePercent: null, subRow: false, highlight: false },
      { name: 'EPA + DHA', amount: 1200, unit: 'mg', dailyValuePercent: null, subRow: true, highlight: true },
      { name: 'Vitamin D3', amount: 25, unit: 'mcg', dailyValuePercent: 125, subRow: false, highlight: false },
      { name: 'Vitamin K2 (MK-7)', amount: 90, unit: 'mcg', dailyValuePercent: 75, subRow: false, highlight: false },
    ],
    related: [],
  },
  {
    id: 6,
    slug: 'sol-crunch-protein-bar',
    name: 'SÖL Crunch Protein Bar',
    brand: 'SÖL Nutrition',
    categoryName: 'Thanh protein',
    categorySlug: 'thanh-protein',
    form: 'bar',
    goals: ['muscle_gain', 'weight_management'],
    shortDescription: 'Thanh protein nướng giòn 20 g đạm, ít đường, tiện mang theo trong túi tập.',
    description: 'Kết hợp whey isolate và hạt hạnh nhân rang, giàu chất xơ prebiotic, không phủ siro đường.',
    servingSize: '1 thanh (60 g)',
    usageInstructions: 'Dùng trực tiếp như bữa phụ trước hoặc sau giờ tập.',
    warnings: 'Chứa sữa và hạt cây (hạnh nhân).',
    registrationNumber: null,
    images: [{ id: 7, url: '/images/shop/protein-bar.jpg', alt: 'SÖL Crunch Protein Bar' }],
    variants: [
      {
        id: 601,
        sku: 'SOL-BAR-ALM-12',
        label: 'Hạnh nhân Cacao · Hộp 12 thanh',
        price: 690000,
        servingsPerContainer: 12,
        pricePerServing: 57500,
        stock: 24,
        available: true,
      },
      {
        id: 602,
        sku: 'SOL-BAR-PNT-12',
        label: 'Bơ đậu phộng muối biển · Hộp 12 thanh',
        price: 690000,
        servingsPerContainer: 12,
        pricePerServing: 57500,
        stock: 16,
        available: true,
      },
    ],
    nutrients: [
      { name: 'Năng lượng', amount: 210, unit: 'kcal', dailyValuePercent: null, subRow: false, highlight: false },
      { name: 'Đạm', amount: 20, unit: 'g', dailyValuePercent: 40, subRow: false, highlight: true },
      { name: 'Carbohydrate', amount: 18, unit: 'g', dailyValuePercent: 7, subRow: false, highlight: false },
      { name: 'Chất xơ', amount: 7, unit: 'g', dailyValuePercent: 25, subRow: true, highlight: false },
      { name: 'Đường', amount: 2, unit: 'g', dailyValuePercent: null, subRow: true, highlight: false },
      { name: 'Chất béo', amount: 7, unit: 'g', dailyValuePercent: 9, subRow: false, highlight: false },
    ],
    related: [],
  },
];

function toSummary(detail: ProductDetailDto): ProductSummaryDto {
  const minPrice = Math.min(...detail.variants.map(v => v.price));
  const ppsValues = detail.variants.map(v => v.pricePerServing).filter((v): v is number => v != null);
  const pricePerServing = ppsValues.length > 0 ? Math.min(...ppsValues) : null;
  const totalStock = detail.variants.reduce((s, v) => s + v.stock, 0);
  const lowStock = detail.variants.some(v => v.stock > 0 && v.stock < 10);
  const highlightNutrient = detail.nutrients.find(n => n.highlight) ?? detail.nutrients[0] ?? null;
  return {
    id: detail.id,
    slug: detail.slug,
    name: detail.name,
    categoryName: detail.categoryName,
    form: detail.form,
    goals: detail.goals,
    shortDescription: detail.shortDescription,
    imageUrl: detail.images[0]?.url ?? null,
    highlight: highlightNutrient
      ? { name: highlightNutrient.name, amount: highlightNutrient.amount, unit: highlightNutrient.unit }
      : null,
    minPrice,
    pricePerServing,
    inStock: totalStock > 0,
    lowStock,
    featured: detail.id <= 3,
    isNew: detail.id <= 2,
    defaultVariantId: detail.variants.length === 1 ? detail.variants[0].id : null,
    variantCount: detail.variants.length,
  };
}

export const FALLBACK_SUMMARIES: ProductSummaryDto[] = FALLBACK_DETAILS.map(toSummary);

export function filterFallbackProducts(params: ListProductsParams = {}): Page<ProductSummaryDto> {
  const q = params.q?.trim().toLowerCase() ?? '';
  let items = FALLBACK_SUMMARIES.filter(p => {
    if (q && !p.name.toLowerCase().includes(q) && !p.shortDescription.toLowerCase().includes(q)) {
      return false;
    }
    if (params.goal && !p.goals.includes(params.goal)) {
      return false;
    }
    if (params.category) {
      const cat = FALLBACK_CATEGORIES.find(c => c.slug === params.category);
      if (cat && p.categoryName !== cat.name) return false;
    }
    if (params.inStock && !p.inStock) {
      return false;
    }
    return true;
  });

  const sort = params.sort ?? 'newest';
  items = [...items].sort((a, b) => {
    if (params.featuredFirst && a.featured !== b.featured) {
      return a.featured ? -1 : 1;
    }
    if (sort === 'price_asc') return a.minPrice - b.minPrice;
    if (sort === 'price_desc') return b.minPrice - a.minPrice;
    if (sort === 'price_per_serving') {
      return (a.pricePerServing ?? Number.MAX_SAFE_INTEGER) - (b.pricePerServing ?? Number.MAX_SAFE_INTEGER);
    }
    return a.id - b.id;
  });

  const size = Math.max(1, params.size ?? 12);
  const page = Math.max(0, params.page ?? 0);
  const start = page * size;
  const content = items.slice(start, start + size);
  const totalPages = Math.max(1, Math.ceil(items.length / size));

  return {
    content,
    number: page,
    size,
    totalElements: items.length,
    totalPages: items.length === 0 ? 0 : totalPages,
  };
}

export function getFallbackProductDetail(slug: string): ProductDetailDto | null {
  const found = FALLBACK_DETAILS.find(d => d.slug === slug);
  if (!found) return null;
  const related = FALLBACK_SUMMARIES.filter(s => s.id !== found.id).slice(0, 3);
  return { ...found, related };
}

export function filterFallbackAdminProducts(
  params: { q?: string; active?: boolean; lowStock?: boolean; page?: number; size?: number } = {},
): Page<ProductAdminSummaryDto> {
  const q = params.q?.trim().toLowerCase() ?? '';
  const all: ProductAdminSummaryDto[] = FALLBACK_DETAILS.map(d => {
    const totalStock = d.variants.reduce((s, v) => s + v.stock, 0);
    const minPrice = Math.min(...d.variants.map(v => v.price));
    const lowStock = d.variants.some(v => v.stock < 10);
    return {
      id: d.id,
      slug: d.slug,
      name: d.name,
      categoryName: d.categoryName,
      variantCount: d.variants.length,
      totalStock,
      lowStock,
      active: true,
      featured: d.id <= 3,
      imageUrl: d.images[0]?.url ?? null,
      minPrice,
      isNew: d.id <= 2,
    };
  }).filter(item => {
    if (q && !item.name.toLowerCase().includes(q) && !item.slug.toLowerCase().includes(q)) return false;
    if (params.active != null && item.active !== params.active) return false;
    if (params.lowStock && !item.lowStock) return false;
    return true;
  });

  const size = Math.max(1, params.size ?? 20);
  const page = Math.max(0, params.page ?? 0);
  const start = page * size;
  const content = all.slice(start, start + size);
  return {
    content,
    number: page,
    size,
    totalElements: all.length,
    totalPages: all.length === 0 ? 0 : Math.max(1, Math.ceil(all.length / size)),
  };
}

export function getFallbackAdminProduct(id: number): ProductAdminDto | null {
  const d = FALLBACK_DETAILS.find(item => item.id === id);
  if (!d) return null;
  const cat = FALLBACK_CATEGORIES.find(c => c.slug === d.categorySlug) ?? FALLBACK_CATEGORIES[0];
  return {
    id: d.id,
    categoryId: cat.id,
    categoryName: d.categoryName,
    name: d.name,
    slug: d.slug,
    brand: d.brand,
    form: d.form,
    shortDescription: d.shortDescription,
    description: d.description,
    servingSize: d.servingSize,
    usageInstructions: d.usageInstructions,
    warnings: d.warnings,
    registrationNumber: d.registrationNumber,
    active: true,
    featured: d.id <= 3,
    goals: d.goals,
    variants: d.variants.map((v, idx) => ({
      id: v.id,
      sku: v.sku,
      label: v.label,
      price: v.price,
      servingsPerContainer: v.servingsPerContainer,
      stock: v.stock,
      active: true,
      sortOrder: idx + 1,
    })),
    nutrients: d.nutrients.map((n, idx) => ({
      id: idx + 1,
      name: n.name,
      amount: n.amount,
      unit: n.unit,
      dailyValuePercent: n.dailyValuePercent,
      subRow: n.subRow,
      highlight: n.highlight,
      sortOrder: idx + 1,
    })),
    images: d.images.map((img, idx) => ({
      id: img.id,
      url: img.url,
      altText: img.alt,
      sortOrder: idx + 1,
    })),
  };
}

export function buildFallbackQuote(request: QuoteRequest): QuoteDto {
  const lines: QuoteLineDto[] = [];
  for (const item of request.items ?? []) {
    for (const prod of FALLBACK_DETAILS) {
      const v = prod.variants.find(x => x.id === item.variantId);
      if (v) {
        const qty = Math.min(Math.max(1, item.quantity), v.stock);
        lines.push({
          variantId: v.id,
          productId: prod.id,
          slug: prod.slug,
          productName: prod.name,
          variantLabel: v.label,
          form: prod.form,
          imageUrl: prod.images[0]?.url ?? null,
          unitPrice: v.price,
          requestedQuantity: item.quantity,
          quantity: qty,
          lineTotal: v.price * qty,
          stock: v.stock,
          problem: item.quantity > v.stock ? 'INSUFFICIENT_STOCK' : null,
        });
        break;
      }
    }
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const shippingFee =
    request.fulfillment === 'delivery' && subtotal > 0 && subtotal < FALLBACK_SHOP_CONFIG.freeShippingThreshold
      ? FALLBACK_SHOP_CONFIG.shippingFee
      : 0;
  return {
    lines,
    subtotal,
    shippingFee,
    total: subtotal + shippingFee,
    freeShippingThreshold: FALLBACK_SHOP_CONFIG.freeShippingThreshold,
    valid: lines.length > 0 && lines.every(l => l.problem === null),
  };
}
