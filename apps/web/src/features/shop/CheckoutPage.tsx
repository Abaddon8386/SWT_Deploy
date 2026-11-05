import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError, getCurrentUser, homePath } from '../../shared/api/client';
import { errorMessage } from '../../shared/lib/errorMessage';
import { notify } from '../../shared/lib/portalNotices';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { PublicLayout, RoundArrow } from '../landing/components/PublicLayout';
import { VnpayPayButton } from '../payments/VnpayPayButton';
import type { VnpayTarget } from '../payments/vnpayApi';
import { clearCart, useCart, type CartLine } from './cart';
import { AddressPicker } from './components/AddressPicker';
import { ShopDisclaimer } from './components/ShopDisclaimer';
import { shopApi } from './shopApi';
import { formatVnd } from './shopFormat';
import type {
  AddressDto,
  AddressRequest,
  CreateOrderRequest,
  FulfillmentMethod,
  OrderDto,
  OrderPaymentMethod,
  QuoteDto,
  ShopConfigDto,
} from './shopTypes';
import './shop-public.css';

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const EMPTY_ADDRESS: AddressRequest = {
  recipientName: '',
  phone: '',
  provinceCode: '',
  wardCode: '',
  streetLine: '',
  note: '',
  makeDefault: false,
};

function validateNewAddress(addr: AddressRequest): Partial<Record<string, string>> {
  const errors: Partial<Record<string, string>> = {};
  if (!addr.recipientName.trim()) {
    errors.recipientName = 'Vui lòng nhập họ tên người nhận.';
  }
  if (!addr.phone.trim() || !/^0\d{8,10}$/.test(addr.phone.trim())) {
    errors.phone = 'Vui lòng nhập số điện thoại hợp lệ.';
  }
  if (!addr.provinceCode) {
    errors.provinceCode = 'Vui lòng chọn Tỉnh / Thành phố.';
  }
  if (!addr.wardCode) {
    errors.wardCode = 'Vui lòng chọn Phường / Xã.';
  }
  if (!addr.streetLine.trim()) {
    errors.streetLine = 'Vui lòng nhập số nhà, tên đường.';
  }
  return errors;
}

