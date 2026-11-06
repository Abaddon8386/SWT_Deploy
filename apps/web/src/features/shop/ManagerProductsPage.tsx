import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { errorMessage } from '../../shared/lib/errorMessage';
import { notify } from '../../shared/lib/portalNotices';
import { ActionMenu } from '../../shared/ui/ActionMenu';
import { useConfirm } from '../../shared/ui/ConfirmDialog';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { PageHeader } from '../../shared/ui/PageHeader';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { CategoryManager } from './components/CategoryManager';
import { StaffOrdersSection } from './StaffOrdersPage';
import './shop-portal.css';
import { shopApi } from './shopApi';
import { formatVnd } from './shopFormat';
import type {
  ManagerOrderSummaryDto,
  OrderCountsDto,
  OrderDto,
  Page,
  ProductAdminSummaryDto,
} from './shopTypes';

type ManagerTab = 'products' | 'categories' | 'orders';

export function ManagerProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab: ManagerTab =
    rawTab === 'categories' ? 'categories' : rawTab === 'orders' ? 'orders' : 'products';

  const [confirm, confirmDialog] = useConfirm();

  // Products state
  const [productQuery, setProductQuery] = useState('');
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [productPage, setProductPage] = useState(0);
  const [productsData, setProductsData] = useState<Page<ProductAdminSummaryDto> | null>(null);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [deleteBlockedProduct, setDeleteBlockedProduct] = useState<{
    product: ProductAdminSummaryDto;
    message: string;
  } | null>(null);

  // Orders state
  const [orderStatus, setOrderStatus] = useState('paid');
  const [orderQuery, setOrderQuery] = useState('');
  const [orderPage, setOrderPage] = useState(0);
  const [ordersData, setOrdersData] = useState<Page<OrderDto> | null>(null);
  const [orderCounts, setOrderCounts] = useState<OrderCountsDto | null>(null);
  const [orderSummary, setOrderSummary] = useState<ManagerOrderSummaryDto | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState('');

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError('');
    try {
      const res = await shopApi.manager.listProducts({
        q: productQuery.trim() || undefined,
        lowStock: onlyLowStock ? true : undefined,
        page: productPage,
        size: 20,
      });
      setProductsData(res);
    } catch (err) {
      setProductsError(errorMessage(err, 'Không thể tải danh sách sản phẩm.'));
    } finally {
      setProductsLoading(false);
    }
  }, [productQuery, onlyLowStock, productPage]);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersError('');
    try {
      const [pageRes, countsRes, summaryRes] = await Promise.all([
        shopApi.staff.listOrders({
          status: orderStatus || undefined,
          q: orderQuery.trim() || undefined,
          page: orderPage,
          size: 20,
        }),
        shopApi.staff.counts(),
        shopApi.manager.orderSummary(),
      ]);
      setOrdersData(pageRes);
      setOrderCounts(countsRes);
      setOrderSummary(summaryRes);
    } catch (err) {
      setOrdersError(errorMessage(err, 'Không thể tải dữ liệu đơn hàng.'));
    } finally {
      setOrdersLoading(false);
    }
  }, [orderStatus, orderQuery, orderPage]);

  useEffect(() => {
    if (activeTab === 'products') {
      void loadProducts();
    } else if (activeTab === 'orders') {
      void loadOrders();
    }
  }, [activeTab, loadProducts, loadOrders]);

  const switchTab = (next: ManagerTab) => {
    if (next === 'products') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: next }, { replace: true });
    }
  };

  const handleToggleActive = async (product: ProductAdminSummaryDto) => {
    if (actionBusy) return;
    setActionBusy(true);
    setDeleteBlockedProduct(null);
    try {
      await shopApi.manager.setProductActive(product.id, !product.active);
      notify(
        product.active
          ? `Đã ngừng bán “${product.name}”.`
          : `Đã mở bán “${product.name}”.`,
        'success',
      );
      await loadProducts();
    } catch (err) {
      notify(errorMessage(err, 'Không thể cập nhật trạng thái bán.'), 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeleteProduct = async (product: ProductAdminSummaryDto) => {
    if (actionBusy) return;
    const ok = await confirm({
      title: 'Xóa sản phẩm',
      message: `Xóa sản phẩm “${product.name}”?`,
      confirmLabel: 'Xóa sản phẩm',
      danger: true,
    });
    if (!ok) return;

    setActionBusy(true);
    setDeleteBlockedProduct(null);
    try {
      await shopApi.manager.deleteProduct(product.id);
      notify(`Đã xóa sản phẩm “${product.name}”.`, 'success');
      await loadProducts();
    } catch (err) {
      const msg = errorMessage(
        err,
        'Không thể xóa sản phẩm đã có đơn hàng. Hãy chọn Ngừng bán.',
      );
      if ((err instanceof ApiError && (err.code === 'PRODUCT_HAS_ORDERS' || err.status === 409)) || msg) {
        setDeleteBlockedProduct({ product, message: msg });
      }
      notify(msg, 'error');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="portal-container stack">
      <PageHeader
        eyebrow="Quản trị trung tâm"
        title="Sản phẩm & Đơn hàng"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link to="/manager/products/new" className="btn-primary">
              Thêm sản phẩm
            </Link>
            {activeTab !== 'categories' && (
              <RefreshButton
                label="Làm mới dữ liệu"
                disabled={activeTab === 'products' ? productsLoading : ordersLoading}
                onClick={() =>
                  void (activeTab === 'products' ? loadProducts() : loadOrders())
                }
              />
            )}
          </div>
        }
      />

      <div className="portal-tabs shop-tabs" role="tablist" aria-label="Quản trị cửa hàng">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'products'}
          className={`portal-tab ${activeTab === 'products' ? 'active' : ''}`}
          onClick={() => switchTab('products')}
        >
          Sản phẩm
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'categories'}
          className={`portal-tab ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => switchTab('categories')}
        >
          Loại sản phẩm
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'orders'}
          className={`portal-tab ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => switchTab('orders')}
        >
          Đơn hàng
        </button>
      </div>

      {activeTab === 'categories' ? (
        <CategoryManager />
      ) : activeTab === 'orders' ? (
        <section className="stack" aria-label="Đơn hàng sản phẩm">
          {orderSummary && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 14,
              }}
            >
              <article className="portal-card">
                <span className="muted">Đơn cần xử lý</span>
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: 24,
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {orderSummary.pendingFulfillment}
                </p>
              </article>
              <article className="portal-card">
                <span className="muted">Doanh thu sản phẩm 30 ngày</span>
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: 24,
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatVnd(orderSummary.revenue30d)}
                </p>
              </article>
              <article className="portal-card">
                <span className="muted">Biến thể sắp hết</span>
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: 24,
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {orderSummary.lowStockVariants}
                </p>
              </article>
            </div>
          )}

          <StaffOrdersSection
            status={orderStatus}
            onStatusChange={setOrderStatus}
            q={orderQuery}
            onQueryChange={setOrderQuery}
            page={orderPage}
            onPageChange={setOrderPage}
            data={ordersData}
            counts={orderCounts}
            loading={ordersLoading}
            error={ordersError}
            onRetry={() => void loadOrders()}
          />
        </section>
      ) : (
        <section className="stack" aria-label="Danh sách sản phẩm">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div className="shop-field" style={{ minWidth: 260 }}>
              <label className="shop-sr-only" htmlFor="manager-product-search">
                Tìm sản phẩm
              </label>
              <input
                id="manager-product-search"
                type="search"
                className="shop-input"
                placeholder="Tìm tên sản phẩm…"
                value={productQuery}
                onChange={e => {
                  setProductQuery(e.target.value);
                  setProductPage(0);
                }}
              />
            </div>

            <label className="shop-checkbox">
              <input
                type="checkbox"
                checked={onlyLowStock}
                onChange={e => {
                  setOnlyLowStock(e.target.checked);
                  setProductPage(0);
                }}
              />
              <span>Chỉ hiện sản phẩm sắp hết hàng</span>
            </label>
          </div>

          {deleteBlockedProduct && (
            <div className="portal-alert stack" role="alert" style={{ gap: 8 }}>
              <p style={{ margin: 0 }}>{deleteBlockedProduct.message}</p>
              <p className="muted" style={{ margin: 0 }}>
                Sản phẩm đã phát sinh đơn hàng không thể xóa. Bạn có thể chọn Ngừng bán để ẩn
                khỏi kệ hàng.
              </p>
              {deleteBlockedProduct.product.active && (
                <div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={actionBusy}
                    onClick={() => void handleToggleActive(deleteBlockedProduct.product)}
                  >
                    Ngừng bán “{deleteBlockedProduct.product.name}”
                  </button>
                </div>
              )}
            </div>
          )}

          {productsLoading ? (
            <LoadingSkeleton label="Đang tải danh sách sản phẩm…" variant="table" count={4} />
          ) : productsError ? (
            <div className="portal-alert" role="alert">
              <span>{productsError}</span>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => void loadProducts()}
              >
                Thử lại
              </button>
            </div>
          ) : !productsData?.content.length ? (
            <div className="portal-card portal-state">
              <p style={{ margin: 0 }}>Chưa có sản phẩm nào khớp bộ lọc.</p>
            </div>
          ) : (
            <>
              <div className="portal-table-wrapper" role="region" aria-label="Danh sách sản phẩm" tabIndex={0}>
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th scope="col">Sản phẩm</th>
                      <th scope="col">Loại</th>
                      <th scope="col">Giá bán</th>
                      <th scope="col">Biến thể</th>
                      <th scope="col">Tồn kho</th>
                      <th scope="col">Đang bán</th>
                      <th scope="col">Nổi bật</th>
                      <th scope="col">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productsData.content.map(p => (
                      <tr key={p.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Link to={`/manager/products/${p.id}`}>
                              <strong>{p.name}</strong>
                            </Link>
                            {p.isNew && (
                              <span className="shop-badge shop-badge--new">Mới</span>
                            )}
                          </div>
                        </td>
                        <td>{p.categoryName}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {p.minPrice != null
                            ? p.variantCount > 1
                              ? `Từ ${formatVnd(p.minPrice)}`
                              : formatVnd(p.minPrice)
                            : '—'}
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{p.variantCount}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong>{p.totalStock}</strong>
                            {(p.lowStock || (p.totalStock > 0 && p.totalStock < 10)) && (
                              <span className="shop-status-pill shop-status-pill--pending_payment">
                                Sắp hết
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="shop-status-pill">
                            {p.active ? 'Đang bán' : 'Ngừng bán'}
                          </span>
                        </td>
                        <td>{p.featured ? 'Nổi bật' : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Link
                              to={`/manager/products/${p.id}`}
                              className="btn-secondary btn-sm"
                            >
                              Sửa
                            </Link>
                            <ActionMenu label={`Thao tác khác cho ${p.name}`}>
                              <button
                                type="button"
                                className="action-menu__item"
                                disabled={actionBusy}
                                onClick={() => void handleToggleActive(p)}
                              >
                                {p.active ? 'Ngừng bán' : 'Mở bán'}
                              </button>
                              <button
                                type="button"
                                className="action-menu__item action-menu__item--danger"
                                disabled={actionBusy}
                                onClick={() => void handleDeleteProduct(p)}
                              >
                                Xóa
                              </button>
                            </ActionMenu>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {productsData.totalPages > 1 && (
                <nav className="court-pagination" aria-label="Phân trang sản phẩm">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={productPage === 0}
                    onClick={() => setProductPage(p => p - 1)}
                  >
                    Trang trước
                  </button>
                  <span>
                    Trang {productPage + 1} / {productsData.totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={productPage + 1 >= productsData.totalPages}
                    onClick={() => setProductPage(p => p + 1)}
                  >
                    Trang sau
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      )}

      {confirmDialog}
    </div>
  );
}
