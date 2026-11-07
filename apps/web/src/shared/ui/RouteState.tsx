import { useI18n } from '../i18n';
import { useRouteError } from 'react-router-dom';
import { isModuleLoadError } from '../lib/routeErrors';
import { LoadingSkeleton } from './LoadingSkeleton';
import './route-state.css';

export function RouteLoading() {
  const { t } = useI18n();
  return <main className="route-state route-state--loading">
    <LoadingSkeleton label={t("Đang tải trang…", "Loading page…")} variant="cards" count={3} />
  </main>;
}

export function RouteLoadError() {
  const { t } = useI18n();
  const network = isModuleLoadError(useRouteError());
  return <main className="route-state" role="alert">
    <h1>{network ? t("Không thể tải trang", "Unable to load page") : t("Trang gặp lỗi khi hiển thị", "Page could not be displayed")}</h1>
    <p>{network ? t("Kiểm tra kết nối rồi tải lại trang để tiếp tục.", "Check your connection and reload the page to continue.") : t("Hãy tải lại trang. Nếu lỗi lặp lại, vui lòng báo cho quản trị viên.", "Reload the page. If the problem persists, contact your administrator.")}</p>
    <button type="button" onClick={() => window.location.reload()}>{t("Tải lại trang", "Reload page")}</button>
  </main>;
}

/** Lỗi của một màn hình portal: hiển thị trong vùng nội dung, giữ nguyên sidebar, topbar và điều hướng. */
export function PortalRouteError() {
  const { t } = useI18n();
  const network = isModuleLoadError(useRouteError());
  return <section className="portal-container portal-route-error" role="alert">
    <h1 className="portal-title">{network ? t("Không thể tải màn hình này", "Unable to load this screen") : t("Màn hình gặp lỗi khi hiển thị", "Screen could not be displayed")}</h1>
    <p className="portal-subtitle">{network
      ? t("Kiểm tra kết nối mạng rồi tải lại. Các màn hình khác vẫn dùng được từ thanh điều hướng.", "Check your connection and reload. Other screens remain available in the navigation.")
      : t("Dữ liệu nhận được không như mong đợi. Hãy tải lại; nếu lỗi lặp lại, vui lòng báo cho quản trị viên.", "The received data was unexpected. Reload the page; if the problem persists, contact your administrator.")}</p>
    <button type="button" className="btn-primary" onClick={() => window.location.reload()}>{t("Tải lại trang", "Reload page")}</button>
  </section>;
}
