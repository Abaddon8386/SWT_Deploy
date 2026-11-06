import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatCenterDateTime } from '../../shared/lib/centerTime';
import { errorMessage } from '../../shared/lib/errorMessage';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { PageHeader } from '../../shared/ui/PageHeader';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { useCart } from './cart';
import { MemberAddressBook } from './components/MemberAddressBook';
import { MemberShopCatalog } from './components/MemberShopCatalog';
import { CartDrawer } from './components/CartDrawer';
import { OrderStatusPill } from './components/OrderStatusPill';
import './shop-portal.css';
import { shopApi } from './shopApi';
import { formatVnd } from './shopFormat';
import type { OrderSummaryDto, Page } from './shopTypes';

const STATUS_FILTERS: Array<{ id: string; label: string }> = [
  { id: '', label: 'Tất cả' },
  { id: 'pending', label: 'Chờ thanh toán' },
  { id: 'active', label: 'Đang xử lý' },
  { id: 'done', label: 'Hoàn tất' },
  { id: 'cancelled', label: 'Đã hủy' },
];

export function MemberOrdersPage({
  defaultTab = 'orders',
}: {
  defaultTab?: 'orders' | 'shop' | 'addresses';
} = {}) {
  const [cartOpen, setCartOpen] = useState(false);
  const cartFocusRef = useRef<HTMLElement | null>(null);
  const openCart = () => {
    cartFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCartOpen(true);
  };
  const cartLines = useCart();
  const cartCount = cartLines.reduce((sum, l) => sum + l.quantity, 0);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab: 'orders' | 'shop' | 'addresses' =
    rawTab === 'addresses'
      ? 'addresses'
      : rawTab === 'shop'
        ? 'shop'
        : rawTab === 'orders'
          ? 'orders'
          : defaultTab;
  const [statusGroup, setStatusGroup] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page<OrderSummaryDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await shopApi.listMyOrders({
        status: statusGroup || undefined,
        page,
        size: 10,
      });
      setData(res);
    } catch (err) {
      setError(errorMessage(err, 'Không thể tải danh sách đơn hàng. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  }, [statusGroup, page]);

  useEffect(() => {
    if (activeTab === 'orders') {
      void loadOrders();
    }
  }, [activeTab, loadOrders]);

  const switchTab = (next: 'orders' | 'shop' | 'addresses') => {
    if (next === 'addresses') {
      setSearchParams({ tab: 'addresses' }, { replace: true });
    } else if (next === 'shop') {
      setSearchParams({ tab: 'shop' }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  return (
    <div className="portal-container stack">
      <PageHeader
        eyebrow="Hội viên"
        title={activeTab === 'shop' ? 'Sản phẩm' : 'Đơn hàng'}
        actions={
          <button
            type="button"
            onClick={openCart}
            className="shop-cart-btn"
            aria-expanded={cartOpen}
            aria-label={`Giỏ hàng · ${cartCount} sản phẩm`}
          >
            <span>Giỏ hàng</span>
            {cartCount > 0 && <span className="shop-cart-badge">{cartCount}</span>}
          </button>
        }
      />

      <div className="shop-tabs-row">
      <div className="portal-tabs shop-tabs" role="tablist" aria-label="Quản lý sản phẩm, đơn hàng và địa chỉ">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'orders'}
          className={`portal-tab ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => switchTab('orders')}
        >
          Đơn hàng
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'shop'}
          className={`portal-tab ${activeTab === 'shop' ? 'active' : ''}`}
          onClick={() => switchTab('shop')}
        >
          Sản phẩm
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'addresses'}
          className={`portal-tab ${activeTab === 'addresses' ? 'active' : ''}`}
          onClick={() => switchTab('addresses')}
        >
          Địa chỉ giao hàng
        </button>
      </div>
        {activeTab === 'orders' && (
          <RefreshButton
            variant="bare"
            label="Làm mới đơn hàng"
            disabled={loading}
            className={loading ? 'is-loading' : ''}
            onClick={() => void loadOrders()}
          />
        )}
      </div>

      {activeTab === 'addresses' ? (
        <MemberAddressBook />
      ) : activeTab === 'shop' ? (
        <MemberShopCatalog onOpenCart={openCart} />
      ) : (
        <section className="stack" aria-label="Danh sách đơn hàng">
          <div className="portal-tabs shop-tabs" aria-label="Lọc trạng thái đơn hàng">
            {STATUS_FILTERS.map(filter => {
              const active = statusGroup === filter.id;
              return (
                <button
                  key={filter.id || 'all'}
                  type="button"
                  aria-pressed={active}
                  className={`portal-tab ${active ? 'active' : ''}`}
                  onClick={() => {
                    setStatusGroup(filter.id);
                    setPage(0);
                  }}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          {loading ? (
            <LoadingSkeleton label="Đang tải đơn hàng…" variant="rows" count={3} />
          ) : error ? (
            <div className="portal-alert" role="alert">
              <span>{error}</span>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => void loadOrders()}
              >
                Thử lại
              </button>
            </div>
          ) : !data?.content.length ? (
            <div className="portal-card portal-state stack" style={{ alignItems: 'flex-start' }}>
              <p style={{ margin: 0 }}>Chưa có đơn hàng nào trong mục này.</p>
              <Link to="/products" className="btn-secondary">
                Xem sản phẩm
              </Link>
            </div>
          ) : (
            <>
              <div className="stack">
                {data.content.map(o => (
                  <article key={o.id} className="portal-card stack" style={{ gap: 10 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <strong>{o.code}</strong>
                        <span className="muted"> · {formatCenterDateTime(o.createdAt)}</span>
                      </div>
                      <OrderStatusPill
                        status={o.status}
                        fulfillment={o.fulfillment}
                        paymentMethod={o.paymentMethod}
                      />
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>
                        {o.firstItemName}
                        {o.itemCount > 1 ? ` và ${o.itemCount - 1} sản phẩm khác` : ''}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatVnd(o.total)}
                        </strong>
                        {o.canPay && (
                          <Link className="btn-primary btn-sm" to={`/member/orders/${o.id}`}>
                            Thanh toán
                          </Link>
                        )}
                        <Link className="btn-secondary btn-sm" to={`/member/orders/${o.id}`}>
                          Xem chi tiết
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {data.totalPages > 1 && (
                <nav className="court-pagination" aria-label="Phân trang đơn hàng">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                  >
                    Trang trước
                  </button>
                  <span>
                    Trang {page + 1} / {data.totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={page + 1 >= data.totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Trang sau
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      )}
      {cartOpen && <CartDrawer onClose={() => setCartOpen(false)} returnFocusRef={cartFocusRef} />}
    </div>
  );
}
