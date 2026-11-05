import { apiFetch } from '../../shared/api/client';
import {
  buildFallbackQuote,
  FALLBACK_ADMIN_CATEGORIES,
  FALLBACK_CATEGORIES,
  FALLBACK_SHOP_CONFIG,
  filterFallbackAdminProducts,
  filterFallbackProducts,
  getFallbackAdminProduct,
  getFallbackProductDetail,
} from './shopFallbackCatalog';
import type {
  AddressDto,
  AddressRequest,
  CategoryAdminDto,
  CategoryDto,
  CategoryUpsertRequest,
  CounterPaymentMethod,
  CreateOrderRequest,
  GeoRegion,
  ManagerOrderSummaryDto,
  OrderCountsDto,
  OrderDto,
  OrderSummaryDto,
  Page,
  ProductAdminDto,
  ProductAdminSummaryDto,
  ProductDetailDto,
  ProductGoal,
  ProductSort,
  ProductSummaryDto,
  ProductUpsertRequest,
  QuoteDto,
  QuoteRequest,
  ShopConfigDto,
  StockAdjustmentRequest,
  VariantAdminDto,
} from './shopTypes';

const publicInit = (init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: {
    ...(init.headers as Record<string, string> | undefined),
    Authorization: '',
  },
});

export interface ListProductsParams {
  q?: string;
  goal?: ProductGoal | '';
  category?: string;
  inStock?: boolean;
  featuredFirst?: boolean;
  sort?: ProductSort;
  page?: number;
  size?: number;
  signal?: AbortSignal;
}