export function CheckoutPage() {
  const user = getCurrentUser();
  const navigate = useNavigate();
  const cartLines = useCart();

  const placedOrderId = useRef<number | null>(null);
  const activeLinesRef = useRef<CartLine[]>(cartLines);
  const [hasPlacedOrder, setHasPlacedOrder] = useState(false);

  useEffect(() => {
    if (cartLines.length > 0) {
      activeLinesRef.current = cartLines;
    }
  }, [cartLines]);

  const [fulfillment, setFulfillment] = useState<FulfillmentMethod>('delivery');
  const [config, setConfig] = useState<ShopConfigDto | null>(null);
  const [addresses, setAddresses] = useState<AddressDto[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | 'new'>('new');
  const [newAddress, setNewAddress] = useState<AddressRequest>(EMPTY_ADDRESS);
  const [saveAddress, setSaveAddress] = useState(true);
  const [addressErrors, setAddressErrors] = useState<Partial<Record<string, string>>>({});

  const [quote, setQuote] = useState<QuoteDto | null>(null);
  const [loadingInit, setLoadingInit] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [counterBusy, setCounterBusy] = useState(false);

  const clientRequestIdRef = useRef<string>(generateRequestId());
  const lastAttemptKeyRef = useRef<string>('');
  const formRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Thanh toán · SÖL Fitness';
  }, []);

  async function refreshQuote(itemsToQuote: CartLine[], currentFulfillment: FulfillmentMethod) {
    if (itemsToQuote.length === 0) return null;
    setQuoting(true);
    try {
      const q = await shopApi.quote({
        items: itemsToQuote.map(l => ({ variantId: l.variantId, quantity: l.quantity })),
        fulfillment: currentFulfillment,
      });
      setQuote(q);
      return q;
    } catch (err) {
      setOrderError(errorMessage(err, 'Không tải được báo giá đơn hàng.'));
      return null;
    } finally {
      setQuoting(false);
    }
  }

  useEffect(() => {
    if (!user || user.role !== 'MEMBER') {
      setLoadingInit(false);
      return;
    }
    if (cartLines.length === 0 && !hasPlacedOrder) {
      setLoadingInit(false);
      return;
    }
    let active = true;
    setLoadingInit(true);
    Promise.all([
      shopApi.getShopConfig().catch(() => null),
      shopApi.listAddresses().catch(() => [] as AddressDto[]),
    ])
      .then(([cfg, addrList]) => {
        if (!active) return;
        if (cfg) setConfig(cfg);
        const list = Array.isArray(addrList) ? addrList : [];
        setAddresses(list);
        if (list.length > 0) {
          const def = list.find(a => a.isDefault) ?? list[0];
          setSelectedAddressId(prev => (prev === 'new' ? def.id : prev));
        } else {
          setSelectedAddressId('new');
        }
      })
      .finally(() => {
        if (active) setLoadingInit(false);
      });

    return () => {
      active = false;
    };
    // Only run initial config + addresses load once for member
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!user || user.role !== 'MEMBER' || cartLines.length === 0) return;
    void refreshQuote(cartLines, fulfillment);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, cartLines, fulfillment]);

  if (!user) {
    return <Navigate to="/login?returnTo=%2Fcheckout" replace />;
  }

  if (user.role !== 'MEMBER') {
    return (
      <PublicLayout>
        <main id="public-main" className="fit-shop-page">
          <section className="fit-section shop-page">
            <div className="fit-catalog-state" role="status">
              <h1>Mua hàng dành cho tài khoản hội viên.</h1>
              <Link to={homePath(user.role)} className="fit-pill">
                <span>Về portal</span>
                <RoundArrow />
              </Link>
            </div>
          </section>
        </main>
      </PublicLayout>
    );
  }

  if (cartLines.length === 0 && !hasPlacedOrder) {
    return (
      <PublicLayout>
        <main id="public-main" className="fit-shop-page">
          <section className="fit-section shop-page">
            <div className="fit-catalog-state" role="status">
              <h1>Giỏ hàng đang trống.</h1>
              <Link to="/products" className="fit-pill">
                <span>Xem sản phẩm</span>
                <RoundArrow />
              </Link>
            </div>
          </section>
        </main>
      </PublicLayout>
    );
  }

  const buildOrderRequest = (paymentMethod: OrderPaymentMethod): CreateOrderRequest => {
    const items = (cartLines.length > 0 ? cartLines : activeLinesRef.current).map(l => ({
      variantId: l.variantId,
      quantity: l.quantity,
    }));

    const useNewAddress =
      fulfillment === 'delivery' && (selectedAddressId === 'new' || addresses.length === 0);

    if (fulfillment === 'delivery') {
      if (useNewAddress) {
        const errs = validateNewAddress(newAddress);
        if (Object.keys(errs).length > 0) {
          setAddressErrors(errs);
          const firstField = Object.keys(errs)[0];
          const el = formRootRef.current?.querySelector<HTMLElement>(`[data-field="${firstField}"]`);
          el?.focus();
          throw new Error('Vui lòng điền đầy đủ thông tin địa chỉ giao hàng.');
        }
      } else if (typeof selectedAddressId !== 'number') {
        throw new Error('Vui lòng chọn địa chỉ giao hàng.');
      }
    }

    const attemptKey = JSON.stringify({
      items,
      fulfillment,
      paymentMethod,
      addressId: fulfillment === 'delivery' && !useNewAddress ? selectedAddressId : null,
      shippingAddress: fulfillment === 'delivery' && useNewAddress ? newAddress : null,
      saveAddress: fulfillment === 'delivery' && useNewAddress ? saveAddress : false,
    });

    if (lastAttemptKeyRef.current !== attemptKey) {
      lastAttemptKeyRef.current = attemptKey;
      clientRequestIdRef.current = generateRequestId();
      placedOrderId.current = null;
      setHasPlacedOrder(false);
    }

    return {
      clientRequestId: clientRequestIdRef.current,
      items,
      fulfillment,
      paymentMethod,
      addressId: fulfillment === 'delivery' && !useNewAddress ? (selectedAddressId as number) : null,
      shippingAddress:
        fulfillment === 'delivery' && useNewAddress
          ? {
              recipientName: newAddress.recipientName.trim(),
              phone: newAddress.phone.trim(),
              provinceCode: newAddress.provinceCode,
              wardCode: newAddress.wardCode,
              streetLine: newAddress.streetLine.trim(),
              note: newAddress.note?.trim() || null,
              makeDefault: Boolean(newAddress.makeDefault),
            }
          : null,
      saveAddress: fulfillment === 'delivery' && useNewAddress ? saveAddress : false,
      expectedTotal: quote?.total ?? 0,
    };
  };

  const submitOrder = async (paymentMethod: OrderPaymentMethod): Promise<OrderDto> => {
    setOrderError('');
    setAddressErrors({});
    const payload = buildOrderRequest(paymentMethod);
    try {
      const order = await shopApi.createOrder(payload);
      placedOrderId.current = order.id;
      setHasPlacedOrder(true);
      clearCart();
      return order;
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === 'ORDER_PRICE_CHANGED' ||
          err.code === 'PRODUCT_OUT_OF_STOCK' ||
          err.status === 409)
      ) {
        const msg = errorMessage(
          err,
          'Giá hoặc tồn kho sản phẩm vừa thay đổi. Báo giá đã được cập nhật lại.',
        );
        setOrderError(msg);
        await refreshQuote(
          cartLines.length > 0 ? cartLines : activeLinesRef.current,
          fulfillment,
        );
      } else {
        setOrderError(errorMessage(err, 'Không thể tạo đơn hàng. Vui lòng thử lại.'));
      }
      throw err;
    }
  };

  const placeOrderOnline = async (): Promise<VnpayTarget> => {
    if (placedOrderId.current !== null) {
      return { productOrderId: placedOrderId.current };
    }
    const order = await submitOrder('online');
    return { productOrderId: order.id };
  };

  const placeOrderCounter = async () => {
    if (counterBusy) return;
    setCounterBusy(true);
    try {
      const order = await submitOrder('counter');
      notify(`Đã đặt đơn ${order.code}`, 'success', { record: true });
      navigate(`/member/orders/${order.id}`);
    } catch {
      /* Error already displayed in orderError */
    } finally {
      setCounterBusy(false);
    }
  };

  const holdMinutes = config?.paymentWindowMinutes ?? 30;
  const pickupAddress = config?.pickupAddress ?? '120 Hai Bà Trưng, Phường Sài Gòn, TP.HCM';

  return (
    <PublicLayout>
      <main id="public-main" className="fit-shop-page" ref={formRootRef}>
        <section className="fit-section shop-page" aria-labelledby="checkout-title">
          <span className="fit-kicker">THANH TOÁN</span>
          <h1 id="checkout-title" className="shop-catalog__title">
            Hoàn tất đơn hàng<span className="fit-title-dot">.</span>
          </h1>

          {loadingInit && !quote ? (
            <LoadingSkeleton label="Đang tải thông tin thanh toán…" variant="cards" count={2} />
          ) : (
            <div className="shop-checkout-grid">
              <div className="shop-checkout-main">
                <div className="shop-checkout-card">
                  <h2>Nhận hàng</h2>
                  <div className="shop-fulfillment-options" role="radiogroup" aria-label="Hình thức nhận hàng">
                    <label
                      className={`shop-address-option${fulfillment === 'delivery' ? ' is-selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="fulfillment"
                        value="delivery"
                        checked={fulfillment === 'delivery'}
                        onChange={() => {
                          setFulfillment('delivery');
                          setOrderError('');
                        }}
                      />
                      <span>Giao tận nơi</span>
                    </label>
                    <label
                      className={`shop-address-option${fulfillment === 'pickup' ? ' is-selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="fulfillment"
                        value="pickup"
                        checked={fulfillment === 'pickup'}
                        onChange={() => {
                          setFulfillment('pickup');
                          setOrderError('');
                        }}
                      />
                      <span>Nhận tại quầy SÖL</span>
                    </label>
                  </div>

                  {fulfillment === 'delivery' ? (
                    <div className="shop-checkout-addresses">
                      <h3>Địa chỉ giao hàng</h3>
                      <AddressPicker
                        addresses={addresses}
                        selectedId={selectedAddressId}
                        onSelect={id => {
                          setSelectedAddressId(id);
                          setAddressErrors({});
                          setOrderError('');
                        }}
                        newAddress={newAddress}
                        onNewAddressChange={next => {
                          setNewAddress(next);
                          setAddressErrors({});
                          setOrderError('');
                        }}
                        saveAddress={saveAddress}
                        onSaveAddressChange={setSaveAddress}
                        errors={addressErrors}
                      />
                    </div>
                  ) : (
                    <div className="shop-pickup-box">
                      <p>
                        <strong>Quầy nhận hàng:</strong> {pickupAddress}
                      </p>
                      <p>Mang thẻ hội viên khi đến nhận.</p>
                    </div>
                  )}
                </div>

                <div className="shop-checkout-card">
                  <h2>Thanh toán</h2>
                  {orderError && (
                    <p className="form-error" role="alert">
                      {orderError}
                    </p>
                  )}

                  <VnpayPayButton
                    prepare={placeOrderOnline}
                    disabled={
                      quoting ||
                      counterBusy ||
                      (!hasPlacedOrder && (!quote || !quote.valid))
                    }
                    onPaid={() => {
                      if (placedOrderId.current !== null) {
                        navigate(`/member/orders/${placedOrderId.current}`);
                      }
                    }}
                  />

                  {fulfillment === 'pickup' && (
                    <div className="shop-checkout-counter">
                      <button
                        type="button"
                        className="btn-secondary shop-checkout__counter-btn"
                        disabled={
                          quoting ||
                          counterBusy ||
                          (!hasPlacedOrder && (!quote || !quote.valid))
                        }
                        onClick={() => void placeOrderCounter()}
                      >
                        {counterBusy ? 'Đang đặt đơn…' : 'Đặt hàng, trả tại quầy'}
                      </button>
                    </div>
                  )}

                  <p className="shop-checkout__hold-note">
                    Giữ hàng {holdMinutes} phút để thanh toán.
                  </p>
                </div>
              </div>

              <aside className="shop-checkout-summary shop-checkout-card" aria-label="Tóm tắt đơn hàng">
                <h2>Đơn hàng</h2>
                {quote && (
                  <ul className="shop-checkout-items">
                    {quote.lines.map(line => (
                      <li key={line.variantId} className="shop-checkout-item">
                        <div>
                          <strong>{line.productName}</strong>
                          <span>
                            {line.variantLabel} × {line.quantity}
                          </span>
                        </div>
                        <span>{formatVnd(line.lineTotal)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="shop-checkout-totals">
                  <div className="shop-checkout-row">
                    <span>Tạm tính</span>
                    <span>{formatVnd(quote?.subtotal ?? 0)}</span>
                  </div>
                  <div className="shop-checkout-row">
                    <span>Phí giao</span>
                    <span>{formatVnd(quote?.shippingFee ?? 0)}</span>
                  </div>
                  <div className="shop-checkout-row shop-checkout-row--total">
                    <strong>Tổng cộng</strong>
                    <strong>{formatVnd(quote?.total ?? 0)}</strong>
                  </div>
                </div>

                <ShopDisclaimer />
              </aside>
            </div>
          )}
        </section>
      </main>
    </PublicLayout>
  );
}
