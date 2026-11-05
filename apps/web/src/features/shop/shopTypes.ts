export type ProductGoal = 'muscle_gain' | 'recovery' | 'energy' | 'weight_management' | 'wellness';
export type ProductForm = 'powder' | 'capsule' | 'tablet' | 'liquid' | 'bar' | 'other';
export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'processing'
  | 'shipping'
  | 'ready_for_pickup'
  | 'completed'
  | 'cancelled';
export type FulfillmentMethod = 'delivery' | 'pickup';
export type OrderPaymentMethod = 'online' | 'counter';
export type CounterPaymentMethod = 'cash' | 'pos' | 'bank_transfer';
export type QuoteProblem = 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | 'INACTIVE' | 'NOT_FOUND' | null;
export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'price_per_serving';

export interface Page<T> {
  content: T[];
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface CategoryDto {
  id: number;
  name: string;
  slug: string;
}

export interface NutrientHighlight {
  name: string;
  amount: number;
  unit: string;
}

export interface ProductSummaryDto {
  id: number;
  slug: string;
  name: string;
  categoryName: string;
  form: ProductForm;
  goals: ProductGoal[];
  shortDescription: string;
  imageUrl: string | null;
  highlight: NutrientHighlight | null;
  minPrice: number;
  pricePerServing: number | null;
  inStock: boolean;
  lowStock: boolean;
  featured: boolean;
  isNew: boolean;
  defaultVariantId?: number | null;
  variantCount?: number;
}

export interface ProductImageDto {
  id: number;
  url: string;
  alt: string;
}

export interface ProductVariantDto {
  id: number;
  sku: string;
  label: string;
  price: number;
  servingsPerContainer: number | null;
  pricePerServing: number | null;
  stock: number;
  available: boolean;
}

export interface NutrientDto {
  name: string;
  amount: number;
  unit: string;
  dailyValuePercent: number | null;
  subRow: boolean;
  highlight: boolean;
  sortOrder?: number;
}

export interface ProductDetailDto {
  id: number;
  slug: string;
  name: string;
  brand: string | null;
  categoryName: string;
  categorySlug: string;
  form: ProductForm;
  goals: ProductGoal[];
  shortDescription: string;
  description: string;
  servingSize: string;
  usageInstructions: string | null;
  warnings: string | null;
  registrationNumber: string | null;
  images: ProductImageDto[];
  variants: ProductVariantDto[];
  nutrients: NutrientDto[];
  related: ProductSummaryDto[];
}

export interface ShopConfigDto {
  shippingFee: number;
  freeShippingThreshold: number;
  paymentWindowMinutes: number;
  counterHoldHours: number;
  pickupAddress: string;
}

export interface QuoteLineRequest {
  variantId: number;
  quantity: number;
}

export interface QuoteRequest {
  items: QuoteLineRequest[];
  fulfillment: FulfillmentMethod;
}

export interface QuoteLineDto {
  variantId: number;
  productName: string;
  variantLabel: string;
  slug: string;
  imageUrl: string | null;
  unitPrice: number;
  requestedQuantity: number;
  quantity: number;
  stock: number;
  lineTotal: number;
  problem: QuoteProblem;
}

export interface QuoteDto {
  lines: QuoteLineDto[];
  subtotal: number;
  shippingFee: number;
  total: number;
  valid: boolean;
}

export interface GeoRegion {
  code: string;
  name: string;
}

export interface AddressRequest {
  recipientName: string;
  phone: string;
  provinceCode: string;
  wardCode: string;
  streetLine: string;
  note?: string | null;
  makeDefault: boolean;
}

export interface AddressDto {
  id: number;
  recipientName: string;
  phone: string;
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  streetLine: string;
  note: string | null;
  isDefault: boolean;
}

export interface CreateOrderRequest {
  clientRequestId: string;
  items: QuoteLineRequest[];
  fulfillment: FulfillmentMethod;
  paymentMethod: OrderPaymentMethod;
  addressId?: number | null;
  shippingAddress?: AddressRequest | null;
  saveAddress?: boolean;
  expectedTotal: number;
}

export interface OrderItemDto {
  variantId: number;
  productName: string;
  variantLabel: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  slug: string | null;
  imageUrl: string | null;
}

export interface ShippingInfoDto {
  recipientName: string;
  phone: string;
  provinceName: string;
  wardName: string;
  streetLine: string;
  note: string | null;
}

export interface OrderMemberDto {
  id: number;
  fullName: string;
  phone: string | null;
}

export interface OrderDto {
  id: number;
  code: string;
  status: OrderStatus;
  fulfillment: FulfillmentMethod;
  paymentMethod: OrderPaymentMethod;
  items: OrderItemDto[];
  subtotal: number;
  shippingFee: number;
  total: number;
  shipping: ShippingInfoDto | null;
  pickupAddress: string | null;
  paymentDueAt: string | null;
  createdAt: string;
  paidAt: string | null;
  processingAt: string | null;
  shippedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  canCancel: boolean;
  canPay: boolean;
  refundedAmount: number | null;
  member: OrderMemberDto | null;
}

export interface OrderSummaryDto {
  id: number;
  code: string;
  status: OrderStatus;
  fulfillment: FulfillmentMethod;
  paymentMethod: OrderPaymentMethod;
  total: number;
  itemCount: number;
  firstItemName: string;
  createdAt: string;
  canPay: boolean;
}

export interface OrderCountsDto {
  paid: number;
  processing: number;
  ready_for_pickup: number;
  shipping: number;
  counter_pending: number;
}

export interface CategoryAdminDto {
  id: number;
  name: string;
  slug: string;
  sortOrder: number;
  active: boolean;
  productCount: number;
}

export interface CategoryUpsertRequest {
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface ProductAdminSummaryDto {
  id: number;
  name: string;
  slug: string;
  categoryName: string;
  variantCount: number;
  totalStock: number;
  lowStock: boolean;
  active: boolean;
  featured: boolean;
  imageUrl: string | null;
  minPrice?: number;
  isNew?: boolean;
}

export interface VariantAdminDto extends ProductVariantDto {
  active: boolean;
  sortOrder: number;
}

export interface ProductAdminDto extends Omit<ProductDetailDto, 'variants' | 'related'> {
  active: boolean;
  featured: boolean;
  categoryId: number;
  variants: VariantAdminDto[];
  related?: ProductSummaryDto[];
}

export interface VariantUpsertRequest {
  id?: number | null;
  sku: string;
  label: string;
  price: number;
  servingsPerContainer?: number | null;
  initialStock?: number | null;
  active: boolean;
  sortOrder: number;
}

export interface NutrientUpsertRequest {
  name: string;
  amount: number;
  unit: string;
  dailyValuePercent?: number | null;
  subRow: boolean;
  highlight: boolean;
  sortOrder: number;
}

export interface ProductUpsertRequest {
  name: string;
  categoryId: number;
  form: ProductForm;
  brand?: string | null;
  shortDescription: string;
  description: string;
  servingSize: string;
  usageInstructions?: string | null;
  warnings?: string | null;
  registrationNumber?: string | null;
  goals: ProductGoal[];
  active: boolean;
  featured: boolean;
  variants: VariantUpsertRequest[];
  nutrients: NutrientUpsertRequest[];
}

export interface StockAdjustmentRequest {
  delta: number;
  reason: 'restock' | 'adjustment';
  note?: string | null;
}

export interface ManagerOrderSummaryDto {
  pendingFulfillment: number;
  revenue30d: number;
  lowStockVariants: number;
}