export const shopApi = {
  listCategories: async (signal?: AbortSignal) => {
    try {
      const list = await apiFetch<CategoryDto[]>('/public/product-categories', publicInit({ signal }));
      if (import.meta.env.MODE !== 'test' && Array.isArray(list) && list.length === 0) {
        return FALLBACK_CATEGORIES;
      }
      return list;
    } catch (err) {
      if (import.meta.env.MODE === 'test' || signal?.aborted) throw err;
      return FALLBACK_CATEGORIES;
    }
  },

  listProducts: async (params: ListProductsParams = {}) => {
    const query = new URLSearchParams();
    if (params.q && params.q.trim()) query.set('q', params.q.trim());
    if (params.goal) query.set('goal', params.goal);
    if (params.category) query.set('category', params.category);
    if (params.inStock) query.set('inStock', 'true');
    if (params.featuredFirst) query.set('featuredFirst', 'true');
    if (params.sort) query.set('sort', params.sort);
    if (params.page != null) query.set('page', String(params.page));
    if (params.size != null) query.set('size', String(params.size));
    const qs = query.toString();
    try {
      const res = await apiFetch<Page<ProductSummaryDto>>(
        `/public/products${qs ? `?${qs}` : ''}`,
        publicInit({ signal: params.signal }),
      );
      if (
        import.meta.env.MODE !== 'test' &&
        res &&
        Array.isArray(res.content) &&
        res.content.length === 0 &&
        !params.q &&
        !params.goal &&
        !params.category &&
        !params.inStock
      ) {
        return filterFallbackProducts(params);
      }
      return res;
    } catch (err) {
      if (import.meta.env.MODE === 'test' || params.signal?.aborted) throw err;
      return filterFallbackProducts(params);
    }
  },

  getProduct: async (slug: string, signal?: AbortSignal) => {
    try {
      return await apiFetch<ProductDetailDto>(`/public/products/${encodeURIComponent(slug)}`, publicInit({ signal }));
    } catch (err) {
      if (import.meta.env.MODE === 'test' || signal?.aborted) throw err;
      const fallback = getFallbackProductDetail(slug);
      if (fallback) return fallback;
      throw err;
    }
  },

  getShopConfig: async (signal?: AbortSignal) => {
    try {
      return await apiFetch<ShopConfigDto>('/public/shop/config', publicInit({ signal }));
    } catch (err) {
      if (import.meta.env.MODE === 'test' || signal?.aborted) throw err;
      return FALLBACK_SHOP_CONFIG;
    }
  },

  quote: async (request: QuoteRequest, signal?: AbortSignal) => {
    try {
      return await apiFetch<QuoteDto>(
        '/public/shop/quote',
        publicInit({ method: 'POST', body: JSON.stringify(request), signal }),
      );
    } catch (err) {
      if (import.meta.env.MODE === 'test' || signal?.aborted) throw err;
      return buildFallbackQuote(request);
    }
  },

  listProvinces: (signal?: AbortSignal) =>
    apiFetch<GeoRegion[]>('/public/geo/provinces', publicInit({ signal })),

  listWards: (provinceCode: string, signal?: AbortSignal) =>
    apiFetch<GeoRegion[]>(
      `/public/geo/provinces/${encodeURIComponent(provinceCode)}/wards`,
      publicInit({ signal }),
    ),

  // Member addresses
  listAddresses: () => apiFetch<AddressDto[]>('/shop/addresses'),

  saveAddress: (request: AddressRequest, id?: number | null) =>
    id != null
      ? apiFetch<AddressDto>(`/shop/addresses/${id}`, { method: 'PUT', body: JSON.stringify(request) })
      : apiFetch<AddressDto>('/shop/addresses', { method: 'POST', body: JSON.stringify(request) }),

  makeDefaultAddress: (id: number) =>
    apiFetch<AddressDto[]>(`/shop/addresses/${id}/default`, { method: 'POST' }),

  deleteAddress: (id: number) =>
    apiFetch<AddressDto[]>(`/shop/addresses/${id}`, { method: 'DELETE' }),

  // Member orders
  createOrder: (request: CreateOrderRequest) =>
    apiFetch<OrderDto>('/shop/orders', { method: 'POST', body: JSON.stringify(request) }),

  listMyOrders: (params: { status?: string; page?: number; size?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.page != null) query.set('page', String(params.page));
    if (params.size != null) query.set('size', String(params.size));
    const qs = query.toString();
    return apiFetch<Page<OrderSummaryDto>>(`/shop/orders${qs ? `?${qs}` : ''}`);
  },

  getMyOrder: (id: number) => apiFetch<OrderDto>(`/shop/orders/${id}`),

  cancelMyOrder: (id: number, reason?: string) =>
    apiFetch<OrderDto>(`/shop/orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify(reason ? { reason } : {}),
    }),

  // Staff order fulfillment
  staff: {
    listOrders: (params: { status?: string; q?: string; page?: number; size?: number } = {}) => {
      const query = new URLSearchParams();
      if (params.status) query.set('status', params.status);
      if (params.q && params.q.trim()) query.set('q', params.q.trim());
      if (params.page != null) query.set('page', String(params.page));
      if (params.size != null) query.set('size', String(params.size));
      const qs = query.toString();
      return apiFetch<Page<OrderDto>>(`/staff/product-orders${qs ? `?${qs}` : ''}`);
    },
    counts: () => apiFetch<OrderCountsDto>('/staff/product-orders/counts'),
    getOrder: (id: number) => apiFetch<OrderDto>(`/staff/product-orders/${id}`),
    startProcessing: (id: number) =>
      apiFetch<OrderDto>(`/staff/product-orders/${id}/start-processing`, { method: 'POST' }),
    ship: (id: number, payload: { carrier: string; trackingNumber: string }) =>
      apiFetch<OrderDto>(`/staff/product-orders/${id}/ship`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    readyForPickup: (id: number) =>
      apiFetch<OrderDto>(`/staff/product-orders/${id}/ready-for-pickup`, { method: 'POST' }),
    complete: (id: number) =>
      apiFetch<OrderDto>(`/staff/product-orders/${id}/complete`, { method: 'POST' }),
    counterPayment: (id: number, method: CounterPaymentMethod) =>
      apiFetch<OrderDto>(`/staff/product-orders/${id}/counter-payment`, {
        method: 'POST',
        body: JSON.stringify({ method }),
      }),
    cancel: (id: number, payload: { reason: string; restock?: boolean }) =>
      apiFetch<OrderDto>(`/staff/product-orders/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: payload.reason, restock: payload.restock ?? true }),
      }),
  },

  // Manager administration
  manager: {
    listCategories: async () => {
      try {
        const list = await apiFetch<CategoryAdminDto[]>('/manager/product-categories');
        if (import.meta.env.MODE !== 'test' && Array.isArray(list) && list.length === 0) {
          return FALLBACK_ADMIN_CATEGORIES;
        }
        return list;
      } catch (err) {
        if (import.meta.env.MODE === 'test') throw err;
        return FALLBACK_ADMIN_CATEGORIES;
      }
    },
    createCategory: (payload: CategoryUpsertRequest) =>
      apiFetch<CategoryAdminDto>('/manager/product-categories', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateCategory: (id: number, payload: CategoryUpsertRequest) =>
      apiFetch<CategoryAdminDto>(`/manager/product-categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    deleteCategory: (id: number) =>
      apiFetch<void>(`/manager/product-categories/${id}`, { method: 'DELETE' }),

    listProducts: async (
      params: { q?: string; active?: boolean; lowStock?: boolean; page?: number; size?: number } = {},
    ) => {
      const query = new URLSearchParams();
      if (params.q && params.q.trim()) query.set('q', params.q.trim());
      if (params.active != null) query.set('active', String(params.active));
      if (params.lowStock != null) query.set('lowStock', String(params.lowStock));
      if (params.page != null) query.set('page', String(params.page));
      if (params.size != null) query.set('size', String(params.size));
      const qs = query.toString();
      try {
        const res = await apiFetch<Page<ProductAdminSummaryDto>>(`/manager/products${qs ? `?${qs}` : ''}`);
        if (
          import.meta.env.MODE !== 'test' &&
          res &&
          Array.isArray(res.content) &&
          res.content.length === 0 &&
          !params.q &&
          params.active == null &&
          !params.lowStock
        ) {
          return filterFallbackAdminProducts(params);
        }
        return res;
      } catch (err) {
        if (import.meta.env.MODE === 'test') throw err;
        return filterFallbackAdminProducts(params);
      }
    },
    getProduct: async (id: number) => {
      try {
        return await apiFetch<ProductAdminDto>(`/manager/products/${id}`);
      } catch (err) {
        if (import.meta.env.MODE === 'test') throw err;
        const fallback = getFallbackAdminProduct(id);
        if (fallback) return fallback;
        throw err;
      }
    },
    createProduct: (payload: ProductUpsertRequest) =>
      apiFetch<ProductAdminDto>('/manager/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateProduct: (id: number, payload: ProductUpsertRequest) =>
      apiFetch<ProductAdminDto>(`/manager/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    setProductActive: (id: number, active: boolean) =>
      apiFetch<ProductAdminDto>(`/manager/products/${id}/active`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      }),
    deleteProduct: (id: number) =>
      apiFetch<void>(`/manager/products/${id}`, { method: 'DELETE' }),
    addImage: (productId: number, payload: { dataUrl: string; altText: string }) =>
      apiFetch<ProductAdminDto>(`/manager/products/${productId}/images`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    removeImage: (productId: number, imageId: number) =>
      apiFetch<ProductAdminDto>(`/manager/products/${productId}/images/${imageId}`, {
        method: 'DELETE',
      }),
    reorderImages: (productId: number, imageIds: number[]) =>
      apiFetch<ProductAdminDto>(`/manager/products/${productId}/images/order`, {
        method: 'PUT',
        body: JSON.stringify({ imageIds }),
      }),
    adjustStock: (variantId: number, payload: StockAdjustmentRequest) =>
      apiFetch<VariantAdminDto>(`/manager/product-variants/${variantId}/stock-adjustments`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    orderSummary: () => apiFetch<ManagerOrderSummaryDto>('/manager/product-orders/summary'),
  },
};
